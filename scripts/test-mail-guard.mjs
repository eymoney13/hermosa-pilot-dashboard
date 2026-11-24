// lib/mailGuard.ts: outside production, no email may reach a real person.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const m = {exports: {}};
const js = ts.transpileModule(readFileSync('lib/mailGuard.ts', 'utf8'),
  {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(`(function(module,exports,process){${js}\n})`, {Error, Array, String, Object})(m, m.exports, {env: {}});
const {guardRecipient, guardMailOptions, guardTransport, isProductionMail} = m.exports;

const prod = {VERCEL_ENV: 'production'};
const preview = {VERCEL_ENV: 'preview', MAIL_SANDBOX_RECIPIENT: 'me@test.dev'};
let n = 0;
const check = async (label, fn) => { await fn(); console.log(`ok ${++n} - ${label}`); };

await check('production is untouched', () => {
  assert.deepEqual({...guardRecipient('a@x.com', 'Hi', prod)}, {to: 'a@x.com', subject: 'Hi'});
  const opts = {to: 'a@x.com', bcc: 'b@x.com', subject: 'Hi'};
  assert.equal(guardMailOptions(opts, prod), opts);
});

await check('preview reroutes to the sandbox inbox and tags the subject', () => {
  assert.deepEqual({...guardRecipient('a@x.com', 'Hi', preview)},
    {to: 'me@test.dev', subject: '[preview → a@x.com] Hi'});
});

await check('missing VERCEL_ENV counts as not production', () => {
  assert.equal(isProductionMail({}), false);
  assert.equal(guardRecipient('a@x.com', 'Hi', {ALERT_TEST_RECIPIENT: 't@x.com'}).to, 't@x.com');
});

await check('no sandbox recipient outside production refuses to send', () => {
  assert.throws(() => guardRecipient('a@x.com', 'Hi', {VERCEL_ENV: 'preview'}), /Email blocked/);
});

await check('cc and bcc are dropped, every original address is named', () => {
  const out = guardMailOptions({to: [{address: 'a@x.com'}, 'b@x.com'], cc: 'c@x.com', bcc: 'd@x.com', subject: 'S'}, preview);
  assert.equal(out.to, 'me@test.dev');
  assert.equal(out.cc, undefined);
  assert.equal(out.bcc, undefined);
  assert.equal(out.subject, '[preview → a@x.com, b@x.com, c@x.com, d@x.com] S');
});

await check('wrapped nodemailer transport reroutes sendMail', async () => {
  const sent = [];
  const t = guardTransport({sendMail: async (o) => { sent.push(o); }}, preview);
  await t.sendMail({to: 'real@user.com', subject: 'Alert'});
  assert.equal(sent[0].to, 'me@test.dev');
});

console.log(`${n}/${n} mail guard checks passed.`);
