// The cron-only routes must reject every request when CRON_SECRET is unset.
// Before this check existed, a deployment without the secret (every preview)
// accepted the literal header "Bearer undefined".
//
// Run: node scripts/test-cron-auth.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const load = (file, env, mocks = {}, globals = {}) => {
  const m = {exports: {}};
  const js = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(`(function(require,module,exports,process){${js}\n})`, {
    Response, Request, URL, JSON, console, setTimeout, Promise, Date, ...globals,
  })((name) => {
    if (name in mocks) return mocks[name];
    throw Error(`unexpected import ${name}`);
  }, m, m.exports, {env});
  return m.exports;
};

const req = (auth) => new Request('https://example.test/api', auth === undefined ? {} : {headers: {authorization: auth}});

// What each route does once it is past authentication, so the test can tell
// "rejected at the door" apart from "let in".
const routes = {
  'app/api/alerts/send/route.ts': (env, calls) => load('app/api/alerts/send/route.ts', env, {
    '@/lib/alertSend': {
      isAlertSendingConfigured: () => { calls.push('configured?'); return false; },
      alertSender: () => { calls.push('sender'); throw Error('must not send'); },
      sendAllAlerts: () => { calls.push('sendAll'); throw Error('must not send'); },
    },
  }),
  'app/api/trigger/route.ts': (env, calls) => load('app/api/trigger/route.ts', env, {}, {
    fetch: () => { calls.push('dispatch'); throw Error('must not dispatch'); },
  }),
};

let n = 0;
for (const [file, build] of Object.entries(routes)) {
  const cases = [
    ['secret unset, "Bearer undefined"', {}, 'Bearer undefined'],
    ['secret unset, "Bearer " (empty)', {}, 'Bearer '],
    ['secret unset, no header', {}, undefined],
    ['secret empty string, "Bearer "', {CRON_SECRET: ''}, 'Bearer '],
    ['secret set, wrong value', {CRON_SECRET: 's3cret'}, 'Bearer nope'],
    ['secret set, "Bearer undefined"', {CRON_SECRET: 's3cret'}, 'Bearer undefined'],
  ];
  for (const [label, env, auth] of cases) {
    const calls = [];
    const res = await build(env, calls).GET(req(auth));
    assert.equal(res.status, 401, `${file}: ${label} -> ${res.status}`);
    assert.deepEqual(calls, [], `${file}: ${label} ran past auth: ${calls}`);
    console.log(`ok ${++n} - ${file}: ${label} -> 401`);
  }
  // The real cron header still gets through (the route then stops at its own
  // "not configured" check, because nothing else is set here).
  const calls = [];
  const res = await build({CRON_SECRET: 's3cret'}, calls).GET(req('Bearer s3cret'));
  assert.notEqual(res.status, 401, `${file}: correct secret was rejected`);
  console.log(`ok ${++n} - ${file}: correct secret is let in (${res.status})`);
}
console.log(`\n${n}/${n} cron-auth checks passed.`);
