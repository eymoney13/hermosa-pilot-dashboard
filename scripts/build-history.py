#!/usr/bin/env python3
"""
Build public/data/history_3day.csv from project-neptune's nowcast_history archive.

Takes the three calendar days before today, reads each one's
nowcast_YYYY-MM-DD.csv snapshot, and pivots the wanted stations into a single
per-station row with day1_*/day2_*/day3_* columns. day1 is always yesterday: a
day with no snapshot is left empty rather than backfilled with an older one, so
a cell can never carry a different day's prediction than the one it is dated.

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
# The past strip is exactly the TARGET_DAYS calendar days before today. There is
# deliberately no lookback beyond that: this used to hunt back up to 14 days to
# FILL three slots, so one failed refresh pulled an older day forward and drew it
# adjacent to today — with yesterday's snapshot missing, a Monday strip showed
# 09-26, 09-25 and 09-21 as "the past three days". A day we have no snapshot for
# is left empty instead, which every consumer already tolerates.
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


def find_recent_dates() -> list[tuple[str, Path | None]]:
    """The TARGET_DAYS days before today, newest first, each paired with its
    snapshot — or None where no archive has one.

    The dates are fixed by the calendar, not chosen by what happens to be on
    disk, so day1 is always yesterday and a cell can never carry a different
    day's prediction than the one it is dated.

    A date present in more than one archive resolves to the first one that has
    it, so the published archive wins and the fallback only fills gaps.
    """
    today = date.today()
    resolved: list[tuple[str, Path | None]] = []
    for offset in range(1, TARGET_DAYS + 1):
        iso = (today - timedelta(days=offset)).isoformat()
        match = None
        for directory in search_dirs():
            candidate = directory / f"nowcast_{iso}.csv"
            if candidate.exists():
                match = candidate
                break
        resolved.append((iso, match))
    return resolved


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

    # dated_paths[0] is yesterday (day1 of the output); a None path means no
    # archive has that day, and its slot is left empty rather than backfilled.
    dated_paths = find_recent_dates()
    if not any(path for _, path in dated_paths):
        # Not an error: carry on and write a file with empty slots. Failing here
        # would leave the previous history_3day.csv in place, and a stale file is
        # the one outcome worth avoiding — it draws days older than the window
        # right next to today, which is the bug this script exists to prevent. An
        # empty strip shows nothing false. The publish must not be blocked for it
        # either: the nowcast is the primary product, and this step runs before
        # the commit.
        searched = " or ".join(str(d) for d in available)
        print(
            f"Warning: no snapshot for any of the last {TARGET_DAYS} days in "
            f"{searched} — writing an empty window.",
            file=sys.stderr,
        )

    dates = [iso for iso, _ in dated_paths]
    rows_by_date: dict[str, dict[str, dict[str, str]]] = {
        iso: (load_station_rows(path) if path is not None else {})
        for iso, path in dated_paths
    }

    # Which archive each day came from, and which days are missing. Worth a line
    # of output each: a past cell disagreeing with what the board published that
    # day is exactly the bug this priority order exists to prevent, and a gap is
    # how you notice a refresh silently failed.
    for iso, path in dated_paths:
        if path is None:
            print(f"  {iso}: MISSING — left empty, no older day substituted")
            continue
        origin = "published" if path.parent == SOURCE_DIR else "fallback"
        print(f"  {iso}: {origin} ({path.parent})")

    # Station metadata from the most recent day that carries the station. Taken
    # across the window rather than from day1 alone, so a gap yesterday does not
    # drop every beach from the file.
    static_meta: dict[str, dict[str, str]] = {}
    for iso in dates:
        for code, row in rows_by_date[iso].items():
            static_meta.setdefault(code, row)

    optional = detect_optional_columns(rows_by_date)
    if optional:
        print(f"Optional snapshot columns detected: {len(optional)} extra per day")
    header = build_header(optional)

    out_rows: list[dict[str, str]] = []
    for code in WANTED_STATIONS:
        meta = static_meta.get(code)
        if meta is None:
            print(
                f"Warning: {code} absent from every snapshot in "
                f"{dates[-1]}..{dates[0]}; skipping.",
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
            # The date is written even when there is no snapshot, so the file
            # records WHICH day is missing rather than just coming up short. The
            # dashboard skips a day whose probability is empty (dynamicTyping
            # parses a blank cell to null), so an empty slot renders as no cell
            # rather than as a 0% one.
            row[f"day{i}_date"] = iso
            for name, source in BASE_DAY_FIELDS:
                row[f"day{i}_{name}"] = day.get(source, "")
            for name in optional:
                row[f"day{i}_{name}"] = day.get(name, "")
        # build_header always emits three day slots, so fill any the window did
        # not cover. Unreachable at TARGET_DAYS = 3; kept so lowering it cannot
        # silently write rows that do not match the header.
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
    filled = sum(1 for _, path in dated_paths if path is not None)
    gaps = "" if filled == len(dates) else f" ({len(dates) - filled} day(s) with no snapshot)"
    print(
        f"Wrote {out_display} "
        f"with {filled} of the last {len(dates)} days for {len(out_rows)} beaches{gaps}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
