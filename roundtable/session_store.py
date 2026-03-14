import time
import uuid
from models import NegotiationSession, AgentState, JoinRequest

_sessions: dict[str, NegotiationSession] = {}
SESSION_TTL = 7200  # 2 hours


def create_session(expected_count: int) -> NegotiationSession:
    session_id = str(uuid.uuid4())[:8]
    session = NegotiationSession(
        session_id=session_id,
        expected_count=expected_count,
        created_at=time.time(),
    )
    _sessions[session_id] = session
    return session


def get_session(session_id: str) -> NegotiationSession | None:
    session = _sessions.get(session_id)
    if session and time.time() - session.created_at > SESSION_TTL:
        del _sessions[session_id]
        return None
    return session


def add_agent(session_id: str, req: JoinRequest) -> tuple[AgentState, int]:
    session = get_session(session_id)
    if session is None:
        raise ValueError("Session not found")
    # Prevent duplicate joins
    for agent in session.agents:
        if agent.user_id == req.user_id:
            waiting_for = session.expected_count - len(session.agents)
            return agent, waiting_for
    agent = AgentState(
        user_id=req.user_id,
        name=req.constraints.name,
        constraints=req.constraints,
    )
    session.agents.append(agent)
    waiting_for = session.expected_count - len(session.agents)
    return agent, waiting_for


def is_ready(session_id: str) -> bool:
    session = get_session(session_id)
    if session is None:
        return False
    return len(session.agents) >= session.expected_count
