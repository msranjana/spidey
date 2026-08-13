"""Spider-Sense demo package — deterministic incident scenarios."""

from demo.registry import (
    DEFAULT_SCENARIO_ID,
    get_fixture,
    list_scenarios,
    resolve_scenario_id,
)

__all__ = [
    "DEFAULT_SCENARIO_ID",
    "get_fixture",
    "list_scenarios",
    "resolve_scenario_id",
]
