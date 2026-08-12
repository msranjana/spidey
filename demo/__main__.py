"""Spider-Sense demo CLI entry point.

Run with::

    python -m demo                              # default: localhost:8000
    python -m demo --backend http://localhost:8000
    python -m demo --help

No external dependencies — stdlib only.
"""

from __future__ import annotations

import argparse
import sys


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m demo",
        description=(
            "Spider-Sense deterministic demo — API Database Connection Failure.\n"
            "\n"
            "Creates an investigation, runs all agents, and prints a live "
            "terminal summary of root cause, proposed fix, and verification."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python -m demo\n"
            "  python -m demo --backend http://localhost:8000\n"
            "  python -m demo --timeout 180\n"
        ),
    )
    parser.add_argument(
        "--backend",
        default="http://localhost:8000",
        metavar="URL",
        help="Spider-Sense backend base URL (default: %(default)s)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=120.0,
        metavar="SECONDS",
        help="Max seconds to wait for investigation to complete (default: %(default)s)",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=1.0,
        metavar="SECONDS",
        dest="poll_interval",
        help="Polling interval in seconds (default: %(default)s)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """CLI entry point.  Returns exit code (0 = success, 1 = failure)."""
    args = _parse_args(argv)

    # Import here so the module can be used as a library without side-effects.
    from demo.runner import DemoRunner  # noqa: PLC0415

    runner = DemoRunner(
        poll_interval=args.poll_interval,
        timeout=args.timeout,
    )

    try:
        state = runner.run(backend_url=args.backend)
    except RuntimeError as exc:
        print(f"\n  ERROR: {exc}\n", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\n  Demo interrupted by user.\n", file=sys.stderr)
        return 130

    inv_status = state.get("status", "UNKNOWN")
    return 0 if inv_status == "COMPLETE" else 1


if __name__ == "__main__":
    sys.exit(main())
