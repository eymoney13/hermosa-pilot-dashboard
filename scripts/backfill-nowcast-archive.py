#!/usr/bin/env python3
"""
Seed data/nowcast-archive/<slug>/ from this repo's own git history.

Every published nowcast is already here: each daily refresh commits
public/data/<slug>/nowcast_latest.csv, so the archive that archive-nowcast.py
will keep going forward can be reconstructed backwards for free.

Without this, the 7-day window takes three days to become fully truthful after
archive-nowcast.py ships — the past cells keep falling back to project-neptune's
all-beaches archive until the new one fills up. Running this once makes the strip
correct on the first deploy instead.

Where two commits publish the same prediction_date (a forced re-run), the LATER
commit wins: that is what readers were last shown for that day.

Usage:
  python3 scripts/backfill-nowcast-archive.py [--days N] [--dry-run] [slug ...]

Defaults to the four CA boards over 30 days. Boston is excluded on purpose — its
workflow archives its own run in project-neptune already, so it never had the
split this repairs.
"""

from __future__ import annotations

import argparse
import csv
import io
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ARCHIVE_ROOT = REPO_ROOT / "data" / "nowcast-archive"
DEFAULT_SLUGS = ["hermosa", "manhattan", "cabrillo", "southbay"]
DEFAULT_DAYS = 30


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=REPO_ROOT, capture_output=True, text=True, check=True
    ).stdout


def commits_for(slug: str, days: int) -> list[str]:
    """Commits touching this slug's nowcast, OLDEST first.

    Oldest first so that when two commits carry the same prediction_date the
    later one overwrites the earlier, leaving what readers last saw.
    """
    path = f"public/data/{slug}/nowcast_latest.csv"
    out = git(
        "log", "--reverse", "--format=%H", f"--since={days} days ago", "--", path
    )
    return [line for line in out.splitlines() if line]


def prediction_date(blob: str) -> str | None:
    for row in csv.DictReader(io.StringIO(blob)):
        stamp = (row.get("prediction_date") or "").strip()
        if stamp:
            return stamp[:10]
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="*", default=None)
    ap.add_argument("--days", type=int, default=DEFAULT_DAYS)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    slugs = args.slugs or DEFAULT_SLUGS
    total = 0
    for slug in slugs:
        commits = commits_for(slug, args.days)
        if not commits:
            print(f"{slug}: no nowcast commits in the last {args.days} days")
            continue

        # prediction_date -> file contents, later commits overwriting earlier.
        by_date: dict[str, str] = {}
        for sha in commits:
            try:
                blob = git("show", f"{sha}:public/data/{slug}/nowcast_latest.csv")
            except subprocess.CalledProcessError:
                # The file was added partway through the window.
                continue
            iso = prediction_date(blob)
            if iso:
                by_date[iso] = blob

        dest = ARCHIVE_ROOT / slug
        if not args.dry_run:
            dest.mkdir(parents=True, exist_ok=True)
        for iso, blob in sorted(by_date.items()):
            target = dest / f"nowcast_{iso}.csv"
            if not args.dry_run:
                target.write_text(blob, encoding="utf-8")
            total += 1
        span = f"{min(by_date)}..{max(by_date)}" if by_date else "-"
        print(
            f"{slug}: {len(by_date)} snapshot(s) from {len(commits)} commit(s), {span}"
            + (" (dry run)" if args.dry_run else "")
        )

    print(f"{'Would write' if args.dry_run else 'Wrote'} {total} snapshot(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
