// lib/proMailer.ts: Pro mail via Resend, From updates@, Reply-To a person,
// rerouted outside production. No network: fetch is injected.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const env = {};
const loaded = {};
function load(file, mocks) {
  const m = {exports: {}};
  const js = ts.transpileModule(readFileSync(file, 'utf8'),
    {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(`(function(require,module,exports,process){${js}\n})`, {Error, Array, String, Object, JSON, Boolean, Response})(
    name => { if (name in mocks) return mocks[name]; throw Error(`unmocked import: ${name}`); }, m, m.exports, {env});
  return m.exports;
}
loaded.guard = load('lib/mailGuard.ts', {});
loaded.provider = load('lib/alertProvider.ts', {'server-only': {}, './mailGuard': loaded.guard});
const pro = load('lib/proMailer.ts', {'server-only': {}, './alertProvider': loaded.provider, './mailGuard': loaded.guard});

const reset = (vars) => { for (const k of Object.keys(env)) delete env[k]; Object.assign(env, vars); };
const base = {VERCEL_ENV: 'production', ALERT_RESEND_API_KEY: 're_test', ALERT_FROM_ADDRESS: 'Project Neptune <updates@alerts.projectneptune.co>', ALERT_REPLY_TO: 'ethan@projectneptune.co'};
const mail = {to: 'buyer@example.com', subject: 'Welcome to Neptune Pro', html: '<p>hi</p>', text: 'hi'};
const capture = (status = 200, body = {id: 'em_1'}) => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({url, init, body: JSON.parse(init.body)}); return new Response(JSON.stringify(body), {status}); };
  return {calls, fetchImpl};
};
let n = 0;
const check = async (label, fn) => { await fn(); console.log(`ok ${++n} - ${label}`); };

await check('production sends from Neptune Pro <updates@…> with reply-to ethan@', async () => {
  reset(base); const {calls, fetchImpl} = capture();
  await pro.sendProMail(mail, fetchImpl);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test');
  assert.equal(calls[0].body.from, 'Neptune Pro <updates@alerts.projectneptune.co>');
  assert.equal(calls[0].body.reply_to, 'ethan@projectneptune.co');
  assert.deepEqual([...calls[0].body.to], ['buyer@example.com']);
  assert.equal(calls[0].body.subject, 'Welcome to Neptune Pro');
});

await check('preview reroutes to the sandbox inbox', async () => {
  reset({...base, VERCEL_ENV: 'preview', MAIL_SANDBOX_RECIPIENT: 'ethan@projectneptune.co'}); const {calls, fetchImpl} = capture();
  await pro.sendProMail(mail, fetchImpl);
  assert.deepEqual([...calls[0].body.to], ['ethan@projectneptune.co']);
  assert.equal(calls[0].body.subject, '[preview → buyer@example.com] Welcome to Neptune Pro');
});

await check('PRO_EMAIL_FROM overrides the sender', async () => {
  reset({...base, PRO_EMAIL_FROM: 'pro@alerts.projectneptune.co'}); const {calls, fetchImpl} = capture();
  await pro.sendProMail(mail, fetchImpl);
  assert.equal(calls[0].body.from, 'Neptune Pro <pro@alerts.projectneptune.co>');
});

await check('unsubscribe headers pass through', async () => {
  reset(base); const {calls, fetchImpl} = capture();
  await pro.sendProMail({...mail, headers: {'List-Unsubscribe': '<https://x/u>'}}, fetchImpl);
  assert.equal(calls[0].body.headers['List-Unsubscribe'], '<https://x/u>');
});

await check('not configured without a key or a from address', () => {
  reset(base); assert.equal(pro.proMailConfigured(), true);
  reset({...base, ALERT_RESEND_API_KEY: undefined}); assert.equal(pro.proMailConfigured(), false);
  reset({...base, ALERT_FROM_ADDRESS: undefined}); assert.equal(pro.proMailConfigured(), false);
});

await check('a Resend rejection throws without echoing the recipient', async () => {
  reset(base); const {fetchImpl} = capture(422, {name: 'validation_error', message: 'bad buyer@example.com'});
  await assert.rejects(pro.sendProMail(mail, fetchImpl), (e) => {
    assert.match(e.message, /422 validation_error/); assert.doesNotMatch(e.message, /buyer@/); return true;
  });
});

console.log(`${n}/${n} Pro mailer checks passed.`);
