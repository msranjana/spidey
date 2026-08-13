"""RootCauseAgent — correlates findings from parallel scouts to identify root cause."""

from __future__ import annotations

import asyncio
from typing import Any

from .base import BaseAgent


class RootCauseAgent(BaseAgent):
    """Correlates evidence from Log / Code / Infra / Security scouts.

    Applies deterministic correlation rules:
      • disk_usage_pct >= 95  AND
      • pod_status == CrashLoopBackOff  AND
      • critical_pattern == connection_refused
    → Disk-exhaustion cascade failure.

    Timing: ~2.1 s (simulates correlation graph traversal).
    """

    name = "Root Cause"
    _SLEEP: float = 2.1

    # ------------------------------------------------------------------
    # Correlation thresholds
    # ------------------------------------------------------------------
    _DISK_THRESHOLD: int = 95
    _CRASH_STATUS: str = "CrashLoopBackOff"
    _LOG_PATTERN: str = "connection_refused"

    async def _investigate(
        self, context: dict[str, Any]
    ) -> tuple[list[str], dict[str, Any]]:
        await asyncio.sleep(self._SLEEP)

        # Pull evidence collected by upstream agents (if passed through context).
        infra_evidence: dict[str, Any] = context.get("infra_evidence", {})
        log_evidence: dict[str, Any] = context.get("log_evidence", {})

        disk_pct: int = infra_evidence.get("disk_usage_pct", 98)
        pod_status: str = infra_evidence.get("pod_status", self._CRASH_STATUS)
        log_pattern: str = log_evidence.get("critical_pattern", self._LOG_PATTERN)

        # Evaluate correlation rule.
        disk_trigger = disk_pct >= self._DISK_THRESHOLD
        crash_trigger = pod_status == self._CRASH_STATUS
        conn_trigger = log_pattern == self._LOG_PATTERN

        if disk_trigger and crash_trigger and conn_trigger:
            root_cause = (
                f"PostgreSQL pod crashed due to disk exhaustion "
                f"({disk_pct}% PVC utilisation), triggering connection pool "
                f"exhaustion and {log_evidence.get('error_count', 847)} API failures."
            )
            confidence = 0.97
            severity = "critical"
            affected_component = "PostgreSQL / postgres-0 (StatefulSet)"
        else:
            root_cause = "Partial correlation — manual review required."
            confidence = 0.50
            severity = "medium"
            affected_component = "Unknown — insufficient correlation"

        contributing_evidence = [
            {
                "source": "Infra Scout",
                "finding": f"PVC disk usage at {disk_pct}% (threshold {self._DISK_THRESHOLD}%)",
                "relevance": 0.95 if disk_trigger else 0.30,
            },
            {
                "source": "Infra Scout",
                "finding": f"Pod status: {pod_status}",
                "relevance": 0.90 if crash_trigger else 0.25,
            },
            {
                "source": "Log Scout",
                "finding": f"Critical pattern: {log_pattern} ({log_evidence.get('error_count', 847)} errors)",
                "relevance": 0.88 if conn_trigger else 0.20,
            },
            {
                "source": "Code Hunter",
                "finding": "db_pool.connect() lacks timeout; no pool exhaustion handling",
                "relevance": 0.72,
            },
        ]

        findings = [
            root_cause,
            f"Confidence score: {confidence:.0%}",
            f"Severity: {severity}",
            f"Affected component: {affected_component}",
            "Cascade chain: disk full → postgres crash → pool exhausted → API 500s",
        ]

        evidence: dict[str, Any] = {
            "confidence": confidence,
            "severity": severity,
            "affected_component": affected_component,
            "contributing_evidence": contributing_evidence,
            "root_cause_summary": root_cause,
            "triggers": {
                "disk_exhaustion": disk_trigger,
                "pod_crash_loop": crash_trigger,
                "connection_refused": conn_trigger,
            },
            "correlated_agents": ["Log Scout", "Infra Scout", "Code Hunter"],
        }

        return findings, evidence
