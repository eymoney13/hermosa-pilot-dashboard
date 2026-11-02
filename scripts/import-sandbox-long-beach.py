"""Import downloaded Long Beach source CSVs; writes only sandbox data.
Usage: python3 scripts/import-sandbox-long-beach.py /tmp
Expected lb-import-0.csv = forecast, 1 = comparison, 2..4 = Oct 1/Sep 30/Sep 29 nowcasts.
"""
import csv
import json
import math
import sys
from pathlib import Path

SOURCE = Path(sys.argv[1])
DEST = Path(__file__).resolve().parent.parent / 'public/data/california-sandbox'
CODES = {'B-5', 'B-60', 'B-7', 'B-8', 'B-10', 'B-31', 'B-14', 'B-67', 'B-22'}

def read(path):
    with path.open(newline='') as f:
        return list(csv.DictReader(f))

def merge(name, incoming):
    old = read(DEST / name)
    rows = [r for r in old if r['StationCode'] not in CODES] + incoming
    fields = list(dict.fromkeys(k for r in rows for k in r))
    with (DEST / name).open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

forecasts = [r for r in read(SOURCE / 'lb-import-0.csv') if r['StationCode'] in CODES]
assert len(forecasts) == 9
for r in forecasts:
    assert [r[f'day{i}_date'] for i in (1, 2, 3)] == ['2026-10-03', '2026-10-04', '2026-10-05']
merge('forecast_3day.csv', forecasts)

history = {code: {'StationCode': code} for code in sorted(CODES)}
for i, date in enumerate(['2026-10-01', '2026-09-30', '2026-09-29'], 1):
    rows = [r for r in read(SOURCE / f'lb-import-{i+1}.csv') if r['StationCode'] in CODES]
    assert len(rows) == 9
    for r in rows:
        assert r['prediction_date'] == date
        row = history[r['StationCode']]
        row[f'day{i}_date'] = date
        rename = {'exc_probability': 'probability', 'estimated_mpn': 'mpn'}
        for key, value in r.items():
            if key in ['StationCode', 'StationName', 'Latitude', 'Longitude', 'prediction_date']:
                continue
            row[f'day{i}_{rename.get(key, key)}'] = value
merge('history_3day.csv', list(history.values()))

samples = {}
for r in read(SOURCE / 'lb-import-1.csv'):
    if r['StationCode'] not in CODES or not r['Date'] or r['Date'] > '2026-10-02':
        continue
    try:
        lab, probability = float(r['Actual_MPN']), float(r['Exc_Probability']) / 100
    except ValueError:
        continue
    if not math.isfinite(lab) or lab < 0 or not math.isfinite(probability) or not 0 <= probability <= 1:
        continue
    key = (r['StationCode'], r['Date'])
    row = dict(StationCode=key[0], date=key[1], actual_mpn=str(lab), exc_probability=str(probability))
    assert key not in samples or samples[key] == row
    samples[key] = row
merge('accuracy.csv', [samples[k] for k in sorted(samples)])
manifest = json.loads((DEST / 'long-beach-experiment.json').read_text())
manifest.update(source_revision='436ee39d42231d039f4ee25a413a460d9565bcab', history_and_forecast_imported=True,
    threshold_scope='same experimental tuned station cutoff for nowcasts, history, forecasts, and accuracy',
    accuracy_source='outputs/mpn_comparison_all_beaches.csv; finite actual lab results only; deduplicated by station/date',
    accuracy_samples={code: sum(k[0] == code for k in samples) for code in sorted(CODES)})
(DEST / 'long-beach-experiment.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(f'Imported 9 forecasts, 27 historical readings, and {len(samples)} lab/prediction pairs into sandbox only.')
