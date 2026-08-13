"""Scenario registry — loads demo fixtures from ``demo/fixtures/``.

Each JSON fixture must include a top-level ``scenario`` object with an ``id``
field.  The registry is keyed by that id.

Usage::

    from demo.registry import get_fixture, list_scenarios, resolve_scenario_id

    fixture = get_fixture("api-db-connection-failure")
    scenario_id = resolve_scenario_id(None)  # -> default
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
DEFAULT_SCENARIO_ID = "api-db-connection-failure"


@lru_cache(maxsize=1)
def _load_registry() -> dict[str, dict[str, Any]]:
    """Load and index all fixture files by scenario id."""
    registry: dict[str, dict[str, Any]] = {}
    for path in sorted(FIXTURES_DIR.glob("*.json")):
        fixture = json.loads(path.read_text(encoding="utf-8"))
        scenario = fixture.get("scenario", {})
        scenario_id = scenario.get("id")
        if not scenario_id:
            raise ValueError(f"Fixture {path.name} is missing scenario.id")
        if scenario_id in registry:
            raise ValueError(f"Duplicate scenario id {scenario_id!r} in {path.name}")
        registry[scenario_id] = fixture
    if DEFAULT_SCENARIO_ID not in registry:
        raise ValueError(
            f"Default scenario {DEFAULT_SCENARIO_ID!r} not found in {FIXTURES_DIR}"
        )
    return registry


def list_scenarios() -> list[dict[str, Any]]:
    """Return scenario metadata for every registered fixture."""
    registry = _load_registry()
    return [
        {
            "id": fixture["scenario"]["id"],
            "title": fixture["scenario"]["title"],
            "description": fixture["scenario"]["description"],
            "severity": fixture["scenario"]["severity"],
        }
        for fixture in registry.values()
    ]


def list_scenario_ids() -> list[str]:
    """Return all registered scenario ids."""
    return list(_load_registry().keys())


def get_fixture(scenario_id: str) -> dict[str, Any]:
    """Return the full fixture dict for *scenario_id*."""
    registry = _load_registry()
    if scenario_id not in registry:
        raise KeyError(scenario_id)
    return registry[scenario_id]


def resolve_scenario_id(scenario_id: str | None) -> str:
    """Return *scenario_id* or the default when ``None`` or empty."""
    if scenario_id is None or scenario_id.strip() == "":
        return DEFAULT_SCENARIO_ID
    return scenario_id.strip()


def clear_cache() -> None:
    """Clear the registry cache (for tests)."""
    _load_registry.cache_clear()
