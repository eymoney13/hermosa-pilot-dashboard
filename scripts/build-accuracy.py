#!/usr/bin/env python3
"""Build public/data/<city>/accuracy.csv from project-neptune's
mpn_comparison_all_beaches.csv, optionally extended with a backfilled record.

Emits one row per lab sample — a date where a real Actual_MPN was measured —
carrying the model's exceedance probability for that date. The dashboard then
scores forecast-vs-lab classification accuracy per beach (see lib/data.ts
computeAccuracy). exc_probability is written as a fraction (0-1) to match
nowcast_latest.csv's convention; the predicted-unsafe boundary is the same 0.5
threshold the dashboard uses for its risk language.

Mirrors build-history.py's env interface: BEACH_FILTER selects the stations and
ACCURACY_OUTPUT_DIR chooses where accuracy.csv lands, so the daily-refresh
workflow can invoke it once per city.

TWO SOURCES
-----------
mpn_comparison_all_beaches.csv is stitched from the daily snapshots in
outputs/nowcast_history/, so it reaches back only as far as a station has been
publishing — mid-April 2026 for most of South Bay. That is a truthful record of
what the dashboard actually showed, but far too short a window to say how a site
performs: it covers one clean summer and nothing else.

ACCURACY_BACKFILL_FILE (optional) names a second source covering the years
before the snapshots begin — project-neptune's
outputs/southbay/backfill_predictions_2024on.csv, which re-scores every lab
sample from 2024-01-01 using the shipped model. That date is train_model.py's
temporal split, so every backfilled sample is held-out data the model never
trained on. Its one compromise is feature vintage: it reads the archival values
in modeling_dataset.csv rather than whatever had arrived by that morning, which
makes it mildly optimistic against the live record.

Where both sources carry the same (station, date), the LIVE row wins — a
prediction the dashboard genuinely published outranks a reconstruction of one.
Leave ACCURACY_BACKFILL_FILE unset and this script behaves exactly as before.
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
# Optional. Unset (the default) means live snapshots only — the behavior every
# city had before this existed.
_BACKFILL_RAW = os.environ.get("ACCURACY_BACKFILL_FILE", "").strip()
BACKFILL_FILE = Path(_BACKFILL_RAW).expanduser() if _BACKFILL_RAW else None

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


def _row(code: str, date: str, prob_fraction: float, actual: float) -> dict[str, str]:
    return {
        "StationCode": code,
        "date": date,
        "exc_probability": f"{prob_fraction:.4f}",
        "actual_mpn": f"{actual:g}",
    }


def _read_backfill(path: Path) -> dict[tuple[str, str], dict[str, str]]:
    """Backfilled samples keyed by (station, date).

    Column names are the backfill's own: `ENT_mpn` for the lab result and an
    `exc_probability` already expressed as a fraction — unlike the live
    comparison file, which carries a percent.
    """
    rows: dict[tuple[str, str], dict[str, str]] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code = (row.get("StationCode") or "").strip()
            if code not in WANTED_STATIONS:
                continue
            date = (row.get("date") or "").strip()
            actual = _to_float(row.get("ENT_mpn"))
            prob = _to_float(row.get("exc_probability"))
            if not date or actual is None or prob is None:
                continue
            rows[(code, date)] = _row(code, date, prob, actual)
    return rows


def main() -> int:
    print(f"SOURCE_FILE: {SOURCE_FILE}")
    print(f"BACKFILL_FILE: {BACKFILL_FILE or '(none)'}")
    print(f"OUTPUT_FILE: {OUTPUT_FILE}")

    if not SOURCE_FILE.is_file():
        print(f"Source file not found: {SOURCE_FILE}", file=sys.stderr)
        return 1

    # Seed with the backfill so the live rows below can overwrite it key-for-key.
    # A missing backfill file is fatal rather than skipped: it was asked for by
    # name, and silently publishing a four-month accuracy figure where a
    # multi-year one was intended is the failure this is most likely to cause.
    merged: dict[tuple[str, str], dict[str, str]] = {}
    if BACKFILL_FILE is not None:
        if not BACKFILL_FILE.is_file():
            print(f"Backfill file not found: {BACKFILL_FILE}", file=sys.stderr)
            return 1
        merged = _read_backfill(BACKFILL_FILE)
        print(f"Backfill contributed {len(merged)} samples.")

    backfilled_keys = set(merged)
    live_count = 0
    superseded = 0
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
            key = (code, date)
            if key in backfilled_keys:
                superseded += 1
            merged[key] = _row(code, date, prob / 100, actual)
            live_count += 1

    if BACKFILL_FILE is not None:
        print(
            f"Live source contributed {live_count} samples "
            f"({superseded} of which superseded a backfilled row)."
        )

    out_rows = sorted(merged.values(), key=lambda r: (r["StationCode"], r["date"]))

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
