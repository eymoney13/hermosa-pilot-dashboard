// Real Stripe test API + explicitly selected isolated Neon database.
// Browser actions complete actual hosted subscription/setup Checkout sessions.
// Clerk identity and email/PostHog delivery are test adapters, never production services.
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import ts from 'typescript';
const secretsPath=process.env.PROMO_TEST_SECRETS_FILE;
const expectedHost=process.env.PROMO_TEST_DATABASE_HOST;
if (!secretsPath || !expectedHost || process.env.NEPTUNE_TEST_DATABASE_CONFIRMED!=='true') throw Error('Explicit isolated test configuration required');
const config=JSON.parse(fs.readFileSync(secretsPath,'utf8'));
assert.match(config.STRIPE_SECRET_KEY,/^sk_test_/);
assert.equal(new URL(config.DATABASE_URL).hostname,expectedHost);
// Do not inherit any Next env-file credentials or enable live billing.
Object.assign(process.env,{DATABASE_URL:config.DATABASE_URL,STRIPE_SECRET_KEY:config.STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET:'whsec_local_test_only',NEPTUNE_PAYMENT_FIRST_ENABLED:'true',NEPTUNE_TEST_CHECKOUT_ENABLED:'true',NEPTUNE_LIVE_BILLING_ENABLED:'false',NEPTUNE_PROMO_LIFECYCLE_ENABLED:'true',NEXT_PUBLIC_SITE_URL:'http://localhost:4319',PRO_ACTIVATION_EMAIL_FROM:'sender@example.invalid',GMAIL_APP_PASSWORD:'local-sink-only'});
const api=new Stripe(config.STRIPE_SECRET_KEY,{apiVersion:'2026-08-26.dahlia',timeout:20000,maxNetworkRetries:1});
const realSql=neon(config.DATABASE_URL);
let appNow=null;
// Keep application and SQL time aligned with Stripe's simulated clock.
// Queries still execute in real Neon; only now() is replaced by that test instant.
const atTestTime=text=>appNow===null?text:text.replace(/\bnow\(\)/g,`to_timestamp(${appNow/1000})`);
const sql=(parts,...values)=>realSql.query(atTestTime(parts.reduce((text,part,index)=>text+(index?`$${index}`:'')+part,'')),values);
sql.query=(text,values)=>realSql.query(atTestTime(text),values);
class TestDate extends Date {
 constructor(value){if(arguments.length)super(value);else super(appNow??Date.now());}
 static now(){return appNow??Date.now();}
}
const webhookEndpoints=await api.webhookEndpoints.list({limit:100});
assert.equal(webhookEndpoints.data.filter(e=>e.status==='enabled').length,0,'Existing test webhooks could write elsewhere; stop for isolation review');
const prior=process.env.PROMO_TEST_RESUME==='true'?JSON.parse(fs.readFileSync('/tmp/promo-stripe-evidence.json','utf8')):null;
const runId=prior?.runId??`promo-test-${Date.now()}`;
const evidence=prior??{runId,testOnly:true,databaseHost:expectedHost,scenarios:{},checks:[],mail:[],analytics:[],errors:[]};
const save=()=>fs.writeFileSync('/tmp/promo-stripe-evidence.json',JSON.stringify(evidence,null,2),{mode:0o600});
let currentUser=null, clockCustomer=null, scenarioName=process.env.PROMO_TEST_SCENARIO||'expiry';
const identities=new Map();
for(const [name,s] of Object.entries(evidence.scenarios))identities.set(name,{id:`test_${runId}_${name}`,emailAddresses:[{emailAddress:s.email,verification:{status:'verified'}}]});
const scenario=()=>evidence.scenarios[scenarioName];
const fakeClerk={users:{getUserList:async()=>({data:[]})},invitations:{getInvitationList:async()=>({data:[]}),createInvitation:async({redirectUrl})=>({url:redirectUrl+'&test_invitation=local'})}};
const adapterApi=new Proxy(api,{get(target,prop){
 if(prop==='checkout')return {sessions:new Proxy(api.checkout.sessions,{get(s,key){
   if(key==='create')return async(params,options)=>{const actual=await api.checkout.sessions.create(params.mode==='subscription'&&clockCustomer?{...params,customer:clockCustomer}:params,options);if(actual.mode==='subscription'){scenario().session=actual.id;scenario().checkoutUrl=actual.url;}else{scenario().setupSession=actual.id;scenario().setupUrl=actual.url;}save();return actual;};
   const value=s[key];return typeof value==='function'?value.bind(s):value;
 }})};
 const value=target[prop];return typeof value==='function'?value.bind(target):value;
}});
const mocks={
 'server-only':{},
 '@clerk/nextjs/server':{currentUser:async()=>currentUser,clerkClient:async()=>fakeClerk},
 nodemailer:{createTransport:()=>({sendMail:async mail=>{evidence.mail.push({to:mail.to,subject:mail.subject,text:mail.text});save();return {accepted:[mail.to]};}})},
 '@neondatabase/serverless':{neon:()=>sql},
 stripe:class{constructor(){return adapterApi;}},
};
const loaded=new Map();
function load(file){
 file=resolve(file);if(loaded.has(file))return loaded.get(file).exports;
 const testModule={exports:{}};loaded.set(file,testModule);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const req=name=>name in mocks?mocks[name]:name==='node:crypto'?{randomUUID}:name.startsWith('.')?load(resolve(dirname(file),name+'.ts')):name.startsWith('@/')?load(resolve(name.slice(2)+'.ts')):(()=>{throw Error(name);})();
 vm.runInNewContext(`(function(require,module,exports,process){${code}\n})`,{console,Date:TestDate,Set,Map,URL,Response,Headers,crypto:globalThis.crypto})(req,testModule,testModule.exports,process);
 return testModule.exports;
}
const purchase=load('lib/purchase.ts'),billing=load('lib/subscription.ts'),promo=load('lib/promoAccess.ts'),lifecycle=load('lib/proLifecycle.ts');
// Capture PostHog at the transport boundary; event-building code remains real.
mocks['@/lib/posthogCapture']={capturePostHogEvent:async event=>{evidence.analytics.push(event);save();}};
const webhook=load('app/api/pro/webhook/route.ts');
function check(name,details={}){evidence.checks.push({name,...details});save();console.log('PASS',name);}
async function dispatch(event){
 assert.equal(event.livemode,false,'Refuse live events');
 const body=JSON.stringify(event);const signature=api.webhooks.generateTestHeaderString({payload:body,secret:process.env.STRIPE_WEBHOOK_SECRET});
 const response=await webhook.POST(new Request('http://localhost:4319/api/pro/webhook',{method:'POST',headers:{'stripe-signature':signature},body}));
 if(!response.ok)throw Error(`Webhook ${event.type}: ${response.status} ${await response.text()}`);
}
async function dispatchRelevantEvents(s){
 const events=await api.events.list({limit:100,created:{gte:evidence.startedAt}});
 let delivered=0;
 for(const event of events.data.reverse()){
  const obj=event.data.object;
  if(!['checkout.session.completed','customer.subscription.updated','customer.subscription.deleted','invoice.paid'].includes(event.type))continue;
  if(obj.id!==s.session&&obj.id!==s.setupSession&&obj.id!==s.subscription&&obj.customer!==s.customer)continue;
  await dispatch(event);delivered++;
 }
 return delivered;
}
async function prepare(name){
 assert.ok(['expiry','keep','late'].includes(name));scenarioName=name;currentUser=null;appNow=null;
 if(evidence.scenarios[name])return scenario();
 const clock=await api.testHelpers.testClocks.create({frozen_time:Math.floor(Date.now()/1000),name:`${runId}-${name}`});
 assert.equal(clock.livemode,false);
 const email=`${runId}-${name}@example.com`;
 const customer=await api.customers.create({test_clock:clock.id,email,metadata:{test_run:runId}});
 evidence.scenarios[name]={clock:clock.id,customer:customer.id,email,frozenTime:clock.frozen_time};
 clockCustomer=customer.id;
 const url=await purchase.startPurchase('monthly','',`${runId}-${name}-browser`,randomUUID());
 clockCustomer=null;
 const session=await api.checkout.sessions.retrieve(scenario().session);
 assert.equal(session.payment_method_collection,'if_required');assert.equal(session.livemode,false);
 check(`${name}: real test Checkout created without mandatory card collection`);
 return {...scenario(),checkoutUrl:url,code:evidence.promoCode};
}
async function fulfill(){
 const s=scenario();appNow=s.frozenTime*1000;
 const session=await api.checkout.sessions.retrieve(s.session);
 assert.equal(session.status,'complete');assert.ok(['paid','no_payment_required'].includes(session.payment_status));assert.equal(session.amount_total,0);
 const receipt=await purchase.syncPurchase(s.session);assert.equal(receipt.active,true);
 s.subscription=receipt.subscriptionId;
 const sub=await api.subscriptions.retrieve(s.subscription,{expand:['discounts.source.coupon']});
 assert.equal(sub.status,'active');assert.equal(sub.cancel_at,sub.discounts[0].end);assert.equal(sub.cancel_at,sub.items.data[0].current_period_end);
 assert.equal(sub.default_payment_method,null);s.deadline=sub.cancel_at;
 // Exercise verified-email claim using a synthetic Clerk identity; no real user is modified.
 const identity={id:`test_${runId}_${scenarioName}`,emailAddresses:[{emailAddress:s.email,verification:{status:'verified'}}]};identities.set(scenarioName,identity);currentUser=identity;
 assert.equal(await purchase.activatePurchase(s.session),true);
 currentUser=null;await purchase.sendRecovery(s.email,true);
 assert.ok(evidence.mail.find(m=>m.to===s.email&&m.text.includes('No card needed')));
 await dispatchRelevantEvents(s);
 check(`${scenarioName}: no-card checkout, scheduled expiry, activation and signed webhook replay`,{subscription:s.subscription,deadline:new Date(s.deadline*1000).toISOString()});
 save();return s;
}
async function keep(){
 const s=scenario();currentUser=identities.get(scenarioName);assert.ok(currentUser);
 const url=await promo.startKeepPro();currentUser=null;
 const session=await api.checkout.sessions.retrieve(s.setupSession);
 assert.equal(session.mode,'setup');assert.equal(session.customer,s.customer);
 const invoices=await api.invoices.list({customer:s.customer,limit:100});assert.equal(invoices.data.filter(i=>i.amount_paid>0).length,0);
 check(`${scenarioName}: actual setup-only Checkout created, no immediate invoice payment`);
 return {url,...s};
}
async function finishKeep(){
 const s=scenario();const setup=await api.checkout.sessions.retrieve(s.setupSession);assert.equal(setup.status,'complete');
 await promo.completeKeepPro(s.setupSession);await promo.completeKeepPro(s.setupSession);await purchase.refreshPurchaseSubscription(s.subscription);
 const sub=await api.subscriptions.retrieve(s.subscription);assert.equal(sub.cancel_at,null);assert.ok(sub.default_payment_method);
 assert.equal(sub.items.data[0].current_period_end,s.deadline);
 const before=evidence.analytics.length;await dispatchRelevantEvents(s);
 const setupEvents=evidence.analytics.slice(before).filter(e=>e.dedupeKey===s.setupSession);assert.equal(setupEvents.length,0);
 check(`${scenarioName}: Keep Pro clears cancellation, preserves original renewal date, no setup purchase event`);
 return s;
}
async function advance(target){
 const s=scenario();const clock=await api.testHelpers.testClocks.retrieve(s.clock);
 if(clock.status==='ready'&&clock.frozen_time<target)await api.testHelpers.testClocks.advance(s.clock,{frozen_time:target});
 return {clock:s.clock,target};
}
async function verifyBoundary(){
 const s=scenario();const clock=await api.testHelpers.testClocks.retrieve(s.clock);if(clock.status!=='ready')return {ready:false,status:clock.status};
 appNow=clock.frozen_time*1000;s.appTime=appNow;
 await dispatchRelevantEvents(s);await purchase.refreshPurchaseSubscription(s.subscription);
 const sub=await api.subscriptions.retrieve(s.subscription);
 const invoices=await api.invoices.list({customer:s.customer,limit:100,expand:['data.payments']});
 s.observedSubscriptionStatus=sub.status;s.invoices=invoices.data.map(i=>({id:i.id,status:i.status,amountDue:i.amount_due,amountPaid:i.amount_paid,billingReason:i.billing_reason,periodStart:i.period_start,periodEnd:i.period_end,linePeriods:i.lines.data.map(l=>({amount:l.amount,start:l.period.start,end:l.period.end})),paymentIntent:i.payments?.data?.map(p=>p.payment?.payment_intent),attemptCount:i.attempt_count}));
 if(scenarioName==='expiry'||scenarioName==='late'){
  assert.equal(sub.status,'canceled');assert.equal(invoices.data.filter(i=>i.amount_due>0||i.amount_paid>0).length,0);
  assert.equal(await billing.hasLiveSubscription(identities.get(scenarioName).id),false);
  assert.equal((await billing.getAccountState(identities.get(scenarioName).id)).kind,'lapsed');
  const follower=await sql`INSERT INTO alert_subscribers(email,location) VALUES (${s.email}, 'sandbox') ON CONFLICT(email,location) DO UPDATE SET email=EXCLUDED.email RETURNING id`;
  await sql`INSERT INTO alert_subscriptions(subscriber_id,station_code) VALUES (${follower[0].id}, 'PROMO_TEST') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO sandbox_alert_delivery(subscriber_id,clerk_user_id) VALUES (${follower[0].id},${identities.get(scenarioName).id}) ON CONFLICT(subscriber_id) DO NOTHING`;
  const alerts=load('lib/sandboxAlertSend.ts');let alertCount=0;
  const summary=await alerts.sendSandboxAlerts([{code:'PROMO_TEST',name:'Test beach',status:'Not recommended'}],new TestDate().toISOString().slice(0,10),false,async()=>{alertCount++;return true;});
  assert.equal(alertCount,0);assert.equal(summary.sent,0);s.proAlertsStopped=true;
  await lifecycle.runProLifecycle(s.subscription);
  assert.ok(evidence.mail.some(m=>m.to===s.email&&m.subject==='Your Neptune Pro access has ended'));
  check(`${scenarioName}: automatic expiry cancels without any paid invoice or Pro entitlement`,{invoices:s.invoices});
 }else{
  const renewal=invoices.data.find(i=>i.billing_reason==='subscription_cycle');
  if(!renewal||renewal.status!=='paid'){save();return {ready:false,subscriptionStatus:sub.status,invoices:s.invoices};}
  assert.equal(renewal.amount_due,200);assert.equal(renewal.amount_paid,200);assert.equal(renewal.currency,'usd');assert.equal(sub.status,'active');
  const paymentRef=renewal.payments?.data?.find(payment=>payment.payment?.payment_intent)?.payment.payment_intent;
  const paymentId=typeof paymentRef==='string'?paymentRef:paymentRef?.id;assert.ok(paymentId);
  const payment=await api.paymentIntents.retrieve(paymentId);assert.equal(payment.status,'succeeded');assert.equal(payment.amount_received,200);assert.equal(payment.livemode,false);
  s.firstRenewalPayment={id:payment.id,status:payment.status,amountReceived:payment.amount_received,currency:payment.currency};
  assert.equal(invoices.data.filter(invoice=>invoice.amount_paid>0).length,1);
  assert.ok(renewal.lines.data.some(line=>line.amount===200&&line.period.start===s.deadline));assert.ok(sub.items.data[0].current_period_end>s.deadline);
  check('keep: first renewal is a paid $2 USD invoice at the original promo deadline',{invoice:renewal.id,amountPaid:renewal.amount_paid,periodStart:new Date(s.deadline*1000).toISOString(),nextPeriodEnd:new Date(sub.items.data[0].current_period_end*1000).toISOString()});
 }
 save();return {ready:true,...s};
}
if(!prior){
evidence.startedAt=Math.floor(Date.now()/1000);
const coupon=await api.coupons.create({percent_off:100,duration:'repeating',duration_in_months:1,name:`${runId} one free month`,metadata:{test_run:runId}});
const code=await api.promotionCodes.create({promotion:{type:'coupon',coupon:coupon.id},code:`NOCARD${Date.now()}`,metadata:{test_run:runId}});
evidence.coupon=coupon.id;evidence.promoCode=code.code;save();
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost:4319');let result;
  if(url.pathname==='/state')result=evidence;
  else if(url.pathname==='/prepare')result=await prepare(url.searchParams.get('scenario')||'expiry');
  else if(url.pathname==='/fulfill')result=await fulfill();
  else if(url.pathname==='/keep')result=await keep();
  else if(url.pathname==='/finish-keep')result=await finishKeep();
  else if(url.pathname==='/advance')result=await advance(Number(url.searchParams.get('target')));
  else if(url.pathname==='/verify-boundary')result=await verifyBoundary();
  else if(url.pathname==='/lifecycle'){
   const s=scenario();const clock=await api.testHelpers.testClocks.retrieve(s.clock);assert.equal(clock.status,'ready');appNow=clock.frozen_time*1000;
   const before=evidence.mail.length;await lifecycle.runProLifecycle(s.subscription);await lifecycle.runProLifecycle(s.subscription);
   result={time:new Date(appNow).toISOString(),newMail:evidence.mail.slice(before)};
   check(`${scenarioName}: lifecycle delivery and replay at simulated time`,{time:new Date(appNow).toISOString(),subjects:result.newMail.map(m=>m.subject)});
  }
  else if(url.pathname==='/verify-late'){
   const s=scenario();await promo.completeKeepPro(s.setupSession);await purchase.refreshPurchaseSubscription(s.subscription);
   const sub=await api.subscriptions.retrieve(s.subscription);assert.equal(sub.status,'canceled');
   const invoices=await api.invoices.list({customer:s.customer,limit:100});assert.equal(invoices.data.filter(i=>i.amount_due>0||i.amount_paid>0).length,0);
   check('late: setup completed after expiry does not resume subscription or create a charge');result={status:sub.status,paidInvoices:0};
  }
  else if(url.pathname==='/select'){scenarioName=url.searchParams.get('scenario');assert.ok(evidence.scenarios[scenarioName]);result=scenario();}
  else if(url.pathname==='/pro/activate'||url.pathname==='/pro/manage'){
   res.setHeader('Content-Type','text/html');res.end(`<h1>Stripe test checkout returned successfully</h1><p>Scenario: ${escape(scenarioName)}</p><p>Local integration verification only. No production services or real emails are used.</p>`);return;
  }else{res.statusCode=404;res.end('Not found');return;}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(e){evidence.errors.push({message:e.message,type:e.type,stack:e.stack});save();console.error(e.type||e.name,e.message);res.statusCode=500;res.end(JSON.stringify({error:e.message,type:e.type}));}
});
server.listen(4319,'127.0.0.1',()=>console.log('Real test-mode verification harness listening on http://localhost:4319; test-only services and local delivery sinks.'));
