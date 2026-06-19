#!/usr/bin/env python3
"""
build-today-json.py

Reads the already-copied nowcast CSV in the dashboard repo and writes a small
today.json for ONE flagship station, consumed by the "Today's prediction"
widget on the marketing site (projectneptune.co).

Mirrors the pattern of build-history.py / build-accuracy.py: runs in the
workflow AFTER the CSVs have been copied into public/data/southbay/, reads from
there, and writes its output alongside them. The existing `git add public/data/`
commit step picks the file up automatically.

Env vars (all optional):
  SOUTHBAY_DATA_DIR  dir holding nowcast_latest.csv and where today.json is
                     written. Default: public/data/southbay
  FLAGSHIP_STATION   StationCode to feature. Default: DHS113 (Manhattan Beach)
  DASHBOARD_URL      link for "Open full forecast".
                     Default: https://dashboard.projectneptune.co/southbay
"""

import csv
import json
import os
import sys
from datetime import datetime, timezone

DATA_DIR = os.environ.get("SOUTHBAY_DATA_DIR", "public/data/southbay")
FLAGSHIP = os.environ.get("FLAGSHIP_STATION", "DHS113")
DASHBOARD_URL = os.environ.get(
    "DASHBOARD_URL", "https://dashboard.projectneptune.co/southbay"
)

NOWCAST_CSV = os.path.join(DATA_DIR, "nowcast_latest.csv")
OUT_JSON = os.path.join(DATA_DIR, "today.json")

REGION = "South Bay, CA"


# Band cutoffs — single source of truth for the four-band system.
# Probability is an integer 0-100. Upper bound inclusive.
#   0-29  normal
#   30-49 slightly_elevated
#   50-74 not_recommended
#   75-100 strongly_not_recommended
def band_for(prob_pct: int) -> str:
    if prob_pct <= 29:
        return "normal"
    if prob_pct <= 49:
        return "slightly_elevated"
    if prob_pct <= 74:
        return "not_recommended"
    return "strongly_not_recommended"


def clean_name(raw: str) -> str:
    """'DHS113-Manhattan Beach, Los Angeles' -> 'Manhattan Beach'."""
    name = raw.split("-", 1)[1] if "-" in raw else raw
    name = name.split(",")[0]
    return name.strip()


def main() -> int:
    if not os.path.exists(NOWCAST_CSV):
        print(f"ERROR: {NOWCAST_CSV} not found — cannot build today.json", file=sys.stderr)
        return 1

    row = None
    with open(NOWCAST_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            if r.get("StationCode", "").strip() == FLAGSHIP:
                row = r
                break

    if row is None:
        print(f"ERROR: station {FLAGSHIP} not found in {NOWCAST_CSV}", file=sys.stderr)
        return 1

    try:
        prob_pct = round(float(row["exc_probability"]) * 100)
    except (KeyError, ValueError) as e:
        print(f"ERROR: bad exc_probability for {FLAGSHIP}: {e}", file=sys.stderr)
        return 1

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "location": {
            "id": FLAGSHIP,
            "name": clean_name(row.get("StationName", FLAGSHIP)),
            "region": REGION,
        },
        "today": {
            "date": row.get("prediction_date", ""),
            "probability": prob_pct,
            "band": band_for(prob_pct),
        },
        "dashboard_url": DASHBOARD_URL,
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")

    print(f"Wrote {OUT_JSON}: {FLAGSHIP} {prob_pct}% ({payload['today']['band']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
