# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Roundtable** — a collaborative group decision-making backend that uses multi-agent LLM negotiation to help groups of 2–6 people plan Edinburgh night outs. Agents negotiate across 3 rounds, voting on venue proposals, with real-time streaming via SSE.

## Commands

```bash
pip install -r requirements.txt
uvicorn main:app --reload          # dev server → http://localhost:8000
```

No test, lint, or build tooling is configured.

## Architecture

### Request Lifecycle

1. `POST /roundtable/session` — creates session with expected group size
2. `POST /roundtable/session/{id}/join` — each participant joins with constraints (budget, dietary, mood, time)
3. When all agents have joined, negotiation starts automatically
4. `GET /roundtable/session/{id}/stream` — SSE stream; replays history for late joiners then delivers live events
5. `POST /roundtable/session/{id}/veto` — restart negotiation (up to 3 vetoes)

### Negotiation Flow (`runner.py`)

`run_negotiation()` is an async generator that streams SSE events through:
- **Research:** `fetch_venues.py` queries Google Places for ~24 Edinburgh venues (8 pre-drinks, 8 dinner, 8 bars)
- **Proposals:** Agents each propose a 3-venue itinerary (parallel LLM calls via `asyncio.as_completed`)
- **Voting:** Agents score each proposal 1–5 with optional objections (parallel LLM calls)
- **Verdict:** Orchestrator LLM selects the winner and writes a summary

Up to 3 rounds before forcing a verdict. Convergence is detected early if scores agree.

### Key Files

| File | Role |
|------|------|
| `main.py` | FastAPI endpoints, CORS, asyncio.Event to gate negotiation start, SSE dispatch |
| `runner.py` | Negotiation loop phases, JSON extraction helpers, fallback venue logic |
| `prompts.py` | All LLM prompt templates (agent system, proposal, reaction, voting, orchestrator) |
| `models.py` | Pydantic models — `NegotiationSession`, `AgentState`, `Venue`, all API contracts |
| `session_store.py` | In-memory session dict with 2-hour TTL; `create_session`, `add_agent`, `is_ready` |
| `fetch_venues.py` | Google Places API queries, Edinburgh centroid fallback, venue formatting with MD5 IDs |
| `config.py` | Loads `OPENAI_API_KEY`, `OPENAI_MODEL`, `GOOGLE_MAPS_API_KEY` from `.env` |

### External APIs

| API | Purpose |
|-----|---------|
| OpenAI API | Agent proposals, voting, orchestrator verdict |
| Google Places API | Venue discovery around agent GPS centroid |

### Session State

`NegotiationSession` (in `models.py`) holds: agents list, current phase/round, veto count, full message history, and fetched venues. All state is in-memory — no database persistence.
