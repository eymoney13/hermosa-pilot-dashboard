import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = path.resolve('components/california-sandbox/lib');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const loadedModule = { exports: {} };
  cache.set(file, loadedModule);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const nativeRequire = createRequire(file);
  const require = spec => spec === 'server-only' ? {} : spec.startsWith('.')
    ? load(path.resolve(path.dirname(file), `${spec}.ts`)) : nativeRequire(spec);
  new Function('require', 'module', 'exports', source)(require, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const { neptuneIndex, displayedNeptuneIndex, LONG_BEACH_THRESHOLDS } = load(`${root}/neptuneIndex.ts`);
for (const t of [0.5, ...Object.values(LONG_BEACH_THRESHOLDS)]) {
  assert.equal(neptuneIndex(0, t), 0);
  assert.equal(neptuneIndex(1, t), 100);
  assert.equal(neptuneIndex(t, t), 50);
  assert.ok(displayedNeptuneIndex(t - 0.000001, t) < 50);
  assert.ok(displayedNeptuneIndex(t + 0.000001, t) >= 50);
  let previous = -1;
  for (let n = 0; n <= 1000; n++) {
    const p = n / 1000;
    const score = neptuneIndex(p, t);
    assert.ok(score >= previous && score >= 0 && score <= 100);
    assert.equal(score >= 50, p >= t);
    if (t === 0.5) assert.ok(Math.abs(score - p * 100) < 1e-10);
    previous = score;
  }
}
assert.equal(displayedNeptuneIndex(0.5225, 0.6), 42);
assert.equal(displayedNeptuneIndex(0.524, 0.66), 36);
for (const p of [NaN, Infinity, -0.1, 1.1]) assert.throws(() => neptuneIndex(p, 0.5));
for (const t of [NaN, 0, 1, -0.1]) assert.throws(() => neptuneIndex(0.5, t));
const { LOCATIONS, statusFromProb, computeAccuracy } = load(`${root}/data.ts`);
const { loadDashboardData } = load(`${root}/loadData.ts`);
const config = { ...LOCATIONS.california, dataSlug: 'california-sandbox' };
const { beaches, predictionDate } = await loadDashboardData(config);
assert.equal(predictionDate, '2026-10-02');
assert.equal(beaches.length, 28);
for (const [code, threshold] of Object.entries(LONG_BEACH_THRESHOLDS)) {
  const beach = beaches.find(b => b.code === code);
  assert.ok(beach, code);
  assert.equal(beach.threshold, threshold);
  assert.ok(Number.isFinite(beach.latitude) && Number.isFinite(beach.longitude));
  assert.equal(beach.status, statusFromProb(beach.probability, code, { [code]: threshold }));
  assert.deepEqual(beach.forecast.map(d => d.date), ['2026-10-03','2026-10-04','2026-10-05']);
  assert.deepEqual(beach.pastDays.map(d => d.date), ['2026-09-29','2026-09-30','2026-10-01']);
  for (const day of [...beach.forecast, ...beach.pastDays]) {
    assert.equal(day.threshold, threshold);
    assert.equal(day.status, statusFromProb(day.probability, code, {[code]: threshold}));
    assert.equal(day.verdict, day.status === 'Not recommended' ? 'Poor' : day.status === 'Slightly elevated' ? 'Moderate' : 'Good');
  }
  assert.ok(beach.accuracy.totalSamples >= 18);
  assert.equal(beach.accuracy.samples.length, 7);
}
const b10 = beaches.find(b => b.code === 'B-10');
assert.equal(b10.probability, 0.5225); // Original model output survives normalization.
assert.equal(b10.status, 'Slightly elevated');
assert.equal(b10.verdict, 'Moderate'); // Published 0.50-based Unsafe is overridden only here.
console.log('PASS: threshold boundaries, monotonicity, fixed-scale identity, invalid inputs, and 28-beach sandbox data.');

// Exact comparison must not round a below-threshold prediction into Unsafe.
const boundary = computeAccuracy([
  {date:'2026-01-01', excProbability:0.5999, labMpn:10},
  {date:'2026-01-02', excProbability:0.6, labMpn:105},
], 0.6);
assert.equal(boundary.totalMatches, 2);
assert.deepEqual(boundary.samples.map(s => s.predictedUnsafe), [false,true]);
assert.deepEqual(boundary.samples.map(s => s.neptuneIndex), [49,50]);
// Independently recompute every imported station's accuracy directly from the CSV.
const papa = createRequire(import.meta.url)('papaparse');
const rawAccuracy = papa.parse(fs.readFileSync('public/data/california-sandbox/accuracy.csv','utf8'), {header:true,skipEmptyLines:true}).data;
let pairedCount = 0;
for (const [code, cutoff] of Object.entries(LONG_BEACH_THRESHOLDS)) {
  const rows = rawAccuracy.filter(r => r.StationCode === code);
  const matches = rows.filter(r => (Number(r.exc_probability) >= cutoff) === (Number(r.actual_mpn) > 104)).length;
  const beach = beaches.find(b => b.code === code);
  assert.equal(beach.accuracy.totalSamples, rows.length);
  assert.equal(beach.accuracy.totalMatches, matches);
  pairedCount += rows.length;
  console.log(`${code}: ${matches}/${rows.length} matched (${Math.round(matches / rows.length * 100)}%) at ${cutoff}`);
}
assert.equal(pairedCount,307);
console.log('PASS: 27 historical + 27 future readings, shared tuned cutoffs, and 307 paired lab samples.');
