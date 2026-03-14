from __future__ import annotations
from typing import Literal
from pydantic import BaseModel


class UserConstraints(BaseModel):
    name: str
    budget: Literal["budget", "mid", "splurge"]
    dietary: str
    location: str
    mood: str
    time: str


class JoinRequest(BaseModel):
    user_id: str
    constraints: UserConstraints


class CreateSessionRequest(BaseModel):
    expected_count: int


class CreateSessionResponse(BaseModel):
    session_id: str


class JoinResponse(BaseModel):
    position: int
    waiting_for: int


class SessionStatusResponse(BaseModel):
    session_id: str
    expected_count: int
    agent_count: int
    phase: str
    waiting_for: int


class VetoRequest(BaseModel):
    user_id: str
    reason: str


class VenueSlot(BaseModel):
    slot: Literal["pre_drinks", "dinner", "bar"]
    venue_id: str
    venue_name: str
    address: str
    lat: float
    lng: float
    reason: str


class ItineraryResult(BaseModel):
    venues: list[VenueSlot]
    summary: str
    round: int


class AgentState(BaseModel):
    user_id: str
    name: str
    constraints: UserConstraints
    proposals: list[ItineraryResult] = []
    votes: list[dict] = []


class NegotiationSession(BaseModel):
    session_id: str
    expected_count: int
    agents: list[AgentState] = []
    phase: str = "waiting"
    round: int = 0
    result: ItineraryResult | None = None
    veto_count: int = 0
    veto_reasons: list[str] = []
    message_history: list[dict] = []
    started: bool = False
    created_at: float = 0.0
