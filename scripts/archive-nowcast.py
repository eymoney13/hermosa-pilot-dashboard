#!/usr/bin/env python3
"""
Archive the nowcast a board just published, so the 7-day window can replay it.

The day strip's past cells are meant to show what the board actually said that
day. They used to be built from project-neptune's outputs/nowcast_history/,
which is written by the all-beaches daily-full-run job — a DIFFERENT model run
from the per-location job that publishes the board. The two disagree: on
2026-09-27 the South Bay run published DHS116 at 0.5105/Unsafe (a red "High"
cell) while the full run archived 0.4791/Safe, so once Sunday rolled into the
past its cell turned yellow. The full run also skips days the boards publish
(no 2026-09-26 snapshot existed), leaving holes in the strip.

So each location now archives the exact file it publishes, in this repo,
committed in the same commit as the published nowcast. That makes the archive
and the live board incapable of disagreeing, and build-history.py reads from
here in preference to the backend's shared archive.

Deliberately NOT under public/: the archive only has to exist in the repo for
tomorrow's workflow to read at build time. Serving it would ship a growing pile
of CSVs in every deployment bundle for no reader.

Env:
  NOWCAST_SOURCE   the published nowcast_latest.csv to archive (required)
  ARCHIVE_DIR      per-location archive directory (required)
  RETENTION_DAYS   prune snapshots older than this many days (default 30)
"""

from __future__ import annotations

import csv
import os
import shutil
import sys
from datetime import date, timedelta
from pathlib import Path

# build-history.py looks back at most 14 days. 30 keeps comfortable headroom if
# that window ever widens, at a few hundred KB per location per month.
DEFAULT_RETENTION_DAYS = 30

SNAPSHOT_PREFIX = "nowcast_"
SNAPSHOT_SUFFIX = ".csv"


def snapshot_date(source: Path) -> str:
    """The prediction_date the file itself carries.

    Read off the data rather than taken from the runner's clock: one run
    produces every row, and the pipeline stamps prediction_date in the
    location's own timezone while the runner is UTC. Naming the snapshot after
    the clock would mislabel it either side of the date boundary, and
    build-history.py finds snapshots strictly by filename date.
    """
    with source.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            stamp = (row.get("prediction_date") or "").strip()
            if stamp:
                return stamp[:10]
    raise SystemExit(f"No prediction_date in {source} — refusing to archive it.")


def prune(archive_dir: Path, newest: str, retention_days: int) -> int:
    """Delete snapshots older than retention_days before `newest`.

    Anchored on the snapshot being written rather than on today, so a backfill
    or a replayed run cannot sweep away the archive around it.
    """
    try:
        y, m, d = (int(p) for p in newest.split("-"))
        cutoff = date(y, m, d) - timedelta(days=retention_days)
    except ValueError:
        print(f"Unparseable snapshot date {newest!r} — skipping prune.")
        return 0

    removed = 0
    for path in archive_dir.glob(f"{SNAPSHOT_PREFIX}*{SNAPSHOT_SUFFIX}"):
        iso = path.stem[len(SNAPSHOT_PREFIX):]
        try:
            y, m, d = (int(p) for p in iso.split("-"))
            stamp = date(y, m, d)
        except ValueError:
            # Not a dated snapshot — leave anything unrecognised alone.
            continue
        if stamp < cutoff:
            path.unlink()
            removed += 1
    return removed


def main() -> int:
    raw_source = os.environ.get("NOWCAST_SOURCE")
    raw_archive = os.environ.get("ARCHIVE_DIR")
    if not raw_source or not raw_archive:
        print("NOWCAST_SOURCE and ARCHIVE_DIR are both required.", file=sys.stderr)
        return 1

    source = Path(raw_source).expanduser()
    archive_dir = Path(raw_archive).expanduser()
    if not source.is_file():
        print(f"Nowcast not found: {source}", file=sys.stderr)
        return 1

    try:
        retention_days = int(os.environ.get("RETENTION_DAYS", DEFAULT_RETENTION_DAYS))
    except ValueError:
        retention_days = DEFAULT_RETENTION_DAYS

    iso = snapshot_date(source)
    archive_dir.mkdir(parents=True, exist_ok=True)
    target = archive_dir / f"{SNAPSHOT_PREFIX}{iso}{SNAPSHOT_SUFFIX}"

    # Overwrite rather than skip: a forced re-run publishes a new nowcast for
    # the same date, and the archive has to agree with what the board now shows.
    shutil.copyfile(source, target)
    print(f"Archived {source.name} -> {target}")

    removed = prune(archive_dir, iso, retention_days)
    if removed:
        print(f"Pruned {removed} snapshot(s) older than {retention_days} days.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
