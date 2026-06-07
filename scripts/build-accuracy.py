#!/usr/bin/env python3
"""Build public/data/<city>/accuracy.csv from project-neptune's
mpn_comparison_all_beaches.csv.

Emits one row per lab sample — a date where a real Actual_MPN was measured —
carrying the model's exceedance probability for that date. The dashboard then
scores forecast-vs-lab classification accuracy per beach (see lib/data.ts
computeAccuracy). exc_probability is written as a fraction (0-1) to match
nowcast_latest.csv's convention; the predicted-unsafe boundary is the same 0.5
threshold the dashboard uses for its risk language.

Mirrors build-history.py's env interface: BEACH_FILTER selects the stations and
ACCURACY_OUTPUT_DIR chooses where accuracy.csv lands, so the daily-refresh
workflow can invoke it once per city.
"""

from __future__ import annotations

import csv
import os
import sys
from pathlib import Path


def _path_from_env(var: str, default: Path) -> Path:
    """Resolve a path override from an env var, falling back to the default.
    Accepts absolute or relative strings; expands a leading ~."""
    raw = os.environ.get(var)
    return Path(raw).expanduser() if raw else default


SOURCE_FILE = _path_from_env(
    "MPN_COMPARISON_FILE",
    Path.home()
    / "Desktop"
    / "project-neptune"
    / "outputs"
    / "mpn_comparison_all_beaches.csv",
)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_FILE = (
    _path_from_env("ACCURACY_OUTPUT_DIR", PROJECT_ROOT / "public" / "data")
    / "accuracy.csv"
)

WANTED_STATIONS = [
    code.strip()
    for code in os.environ.get("BEACH_FILTER", "DHS114,DHS115").split(",")
    if code.strip()
]

HEADER = ["StationCode", "date", "exc_probability", "actual_mpn"]


def _to_float(raw: str | None) -> float | None:
    if raw is None:
        return None
    text = raw.strip()
    if text == "" or text.lower() in {"nan", "none"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def main() -> int:
    print(f"SOURCE_FILE: {SOURCE_FILE}")
    print(f"OUTPUT_FILE: {OUTPUT_FILE}")

    if not SOURCE_FILE.is_file():
        print(f"Source file not found: {SOURCE_FILE}", file=sys.stderr)
        return 1

    out_rows: list[dict[str, str]] = []
    with SOURCE_FILE.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code = (row.get("StationCode") or "").strip()
            if code not in WANTED_STATIONS:
                continue
            date = (row.get("Date") or "").strip()
            actual = _to_float(row.get("Actual_MPN"))
            prob = _to_float(row.get("Exc_Probability"))
            # Only dates with a real lab result are scorable samples.
            if not date or actual is None or prob is None:
                continue
            out_rows.append(
                {
                    "StationCode": code,
                    "date": date,
                    "exc_probability": f"{prob / 100:.4f}",
                    "actual_mpn": f"{actual:g}",
                }
            )

    out_rows.sort(key=lambda r: (r["StationCode"], r["date"]))

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=HEADER)
        writer.writeheader()
        writer.writerows(out_rows)

    try:
        out_display = OUTPUT_FILE.relative_to(PROJECT_ROOT)
    except ValueError:
        out_display = OUTPUT_FILE
    print(f"Wrote {out_display} with {len(out_rows)} samples for {WANTED_STATIONS}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
