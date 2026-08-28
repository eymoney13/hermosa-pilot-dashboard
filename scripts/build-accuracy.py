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

EXTRA SOURCES
-------------
mpn_comparison_all_beaches.csv is stitched from the daily snapshots in
outputs/nowcast_history/, so it reaches back only as far as a station has been
publishing — mid-April 2026 for most of South Bay. That is a truthful record of
what the dashboard actually showed, but far too short a window to say how a site
performs: it covers one clean summer and nothing else.

ACCURACY_EXTRA_SOURCES (optional) is a comma-separated list of further files to
draw scored samples from, for the years before the snapshots begin. Two layouts
are recognised, by header:

  comparison  StationCode, Date, Actual_MPN, Exc_Probability (percent)
              — mpn_comparison_featured_beaches.csv, daily_predictions_hermosa.csv
  backfill    StationCode, date, ENT_mpn, exc_probability (fraction)
              — outputs/southbay/backfill_predictions_2024on.csv

All of them re-score history with the shipped model from 2024-01-01, which is
train_model.py's temporal split — so every sample they contribute is held-out
data the model never trained on. Their one compromise is feature vintage: they
read archival values rather than whatever had arrived by that morning, which
makes them mildly optimistic against the live record.

PRECEDENCE
----------
Later beats earlier: extras are applied in the order listed, then the live
source last, so a prediction the dashboard genuinely published always outranks
a reconstruction of one. List the broadest/oldest source first.

Leave ACCURACY_EXTRA_SOURCES unset and this script behaves exactly as before.
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
EXTRA_SOURCES = [
    Path(raw.strip()).expanduser()
    for raw in os.environ.get("ACCURACY_EXTRA_SOURCES", "").split(",")
    if raw.strip()
]

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


# The two column layouts a scored-sample file arrives in. `prob_divisor` carries
# the one difference that is not a rename: the comparison files express the
# exceedance probability as a percent, the backfill as a fraction.
_LAYOUTS = (
    {
        "name": "comparison",
        "station": "StationCode",
        "date": "Date",
        "lab": "Actual_MPN",
        "prob": "Exc_Probability",
        "prob_divisor": 100.0,
    },
    {
        "name": "backfill",
        "station": "StationCode",
        "date": "date",
        "lab": "ENT_mpn",
        "prob": "exc_probability",
        "prob_divisor": 1.0,
    },
)


def _layout_for(fieldnames: list[str] | None) -> dict | None:
    """The layout whose columns are all present, or None if the file is neither."""
    present = set(fieldnames or ())
    for layout in _LAYOUTS:
        if {layout["station"], layout["date"], layout["lab"], layout["prob"]} <= present:
            return layout
    return None


def _read_samples(path: Path) -> dict[tuple[str, str], dict[str, str]]:
    """Scored samples from one file, keyed by (station, date).

    Only dates carrying a real lab result are scorable, so rows without one are
    dropped — that is what distinguishes a sample from a plain daily prediction.
    """
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        layout = _layout_for(reader.fieldnames)
        if layout is None:
            raise ValueError(
                f"{path}: unrecognised columns {reader.fieldnames!r}; expected a "
                f"comparison layout (Actual_MPN/Exc_Probability) or a backfill "
                f"layout (ENT_mpn/exc_probability)"
            )
        rows: dict[tuple[str, str], dict[str, str]] = {}
        for row in reader:
            code = (row.get(layout["station"]) or "").strip()
            if code not in WANTED_STATIONS:
                continue
            date = (row.get(layout["date"]) or "").strip()
            actual = _to_float(row.get(layout["lab"]))
            prob = _to_float(row.get(layout["prob"]))
            if not date or actual is None or prob is None:
                continue
            rows[(code, date)] = _row(code, date, prob / layout["prob_divisor"], actual)
    return rows


def main() -> int:
    print(f"SOURCE_FILE: {SOURCE_FILE}")
    print(f"EXTRA_SOURCES: {[str(p) for p in EXTRA_SOURCES] or '(none)'}")
    print(f"OUTPUT_FILE: {OUTPUT_FILE}")

    if not SOURCE_FILE.is_file():
        print(f"Source file not found: {SOURCE_FILE}", file=sys.stderr)
        return 1

    # Extras first, in order, so each later source — and finally the live one —
    # overwrites any (station, date) an earlier source already covered.
    #
    # A missing extra is fatal rather than skipped: it was named explicitly, and
    # silently publishing a four-month accuracy figure where a multi-year one was
    # intended is the failure this is most likely to cause. Callers that cannot
    # guarantee the file (a workflow running before the branch that adds it has
    # merged, say) should leave it out of the list rather than hope it appears.
    merged: dict[tuple[str, str], dict[str, str]] = {}
    for extra in EXTRA_SOURCES:
        if not extra.is_file():
            print(f"Extra source not found: {extra}", file=sys.stderr)
            return 1
        before = len(merged)
        contributed = _read_samples(extra)
        merged.update(contributed)
        print(
            f"  {extra.name}: {len(contributed)} samples "
            f"(+{len(merged) - before} new)"
        )

    from_extras = set(merged)
    live = _read_samples(SOURCE_FILE)
    superseded = len(from_extras & set(live))
    merged.update(live)
    print(
        f"  {SOURCE_FILE.name}: {len(live)} samples "
        f"({superseded} superseding an earlier source)"
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
