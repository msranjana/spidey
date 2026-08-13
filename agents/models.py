"""Shared agent data models.

Re-exports the canonical Pydantic models defined in ``backend/models.py`` so
the agents package and the backend use one single set of types (no drift, no
manual conversion).

The backend directory is placed on ``sys.path`` (mirroring the strategy used
by ``backend/investigation.py``) so ``import models`` resolves to
``backend/models.py`` regardless of how this package is imported.
"""

from __future__ import annotations

import sys
from pathlib import Path

_BACKEND_DIR = str(Path(__file__).resolve().parent.parent / "backend")
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from models import AgentResult, AgentStatus  # noqa: E402

__all__ = ["AgentResult", "AgentStatus"]
