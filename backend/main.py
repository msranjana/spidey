"""Spider-Sense FastAPI backend.

Start with:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from investigation import InvestigationManager
from models import (
    AgentResult,
    InvestigationState,
    StartInvestigationRequest,
    StartInvestigationResponse,
)


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

manager = InvestigationManager()


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN001
    yield


app = FastAPI(
    title="Spider-Sense",
    description="Agentic incident-response tool API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # frontend at localhost:5173
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/api/investigations", response_model=StartInvestigationResponse, status_code=201)
async def start_investigation(body: StartInvestigationRequest = StartInvestigationRequest()) -> StartInvestigationResponse:
    """Create and immediately start a new investigation."""
    state = manager.create(title=body.title)
    asyncio.create_task(manager.run_investigation(state.id))
    return StartInvestigationResponse(
        investigation_id=state.id,
        status=state.status,
    )


@app.get("/api/investigations/{inv_id}", response_model=InvestigationState)
async def get_investigation(inv_id: str) -> InvestigationState:
    state = manager.get(inv_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return state


@app.get("/api/investigations/{inv_id}/agents", response_model=dict[str, AgentResult])
async def get_agents(inv_id: str) -> dict[str, AgentResult]:
    state = manager.get(inv_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return state.agents


@app.post("/api/investigations/{inv_id}/run-demo", status_code=202)
async def run_demo(inv_id: str) -> dict:
    """Re-trigger the demo scenario for an existing investigation."""
    state = manager.get(inv_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    asyncio.create_task(manager.run_investigation(inv_id))
    return {"investigation_id": inv_id, "message": "Demo triggered"}


@app.get("/api/investigations/{inv_id}/stream")
async def stream_investigation(inv_id: str) -> StreamingResponse:
    """SSE stream of investigation events."""
    state = manager.get(inv_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Investigation not found")

    async def event_generator():
        # Send a comment line immediately so the client knows the stream is open
        yield ": connected\n\n"
        async for raw_json in manager.subscribe(inv_id):
            # SSE format: data: <payload>\n\n
            yield f"data: {raw_json}\n\n"
        # Final empty comment to signal stream end
        yield ": done\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
