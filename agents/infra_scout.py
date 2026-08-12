"""InfraScoutAgent — checks Kubernetes pod/PVC/node health."""

from __future__ import annotations

import asyncio
from typing import Any

from .base import BaseAgent


class InfraScoutAgent(BaseAgent):
    """Polls infrastructure state (pods, volumes, nodes).

    Demo scenario: API Database Connection Failure.
    Timing: ~3.7 s (simulates kubectl API calls + metric scraping).
    """

    name = "Infra Scout"
    _SLEEP: float = 3.7

    async def _investigate(
        self, context: dict[str, Any]
    ) -> tuple[list[str], dict[str, Any]]:
        await asyncio.sleep(self._SLEEP)

        findings = [
            "postgres-0 pod is in CrashLoopBackOff — 15 restarts recorded",
            "Persistent Volume Claim disk usage at 98% (9.8Gi / 10Gi)",
        ]

        evidence: dict[str, Any] = {
            "pod_status": "CrashLoopBackOff",
            "pod_restarts": 15,
            "disk_usage_pct": 98,
            "disk_used_gi": 9.8,
            "disk_capacity_gi": 10,
            "node_cpu_pct": 34,
            "node_mem_pct": 61,
        }

        return findings, evidence
