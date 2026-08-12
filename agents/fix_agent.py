"""FixAgent — generates a remediation plan based on root-cause findings."""

from __future__ import annotations

import asyncio
from typing import Any

from .base import BaseAgent


class FixAgent(BaseAgent):
    """Produces a concrete, ordered remediation plan.

    Demo scenario: disk-exhaustion cascade failure.
    Timing: ~1.8 s (simulates plan generation + risk assessment).
    """

    name = "Fix"
    _SLEEP: float = 1.8

    async def _investigate(
        self, context: dict[str, Any]
    ) -> tuple[list[str], dict[str, Any]]:
        await asyncio.sleep(self._SLEEP)

        steps = [
            "Step 1 — Reclaim disk space: kubectl exec postgres-0 -- vacuumdb --all --analyze",
            "Step 2 — Expand PVC: kubectl patch pvc postgres-pvc -p '{\"spec\":{\"resources\":{\"requests\":{\"storage\":\"50Gi\"}}}}'",
            "Step 3 — Restart StatefulSet: kubectl rollout restart statefulset/postgres",
            "Step 4 — Increase connection pool: set DB_POOL_SIZE=50 in app config",
            "Step 5 — Add pool timeout: set DB_POOL_TIMEOUT=30 in app config",
        ]

        findings = steps + [
            "Estimated remediation time: 5 minutes",
            "Risk assessment: LOW — all changes are reversible",
        ]

        evidence: dict[str, Any] = {
            "step_count": len(steps),
            "risk": "low",
            "estimated_minutes": 5,
            "reversible": True,
            "commands": [
                "vacuumdb --all --analyze",
                "kubectl patch pvc postgres-pvc ...",
                "kubectl rollout restart statefulset/postgres",
            ],
            "config_changes": {
                "DB_POOL_SIZE": {"from": 10, "to": 50},
                "DB_POOL_TIMEOUT": {"from": None, "to": 30},
            },
        }

        return findings, evidence
