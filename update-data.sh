#!/bin/bash
set -e
cp ~/Desktop/project-neptune/outputs/nowcast_latest.csv public/data/
cp ~/Desktop/project-neptune/outputs/forecast_3day.csv public/data/
cp ~/Desktop/project-neptune/models/thresholds.csv public/data/
./scripts/build-history.py
git add public/data/
git diff --cached --quiet || git commit -m "Refresh predictions $(date +%Y-%m-%d)"
git push
