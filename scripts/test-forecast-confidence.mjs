import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();
const load = file => {
  const m = new Module(path.resolve(file)); m.filename = path.resolve(file); m.paths = require.resolve.paths('typescript');
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText, m.filename);
  return m.exports;
};
const { loadPredictionArchive } = load('lib/predictionArchive.ts');
const archive = await loadPredictionArchive('2026-11-02', 'southbay');
assert.equal(archive.size, 10);
assert(!archive.has('2026-11-02'));
assert(archive.has('2026-10-23'));
for (const [date, rows] of archive) { assert(rows.has('DHS114'), date); assert(rows.has('0'), date); }
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forecast-confidence-'));
try {
  fs.writeFileSync(path.join(temp, 'nowcast_2026-11-01.csv'), 'StationCode,prediction_date,exc_probability\n0,2026-11-01,0\nwrong,2026-10-31,0.5\nblank,2026-11-01,\ninvalid,2026-11-01,2\n');
  process.env.SANDBOX_NOWCAST_HISTORY_DIR = temp;
  const sandbox = await loadPredictionArchive('2026-11-02');
  assert.equal(sandbox.get('2026-11-01').get('0'), 0);
  assert(!sandbox.get('2026-10-31').has('wrong'));
  assert(!sandbox.get('2026-11-01').has('invalid'));
  assert(!sandbox.get('2026-11-01').has('blank'));
  assert.equal((await loadPredictionArchive('invalid')).size, 0);
  // Existing daily job must produce both files and retain yesterday-first order.
  const anchor = new Date();
  for (let i = 1; i <= 10; i++) {
    const day = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() - i));
    const date = day.toISOString().slice(0, 10);
    fs.writeFileSync(path.join(temp, `nowcast_${date}.csv`), `StationCode,StationName,prediction_date,exc_probability\n0,Test,${date},0\n`);
  }
  const result = spawnSync('python3', ['scripts/build-history.py'], { cwd: root, encoding: 'utf8', env: { ...process.env, NOWCAST_HISTORY_DIR: temp, NOWCAST_HISTORY_FALLBACK_DIR: '', HISTORY_OUTPUT_DIR: temp, BEACH_FILTER: '0' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert(fs.existsSync(path.join(temp, 'history_3day.csv')));
  const csv = fs.readFileSync(path.join(temp, 'history_10day.csv'), 'utf8').trim().split(/\r?\n/);
  assert.equal(csv.length, 11);
  assert(csv[1].endsWith(',0'));
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log('Forecast confidence: ten completed dates, archive lookup, station 0, zero probability, invalid rows, and daily history generation passed.');
