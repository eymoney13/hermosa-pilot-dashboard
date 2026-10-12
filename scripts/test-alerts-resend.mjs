// Alert delivery tests: Resend transport, claim/settle durability, and the
// duplicate guard. Same shape as scripts/test-sandbox-alerts.mjs -- PGlite for
// a real Postgres, and the module under test loaded through a vm with its
// imports injected, so nothing here can reach a network or a mail provider.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';

// db() guards on this before neon() is called; PGlite is what actually answers.
process.env.DATABASE_URL='postgres://pglite/test';

const pg = new PGlite();
for (const f of ['alerts-schema.sql','subscriptions-schema.sql','payment-first-schema.sql',
                 'sandbox-alerts-schema.sql','california-free-alerts-schema.sql',
                 'california-alerts-schema.sql','alert-deliveries-schema.sql']) {
  await pg.exec(readFileSync(`scripts/${f}`,'utf8'));
}
const sql = async (parts,...values) =>
  (await pg.query(parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows;

const load = (file,mocks={}) => {
  const m={exports:{}};
  const js=ts.transpileModule(readFileSync(file,'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(`(function(require,module,exports,process,console,fetch){${js}\n})`,
    {Date,URL,Response,JSON,Math,Array,Object,Number,String,Boolean,Promise,Error,Set,Map,isNaN})
    (name=>{if(name in mocks)return mocks[name];throw Error(`unmocked import: ${name}`);},
     m,m.exports,process,{log(){},error(){}},globalThis.fetch);
  return m.exports;
};

let n=0, failures=0;
function check(label,fn){
  try { fn(); console.log(`ok ${++n} - ${label}`); }
  catch(e){ failures++; console.log(`not ok ${++n} - ${label}\n  ${e.message}`); }
}
async function reset(){
  await pg.exec(`TRUNCATE alert_deliveries, alert_notifications, alert_subscriptions,
                 legacy_alert_grants, alert_subscribers RESTART IDENTITY CASCADE;`);
}

// ---------------------------------------------------------------------------
// Provider: error classification against Resend's documented codes.
// ---------------------------------------------------------------------------
const makeRes = (status, body, headers={}) => ({
  ok: status>=200 && status<300, status,
  headers:{get:k=>headers[k] ?? null},
  json: async()=>body,
});

function providerWith(responder){
  // ALERT_FROM_ADDRESS is now required outright; RESEND_EMAIL_DOMAIN is set
  // here deliberately to prove it is ignored rather than merely absent.
  process.env.ALERT_RESEND_API_KEY='re_test';
  process.env.RESEND_EMAIL_DOMAIN='projectneptune.co';
  process.env.ALERT_FROM_ADDRESS='Project Neptune <updates@alerts.projectneptune.co>';
  const mod = load('lib/alertProvider.ts',{'server-only':{}});
  return mod.createResendSender(responder);
}
const MSG = {to:'a@example.com',subject:'s',html:'<p>h</p>',text:'t',oneClickUrl:'https://x/u'};

{
  let captured=null;
  const s = providerWith(async(url,init)=>{captured={url,init};return makeRes(200,{id:'email_123'});});
  const r = await s.send(MSG,'key-1');
  check('accepted send returns the provider message id',()=>{
    assert.equal(r.ok,true); assert.equal(r.id,'email_123');
  });
  check('posts to the documented Resend endpoint with bearer auth',()=>{
    assert.equal(captured.url,'https://api.resend.com/emails');
    assert.equal(captured.init.headers.Authorization,'Bearer re_test');
  });
  check('sends a stable Idempotency-Key header',()=>{
    assert.equal(captured.init.headers['Idempotency-Key'],'key-1');
  });
  const body = JSON.parse(captured.init.body);
  check('preserves subject, html, text and one-click unsubscribe headers',()=>{
    assert.equal(body.subject,'s'); assert.equal(body.html,'<p>h</p>'); assert.equal(body.text,'t');
    assert.equal(body.headers['List-Unsubscribe'],'<https://x/u>');
    assert.equal(body.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
  });
  check('from address is the verified alerts subdomain, not the Marketplace one',()=>{
    assert.equal(body.from,'Project Neptune <updates@alerts.projectneptune.co>');
    assert.match(body.from,/@alerts\.projectneptune\.co>$/);
  });
}
{
  const s = providerWith(async()=>makeRes(429,{name:'rate_limit_exceeded'},{'retry-after':'2'}));
  const r = await s.send(MSG,'k');
  check('rate limiting is retryable and carries retry-after',()=>{
    assert.equal(r.ok,false); assert.equal(r.retryable,true); assert.equal(r.retryAfterMs,2000);
  });
}
{
  const s = providerWith(async()=>makeRes(422,{name:'invalid_parameter'}));
  const r = await s.send(MSG,'k');
  check('a validation rejection is permanent, not retried forever',()=>{
    assert.equal(r.ok,false); assert.equal(r.retryable,false);
  });
}
{
  const s = providerWith(async()=>makeRes(503,{name:'service_unavailable'}));
  const r = await s.send(MSG,'k');
  check('provider 5xx is retryable',()=>assert.equal(r.retryable,true));
}
{
  const s = providerWith(async()=>{throw new Error('socket hang up');});
  const r = await s.send(MSG,'k');
  check('network failure is retryable and leaks no detail',()=>{
    assert.equal(r.ok,false); assert.equal(r.code,'network_error'); assert.equal(r.retryable,true);
  });
}
{
  const s = providerWith(async()=>makeRes(409,{name:'invalid_idempotent_request'}));
  const r = await s.send(MSG,'k');
  check('replayed key with a changed payload counts as already sent',()=>{
    assert.equal(r.ok,true); assert.equal(r.deduplicated,true);
  });
}

// ---------------------------------------------------------------------------
// Provider/sender configuration. These guard the Resend workspace migration:
// RESEND_API_KEY and RESEND_EMAIL_DOMAIN are Marketplace-managed and point at
// a workspace that does NOT own the verified sending domain, so neither may be
// allowed to decide how alert mail is sent.
// ---------------------------------------------------------------------------
function freshProvider(env){
  for (const k of ['ALERT_RESEND_API_KEY','RESEND_API_KEY','ALERT_FROM_ADDRESS',
                   'RESEND_EMAIL_DOMAIN','ALERT_EMAIL_PROVIDER','ALERT_REPLY_TO']) delete process.env[k];
  Object.assign(process.env, env);
  return load('lib/alertProvider.ts',{'server-only':{}});
}
const throws = fn => { try { fn(); return null; } catch (e) { return e.message; } };
const GOOD_FROM = 'Project Neptune <updates@alerts.projectneptune.co>';

{
  const m = freshProvider({ALERT_RESEND_API_KEY:'re_alert',RESEND_API_KEY:'re_marketplace',ALERT_FROM_ADDRESS:GOOD_FROM});
  check('ALERT_RESEND_API_KEY is preferred over the Marketplace key',()=>
    assert.equal(m.resendApiKey(),'re_alert'));
}
{
  const m = freshProvider({RESEND_API_KEY:'re_marketplace',ALERT_FROM_ADDRESS:GOOD_FROM});
  check('falls back to RESEND_API_KEY when the alert key is absent',()=>
    assert.equal(m.resendApiKey(),'re_marketplace'));
}
{
  const m = freshProvider({ALERT_RESEND_API_KEY:'',RESEND_API_KEY:'re_marketplace',ALERT_FROM_ADDRESS:GOOD_FROM});
  check('an empty alert key does not shadow the fallback',()=>
    assert.equal(m.resendApiKey(),'re_marketplace'));
}
{
  const m = freshProvider({ALERT_FROM_ADDRESS:GOOD_FROM});
  check('no key at all is reported, not silently used',()=>{
    assert.equal(m.resendApiKey(),undefined);
    const e = throws(()=>m.createResendSender());
    assert.match(e,/ALERT_RESEND_API_KEY/);
  });
}
{
  const m = freshProvider({ALERT_RESEND_API_KEY:'re_alert',RESEND_EMAIL_DOMAIN:'projectneptune.co'});
  check('NO silent fallback to the unverified Marketplace domain',()=>{
    const e = throws(()=>m.resendFrom());
    assert.match(e,/ALERT_FROM_ADDRESS must be set/);
    assert.match(e,/not used as a fallback/i);
  });
  check('a sender cannot be built without ALERT_FROM_ADDRESS',()=>
    assert.match(throws(()=>m.createResendSender()),/ALERT_FROM_ADDRESS/));
}
{
  const m = freshProvider({ALERT_RESEND_API_KEY:'re_alert',ALERT_FROM_ADDRESS:'   '});
  check('a blank ALERT_FROM_ADDRESS is rejected',()=>
    assert.match(throws(()=>m.resendFrom()),/ALERT_FROM_ADDRESS/));
}
{
  const m = freshProvider({ALERT_RESEND_API_KEY:'re_alert',ALERT_FROM_ADDRESS:'not-an-email'});
  check('a malformed ALERT_FROM_ADDRESS is rejected',()=>
    assert.match(throws(()=>m.resendFrom()),/ALERT_FROM_ADDRESS/));
}
{
  const m = freshProvider({ALERT_RESEND_API_KEY:'re_alert',ALERT_FROM_ADDRESS:GOOD_FROM});
  check('a display-name sender is passed through unchanged',()=>
    assert.equal(m.resendFrom(),GOOD_FROM));
}
{
  const m = freshProvider({ALERT_RESEND_API_KEY:'re_alert',ALERT_FROM_ADDRESS:'updates@alerts.projectneptune.co'});
  check('a bare address gains the display name',()=>
    assert.equal(m.resendFrom(),'Project Neptune <updates@alerts.projectneptune.co>'));
}
{
  const m = freshProvider({});
  check('fromAddressEmail extracts and validates',()=>{
    assert.equal(m.fromAddressEmail(GOOD_FROM),'updates@alerts.projectneptune.co');
    assert.equal(m.fromAddressEmail('a@b.co'),'a@b.co');
    assert.equal(m.fromAddressEmail(undefined),null);
    assert.equal(m.fromAddressEmail('nope'),null);
    assert.equal(m.fromAddressEmail('a@b'),null);
  });
}
{
  check('provider selection is explicit, defaulting to gmail',()=>{
    assert.equal(freshProvider({ALERT_EMAIL_PROVIDER:'resend'}).configuredProvider(),'resend');
    assert.equal(freshProvider({ALERT_EMAIL_PROVIDER:'gmail'}).configuredProvider(),'gmail');
    assert.equal(freshProvider({}).configuredProvider(),'gmail');
    assert.equal(freshProvider({ALERT_EMAIL_PROVIDER:'RESEND'}).configuredProvider(),'gmail');
  });
}
{
  const m = freshProvider({ALERT_RESEND_API_KEY:'re_alert',ALERT_FROM_ADDRESS:GOOD_FROM,ALERT_REPLY_TO:'ethan@projectneptune.co'});
  let captured=null;
  const s = m.createResendSender(async(url,init)=>{captured={url,init};return makeRes(200,{id:'x'});});
  await s.send(MSG,'k');
  const body = JSON.parse(captured.init.body);
  check('the configured sender and reply-to reach Resend',()=>{
    assert.equal(body.from,GOOD_FROM);
    assert.equal(body.reply_to,'ethan@projectneptune.co');
    assert.equal(captured.init.headers.Authorization,'Bearer re_alert');
  });
}
for (const k of ['ALERT_RESEND_API_KEY','ALERT_FROM_ADDRESS','RESEND_EMAIL_DOMAIN','ALERT_EMAIL_PROVIDER','ALERT_REPLY_TO']) delete process.env[k];
process.env.RESEND_API_KEY='re_test';

// ---------------------------------------------------------------------------
// Delivery run: eligibility, durability, duplicates.
// ---------------------------------------------------------------------------
const BEACH = c => ({code:c,name:`Beach ${c}`,status:'Not recommended',probability:0.7});
const CONFIG = {slug:'southbay',displayName:'South Bay'};

function sender(script){
  const calls=[];
  let i=0;
  return {calls, sender:{name:'resend', async send(msg,key){
    calls.push({to:msg.to,key});
    const step = typeof script==='function' ? script(calls.length) : script[Math.min(i++,script.length-1)];
    return step;
  }}};
}

function loadSend(beaches, predictionDate){
  return load('lib/alertSend.ts',{
    'server-only':{},
    'nodemailer':{createTransport:()=>({sendMail:async()=>{throw new Error('gmail must not be used');}})},
    '@neondatabase/serverless':{neon:()=>sql},
    './sandboxAlertSend':{sendSandboxAlerts:async()=>({location:'california',predictionDate,elevated:[],recipients:0,sent:0,failed:0})},
    './data':{LOCATIONS:{southbay:CONFIG}},
    './features':{featuresFor:()=>({beachAlerts:true})},
    './loadData':{loadDashboardData:async()=>({beaches,predictionDate})},
    './alertMail':{composeAlertEmail:()=>({subject:'Elevated bacteria',html:'<p>x</p>',text:'x'})},
    './alertProvider':{configuredProvider:()=>'resend',createResendSender:()=>{throw Error('should be injected');}},
  });
}

async function seed(emails, stations){
  for (const e of emails){
    const [row] = await sql`INSERT INTO alert_subscribers(email,location) VALUES (${e},'southbay') RETURNING id`;
    for (const st of stations){
      await sql`INSERT INTO alert_subscriptions(subscriber_id,station_code) VALUES (${row.id},${st})`;
      await sql`INSERT INTO legacy_alert_grants(subscriber_id,station_code) VALUES (${row.id},${st})`;
    }
  }
}

const OK = {ok:true,id:'email_x',deduplicated:false};
const FAIL = {ok:false,code:'rate_limit_exceeded',retryable:true};

// 1. one eligible subscriber
await reset(); await seed(['one@example.com'],['A']);
{
  const m = loadSend([BEACH('A')],'2026-10-12');
  const s = sender([OK]);
  const r = await m.sendAlertsForLocation(CONFIG,'2026-10-12',false,s.sender);
  check('one eligible subscriber is mailed once',()=>{
    assert.equal(r.recipients,1); assert.equal(r.sent,1); assert.equal(r.failed,0);
    assert.equal(s.calls.length,1);
  });
  const [d] = await sql`SELECT status, provider_message_id, attempts FROM alert_deliveries`;
  check('delivery row records accepted state and provider id',()=>{
    assert.equal(d.status,'sent'); assert.equal(d.provider_message_id,'email_x'); assert.equal(d.attempts,1);
  });
  const notif = await sql`SELECT station_code FROM alert_notifications`;
  check('legacy alert_notifications row still written for eligibility',()=>{
    assert.equal(notif.length,1); assert.equal(notif[0].station_code,'A');
  });
}

// 2. repeated cron execution must not re-send
{
  const m = loadSend([BEACH('A')],'2026-10-12');
  const s = sender([OK]);
  const r = await m.sendAlertsForLocation(CONFIG,'2026-10-12',false,s.sender);
  check('re-running the cron the same day sends nothing',()=>{
    assert.equal(r.recipients,0); assert.equal(s.calls.length,0);
  });
}

// 3. multiple subscribers
await reset(); await seed(['a@example.com','b@example.com','c@example.com'],['A']);
{
  const m = loadSend([BEACH('A')],'2026-10-12');
  const s = sender([OK]);
  const r = await m.sendAlertsForLocation(CONFIG,'2026-10-12',false,s.sender);
  check('every eligible subscriber is mailed exactly once',()=>{
    assert.equal(r.sent,3); assert.equal(s.calls.length,3);
    assert.equal(new Set(s.calls.map(c=>c.to)).size,3);
  });
  check('each gets a distinct per-person idempotency key',()=>{
    assert.equal(new Set(s.calls.map(c=>c.key)).size,3);
    for (const c of s.calls) assert.match(c.key,/^alert:southbay:\d+:2026-10-12$/);
  });
}

// 4. no elevated beaches
await reset(); await seed(['a@example.com'],['A']);
{
  const m = loadSend([{code:'A',name:'Beach A',status:'Normal',probability:0.1}],'2026-10-12');
  const s = sender([OK]);
  const r = await m.sendAlertsForLocation(CONFIG,'2026-10-12',false,s.sender);
  check('no elevated beaches sends nothing',()=>{
    assert.equal(r.elevated.length,0); assert.equal(s.calls.length,0);
  });
}

// 5. no eligible recipients (elevated beach nobody follows)
{
  const m = loadSend([BEACH('Z')],'2026-10-12');
  const s = sender([OK]);
  const r = await m.sendAlertsForLocation(CONFIG,'2026-10-12',false,s.sender);
  check('elevated beach with no subscribers sends nothing',()=>{
    assert.equal(r.recipients,0); assert.equal(s.calls.length,0);
  });
}

// 6. stale predictions
{
  const m = loadSend([BEACH('A')],'2026-10-11');
  const s = sender([OK]);
  const r = await m.sendAlertsForLocation(CONFIG,'2026-10-12',false,s.sender);
  check('stale forecast is skipped, not mailed',()=>{
    assert.match(r.skipped,/stale forecast/); assert.equal(s.calls.length,0);
  });
}

// 7. dry run sends nothing and records nothing
await reset(); await seed(['dry@example.com'],['A']);
{
  const m = loadSend([BEACH('A')],'2026-10-12');
  const s = sender([OK]);
  const r = await m.sendAlertsForLocation(CONFIG,'2026-10-12',true,s.sender);
  const rows = await sql`SELECT count(*)::int AS n FROM alert_deliveries`;
  const notif = await sql`SELECT count(*)::int AS n FROM alert_notifications`;
  check('dry run sends no mail and writes no state',()=>{
    assert.equal(s.calls.length,0); assert.equal(r.sent,0);
    assert.equal(rows[0].n,0); assert.equal(notif[0].n,0);
    assert.equal(r.dryRun,true); assert.equal(r.wouldNotify.length,1);
  });
}

// 8. duplicate subscriptions: one person, several elevated beaches -> one email
await reset(); await seed(['multi@example.com'],['A','B','C']);
{
  const m = loadSend([BEACH('A'),BEACH('B'),BEACH('C')],'2026-10-12');
  const s = sender([OK]);
  const r = await m.sendAlertsForLocation(CONFIG,'2026-10-12',false,s.sender);
  check('three elevated beaches produce one email, not three',()=>{
    assert.equal(r.recipients,1); assert.equal(s.calls.length,1);
  });
  const notif = await sql`SELECT count(*)::int AS n FROM alert_notifications`;
  check('all three stations recorded against that one send',()=>assert.equal(notif[0].n,3));
}

// 9. provider rejection -> retryable, retried on the next run
await reset(); await seed(['retry@example.com'],['A']);
{
  const m = loadSend([BEACH('A')],'2026-10-12');
  const s1 = sender([FAIL]);
  const r1 = await m.sendAlertsForLocation(CONFIG,'2026-10-12',false,s1.sender);
  check('a rejected send is counted failed',()=>{
    assert.equal(r1.failed,1); assert.equal(r1.sent,0);
  });
  const [d] = await sql`SELECT status,last_error,attempts,lease_until FROM alert_deliveries`;
  check('failure is durable, lease released, error recorded',()=>{
    assert.equal(d.status,'failed'); assert.equal(d.last_error,'rate_limit_exceeded');
    assert.equal(d.lease_until,null);
  });
  const notif = await sql`SELECT count(*)::int AS n FROM alert_notifications`;
  check('a failed send did NOT mark the subscriber as notified',()=>assert.equal(notif[0].n,0));

  const s2 = sender([OK]);
  const r2 = await m.sendAlertsForLocation(CONFIG,'2026-10-12',false,s2.sender);
  check('the next run retries the failure and succeeds',()=>{
    assert.equal(r2.sent,1); assert.equal(s2.calls.length,1);
  });
  const [d2] = await sql`SELECT status,attempts FROM alert_deliveries`;
  check('retry reuses the same row and counts the attempt',()=>{
    assert.equal(d2.status,'sent'); assert.equal(d2.attempts,2);
  });
  check('retry reused the original idempotency key',()=>{
    assert.equal(s2.calls[0].key,s1.calls[0].key);
  });
}

// 10. partial delivery success
await reset(); await seed(['p1@example.com','p2@example.com','p3@example.com'],['A']);
{
  const m = loadSend([BEACH('A')],'2026-10-12');
  const s = sender(i => i===2 ? FAIL : OK);
  const r = await m.sendAlertsForLocation(CONFIG,'2026-10-12',false,s.sender);
  check('partial failure reports both halves accurately',()=>{
    assert.equal(r.sent,2); assert.equal(r.failed,1);
  });
  const rows = await sql`SELECT status, count(*)::int AS n FROM alert_deliveries GROUP BY status ORDER BY status`;
  check('only the failed one stays retryable',()=>{
    const byStatus = Object.fromEntries(rows.map(x=>[x.status,x.n]));
    assert.equal(byStatus.sent,2); assert.equal(byStatus.failed,1);
  });
}

// 11. concurrent run: a held lease blocks a second claim
await reset(); await seed(['conc@example.com'],['A']);
{
  const m = loadSend([BEACH('A')],'2026-10-12');
  const [sub] = await sql`SELECT id FROM alert_subscribers LIMIT 1`;
  await sql`INSERT INTO alert_deliveries(subscriber_id,prediction_date,status,lease_until)
            VALUES (${sub.id},'2026-10-12'::date,'sending',now()+interval '5 minutes')`;
  const s = sender([OK]);
  const r = await m.sendAlertsForLocation(CONFIG,'2026-10-12',false,s.sender);
  check('a run in progress blocks a second send',()=>{
    assert.equal(s.calls.length,0); assert.equal(r.sent,0); assert.equal(r.skippedDuplicates,1);
  });
}

// 12. an expired lease (crashed run) is reclaimed
{
  await sql`UPDATE alert_deliveries SET lease_until = now() - interval '1 minute'`;
  const m = loadSend([BEACH('A')],'2026-10-12');
  const s = sender([OK]);
  const r = await m.sendAlertsForLocation(CONFIG,'2026-10-12',false,s.sender);
  check('a crashed run is reclaimed once its lease expires',()=>{
    assert.equal(s.calls.length,1); assert.equal(r.sent,1);
  });
}

// 13. a sent row is never reclaimed, even with an expired lease
{
  await sql`UPDATE alert_deliveries SET lease_until = now() - interval '1 hour'`;
  const m = loadSend([BEACH('A')],'2026-10-12');
  const s = sender([OK]);
  await m.sendAlertsForLocation(CONFIG,'2026-10-12',false,s.sender);
  check('an already-sent delivery is never re-sent',()=>assert.equal(s.calls.length,0));
}

// 14. database write failure surfaces rather than silently dropping mail
await reset(); await seed(['db@example.com'],['A']);
{
  const broken = async (parts,...v) => {
    const text = parts.join('?');
    if (text.includes('alert_deliveries')) throw new Error('connection terminated');
    return sql(parts,...v);
  };
  const m = load('lib/alertSend.ts',{
    'server-only':{}, 'nodemailer':{createTransport:()=>({})},
    '@neondatabase/serverless':{neon:()=>broken},
    './sandboxAlertSend':{sendSandboxAlerts:async()=>({})},
    './data':{LOCATIONS:{southbay:CONFIG}}, './features':{featuresFor:()=>({beachAlerts:true})},
    './loadData':{loadDashboardData:async()=>({beaches:[BEACH('A')],predictionDate:'2026-10-12'})},
    './alertMail':{composeAlertEmail:()=>({subject:'s',html:'h',text:'t'})},
    './alertProvider':{configuredProvider:()=>'resend',createResendSender:()=>{throw Error('x');}},
  });
  const s = sender([OK]);
  let threw=false;
  try { await m.sendAlertsForLocation(CONFIG,'2026-10-12',false,s.sender); } catch { threw=true; }
  check('a database failure propagates instead of silently losing the run',()=>{
    assert.equal(threw,true); assert.equal(s.calls.length,0);
  });
}

await pg.close();
console.log(`\n${n - failures}/${n} alert delivery checks passed.`);
process.exit(failures ? 1 : 0);
