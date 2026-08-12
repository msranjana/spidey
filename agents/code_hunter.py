"""CodeHunterAgent — inspects source code for anti-patterns and misconfigurations."""

from __future__ import annotations

import asyncio
from typing import Any

from .base import BaseAgent


class CodeHunterAgent(BaseAgent):
    """Static-analysis style scan of application source code.

    Demo scenario: API Database Connection Failure.
    Timing: ~4.1 s (simulates AST walk + pattern matching across files).
    """

    name = "Code Hunter"
    _SLEEP: float = 4.1

    async def _investigate(
        self, context: dict[str, Any]
    ) -> tuple[list[str], dict[str, Any]]:
        await asyncio.sleep(self._SLEEP)

        findings = [
            "db_pool.connect() called without timeout parameter",
            "No circuit breaker pattern implemented around DB calls",
            "Connection pool size hardcoded to 10 — insufficient for load",
        ]

        evidence: dict[str, Any] = {
            "files_scanned": 47,
            "severity": "high",
            "affected_files": [
                "src/db/pool.py",
                "src/db/connection.py",
                "src/api/routes.py",
            ],
            "rule_hits": {
                "missing_timeout": 12,
                "no_circuit_breaker": 1,
                "hardcoded_pool_size": 1,
            },
        }

        return findings, evidence
