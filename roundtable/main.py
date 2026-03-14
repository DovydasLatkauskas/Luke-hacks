from __future__ import annotations
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

import session_store
from models import (
    CreateSessionRequest,
    CreateSessionResponse,
    FeedbackRequest,
    JoinRequest,
    JoinResponse,
    SessionStatusResponse,
    VetoRequest,
)
from runner import run_negotiation

# asyncio.Event per session to signal "all joined"
_ready_events: dict[str, asyncio.Event] = {}
# asyncio.Event per session to signal "feedback received, continue negotiation"
_feedback_events: dict[str, asyncio.Event] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Roundtable", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/roundtable/session", response_model=CreateSessionResponse)
async def create_session(req: CreateSessionRequest):
    if not (2 <= req.expected_count <= 6):
        raise HTTPException(400, "expected_count must be between 2 and 6")
    session = session_store.create_session(req.expected_count)
    _ready_events[session.session_id] = asyncio.Event()
    return CreateSessionResponse(session_id=session.session_id)


@app.post("/roundtable/session/{session_id}/join", response_model=JoinResponse)
async def join_session(session_id: str, req: JoinRequest):
    session = session_store.get_session(session_id)
    if session is None:
        raise HTTPException(404, "Session not found")
    if session.phase != "waiting":
        raise HTTPException(409, "Session already started")

    agent, waiting_for = session_store.add_agent(session_id, req)
    position = next(
        (i + 1 for i, a in enumerate(session.agents) if a.user_id == req.user_id),
        len(session.agents),
    )

    if waiting_for == 0 and session_id in _ready_events:
        _ready_events[session_id].set()

    return JoinResponse(position=position, waiting_for=waiting_for)


@app.get("/roundtable/session/{session_id}", response_model=SessionStatusResponse)
async def get_session(session_id: str):
    session = session_store.get_session(session_id)
    if session is None:
        raise HTTPException(404, "Session not found")
    return SessionStatusResponse(
        session_id=session.session_id,
        expected_count=session.expected_count,
        agent_count=len(session.agents),
        phase=session.phase,
        waiting_for=max(0, session.expected_count - len(session.agents)),
    )


@app.get("/roundtable/session/{session_id}/stream")
async def stream_session(session_id: str, user_id: str = ""):
    session = session_store.get_session(session_id)
    if session is None:
        raise HTTPException(404, "Session not found")

    async def event_generator():
        # Replay history for late joiners
        for ev in list(session.message_history):
            yield {"event": ev["event"], "data": ev["data"]}

        # If negotiation not started yet, wait for all agents
        if not session.started:
            if not session_store.is_ready(session_id):
                # Wait for ready event (max 120s)
                event = _ready_events.get(session_id)
                if event:
                    try:
                        await asyncio.wait_for(event.wait(), timeout=120)
                    except asyncio.TimeoutError:
                        yield {"event": "error", "data": '{"message":"Timeout waiting for players"}'}
                        return

            session.started = True
            session.round = 1
            # Create feedback event for this session
            _feedback_events[session_id] = asyncio.Event()
            async for ev in run_negotiation(session, _feedback_events.get(session_id)):
                yield {"event": ev["event"], "data": ev["data"]}
        else:
            # Follow live: poll message_history for new events
            seen = len(session.message_history)
            while session.phase != "done":
                await asyncio.sleep(0.2)
                new_events = session.message_history[seen:]
                for ev in new_events:
                    yield {"event": ev["event"], "data": ev["data"]}
                seen = len(session.message_history)

    return EventSourceResponse(
        event_generator(),
        headers={"X-Accel-Buffering": "no"},
    )


@app.post("/roundtable/session/{session_id}/feedback")
async def submit_feedback(session_id: str, req: FeedbackRequest):
    session = session_store.get_session(session_id)
    if session is None:
        raise HTTPException(404, "Session not found")
    if session.phase != "feedback":
        raise HTTPException(409, "Not currently accepting feedback")

    session.feedback.append({
        "user_id": req.user_id,
        "text": req.text,
        "round": session.round,
    })

    # Signal the runner to continue to the next round
    event = _feedback_events.get(session_id)
    if event:
        event.set()

    return {"ok": True}


@app.post("/roundtable/session/{session_id}/veto")
async def veto_session(session_id: str, req: VetoRequest):
    session = session_store.get_session(session_id)
    if session is None:
        raise HTTPException(404, "Session not found")
    if session.phase != "done":
        raise HTTPException(409, "No result to veto yet")
    if session.veto_count >= 3:
        raise HTTPException(409, "Maximum vetoes reached")

    session.veto_reasons.append(req.reason)
    session.veto_count += 1
    session.round = 1  # reset round counter for fresh negotiation
    session.phase = "proposals"
    session.started = True  # keep started so stream poll picks up new events

    # Run veto round in background so the SSE poll picks it up
    asyncio.create_task(_run_veto(session_id))
    return {"ok": True}


async def _run_veto(session_id: str) -> None:
    session = session_store.get_session(session_id)
    if session is None:
        return
    _feedback_events[session_id] = asyncio.Event()
    async for _ in run_negotiation(session, _feedback_events.get(session_id)):
        pass  # events are stored in message_history; SSE poll picks them up
