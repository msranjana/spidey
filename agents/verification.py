"""VerificationAgent — runs health checks to confirm remediation success."""

from __future__ import annotations

import asyncio
from typing import Any

from .base import BaseAgent


class VerificationAgent(BaseAgent):
    """Executes post-fix health probes and reports pass/fail.

    Demo scenario: all checks pass after remediation.
    Timing: ~2.5 s (simulates HTTP probe + DB ping + metric poll).
    """

    name = "Verification"
    _SLEEP: float = 2.5

    async def _investigate(
        self, context: dict[str, Any]
    ) -> tuple[list[str], dict[str, Any]]:
        await asyncio.sleep(self._SLEEP)

        checks = {
            "api_health": "200 OK",
            "db_connections": "45/100 active",
            "error_rate": "0.00%",
            "postgres_pod": "Running",
            "disk_usage_pct": 61,  # after vacuum + PVC resize
        }

        all_pass = (
            checks["api_health"] == "200 OK"
            and checks["postgres_pod"] == "Running"
            and checks["error_rate"] == "0.00%"
        )

        verdict = "PASS" if all_pass else "FAIL"

        findings = [
            f"Verification result: {verdict}",
            f"API health check: {checks['api_health']}",
            f"Database connections: {checks['db_connections']}",
            f"API error rate: {checks['error_rate']}",
            f"PostgreSQL pod status: {checks['postgres_pod']}",
            f"PVC disk usage: {checks['disk_usage_pct']}% (post-remediation)",
        ]

        evidence: dict[str, Any] = {
            "verdict": verdict,
            **checks,
            "checks_run": len(checks),
            "checks_passed": len(checks),
        }

        return findings, evidence
