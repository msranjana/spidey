"""Spider-Sense demo scenario: API Database Connection Failure.

All data is deterministic and hardcoded except for ``triggered_at``,
which is set to ``datetime.now(timezone.utc)`` at import time so the scenario
always looks fresh.

Usage::

    from demo.scenario import SCENARIO
    print(SCENARIO["title"])

    from demo.registry import list_scenarios, get_fixture
    print(list_scenarios())
"""

from __future__ import annotations

from datetime import datetime, timezone

from demo.registry import DEFAULT_SCENARIO_ID


def _ts(offset_seconds: int) -> str:
    """Return an ISO-8601 timestamp relative to now minus the given offset."""
    base = datetime.now(tz=timezone.utc)
    delta_total = base.timestamp() - offset_seconds
    from datetime import datetime as dt_  # noqa: PLC0415
    return dt_.utcfromtimestamp(delta_total).strftime("%Y-%m-%dT%H:%M:%SZ")


# Build the log timeline once at import time so all timestamps are consistent.
_NOW = datetime.now(tz=timezone.utc)


def _log_ts(offset_seconds: int) -> str:
    """Absolute log timestamp, offset seconds before _NOW."""
    from datetime import datetime as dt_  # noqa: PLC0415
    return dt_.utcfromtimestamp(_NOW.timestamp() - offset_seconds).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


# ---------------------------------------------------------------------------
# Scenario definition
# ---------------------------------------------------------------------------

SCENARIO: dict = {
    "id": DEFAULT_SCENARIO_ID,
    "title": "API Database Connection Failure",
    "description": (
        "api-gateway is returning 503 errors. "
        "Database connection pool exhausted. "
        "847 requests failed in the last 5 minutes."
    ),
    "severity": "CRITICAL",
    "triggered_at": datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z"),

    # ------------------------------------------------------------------
    # 20-line log stream showing the failure building up over 5 minutes.
    # T-5min to T-0: normal → slow queries → warnings → retries → exhaustion → failure
    # ------------------------------------------------------------------
    "logs": [
        # T-5min: Normal operation
        {
            "ts": _log_ts(300),
            "level": "INFO",
            "service": "api-gateway",
            "msg": "GET /api/products 200 OK [12ms] — db_pool=8/10 active",
        },
        {
            "ts": _log_ts(290),
            "level": "INFO",
            "service": "api-gateway",
            "msg": "POST /api/orders 201 Created [18ms] — db_pool=7/10 active",
        },
        {
            "ts": _log_ts(275),
            "level": "INFO",
            "service": "postgres-0",
            "msg": "checkpoint starting: time — wal_buffers_full=0 write=0.142s",
        },
        {
            "ts": _log_ts(260),
            "level": "INFO",
            "service": "api-gateway",
            "msg": "GET /api/users 200 OK [9ms] — db_pool=6/10 active",
        },

        # T-4min: First slow queries
        {
            "ts": _log_ts(240),
            "level": "WARN",
            "service": "postgres-0",
            "msg": "slow query detected: SELECT * FROM orders WHERE ... [duration=1204ms]",
        },
        {
            "ts": _log_ts(228),
            "level": "WARN",
            "service": "api-gateway",
            "msg": "DB query latency spike: p99=1840ms (threshold=500ms) — db_pool=9/10 active",
        },
        {
            "ts": _log_ts(215),
            "level": "WARN",
            "service": "postgres-0",
            "msg": "autovacuum: table 'orders' needs vacuuming, disk pressure detected",
        },

        # T-3min: Connection warnings
        {
            "ts": _log_ts(180),
            "level": "WARN",
            "service": "api-gateway",
            "msg": "Connection pool near capacity: 10/10 slots in use",
        },
        {
            "ts": _log_ts(172),
            "level": "ERROR",
            "service": "postgres-0",
            "msg": "FATAL: could not write to file 'pg_wal/000000010000002B': No space left on device",
        },
        {
            "ts": _log_ts(165),
            "level": "ERROR",
            "service": "postgres-0",
            "msg": "database system is shut down — disk exhaustion at 10.0Gi / 10.0Gi (100%)",
        },

        # T-2min: Retries starting
        {
            "ts": _log_ts(120),
            "level": "ERROR",
            "service": "api-gateway",
            "msg": "connect() to postgres:5432 failed: Connection refused — retry 1/5",
        },
        {
            "ts": _log_ts(115),
            "level": "ERROR",
            "service": "api-gateway",
            "msg": "connect() to postgres:5432 failed: Connection refused — retry 2/5",
        },
        {
            "ts": _log_ts(110),
            "level": "ERROR",
            "service": "api-gateway",
            "msg": "connect() to postgres:5432 failed: Connection refused — retry 3/5",
        },
        {
            "ts": _log_ts(105),
            "level": "WARN",
            "service": "k8s-kubelet",
            "msg": "Pod postgres-0: container unhealthy, liveness probe failed (attempt 3/3)",
        },

        # T-1min: Pool exhaustion
        {
            "ts": _log_ts(60),
            "level": "ERROR",
            "service": "api-gateway",
            "msg": "connect() to postgres:5432 failed: Connection refused — retry 5/5",
        },
        {
            "ts": _log_ts(55),
            "level": "ERROR",
            "service": "api-gateway",
            "msg": "ConnectionPoolExhausted: all 10 connections failed — circuit open",
        },
        {
            "ts": _log_ts(50),
            "level": "ERROR",
            "service": "k8s-kubelet",
            "msg": "Pod postgres-0 status: CrashLoopBackOff (restart #15)",
        },
        {
            "ts": _log_ts(45),
            "level": "ERROR",
            "service": "api-gateway",
            "msg": "503 Service Unavailable — database unavailable, 312 requests failed this minute",
        },

        # T-0: Complete failure
        {
            "ts": _log_ts(10),
            "level": "CRITICAL",
            "service": "api-gateway",
            "msg": (
                "ALERT: 847 requests failed (503) in last 5 minutes — "
                "error_rate=100% — paging on-call engineer"
            ),
        },
        {
            "ts": _log_ts(2),
            "level": "CRITICAL",
            "service": "alertmanager",
            "msg": (
                "[FIRING] APIHighErrorRate: api-gateway error_rate=100% "
                "severity=critical for=5m — runbook: https://wiki/db-connection-failure"
            ),
        },
    ],

    # ------------------------------------------------------------------
    # Infrastructure state snapshot at T-0
    # ------------------------------------------------------------------
    "infra_state": {
        "pods": [
            {
                "name": "postgres-0",
                "namespace": "production",
                "status": "CrashLoopBackOff",
                "restarts": 15,
                "ready": False,
                "age": "42d",
            },
            {
                "name": "api-gateway-7d9f8b-xkp2r",
                "namespace": "production",
                "status": "Running",
                "restarts": 0,
                "ready": True,
                "age": "6d",
            },
            {
                "name": "api-gateway-7d9f8b-mn3ts",
                "namespace": "production",
                "status": "Running",
                "restarts": 0,
                "ready": True,
                "age": "6d",
            },
        ],
        "persistent_volumes": [
            {
                "name": "postgres-pvc",
                "capacity": "10Gi",
                "used": "9.8Gi",
                "used_pct": 98,
                "status": "Bound",
            }
        ],
        "nodes": [
            {
                "name": "node-01",
                "cpu_pct": 34,
                "memory_pct": 61,
                "disk_pct": 43,
                "status": "Ready",
            }
        ],
        "services": [
            {"name": "api-gateway", "endpoint": "api.prod.internal:80", "healthy": True},
            {"name": "postgres", "endpoint": "postgres:5432", "healthy": False},
        ],
        "error_budget": {
            "remaining_pct": 0,
            "burn_rate_1h": 28.4,
            "slo": "99.9% availability",
        },
    },

    # ------------------------------------------------------------------
    # Repository context: relevant code snippets for Code Hunter
    # ------------------------------------------------------------------
    "repo_context": {
        "relevant_files": [
            {
                "path": "src/db/pool.py",
                "language": "python",
                "snippet": (
                    "class ConnectionPool:\n"
                    "    POOL_SIZE = 10  # TODO: make configurable\n"
                    "\n"
                    "    def connect(self):\n"
                    "        # BUG: no timeout — will block indefinitely\n"
                    "        conn = self._pool.acquire()  # missing timeout=\n"
                    "        return conn\n"
                ),
                "issues": ["missing_timeout", "hardcoded_pool_size"],
            },
            {
                "path": "src/db/connection.py",
                "language": "python",
                "snippet": (
                    "def get_db_connection():\n"
                    "    pool = ConnectionPool()\n"
                    "    # No circuit breaker, no retry limit\n"
                    "    return pool.connect()\n"
                ),
                "issues": ["no_circuit_breaker"],
            },
            {
                "path": "src/api/routes.py",
                "language": "python",
                "snippet": (
                    "@app.route('/api/products')\n"
                    "def get_products():\n"
                    "    db = get_db_connection()  # can hang forever\n"
                    "    return db.query('SELECT * FROM products')\n"
                ),
                "issues": ["missing_timeout"],
            },
        ],
        "total_files": 47,
        "repo": "github.com/acme/api-service",
        "commit": "a3f9c21",
    },
}
