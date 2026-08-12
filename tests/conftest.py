"""Shared pytest fixtures for Spider-Sense test suite."""

from __future__ import annotations

import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Ensure repo root and backend dir are importable from any CWD.
# ---------------------------------------------------------------------------
_ROOT = Path(__file__).resolve().parent.parent
_BACKEND = _ROOT / "backend"

for _p in (_ROOT, _BACKEND):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import pytest
from fastapi.testclient import TestClient

# Patch all agent sleep times to near-zero before anything else imports them.
# This must happen before `agents` is imported so the class vars are set early.
from agents import (
    CodeHunterAgent,
    FixAgent,
    InfraScoutAgent,
    LogScoutAgent,
    RootCauseAgent,
    SecurityScoutAgent,
    VerificationAgent,
)

_FAST = 0.01
for _cls in (
    LogScoutAgent,
    CodeHunterAgent,
    InfraScoutAgent,
    SecurityScoutAgent,
    RootCauseAgent,
    FixAgent,
    VerificationAgent,
):
    _cls._SLEEP = _FAST  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Backend app fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def app():
    """Return the FastAPI app instance (session-scoped)."""
    from main import app as _app
    return _app


@pytest.fixture()
def client(app):
    """Return a fresh synchronous TestClient for each test."""
    return TestClient(app)


# ---------------------------------------------------------------------------
# Investigation helper fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def created_investigation(client):
    """Create an investigation and return (client, inv_id)."""
    resp = client.post("/api/investigations", json={"title": "Test Investigation"})
    assert resp.status_code == 201
    inv_id = resp.json()["investigation_id"]
    return client, inv_id


# ---------------------------------------------------------------------------
# pytest-asyncio configuration
# ---------------------------------------------------------------------------

# Set default asyncio mode so async test functions work without decoration.
# This requires pytest-asyncio >= 0.21.
def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: marks tests as integration tests requiring a live backend",
    )
