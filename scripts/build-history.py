#!/usr/bin/env python3
"""
Build public/data/history_3day.csv from project-neptune's nowcast_history archive.

Walks backward from yesterday, finds the most recent 3 dates with a
nowcast_YYYY-MM-DD.csv snapshot, and pivots the wanted stations into a single
per-station row with day1_*/day2_*/day3_* columns. The schema is a superset of
forecast_3day.csv: in addition to the date/probability/mpn fields, each day also
carries that day's top factors, last lab result, days-since-sample, and insight,
so the dashboard can replay the exact nowcast each past day showed.

TWO SNAPSHOT SCHEMAS. The California pipeline and the region pipelines
(generate_nowcast_region.py, e.g. Massachusetts/Boston) archive to the same
directory layout but do not publish the same columns — CA has estimated_mpn and
insight, a region has per-beach thresholds, a deeper factor ranking with SHAP
directions, and measured environmental conditions. Rather than branch on region,
BASE_DAY_FIELDS below is emitted always (so CA output is unchanged) and
OPTIONAL_SOURCE_COLUMNS are emitted only when the snapshots actually carry them.
A snapshot missing a base field yields an empty cell, which every consumer
already tolerates.
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

WANTED_STATIONS = [
    code.strip()
    for code in os.environ.get("BEACH_FILTER", "DHS114,DHS115").split(",")
    if code.strip()
]
LOOKBACK_DAYS = 14
TARGET_DAYS = 3

# Per-day output columns emitted for every snapshot, as (output suffix, source
# column). This is CA's original schema and is deliberately unchanged — a region
# snapshot simply leaves the columns it lacks empty.
BASE_DAY_FIELDS: list[tuple[str, str]] = [
    ("probability", "exc_probability"),
    ("prediction", "prediction"),
    ("mpn", "estimated_mpn"),
    ("mpn_label", "mpn_label"),
    ("top_factor_1", "top_factor_1"),
    ("top_factor_2", "top_factor_2"),
    ("top_factor_3", "top_factor_3"),
    ("last_result", "last_result"),
    ("days_since_sample", "days_since_sample"),
    ("insight", "insight"),
]

# Emitted as day{i}_<name> only when the snapshots carry them. Keeps CA's output
# byte-identical while letting a region carry everything its dashboard needs to
# describe a past day the same way it describes today.
OPTIONAL_SOURCE_COLUMNS: list[str] = (
    # The cutoff that day was scored against. A region re-tunes per beach, so a
    # past day classified against today's cutoff would disagree with the call
    # actually made that day.
    ["threshold", "no_recent_sample"]
    # Deeper factor ranking + the direction each drove risk.
    + [f"top_factor_{i}" for i in range(4, 16)]
    + [f"shap_direction_{i}" for i in range(1, 16)]
    # Measured conditions, so a past day's written summary reads from that day's
    # weather rather than from today's.
    + ["rain_today_mm", "rain_prior3d_mm", "wind_kph", "air_temp_c", "solar_mj",
       "water_temp_c", "wave_height_m", "tide_range_m", "spring_tide",
       "river_flow", "cso_dist_km"]
)


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


# A snapshot is a region snapshot if it carries these. Both come from
# generate_nowcast_region.py and neither exists in a CA snapshot, so the pair is
# an unambiguous marker.
REGION_MARKER_COLUMNS = {"threshold", "no_recent_sample"}


def detect_optional_columns(rows_by_date: dict[str, dict[str, dict[str, str]]]) -> list[str]:
    """Which OPTIONAL_SOURCE_COLUMNS these snapshots actually carry.

    Gated on REGION_MARKER_COLUMNS rather than picking up whatever happens to
    match. CA snapshots publish shap_direction_2 and shap_direction_3 (with no
    _1), which would otherwise be swept in and quietly change the schema of a
    live CA file to no purpose — the CA boards render no written summary. So CA
    output stays exactly as it was, and only a region snapshot gets the extras.

    Read off the rows rather than the file header so an empty or partially
    written archive degrades to "nothing optional" instead of raising.
    """
    seen: set[str] = set()
    for by_station in rows_by_date.values():
        for row in by_station.values():
            seen.update(row.keys())
    if not REGION_MARKER_COLUMNS.issubset(seen):
        return []
    return [c for c in OPTIONAL_SOURCE_COLUMNS if c in seen]


def build_header(optional: list[str]) -> list[str]:
    header = ["StationCode", "StationName", "Latitude", "Longitude"]
    for i in range(1, 4):
        # Per-day snapshot fields so the dashboard can replay each past day's
        # nowcast (top factors + the lab result that was latest as of that date).
        header.append(f"day{i}_date")
        header += [f"day{i}_{name}" for name, _ in BASE_DAY_FIELDS]
        header += [f"day{i}_{name}" for name in optional]
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

    optional = detect_optional_columns(rows_by_date)
    if optional:
        print(f"Region snapshot columns detected: {len(optional)} extra per day")
    header = build_header(optional)

    out_rows: list[dict[str, str]] = []
    for code in WANTED_STATIONS:
        meta = static_meta.get(code)
        if meta is None:
            print(
                f"Warning: {code} missing from most recent snapshot ({dates[0]}); skipping.",
                file=sys.stderr,
            )
            continue
        # Coordinates are absent from region snapshots (their dashboards take
        # them from the published roster instead), so these are lookups rather
        # than required keys.
        row: dict[str, str] = {
            "StationCode": code,
            "StationName": meta.get("StationName", ""),
            "Latitude": meta.get("Latitude", ""),
            "Longitude": meta.get("Longitude", ""),
        }
        for i, iso in enumerate(dates, start=1):
            day = rows_by_date[iso].get(code, {})
            row[f"day{i}_date"] = iso
            for name, source in BASE_DAY_FIELDS:
                row[f"day{i}_{name}"] = day.get(source, "")
            for name in optional:
                row[f"day{i}_{name}"] = day.get(name, "")
        # Pad with empty day slots if fewer than 3 valid dates were found. This
        # is the normal state for the first two runs after an archive starts:
        # the window grows as snapshots accumulate rather than failing.
        for i in range(len(dates) + 1, 4):
            row[f"day{i}_date"] = ""
            for name, _ in BASE_DAY_FIELDS:
                row[f"day{i}_{name}"] = ""
            for name in optional:
                row[f"day{i}_{name}"] = ""
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
