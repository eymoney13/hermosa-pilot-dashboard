#!/usr/bin/env python3
"""
Build public/data/history_3day.csv from project-neptune's nowcast_history archive.

Walks backward from yesterday, finds the most recent 3 dates with a
nowcast_YYYY-MM-DD.csv snapshot, and pivots the wanted stations into a single
per-station row with day1_*/day2_*/day3_* columns.

TWO ARCHIVES, IN PRIORITY ORDER. SOURCE_DIR is the location's own archive of the
nowcasts it published (written by archive-nowcast.py, committed alongside them),
and it wins every date it covers. FALLBACK_DIR is project-neptune's shared
outputs/nowcast_history/, written by the all-beaches daily-full-run job.

They are not the same numbers. The full run is a separate execution over a
different beach set at a different hour, so it disagrees with what a board
actually published: on 2026-09-27 the South Bay run published DHS116 at
0.5105/Unsafe — a red "High" cell — while the full run archived 0.4791/Safe, so
that Sunday turned yellow the moment it became a past day. The full run also
skips days the boards publish (there is no 2026-09-26 snapshot), punching holes
in the strip. Reading the published archive first makes a past cell a literal
replay of what readers saw; the fallback only covers dates from before a
location started archiving, so the window does not shrink on the changeover. The schema is a superset of
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
# Consulted only for dates SOURCE_DIR does not have. Unset means "no fallback",
# which is the right default for a local run against a single archive.
_raw_fallback = os.environ.get("NOWCAST_HISTORY_FALLBACK_DIR")
FALLBACK_DIR = Path(_raw_fallback).expanduser() if _raw_fallback else None
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


def search_dirs() -> list[Path]:
    """The archives to consult, most authoritative first."""
    dirs = [SOURCE_DIR]
    if FALLBACK_DIR is not None and FALLBACK_DIR != SOURCE_DIR:
        dirs.append(FALLBACK_DIR)
    return dirs


def find_recent_dates() -> list[tuple[str, Path]]:
    """Walk back from yesterday; return (ISO date, snapshot path) newest first,
    up to TARGET_DAYS or LOOKBACK_DAYS — whichever hits first.

    A date present in more than one archive resolves to the first one that has
    it, so the published archive wins and the fallback only fills gaps.
    """
    today = date.today()
    found: list[tuple[str, Path]] = []
    for offset in range(1, LOOKBACK_DAYS + 1):
        iso = (today - timedelta(days=offset)).isoformat()
        for directory in search_dirs():
            candidate = directory / f"nowcast_{iso}.csv"
            if candidate.exists():
                found.append((iso, candidate))
                break
        if len(found) == TARGET_DAYS:
            break
    return found


# The CA pipeline used to name slot 1's direction with no number, so archived
# snapshots carry "shap_direction" where every later slot is "shap_direction_N".
# Left alone it reads as a missing slot 1: the dashboard asks for
# shap_direction_1, finds nothing, and drops the strongest driver of the day.
# Renaming it on the way in means the ~3 days of pre-change snapshots still in
# the window replay with their top driver intact.
LEGACY_DIRECTION_COLUMN = "shap_direction"


def load_station_rows(file_path: Path) -> dict[str, dict[str, str]]:
    """Return {StationCode: row_dict} for WANTED_STATIONS in a snapshot file."""
    out: dict[str, dict[str, str]] = {}
    with file_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = row.get("StationCode")
            if code not in WANTED_STATIONS:
                continue
            legacy = row.pop(LEGACY_DIRECTION_COLUMN, None)
            if legacy and not row.get("shap_direction_1"):
                row["shap_direction_1"] = legacy
            out[code] = row
    return out


def detect_optional_columns(rows_by_date: dict[str, dict[str, dict[str, str]]]) -> list[str]:
    """Which OPTIONAL_SOURCE_COLUMNS these snapshots actually carry.

    Presence is the whole test: a column the snapshots publish is a column the
    dashboard can use. This was previously gated on a pair of region-only marker
    columns, to keep CA files byte-identical back when a CA snapshot's only
    matching columns were an orphaned shap_direction_2/_3 pair that would have
    changed the schema to no purpose. Both halves of that have since stopped
    being true — CA publishes a full ranked set with numbered directions, and
    the CA boards render the same written summary the region ones do — so the
    gate now only withholds data the dashboard is asking for.

    Read off the rows rather than the file header so an empty or partially
    written archive degrades to "nothing optional" instead of raising.
    """
    seen: set[str] = set()
    for by_station in rows_by_date.values():
        for row in by_station.values():
            seen.update(row.keys())
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
    if FALLBACK_DIR is not None:
        print(f"FALLBACK_DIR: {FALLBACK_DIR}")
    print(f"OUTPUT_FILE: {OUTPUT_FILE}")

    # A missing primary is the normal state on the first run after a location
    # starts archiving its own nowcasts — the directory does not exist until
    # archive-nowcast.py creates it. Only bail when nothing is readable at all.
    available = [d for d in search_dirs() if d.is_dir()]
    if not available:
        searched = " or ".join(str(d) for d in search_dirs())
        print(f"No archive directory found: {searched}", file=sys.stderr)
        return 1

    dated_paths = find_recent_dates()
    if not dated_paths:
        searched = " or ".join(str(d) for d in available)
        print(f"No nowcast snapshots found in {searched}", file=sys.stderr)
        return 1

    dates = [iso for iso, _ in dated_paths]
    # dates[0] is the most recent past day (day1 of the output).
    rows_by_date: dict[str, dict[str, dict[str, str]]] = {
        iso: load_station_rows(path) for iso, path in dated_paths
    }
    static_meta = rows_by_date[dates[0]]

    # Which archive each day came from. Worth a line of output: a past cell
    # disagreeing with what the board published that day is exactly the bug this
    # priority order exists to prevent, and the log is where you would catch a
    # location silently still reading the shared archive.
    for iso, path in dated_paths:
        origin = "published" if path.parent == SOURCE_DIR else "fallback"
        print(f"  {iso}: {origin} ({path.parent})")

    optional = detect_optional_columns(rows_by_date)
    if optional:
        print(f"Optional snapshot columns detected: {len(optional)} extra per day")
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
