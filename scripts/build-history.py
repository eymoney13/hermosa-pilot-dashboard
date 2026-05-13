#!/usr/bin/env python3
"""
Build public/data/history_3day.csv from project-neptune's nowcast_history archive.

Walks backward from yesterday, finds the most recent 3 dates with a
nowcast_YYYY-MM-DD.csv snapshot, and pivots the DHS114 / DHS115 rows into
a single per-station row with day1_*/day2_*/day3_* columns. Schema matches
forecast_3day.csv exactly so the existing loader picks it up unchanged.
"""

from __future__ import annotations

import csv
import os
import sys
from datetime import date, timedelta
from pathlib import Path


def _path_from_env(var: str, default: Path) -> Path:
    """Resolve a path override from an env var, falling back to the default.
    Accepts absolute or relative strings; expands a leading ~."""
    raw = os.environ.get(var)
    return Path(raw).expanduser() if raw else default


SOURCE_DIR = _path_from_env(
    "NOWCAST_HISTORY_DIR",
    Path.home() / "Desktop" / "project-neptune" / "outputs" / "nowcast_history",
)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_FILE = (
    _path_from_env("HISTORY_OUTPUT_DIR", PROJECT_ROOT / "public" / "data")
    / "history_3day.csv"
)

WANTED_STATIONS = ["DHS114", "DHS115"]
LOOKBACK_DAYS = 14
TARGET_DAYS = 3


def find_recent_dates() -> list[str]:
    """Walk back from yesterday; return ISO dates whose snapshot files exist,
    newest first, up to TARGET_DAYS or LOOKBACK_DAYS — whichever hits first."""
    today = date.today()
    found: list[str] = []
    for offset in range(1, LOOKBACK_DAYS + 1):
        iso = (today - timedelta(days=offset)).isoformat()
        if (SOURCE_DIR / f"nowcast_{iso}.csv").exists():
            found.append(iso)
            if len(found) == TARGET_DAYS:
                break
    return found


def load_station_rows(file_path: Path) -> dict[str, dict[str, str]]:
    """Return {StationCode: row_dict} for WANTED_STATIONS in a snapshot file."""
    out: dict[str, dict[str, str]] = {}
    with file_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = row.get("StationCode")
            if code in WANTED_STATIONS:
                out[code] = row
    return out


def build_header() -> list[str]:
    header = ["StationCode", "StationName", "Latitude", "Longitude"]
    for i in range(1, 4):
        header += [
            f"day{i}_date",
            f"day{i}_probability",
            f"day{i}_prediction",
            f"day{i}_mpn",
            f"day{i}_mpn_label",
        ]
    return header


def main() -> int:
    print(f"SOURCE_DIR:  {SOURCE_DIR}")
    print(f"OUTPUT_FILE: {OUTPUT_FILE}")

    if not SOURCE_DIR.is_dir():
        print(f"Source directory not found: {SOURCE_DIR}", file=sys.stderr)
        return 1

    dates = find_recent_dates()
    if not dates:
        print(f"No nowcast snapshots found in {SOURCE_DIR}", file=sys.stderr)
        return 1

    # dates[0] is the most recent past day (day1 of the output).
    rows_by_date: dict[str, dict[str, dict[str, str]]] = {
        iso: load_station_rows(SOURCE_DIR / f"nowcast_{iso}.csv") for iso in dates
    }
    static_meta = rows_by_date[dates[0]]

    header = build_header()
    out_rows: list[dict[str, str]] = []
    for code in WANTED_STATIONS:
        meta = static_meta.get(code)
        if meta is None:
            print(
                f"Warning: {code} missing from most recent snapshot ({dates[0]}); skipping.",
                file=sys.stderr,
            )
            continue
        row: dict[str, str] = {
            "StationCode": code,
            "StationName": meta["StationName"],
            "Latitude": meta["Latitude"],
            "Longitude": meta["Longitude"],
        }
        for i, iso in enumerate(dates, start=1):
            day = rows_by_date[iso].get(code, {})
            row[f"day{i}_date"] = iso
            row[f"day{i}_probability"] = day.get("exc_probability", "")
            row[f"day{i}_prediction"] = day.get("prediction", "")
            row[f"day{i}_mpn"] = day.get("estimated_mpn", "")
            row[f"day{i}_mpn_label"] = day.get("mpn_label", "")
        # Pad with empty day slots if fewer than 3 valid dates were found.
        for i in range(len(dates) + 1, 4):
            row[f"day{i}_date"] = ""
            row[f"day{i}_probability"] = ""
            row[f"day{i}_prediction"] = ""
            row[f"day{i}_mpn"] = ""
            row[f"day{i}_mpn_label"] = ""
        out_rows.append(row)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=header)
        writer.writeheader()
        writer.writerows(out_rows)

    try:
        out_display = OUTPUT_FILE.relative_to(PROJECT_ROOT)
    except ValueError:
        out_display = OUTPUT_FILE
    print(
        f"Wrote {out_display} "
        f"with {len(dates)} days for {len(out_rows)} beaches."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
