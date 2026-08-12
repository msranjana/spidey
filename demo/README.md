# Spider-Sense Demo

Deterministic demo for the **API Database Connection Failure** scenario.

The demo creates a real investigation through the Spider-Sense backend, watches
all seven agents run in real time, and prints a terminal summary when complete.
Everything is hardcoded — no LLM calls required.

---

## Quick start

### 1. Start the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Run the demo

From the repository root:

```bash
python -m demo
```

Expected output (approximately 15–20 seconds):

```
──────────────────────────────────────────────────────────────────────
  🕷  Spider-Sense  — API Database Connection Failure Demo
──────────────────────────────────────────────────────────────────────

  Creating investigation...
  Investigation created: <uuid>

  ○ Log Scout          IDLE
  ◉ Log Scout          RUNNING
  ◉ Code Hunter        RUNNING
  ◉ Infra Scout        RUNNING
  ◉ Security Scout     RUNNING
  ● Log Scout          COMPLETE       (3 findings)
      ↳ ERROR: Connection refused to postgres:5432
      ↳ Retry attempts: 5/5 failed — giving up
  ● Security Scout     COMPLETE       (2 findings)
  ● Code Hunter        COMPLETE       (3 findings)
  ● Infra Scout        COMPLETE       (2 findings)
  ● Root Cause         COMPLETE       (3 findings)
  ● Fix                COMPLETE       (7 findings)
  ● Verification       COMPLETE       (6 findings)

══════════════════════════════════════════════════════════════════════
  INVESTIGATION COMPLETE
══════════════════════════════════════════════════════════════════════

  AGENTS
  ──────────────────────────────────────────────────
  ● Log Scout          COMPLETE    (3 findings)
  ● Code Hunter        COMPLETE    (3 findings)
  ● Infra Scout        COMPLETE    (2 findings)
  ● Security Scout     COMPLETE    (2 findings)
  ● Root Cause         COMPLETE    (3 findings)
  ● Fix                COMPLETE    (7 findings)
  ● Verification       COMPLETE    (6 findings)

  ROOT CAUSE
  ──────────────────────────────────────────────────
  PostgreSQL pod crashed due to disk exhaustion (98% PVC
  utilisation), triggering connection pool exhaustion and 847 API
  failures.

  PROPOSED FIX
  ──────────────────────────────────────────────────
  kubectl exec postgres-0 -- vacuumdb --all --analyze; increase PVC
  size from 10Gi to 50Gi

  VERIFICATION
  ──────────────────────────────────────────────────
  API health check: 200 OK; DB connections: 45/100 active; Error
  rate: 0.0%
```

---

## Options

```
python -m demo --help

usage: python -m demo [-h] [--backend URL] [--timeout SECONDS] [--poll-interval SECONDS]

options:
  --backend URL          Spider-Sense backend base URL (default: http://localhost:8000)
  --timeout SECONDS      Max seconds to wait for completion (default: 120)
  --poll-interval SECS   Polling interval in seconds (default: 1.0)
```

---

## Module structure

| File | Purpose |
|---|---|
| `scenario.py` | Hardcoded `SCENARIO` dict with logs, infra state, and repo context |
| `runner.py` | `DemoRunner` class — HTTP client, polling loop, terminal output |
| `__main__.py` | `python -m demo` entry point with argument parsing |
| `README.md` | This file |
| `fixtures/db_connection_failure.json` | Static expected-outcome fixture for QA tests |

---

## Using scenario data in tests

```python
from demo.scenario import SCENARIO

def test_scenario_has_critical_logs():
    critical = [l for l in SCENARIO["logs"] if l["level"] == "CRITICAL"]
    assert len(critical) >= 1
```

## Using the fixture for QA validation

```python
import json, pathlib

fixture = json.loads(
    pathlib.Path("demo/fixtures/db_connection_failure.json").read_text()
)
assert fixture["expected_root_cause_contains"] in investigation["root_cause"]
```

---

## Troubleshooting

**`Could not connect to backend`** — ensure `uvicorn main:app --reload` is
running in the `backend/` directory and the port matches `--backend`.

**Demo finishes instantly with `FAILED`** — the agents module may have raised
an import error.  Check the backend console for tracebacks.

**Colours not showing** — the demo auto-detects TTY; redirect stdout to a file
to get plain text output.
