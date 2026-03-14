from __future__ import annotations
import asyncio
import json
import re
from typing import AsyncGenerator

from openai import AsyncOpenAI
from models import AgentState, ItineraryResult, NegotiationSession, Venue, VenueSlot
from fetch_venues import (
    fetch_venues_for_session,
    format_venues_for_prompt,
    get_venue_by_id,
    get_fallback_venue,
)
from prompts import AGENT_SYSTEM, ORCHESTRATOR_PROMPT, PROPOSAL_PROMPT, REACTION_PROMPT, VOTING_PROMPT
from config import OPENAI_API_KEYS, OPENAI_MODEL

# Pre-built clients for each key
_clients = [AsyncOpenAI(api_key=k) for k in OPENAI_API_KEYS]


async def _chat_with_fallback(**kwargs) -> object:
    """Try each API key in order, raising the last error if all fail."""
    last_err: Exception | None = None
    for cl in _clients:
        try:
            return await cl.chat.completions.create(**kwargs)
        except Exception as e:
            last_err = e
            if "401" not in str(e) and "invalid_api_key" not in str(e):
                raise
    raise last_err or RuntimeError("No OpenAI API keys configured")

MAX_ROUNDS = 3
CONVERGENCE_THRESHOLD = 4.0  # average score out of 5 to stop early


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


def build_votes_list(agents: list[AgentState], round_num: int) -> str:
    lines = []
    for a in agents:
        votes_this_round = [v for v in a.votes if v.get("round") == round_num]
        if votes_this_round:
            v = votes_this_round[-1]
            scores_str = ", ".join(f"{k}: {val}" for k, val in v.get("scores", {}).items())
            objection = v.get("objection") or "no objection"
            lines.append(f"{a.name}: scores=[{scores_str}], objection: {objection}")
    return "\n".join(lines)


def build_conversation_history(
    agents: list[AgentState],
    up_to_round: int,
    veto_reasons: list[str] | None = None,
) -> str:
    """Builds a readable transcript of all rounds so far for agents to react to."""
    parts = []
    for r in range(1, up_to_round + 1):
        proposals = build_proposals_list(agents, r)
        votes = build_votes_list(agents, r)
        if proposals:
            parts.append(f"=== Round {r} Proposals ===\n{proposals}")
        if votes:
            parts.append(f"=== Round {r} Votes & Objections ===\n{votes}")
    if veto_reasons:
        reasons_str = "\n".join(f"- {r}" for r in veto_reasons)
        parts.append(f"=== Group Vetoed the Previous Result ===\n{reasons_str}\nYou must propose a new itinerary that addresses these concerns.")
    return "\n\n".join(parts)


def compute_score_totals(agents: list[AgentState], round_num: int) -> dict[str, float]:
    totals: dict[str, float] = {}
    counts: dict[str, int] = {}
    for a in agents:
        votes_this_round = [v for v in a.votes if v.get("round") == round_num]
        if votes_this_round:
            scores = votes_this_round[-1].get("scores", {})
            for name, score in scores.items():
                totals[name] = totals.get(name, 0.0) + float(score)
                counts[name] = counts.get(name, 0) + 1
    # Return averages
    return {name: totals[name] / counts[name] for name in totals}


def check_convergence(agents: list[AgentState], round_num: int) -> bool:
    """Returns True if any proposal has average score >= CONVERGENCE_THRESHOLD."""
    averages = compute_score_totals(agents, round_num)
    if not averages:
        return False
    return max(averages.values()) >= CONVERGENCE_THRESHOLD


def validate_proposal(data: dict, round_num: int, venue_pool: list[Venue]) -> ItineraryResult:
    slots_needed = ["pre_drinks", "dinner", "bar"]
    result_venues: list[VenueSlot] = []
    used_ids: list[str] = []

    for slot in slots_needed:
        venue_id = data.get(slot, "")
        venue = get_venue_by_id(venue_pool, venue_id)
        if venue is None or slot not in venue.slot:
            venue = get_fallback_venue(venue_pool, slot, used_ids)
        if venue:
            used_ids.append(venue.id)
            result_venues.append(VenueSlot(
                slot=slot,  # type: ignore[arg-type]
                venue_id=venue.id,
                venue_name=venue.name,
                address=venue.address,
                lat=venue.lat,
                lng=venue.lng,
                reason=str(data.get("reasoning", venue.description))[:200],
            ))

    return ItineraryResult(
        venues=result_venues,
        summary=str(data.get("reasoning", "A great night out in Edinburgh.")),
        round=round_num,
    )


# ---------------------------------------------------------------------------
# Per-agent LLM calls
# ---------------------------------------------------------------------------

async def _call_proposal(
    agent: AgentState,
    round_num: int,
    venue_list: str,
    venue_pool: list[Venue],
    conversation_history: str,
) -> tuple[AgentState, ItineraryResult | None, str | None]:
    system = AGENT_SYSTEM.format(
        name=agent.name,
        n_agents="several",
        budget=agent.constraints.budget,
        dietary=agent.constraints.dietary or "none",
        mood=agent.constraints.mood,
        time=agent.constraints.time,
    )

    if round_num == 1:
        user_content = PROPOSAL_PROMPT.format(
            round=round_num,
            venue_list=venue_list,
            constraints_summary="Other group members have varying budgets, dietary needs, and preferences.",
        )
    else:
        user_content = REACTION_PROMPT.format(
            round=round_num,
            venue_list=venue_list,
            conversation_history=conversation_history,
        )

    try:
        resp = await _chat_with_fallback(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
        )
        text = resp.choices[0].message.content or ""
        data = extract_json(text)
        return agent, validate_proposal(data, round_num, venue_pool), None
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
        mood=agent.constraints.mood,
        time=agent.constraints.time,
    )
    score_keys = ", ".join(f'"{n}": <score>' for n in all_names if n != agent.name)
    try:
        resp = await _chat_with_fallback(
            model=OPENAI_MODEL,
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
        data["round"] = round_num  # tag which round this vote belongs to
        return agent, data, None
    except Exception as e:
        return agent, None, str(e)


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

async def _call_orchestrator(
    agents: list[AgentState],
    round_num: int,
    venue_pool: list[Venue],
) -> ItineraryResult:
    proposals_list = build_proposals_list(agents, round_num)
    votes_list = build_votes_list(agents, round_num)
    score_totals = compute_score_totals(agents, round_num)
    score_totals_str = "\n".join(f"  {k}: {v:.1f}/5 avg" for k, v in score_totals.items())

    resp = await _chat_with_fallback(
        model=OPENAI_MODEL,
        messages=[
            {"role": "user", "content": ORCHESTRATOR_PROMPT.format(
                round=round_num,
                proposals_list=proposals_list,
                votes_list=votes_list,
                score_totals=score_totals_str,
            )},
        ],
    )
    text = resp.choices[0].message.content or ""
    data = extract_json(text)
    result = validate_proposal(data, round_num, venue_pool)
    result.summary = str(data.get("summary", result.summary))
    return result


# ---------------------------------------------------------------------------
# Main negotiation runner
# ---------------------------------------------------------------------------

async def run_negotiation(session: NegotiationSession) -> AsyncGenerator[dict, None]:
    agents = session.agents
    all_names = [a.name for a in agents]

    def emit(event: str, data: dict) -> dict:
        ev = make_sse(event, data)
        session.message_history.append(ev)
        return ev

    # Phase 1: Research
    session.phase = "research"
    yield emit("phase", {"phase": "research", "round": session.round})

    if not session.venues:
        try:
            venues, centroid_lat, centroid_lng = await fetch_venues_for_session(agents)
            session.venues = venues
            session.centroid_lat = centroid_lat
            session.centroid_lng = centroid_lng
        except Exception as e:
            yield emit("error", {"message": f"Could not fetch venues: {e}"})
            session.venues = []

    venue_pool = session.venues
    if not venue_pool:
        yield emit("error", {"message": "No venues found — cannot negotiate. Check Google Maps API key."})
        session.phase = "done"
        return

    venue_list = format_venues_for_prompt(venue_pool)

    # Negotiation loop
    converged = False
    while session.round <= MAX_ROUNDS and not converged:

        # --- Proposals ---
        session.phase = "proposals"
        yield emit("phase", {"phase": "proposals", "round": session.round})

        veto_reasons = session.veto_reasons if session.veto_count > 0 else None
        conversation_history = build_conversation_history(agents, session.round - 1, veto_reasons)

        for a in agents:
            yield emit("thinking", {"agent_id": a.user_id, "thinking": True})

        proposal_tasks = {
            asyncio.create_task(
                _call_proposal(a, session.round, venue_list, venue_pool, conversation_history)
            ): a
            for a in agents
        }

        for task in asyncio.as_completed(list(proposal_tasks.keys())):
            agent, proposal, error = await task
            yield emit("thinking", {"agent_id": agent.user_id, "thinking": False})
            if error or proposal is None:
                yield emit("error", {"message": f"{agent.name} failed to propose: {error}"})
                proposal = validate_proposal({}, session.round, venue_pool)
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

        # --- Voting ---
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
                vote_data = {
                    "scores": {n: 3 for n in all_names if n != agent.name},
                    "objection": None,
                    "round": session.round,
                }
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

        # --- Check convergence ---
        converged = check_convergence(agents, session.round)
        if converged or session.round >= MAX_ROUNDS:
            break
        yield emit("message", {
            "agent_id": "orchestrator",
            "agent_name": "The Orchestrator",
            "round": session.round,
            "content": f"Round {session.round} complete — no consensus yet. Moving to round {session.round + 1}.",
            "type": "summary",
        })
        session.round += 1

    # --- Verdict ---
    session.phase = "verdict"
    yield emit("phase", {"phase": "verdict", "round": session.round})

    try:
        result = await _call_orchestrator(agents, session.round, venue_pool)
    except Exception as e:
        yield emit("error", {"message": f"Orchestrator error: {e}"})
        result = agents[0].proposals[-1] if agents and agents[0].proposals else validate_proposal({}, session.round, venue_pool)

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
