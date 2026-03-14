from __future__ import annotations
import asyncio
import json
import re
from typing import AsyncGenerator

from openai import AsyncOpenAI
from models import AgentState, ItineraryResult, NegotiationSession, VenueSlot
from venues import VENUE_BY_ID, format_venues_for_prompt, get_venue_for_slot
from prompts import (
    AGENT_SYSTEM,
    ORCHESTRATOR_PROMPT,
    PROPOSAL_PROMPT,
    VETO_PROPOSAL_PROMPT,
    VOTING_PROMPT,
)
from config import OPENAI_API_KEY, OPENAI_MODEL

client = AsyncOpenAI(api_key=OPENAI_API_KEY)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_json(text: str) -> dict:
    text = re.sub(r"```json?\n?", "", text)
    text = text.strip("`").strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group(0)
    return json.loads(text)


def make_sse(event: str, data: dict) -> dict:
    return {"event": event, "data": json.dumps(data)}


def build_proposals_list(agents: list[AgentState], round_num: int) -> str:
    lines = []
    for a in agents:
        proposals_this_round = [p for p in a.proposals if p.round == round_num]
        if proposals_this_round:
            p = proposals_this_round[-1]
            venue_names = {vs.slot: vs.venue_name for vs in p.venues}
            lines.append(
                f"{a.name}'s proposal:\n"
                f"  Pre-drinks: {venue_names.get('pre_drinks', '?')}\n"
                f"  Dinner: {venue_names.get('dinner', '?')}\n"
                f"  Bar: {venue_names.get('bar', '?')}\n"
                f"  Reasoning: {p.summary}"
            )
    return "\n\n".join(lines)


def build_votes_list(agents: list[AgentState]) -> str:
    lines = []
    for a in agents:
        if a.votes:
            v = a.votes[-1]
            scores_str = ", ".join(f"{k}: {v}" for k, v in v.get("scores", {}).items())
            objection = v.get("objection") or "no objection"
            lines.append(f"{a.name}: scores=[{scores_str}], objection: {objection}")
    return "\n".join(lines)


def compute_score_totals(agents: list[AgentState]) -> dict[str, int]:
    totals: dict[str, int] = {}
    for a in agents:
        if a.votes:
            scores = a.votes[-1].get("scores", {})
            for name, score in scores.items():
                totals[name] = totals.get(name, 0) + int(score)
    return totals


def validate_proposal(data: dict, round_num: int) -> ItineraryResult:
    slots_needed = ["pre_drinks", "dinner", "bar"]
    venues: list[VenueSlot] = []
    used_ids: list[str] = []

    for slot in slots_needed:
        venue_id = data.get(slot, "")
        venue = VENUE_BY_ID.get(venue_id)
        if venue is None or slot not in venue["slot"]:
            venue = get_venue_for_slot(slot, exclude_ids=used_ids)
        if venue:
            used_ids.append(venue["id"])
            venues.append(VenueSlot(
                slot=slot,  # type: ignore[arg-type]
                venue_id=venue["id"],
                venue_name=venue["name"],
                address=venue["address"],
                lat=venue["lat"],
                lng=venue["lng"],
                reason=str(data.get("reasoning", venue["description"]))[:200],
            ))

    return ItineraryResult(
        venues=venues,
        summary=str(data.get("reasoning", "A great night out in Edinburgh.")),
        round=round_num,
    )


# ---------------------------------------------------------------------------
# Per-agent LLM calls (return tuples, not generators)
# ---------------------------------------------------------------------------

async def _call_proposal(
    agent: AgentState,
    round_num: int,
    venue_list: str,
    veto_context: str | None,
) -> tuple[AgentState, ItineraryResult | None, str | None]:
    system = AGENT_SYSTEM.format(
        name=agent.name,
        n_agents="several",
        budget=agent.constraints.budget,
        dietary=agent.constraints.dietary or "none",
        location=agent.constraints.location,
        mood=agent.constraints.mood,
        time=agent.constraints.time,
    )
    if veto_context:
        user_content = veto_context
    else:
        user_content = PROPOSAL_PROMPT.format(
            round=round_num,
            venue_list=venue_list,
            constraints_summary="Other group members have varying budgets, dietary needs, and location preferences.",
        )
    try:
        resp = await client.chat.completions.create(
            model=OPENAI_MODEL,
            temperature=0.7,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
        )
        text = resp.choices[0].message.content or ""
        data = extract_json(text)
        return agent, validate_proposal(data, round_num), None
    except Exception as e:
        return agent, None, str(e)


async def _call_vote(
    agent: AgentState,
    round_num: int,
    proposals_list: str,
    all_names: list[str],
) -> tuple[AgentState, dict | None, str | None]:
    system = AGENT_SYSTEM.format(
        name=agent.name,
        n_agents=len(all_names),
        budget=agent.constraints.budget,
        dietary=agent.constraints.dietary or "none",
        location=agent.constraints.location,
        mood=agent.constraints.mood,
        time=agent.constraints.time,
    )
    score_keys = ", ".join(f'"{n}": <score>' for n in all_names if n != agent.name)
    try:
        resp = await client.chat.completions.create(
            model=OPENAI_MODEL,
            temperature=0.5,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": VOTING_PROMPT.format(
                    round=round_num,
                    proposals_list=proposals_list,
                    score_keys=score_keys,
                )},
            ],
        )
        text = resp.choices[0].message.content or ""
        data = extract_json(text)
        return agent, data, None
    except Exception as e:
        return agent, None, str(e)


# ---------------------------------------------------------------------------
# Main negotiation runner — yields SSE dicts
# ---------------------------------------------------------------------------

async def run_negotiation(session: NegotiationSession) -> AsyncGenerator[dict, None]:
    agents = session.agents
    all_names = [a.name for a in agents]
    venue_list = format_venues_for_prompt()

    def emit(event: str, data: dict) -> dict:
        ev = make_sse(event, data)
        session.message_history.append(ev)
        return ev

    # Phase 1: Research
    session.phase = "research"
    yield emit("phase", {"phase": "research", "round": session.round})
    await asyncio.sleep(0.3)

    # Phase 2: Proposals
    session.phase = "proposals"
    yield emit("phase", {"phase": "proposals", "round": session.round})

    veto_context: str | None = None
    if session.veto_count > 0 and session.result:
        vetoed = session.result
        vetoed_slots = {vs.slot: vs.venue_name for vs in vetoed.venues}
        veto_context = VETO_PROPOSAL_PROMPT.format(
            round=session.round,
            veto_reasons="\n".join(f"- {r}" for r in session.veto_reasons),
            vetoed_pre_drinks=vetoed_slots.get("pre_drinks", "?"),
            vetoed_dinner=vetoed_slots.get("dinner", "?"),
            vetoed_bar=vetoed_slots.get("bar", "?"),
            venue_list=venue_list,
        )

    # Emit thinking for all agents, then fire parallel calls
    for a in agents:
        yield emit("thinking", {"agent_id": a.user_id, "thinking": True})

    proposal_tasks = {
        asyncio.create_task(
            _call_proposal(a, session.round, venue_list, veto_context)
        ): a
        for a in agents
    }

    for task in asyncio.as_completed(list(proposal_tasks.keys())):
        agent, proposal, error = await task
        yield emit("thinking", {"agent_id": agent.user_id, "thinking": False})
        if error or proposal is None:
            yield emit("error", {"message": f"{agent.name} failed to propose: {error}"})
            proposal = validate_proposal({}, session.round)
        agent.proposals.append(proposal)
        venue_names = {vs.slot: vs.venue_name for vs in proposal.venues}
        content = (
            f"I propose: {venue_names.get('pre_drinks', '?')} for pre-drinks, "
            f"{venue_names.get('dinner', '?')} for dinner, "
            f"then {venue_names.get('bar', '?')} to end the night. "
            f"{proposal.summary}"
        )
        yield emit("message", {
            "agent_id": agent.user_id,
            "agent_name": agent.name,
            "round": session.round,
            "content": content,
            "type": "proposal",
        })

    # Phase 3: Voting
    session.phase = "voting"
    yield emit("phase", {"phase": "voting", "round": session.round})

    proposals_list = build_proposals_list(agents, session.round)

    for a in agents:
        yield emit("thinking", {"agent_id": a.user_id, "thinking": True})

    vote_tasks = {
        asyncio.create_task(
            _call_vote(a, session.round, proposals_list, all_names)
        ): a
        for a in agents
    }

    for task in asyncio.as_completed(list(vote_tasks.keys())):
        agent, vote_data, error = await task
        yield emit("thinking", {"agent_id": agent.user_id, "thinking": False})
        if error or vote_data is None:
            vote_data = {"scores": {n: 3 for n in all_names if n != agent.name}, "objection": None}
        agent.votes.append(vote_data)
        scores_str = ", ".join(
            f"{k}: {v}/5" for k, v in vote_data.get("scores", {}).items()
        )
        objection = vote_data.get("objection")
        content = f"Scores — {scores_str}."
        if objection:
            content += f" My concern: {objection}"
        yield emit("message", {
            "agent_id": agent.user_id,
            "agent_name": agent.name,
            "round": session.round,
            "content": content,
            "type": "vote",
        })

    # Phase 4: Verdict
    session.phase = "verdict"
    yield emit("phase", {"phase": "verdict", "round": session.round})

    votes_list = build_votes_list(agents)
    score_totals = compute_score_totals(agents)
    score_totals_str = "\n".join(f"  {k}: {v} points" for k, v in score_totals.items())

    result: ItineraryResult
    try:
        resp = await client.chat.completions.create(
            model=OPENAI_MODEL,
            temperature=0.3,
            messages=[
                {"role": "user", "content": ORCHESTRATOR_PROMPT.format(
                    round=session.round,
                    proposals_list=proposals_list,
                    votes_list=votes_list,
                    score_totals=score_totals_str,
                )},
            ],
        )
        text = resp.choices[0].message.content or ""
        data = extract_json(text)
        result = validate_proposal(data, session.round)
        result.summary = str(data.get("summary", result.summary))
    except Exception as e:
        yield emit("error", {"message": f"Orchestrator error: {e}"})
        result = agents[0].proposals[-1] if agents and agents[0].proposals else validate_proposal({}, session.round)

    yield emit("message", {
        "agent_id": "orchestrator",
        "agent_name": "The Orchestrator",
        "round": session.round,
        "content": result.summary,
        "type": "summary",
    })
    yield emit("result", {"itinerary": result.model_dump()})
    session.result = result
    session.phase = "done"
