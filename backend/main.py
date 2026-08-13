"""Spider-Sense FastAPI backend.

Start with:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from investigation import InvestigationManager
from models import (
    AgentResult,
    InvestigationState,
    InvestigationStatus,
    InvestigationSummary,
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
    # Cancel any in-flight investigations on shutdown so they are not
    # silently dropped mid-run.
    await manager.cancel_all()


app = FastAPI(
    title="Spider-Sense",
    description="Agentic incident-response tool API",
    version="0.2.0",
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


@app.get("/api/demo/scenarios")
async def list_demo_scenarios() -> list[dict]:
    """Return metadata for all registered demo scenarios."""
    from demo.registry import list_scenarios

    return list_scenarios()


@app.get("/api/investigations", response_model=list[InvestigationSummary])
async def list_investigations() -> list[InvestigationSummary]:
    """List all investigations (newest first)."""
    return [
        InvestigationSummary(
            id=state.id,
            title=state.title,
            status=state.status,
            created_at=state.created_at,
            updated_at=state.updated_at,
        )
        for state in manager.list()
    ]


@app.post("/api/investigations", response_model=StartInvestigationResponse, status_code=201)
async def create_investigation(
    body: StartInvestigationRequest = StartInvestigationRequest(),
) -> StartInvestigationResponse:
    """Create a new investigation (does not start the pipeline)."""
    state = manager.create(
        title=body.title,
        logs=body.logs,
        stack_trace=body.stack_trace,
        config_snippet=body.config_snippet,
        code_snippet=body.code_snippet,
    )
    return StartInvestigationResponse(
        investigation_id=state.id,
        status=state.status,
    )


@app.post("/api/investigations/{inv_id}/start", status_code=202)
async def start_investigation(inv_id: str) -> dict:
    """Start the investigation pipeline for a custom incident."""
    state = manager.get(inv_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    manager.start(inv_id)
    return {"investigation_id": inv_id, "message": "Investigation started"}


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
async def run_demo(inv_id: str, scenario_id: str | None = None) -> dict:
    """Run a deterministic demo scenario for an existing investigation."""
    from demo.registry import get_fixture, resolve_scenario_id

    state = manager.get(inv_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Investigation not found")

    resolved_id = resolve_scenario_id(scenario_id)
    try:
        get_fixture(resolved_id)
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown scenario_id: {scenario_id}",
        ) from None

    manager.set_scenario(inv_id, resolved_id)
    manager.start(inv_id, scenario_id=resolved_id)
    return {
        "investigation_id": inv_id,
        "scenario_id": resolved_id,
        "message": "Demo triggered",
    }


@app.get("/api/investigations/{inv_id}/stream")
async def stream_investigation(inv_id: str, request: Request) -> StreamingResponse:
    """SSE stream of investigation events."""
    state = manager.get(inv_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Investigation not found")

    async def event_generator():
        q = manager.attach_subscriber(inv_id)
        try:
            yield ": connected\n\n"
            while not await request.is_disconnected():
                try:
                    item = await asyncio.wait_for(q.get(), timeout=0.25)
                except asyncio.TimeoutError:
                    current = manager.get(inv_id)
                    if current is not None and current.status in (
                        InvestigationStatus.PENDING,
                        InvestigationStatus.COMPLETE,
                        InvestigationStatus.FAILED,
                    ):
                        break
                    continue
                if item is None:
                    break
                yield f"data: {item}\n\n"
            yield ": done\n\n"
        finally:
            manager.detach_subscriber(inv_id, q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
