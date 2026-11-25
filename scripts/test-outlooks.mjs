// Water Quality Outlooks data layer: flag gating, data assembly, and the
// guarantee that outlook stations can never carry prediction fields.
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
let n = 0;
async function check(label, fn) { await fn(); console.log(`ok ${++n} - ${label}`); }

const load = (file, mocks = {}) => {
  const m = {exports: {}};
  const js = ts.transpileModule(readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
  vm.runInNewContext(`(function(require,module,exports,process){${js}\n})`, {console: {...console, error: () => {}}, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Map, Set, Date, Promise, Error, Infinity})(
    (name) => { if (name in mocks) return mocks[name]; if (name === './parse') return parse; return require(name); }, m, m.exports, process);
  return m.exports;
};
const parse = load('lib/outlooks/parse.ts');
const loader = load('lib/outlooks/load.ts', {'server-only': {}});

const ON = {NEPTUNE_OUTLOOKS_ENABLED: 'true'};
const NOW = new Date('2026-11-25T12:00:00Z');
const forecastBeach = (code) => ({code, name: code, probability: 0.2, status: 'Normal', forecast: []});
const coverageSrc = readFileSync('lib/californiaCoverage.ts', 'utf8');
const coverage = [...coverageSrc.slice(coverageSrc.indexOf('new Set(['), coverageSrc.indexOf(']);')).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const plain = (v) => JSON.parse(JSON.stringify(v));
const keysDeep = (v, out = new Set()) => { if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); } return out; };
const PREDICTIONISH = /prob|predict|risk|index|mpn_?label|threshold|shap|factor|verdict|band|accuracy|forecast/i;

// ── Committed review data (live branch run 2026-11-25) ────────────────────
const net = await loader.loadOutlookNetwork({forecastBeaches: coverage.map(forecastBeach), displayNames: {DHS115: 'Hermosa Beach - Herondo St'}, env: ON, now: NOW});
await check('loads 119 released stations at 38 beaches', () => {
  assert.ok(net);
  assert.deepEqual({...net.counts}, {stations: 119, forecastStations: 19, outlookStations: 100, beaches: 38});
});
const stations = net.sites.flatMap((s) => s.stations);
await check('forecast stations are exactly the 19 public forecasts', () => {
  assert.deepEqual(plain(stations.filter((s) => s.kind === 'forecast').map((s) => s.station.code).sort()), [...coverage].sort());
});
await check('only LA and Orange County are released', () => {
  assert.deepEqual(plain([...new Set(net.sites.map((s) => s.county))].sort()), ['Los Angeles', 'Orange']);
});
await check('no outlook station carries a prediction-shaped field anywhere', () => {
  for (const s of stations.filter((x) => x.kind === 'outlook')) {
    for (const k of keysDeep(s)) assert.ok(!PREDICTIONISH.test(k), `${s.station.code}: ${k}`);
    assert.equal(s.beach, undefined);
  }
});
await check('a beach with a forecast station leads with it (Newport Bay → BNB05)', () => {
  const nb = net.sites.find((s) => s.name === 'Newport Bay');
  assert.equal(nb.leadStationCode, 'BNB05');
  assert.equal(nb.stations[0].kind, 'forecast');
  assert.equal(nb.hasForecast, true);
  assert.equal(nb.multiStation, true);
});
await check('reliability labels match D1 (3 strong, 3 fair, 13 grandfathered)', () => {
  const f = stations.filter((s) => s.kind === 'forecast');
  const by = (r) => plain(f.filter((s) => s.reliability === r).map((s) => s.station.code).sort());
  assert.deepEqual(by('strong'), ['DHS113', 'SMB-3-5', 'SMB-3-6']);
  assert.deepEqual(by('fair'), ['0', 'DHS115', 'SMB-2-10']);
  assert.equal(by('grandfathered').length, 13);
  assert.equal(f.find((s) => s.station.code === 'SMB-2-13').reliabilityReason, 'below_requirements');
  assert.equal(f.find((s) => s.station.code === 'DHS114').reliabilityReason, 'insufficient_exceedances');
  assert.equal(f.find((s) => s.station.code === 'DHS113').reliabilityReason, null);
});
await check('station "0" survives parsing and curated names win', () => {
  assert.ok(stations.some((s) => s.station.code === '0'));
  assert.equal(stations.find((s) => s.station.code === 'DHS115').station.name, 'Hermosa Beach - Herondo St');
  assert.equal(stations.find((s) => s.station.code === 'DHS104B').station.name, 'Santa Monica State Beach');
});
await check('every station has an outlook and lab results are recent-first, capped, flagged', () => {
  for (const s of stations) {
    assert.ok(s.outlook, s.station.code);
    assert.ok(s.labs.length <= parse.LABS_PER_STATION);
    for (let i = 1; i < s.labs.length; i++) assert.ok(s.labs[i - 1].sampleDate >= s.labs[i].sampleDate);
    for (const l of s.labs) { assert.equal(typeof l.exceedsStandard, 'boolean'); assert.equal(l.standardMpn, 104); }
  }
  const osb05 = stations.find((s) => s.station.code === 'OSB05');
  assert.equal(osb05.outlook.headlineKey, 'data_unavailable');
});
await check('freshness: same day is fresh, two days later is stale', async () => {
  assert.equal(net.stale, false);
  const later = await loader.loadOutlookNetwork({forecastBeaches: [], displayNames: {}, env: ON, now: new Date('2026-11-27T12:00:00Z')});
  assert.equal(later.stale, true);
});

// ── Flag and failure behaviour ────────────────────────────────────────────
await check('flag off: returns null without touching the files', async () => {
  let reads = 0;
  const gated = load('lib/outlooks/load.ts', {'server-only': {}, 'node:fs/promises': {readFile: async () => { reads++; throw Error('read'); }}});
  for (const env of [{}, {NEPTUNE_OUTLOOKS_ENABLED: '1'}, {NEPTUNE_OUTLOOKS_ENABLED: 'TRUE'}]) {
    assert.equal(await gated.loadOutlookNetwork({forecastBeaches: [], displayNames: {}, env}), null);
  }
  assert.equal(reads, 0);
});
await check('missing files: returns null instead of breaking the page', async () => {
  const empty = mkdtempSync(path.join(tmpdir(), 'outlooks-'));
  assert.equal(await loader.loadOutlookNetwork({forecastBeaches: [], displayNames: {}, env: ON, root: empty}), null);
});

// ── Injection: extra prediction columns in the files never reach outlooks ─
const fixture = mkdtempSync(path.join(tmpdir(), 'outlooks-'));
mkdirSync(path.join(fixture, 'data', 'outlooks'), {recursive: true});
const w = (f, s) => writeFileSync(path.join(fixture, 'data', 'outlooks', f), s);
w('station_registry.csv', [
  'StationCode,StationName,Latitude,Longitude,county,site_id,site_name,site_verified,classification,reliability,reliability_reason,exc_probability',
  'A1,A1-Test Beach, Los Angeles,33.9,-118.4,Los Angeles,la--test,Test Beach,true,outlook,,,0.9',
  'F1,F1-Test Beach, Los Angeles,33.8,-118.4,Los Angeles,la--test,Test Beach,true,forecast,fair,,0.9',
  'F2,F2,33.7,-118.4,Los Angeles,la--other,Other,false,forecast,beta,,0.9',
  'X1,X1,37.7,-122.5,San Francisco,sf--x,X,false,unreleased,,,0.9',
].join('\n').replace(/A1-Test Beach, Los Angeles/, '"A1-Test Beach, Los Angeles"').replace(/F1-Test Beach, Los Angeles/, '"F1-Test Beach, Los Angeles"'));
const infl = JSON.stringify([{key: 'rain_prior3', label: 'Rain, past 3 days', value: 0, unit: 'mm', display: '0 in', status: 'context', detail: '', age_days: 0, probability: 0.9}]).replace(/"/g, '""');
w('outlook_latest.csv', [
  'StationCode,site_id,county,classification,inputs_date,generated_at,data_status,headline_key,headline,explanation,influences,disclaimer,exc_probability,prediction,top_factor_1',
  `A1,la--test,Los Angeles,outlook,2026-11-25,2026-11-25T02:00:00Z,complete,dry,Dry weather pattern,Dry.,"${infl}",D,0.9,1,Rain`,
  `F1,la--test,Los Angeles,forecast,2026-11-25,2026-11-25T02:00:00Z,complete,dry,Dry weather pattern,Dry.,"${infl}",D,0.9,1,Rain`,
].join('\n'));
w('lab_history.csv', ['StationCode,sample_date,result_mpn,qualifier,display,exceeds_standard,standard_mpn,units',
  ...Array.from({length: 15}, (_, i) => `A1,2026-10-${String(i + 1).padStart(2, '0')},${i * 20},=,${i * 20},${i * 20 > 104 ? 1 : 0},104,MPN/100 mL`)].join('\n'));
const fx = await loader.loadOutlookNetwork({forecastBeaches: [], displayNames: {}, env: ON, root: fixture, now: NOW});
const a1 = fx.sites.flatMap((s) => s.stations).find((s) => s.station.code === 'A1');
await check('extra prediction columns and JSON keys are dropped from outlooks', () => {
  for (const k of keysDeep(a1)) assert.ok(!PREDICTIONISH.test(k), k);
  assert.equal(JSON.stringify(a1).includes('0.9'), false);
});
await check('unreleased and badly-labelled stations are not shipped', () => {
  const codes = fx.sites.flatMap((s) => s.stations).map((s) => s.station.code).sort();
  assert.deepEqual(plain(codes), ['A1', 'F1']);
});
await check('a forecast missing today stays a forecast (beach null), never an outlook', () => {
  const f1 = fx.sites[0].stations.find((s) => s.station.code === 'F1');
  assert.equal(f1.kind, 'forecast');
  assert.equal(f1.beach, null);
  assert.equal(fx.sites[0].leadStationCode, 'F1');
});
await check('lab history keeps the 12 newest results', () => {
  assert.equal(a1.labs.length, 12);
  assert.equal(a1.labs[0].sampleDate, '2026-10-15');
  assert.equal(a1.labs[0].exceedsStandard, true);
});
await check('the guard rejects prediction fields at any depth', () => {
  assert.throws(() => parse.assertNoPredictionFields({probability: 0.2}));
  assert.throws(() => parse.assertNoPredictionFields({outlook: {influences: [{riskLevel: 'High'}]}}));
  assert.throws(() => parse.assertNoPredictionFields({forecast: []}));
  parse.assertNoPredictionFields({kind: 'outlook', outlook: {headline: 'Rain forecast for today'}});
});
await check('station names are cleaned from CEDEN names', () => {
  assert.equal(parse.cleanStationName('DHS104', 'DHS104-Santa Monica State Beach, Los Angeles'), 'Santa Monica State Beach');
  assert.equal(parse.cleanStationName('SMB-1-10', 'SMB-1-10'), 'SMB-1-10');
  assert.equal(parse.cleanStationName('CLEOz', 'Cleo St. Point Zero'), 'Cleo St. Point Zero');
});
console.log(`${n} outlook data checks passed.`);
