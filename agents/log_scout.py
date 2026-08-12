"""LogScoutAgent — scans application logs for error patterns."""

from __future__ import annotations

import asyncio
from typing import Any

from .base import BaseAgent


class LogScoutAgent(BaseAgent):
    """Analyses application and system logs for error signatures.

    Demo scenario: API Database Connection Failure.
    Timing: ~3.2 s (simulates log ingestion + pattern matching).
    """

    name = "Log Scout"
    _SLEEP: float = 3.2

    async def _investigate(
        self, context: dict[str, Any]
    ) -> tuple[list[str], dict[str, Any]]:
        await asyncio.sleep(self._SLEEP)

        findings = [
            "ERROR: Connection refused to postgres:5432",
            "Retry attempts: 5/5 failed — giving up",
            "847 failed API requests in the last 15 minutes",
        ]

        evidence: dict[str, Any] = {
            "log_lines_analyzed": 1247,
            "error_count": 847,
            "critical_pattern": "connection_refused",
            "first_error_ts": "2026-08-12T15:01:34Z",
            "last_error_ts": "2026-08-12T15:16:22Z",
        }

        return findings, evidence
