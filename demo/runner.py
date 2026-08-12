"""Spider-Sense demo runner.

Orchestrates the full demo lifecycle:

1. Creates an investigation via ``POST /api/investigations``.
2. Polls ``GET /api/investigations/{id}`` every second and prints live progress.
3. Prints a rich terminal summary when the investigation reaches COMPLETE or FAILED.

Usage::

    from demo.runner import DemoRunner
    runner = DemoRunner()
    runner.run(backend_url="http://localhost:8000")

No external dependencies — stdlib only (urllib, json, time).
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from typing import Any

# ANSI colour codes (fall back gracefully on terminals that don't support them)
_RESET = "\033[0m"
_BOLD = "\033[1m"
_DIM = "\033[2m"
_RED = "\033[31m"
_GREEN = "\033[32m"
_YELLOW = "\033[33m"
_CYAN = "\033[36m"
_MAGENTA = "\033[35m"
_WHITE = "\033[37m"

# Agent display order (matches investigation pipeline)
_AGENT_ORDER = [
    "Log Scout",
    "Code Hunter",
    "Infra Scout",
    "Security Scout",
    "Root Cause",
    "Fix",
    "Verification",
]

_STATUS_COLOUR = {
    "IDLE": _DIM,
    "RUNNING": _YELLOW,
    "COMPLETE": _GREEN,
    "FAILED": _RED,
}

_INV_STATUS_COLOUR = {
    "PENDING": _DIM,
    "RUNNING": _YELLOW,
    "COMPLETE": _GREEN,
    "FAILED": _RED,
}


def _http_get(url: str, timeout: int = 10) -> dict[str, Any]:
    """Perform a GET request and return the parsed JSON body."""
    req = urllib.request.Request(url, method="GET")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _http_post(url: str, body: dict | None = None, timeout: int = 10) -> dict[str, Any]:
    """Perform a POST request with an optional JSON body and return parsed JSON."""
    data = json.dumps(body or {}).encode() if body is not None else b""
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _colour(text: str, code: str) -> str:
    """Wrap text in an ANSI colour code if stdout is a TTY."""
    if not sys.stdout.isatty():
        return text
    return f"{code}{text}{_RESET}"


def _print_separator(char: str = "─", width: int = 70) -> None:
    print(_colour(char * width, _DIM))


def _agent_status_icon(status: str) -> str:
    icons = {
        "IDLE": "○",
        "RUNNING": "◉",
        "COMPLETE": "●",
        "FAILED": "✗",
    }
    return icons.get(status, "?")


class DemoRunner:
    """Runs the Spider-Sense demo against a live backend.

    Parameters
    ----------
    poll_interval:
        Seconds between status polls (default 1.0).
    timeout:
        Maximum seconds to wait for the investigation to finish (default 120).
    """

    def __init__(self, poll_interval: float = 1.0, timeout: float = 120.0) -> None:
        self.poll_interval = poll_interval
        self.timeout = timeout

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def run(self, backend_url: str = "http://localhost:8000") -> dict[str, Any]:
        """Create an investigation, run the demo, and return the final state.

        Returns the final ``InvestigationState`` dict, or raises
        ``RuntimeError`` on failure.
        """
        backend_url = backend_url.rstrip("/")

        # Step 1 — create the investigation
        inv_id = self._create_investigation(backend_url)

        # Step 2 — poll until complete
        final_state = self._poll_until_done(backend_url, inv_id)

        # Step 3 — print summary
        self._print_summary(final_state)

        return final_state

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _create_investigation(self, backend_url: str) -> str:
        """POST /api/investigations and return the new investigation ID."""
        url = f"{backend_url}/api/investigations"
        payload = {"title": "API Database Connection Failure"}

        print()
        _print_separator()
        print(
            _colour("  🕷  Spider-Sense", _BOLD + _CYAN)
            + _colour("  — API Database Connection Failure Demo", _WHITE)
        )
        _print_separator()
        print()
        print(_colour("  Creating investigation...", _DIM))

        try:
            resp = _http_post(url, body=payload)
        except urllib.error.URLError as exc:
            raise RuntimeError(
                f"Could not connect to backend at {backend_url}.\n"
                f"Is the backend running?  uvicorn main:app --reload\n"
                f"Original error: {exc}"
            ) from exc

        inv_id: str = resp["investigation_id"]
        print(
            _colour("  Investigation created: ", _DIM)
            + _colour(inv_id, _BOLD)
        )
        print()
        return inv_id

    def _poll_until_done(self, backend_url: str, inv_id: str) -> dict[str, Any]:
        """Poll GET /api/investigations/{id} until status is COMPLETE or FAILED."""
        url = f"{backend_url}/api/investigations/{inv_id}"
        deadline = time.monotonic() + self.timeout
        last_agent_statuses: dict[str, str] = {}
        spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
        spin_idx = 0

        while time.monotonic() < deadline:
            try:
                state = _http_get(url)
            except urllib.error.URLError as exc:
                print(_colour(f"  Poll error: {exc}", _YELLOW), end="\r")
                time.sleep(self.poll_interval)
                continue

            inv_status: str = state.get("status", "PENDING")
            agents: dict[str, Any] = state.get("agents", {})

            # Print any newly-changed agent statuses
            for agent_name in _AGENT_ORDER:
                if agent_name not in agents:
                    continue
                agent_data = agents[agent_name]
                new_status = agent_data.get("status", "IDLE")
                if last_agent_statuses.get(agent_name) != new_status:
                    last_agent_statuses[agent_name] = new_status
                    colour = _STATUS_COLOUR.get(new_status, _RESET)
                    icon = _agent_status_icon(new_status)
                    findings = agent_data.get("findings", [])
                    label = f"  {icon} {agent_name:<16} {new_status}"
                    print(_colour(label, colour))
                    if new_status == "COMPLETE" and findings:
                        for f in findings[:2]:
                            print(_colour(f"      ↳ {f}", _DIM))

            # Progress spinner for running state
            if inv_status == "RUNNING":
                spin = spinner[spin_idx % len(spinner)]
                spin_idx += 1
                status_str = _colour(
                    f"  {spin} Investigation {inv_status}...", _YELLOW
                )
                print(status_str, end="\r", flush=True)

            if inv_status in ("COMPLETE", "FAILED"):
                # Clear spinner line
                print(" " * 50, end="\r")
                return state

            time.sleep(self.poll_interval)

        raise RuntimeError(
            f"Investigation {inv_id} did not complete within {self.timeout}s."
        )

    @staticmethod
    def _print_summary(state: dict[str, Any]) -> None:
        """Print a pretty terminal summary of the completed investigation."""
        inv_status: str = state.get("status", "UNKNOWN")
        root_cause: str = state.get("root_cause") or "—"
        proposed_fix: str = state.get("proposed_fix") or "—"
        verification: str = state.get("verification_result") or "—"
        agents: dict[str, Any] = state.get("agents", {})

        status_colour = _INV_STATUS_COLOUR.get(inv_status, _RESET)

        print()
        _print_separator("═")
        print(
            _colour("  INVESTIGATION COMPLETE", _BOLD + _GREEN)
            if inv_status == "COMPLETE"
            else _colour(f"  INVESTIGATION {inv_status}", _BOLD + _RED)
        )
        _print_separator("═")
        print()

        # Agent results table
        print(_colour("  AGENTS", _BOLD))
        _print_separator("─", 50)
        for name in _AGENT_ORDER:
            if name not in agents:
                continue
            data = agents[name]
            status = data.get("status", "IDLE")
            colour = _STATUS_COLOUR.get(status, _RESET)
            icon = _agent_status_icon(status)
            findings_count = len(data.get("findings", []))
            print(
                _colour(f"  {icon} {name:<16}", colour)
                + _colour(f" {status:<10}", colour)
                + _colour(f" ({findings_count} finding{'s' if findings_count != 1 else ''})", _DIM)
            )
        print()

        # Root cause
        print(_colour("  ROOT CAUSE", _BOLD))
        _print_separator("─", 50)
        for line in _wrap(root_cause, width=66):
            print(f"  {line}")
        print()

        # Proposed fix
        print(_colour("  PROPOSED FIX", _BOLD))
        _print_separator("─", 50)
        for line in _wrap(proposed_fix, width=66):
            print(f"  {line}")
        print()

        # Verification
        print(_colour("  VERIFICATION", _BOLD))
        _print_separator("─", 50)
        for line in _wrap(verification, width=66):
            print(f"  {line}")
        print()

        _print_separator("═")

        # Timeline count
        timeline = state.get("timeline", [])
        print(
            _colour(f"  {len(timeline)} timeline events", _DIM)
            + _colour(f"  ·  investigation ID: {state.get('id', '?')}", _DIM)
        )
        _print_separator("═")
        print()


def _wrap(text: str, width: int = 70) -> list[str]:
    """Naïve word-wrap that doesn't require textwrap (already in stdlib, but keep it simple)."""
    import textwrap  # noqa: PLC0415
    return textwrap.wrap(text, width=width) or [text]
