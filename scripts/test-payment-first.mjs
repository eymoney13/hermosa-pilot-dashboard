import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL semantics in memory; Stripe, Clerk, and SMTP are fake adapters.
// No credentials, network requests, emails, or persistent database writes.
const pg = new PGlite();
// Rehearse the upgrade against existing subscribers before exercising new sales.
const legacy = new PGlite();
await legacy.exec(readFileSync('scripts/subscriptions-schema.sql', 'utf8'));
await legacy.exec(`INSERT INTO pro_subscriptions
  (clerk_user_id, stripe_subscription_id, status, current_period_end, plan)
  VALUES ('legacy_active', 'sub_legacy_active', 'active', '2030-01-01', 'monthly'),
         ('legacy_canceled', 'sub_legacy_canceled', 'canceled', '2025-01-01', 'yearly')`);
const legacyBefore = (await legacy.query('SELECT * FROM pro_subscriptions ORDER BY id')).rows;
await legacy.exec(readFileSync('scripts/payment-first-schema.sql', 'utf8'));
await legacy.exec(readFileSync('scripts/payment-first-schema.sql', 'utf8'));
await legacy.exec(readFileSync('scripts/promo-lifecycle-schema.sql', 'utf8'));
await legacy.exec(readFileSync('scripts/promo-lifecycle-schema.sql', 'utf8'));
const legacyAfter = (await legacy.query('SELECT * FROM pro_subscriptions ORDER BY id')).rows;
for (let i = 0; i < legacyBefore.length; i++) {
  for (const key of Object.keys(legacyBefore[i])) assert.deepEqual(legacyAfter[i][key], legacyBefore[i][key]);
}
await legacy.close();
await pg.exec(readFileSync('scripts/subscriptions-schema.sql', 'utf8'));
await pg.exec(readFileSync('scripts/payment-first-schema.sql', 'utf8'));
await pg.exec(readFileSync('scripts/payment-first-schema.sql', 'utf8')); // re-runnable
await pg.exec(readFileSync('scripts/promo-lifecycle-schema.sql', 'utf8'));
await pg.exec(readFileSync('scripts/promo-lifecycle-schema.sql', 'utf8'));
const sql = async (parts, ...values) => (await pg.query(parts.reduce((s, p, i) => s + (i ? `$${i}` : '') + p, ''), values)).rows;
let user = null;
const sessions = new Map(), subscriptions = new Map(), keys = new Map(), mails = [];
let creations = 0;
let smtpFails = false;
const invitations = [], knownEmails = new Set();
const prices = new Map(['monthly','yearly'].map(plan => [`price_${plan}`, {
  id:`price_${plan}`,active:true,livemode:false,currency:'usd',unit_amount:plan==='monthly'?200:2000,
  type:'recurring',recurring:{interval:plan==='monthly'?'month':'year',interval_count:1,usage_type:'licensed'},
  product:{id:`prod_${plan}`,active:true},
}]));
const promoCode = {id:'promo_elnino',code:'ELNINO',active:true,livemode:false,customer:null,customer_account:null,
 expires_at:null,max_redemptions:200,times_redeemed:0,restrictions:{first_time_transaction:false},
 promotion:{type:'coupon',coupon:{id:'coupon_elnino',valid:true,percent_off:100,duration:'repeating',duration_in_months:1,
 applies_to:{products:['prod_monthly']},redeem_by:null,max_redemptions:200,times_redeemed:0}}};
let promotionResults=[promoCode];
const stripe = {
  promotionCodes:{list:async()=>({data:structuredClone(promotionResults)})},
  prices: {retrieve:async id=>structuredClone(prices.get(id))},
  checkout: {sessions: {
    listLineItems: async id => ({data:sessions.get(id).line_items.map(i=>({...i,price:{id:i.price}})),has_more:false}),
    retrieve: async id => { if (!sessions.has(id)) throw Object.assign(Error('missing'), {code:'resource_missing',param:'id'}); return structuredClone(sessions.get(id)); },
    expire: async id => { const session=sessions.get(id); if (session.status !== 'open') throw Error('not open'); session.status='expired'; return structuredClone(session); },
    create: async (params, opts = {}) => {
      if (keys.has(opts.idempotencyKey)) return keys.get(opts.idempotencyKey);
      const id = `cs_test_${++creations}`;
      const session = { ...params, id, status: 'open', payment_status: 'unpaid', url: `https://checkout.stripe.test/${id}` };
      sessions.set(id, session); keys.set(opts.idempotencyKey, session); return session;
    }
  }}, subscriptions: { retrieve: async id => structuredClone(subscriptions.get(id)) }
};
const mocks = {
  'server-only': {},
  '@clerk/nextjs/server': {currentUser: async () => user, clerkClient: async () => ({
    users: {getUserList: async ({emailAddress}) => ({data: knownEmails.has(emailAddress[0]) ? [{id:'existing'}] : []})},
    invitations: {
      getInvitationList: async ({query}) => ({data: invitations.filter(i => i.emailAddress === query)}),
      createInvitation: async params => {
        const invite = {...params, url: `https://clerk.test/private-invitation-${invitations.length + 1}?receipt=${params.publicMetadata.checkout_session_id}`};
        invitations.push(invite); return invite;
      }
    }
  })},
  nodemailer: {createTransport: () => ({sendMail: async mail => { if (smtpFails) throw Error("SMTP failed"); mails.push(mail); }})},
  '@neondatabase/serverless': {neon: () => sql},
  stripe: class { constructor() { return stripe; } }
};
const loaded = new Map();
function load(file) {
  file = resolve(file);
  if (loaded.has(file)) return loaded.get(file).exports;
  const testModule = {exports:{}}; loaded.set(file, testModule);
  const code = ts.transpileModule(readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const req = name => name in mocks ? mocks[name] : name.startsWith('.') ? load(resolve(dirname(file), name + '.ts')) : name === 'node:crypto' ? {randomUUID: () => crypto.randomUUID()} : (() => {throw Error(name)})();
  vm.runInNewContext(`(function(require,module,exports,process){${code}\n})`, {console,Date,Set,crypto,URL})(req,testModule,testModule.exports,process);
  return testModule.exports;
}
Object.assign(process.env, {STRIPE_SECRET_KEY:'sk_test_fake', STRIPE_PRO_MONTHLY_PRICE_ID:'price_monthly', STRIPE_PRO_YEARLY_PRICE_ID:'price_yearly', DATABASE_URL:'memory', NEPTUNE_PAYMENT_FIRST_ENABLED:'true', NEPTUNE_TEST_CHECKOUT_ENABLED:'true', NEXT_PUBLIC_SITE_URL:'http://localhost:3000', PRO_ACTIVATION_EMAIL_FROM:'sender@example.com', GMAIL_APP_PASSWORD:'fake'});
delete process.env.NEPTUNE_LIVE_BILLING_ENABLED;
const policy = load('lib/purchasePolicy.ts'), purchase = load('lib/purchase.ts'), billing = load('lib/subscription.ts');
let checks = 0;
function check(label, fn) { fn(); checks++; console.log(`ok ${checks} - ${label}`); }
check('migration preserves existing active and canceled subscribers and is re-runnable', () => {});
check('live keys cannot use the test bypass', () => assert.equal(policy.paymentFirstAllowed({...process.env,STRIPE_SECRET_KEY:'sk_live_fake'}), false));
check('payment-first opt-in required', () => assert.equal(policy.paymentFirstAllowed({...process.env,NEPTUNE_PAYMENT_FIRST_ENABLED:''}), false));
check('unpaid or foreign checkout cannot fulfill', () => {
  assert.equal(policy.paidCheckout({mode:'subscription',status:'complete',payment_status:'unpaid',metadata:{flow:'payment_first_v1'}}), false);
  assert.equal(policy.paidCheckout({mode:'subscription',status:'complete',payment_status:'paid',metadata:{}}), false);
});
const first = await purchase.startPurchase('monthly',' Buyer@example.com ');
const retry = await purchase.startPurchase('monthly','buyer@example.com');
check('duplicate checkout submission reuses one Stripe session', () => { assert.equal(first,retry); assert.equal(creations,1); });
await purchase.startPurchase('monthly','annual-buyer@example.com');
const oldMonthly = sessions.get('cs_test_2');
await purchase.startPurchase('yearly','annual-buyer@example.com');
const annual = sessions.get('cs_test_3');
check('switching monthly to annual expires the old checkout and bills $20/year', () => {
  assert.equal(oldMonthly.status,'expired');
  assert.equal(annual.line_items[0].price,'price_yearly');
  assert.equal(prices.get(annual.line_items[0].price).recurring.interval,'year');
  assert.equal(annual.metadata.plan,'yearly');
});
check('both plans offer promo codes and always collect a renewal card', () => {
  assert.equal(annual.allow_promotion_codes, true);
  assert.equal(sessions.get('cs_test_1').allow_promotion_codes, true);
  assert.equal(annual.payment_method_collection, 'always');
});
check('free annual fulfillment rejects incomplete, unpaid, foreign, unknown-plan or nonzero sessions', () => {
  const free = {mode:'subscription', status:'complete', payment_status:'no_payment_required', amount_total:0, metadata:{flow:'payment_first_v1',plan:'yearly'}};
  assert.equal(policy.paidCheckout(free), true);
  for (const patch of [{status:'open'}, {payment_status:'unpaid'}, {mode:'payment'}, {amount_total:1}, {amount_total:null}, {amount_total:undefined}, {metadata:{flow:'payment_first_v1',plan:'unknown'}}, {metadata:{plan:'yearly'}}]) {
    assert.equal(policy.paidCheckout({...free,...patch}), false);
  }
});
const annualRetry = await purchase.startPurchase('yearly','annual-buyer@example.com');
check('annual retries reuse the same checkout', () => assert.equal(annualRetry, annual.url));
const session = sessions.get('cs_test_1');
check('checkout is anonymous, fixed price, and returns to activation', () => {
  assert.equal(session.client_reference_id,undefined); assert.equal(session.line_items[0].price,'price_monthly');
  assert.ok(session.success_url.includes('/pro/activate?session_id={CHECKOUT_SESSION_ID}'));
});
assert.equal(await purchase.syncPurchase('cs_test_1'),null);
assert.equal((await pg.query('SELECT * FROM pro_subscriptions')).rows.length,0);
check('unpaid checkout grants no database row', () => {});
function paid(id,email,subId) {
  sessions.set(id,{id,mode:'subscription',status:'complete',payment_status:'paid',metadata:{flow:'payment_first_v1',plan:'monthly'},subscription:subId,customer:`cus_${subId}`,customer_details:{email}});
  subscriptions.set(subId,{id:subId,status:'active',metadata:{},items:{data:[{current_period_end:Math.floor(Date.now()/1000)+86400}]}});
}
paid('cs_test_1','buyer@example.com','sub_1');
await purchase.syncPurchase('cs_test_1'); await purchase.syncPurchase('cs_test_1');
check('fulfillment replay stores one unclaimed purchase', () => {});
assert.equal((await pg.query('SELECT * FROM pro_subscriptions')).rows.length,1);
assert.equal((await pg.query('SELECT clerk_user_id FROM pro_subscriptions')).rows[0].clerk_user_id,null);
user={id:'user_wrong',emailAddresses:[{emailAddress:'attacker@example.com',verification:{status:'verified'}}]};
assert.equal(await purchase.activatePurchase('cs_test_1'),false);
user={id:'user_1',emailAddresses:[{emailAddress:'buyer@example.com',verification:{status:'unverified'}}]};
assert.equal(await purchase.activatePurchase('cs_test_1'),false);
check('wrong and unverified emails cannot claim a receipt',()=>{});
user.emailAddresses[0].verification.status='verified';
assert.equal(await purchase.activatePurchase('cs_test_1'),true);
assert.equal(await purchase.activatePurchase('cs_test_1'),true);
assert.equal(await billing.hasLiveSubscription('user_1'),true);
check('verified buyer activates idempotently and receives entitlement',()=>{});
user={id:'user_2',emailAddresses:[{emailAddress:'buyer@example.com',verification:{status:'verified'}}]};
assert.equal(await purchase.activatePurchase('cs_test_1'),false);
check('a second account cannot steal an activated purchase',()=>{});
await Promise.all([purchase.sendRecovery('buyer@example.com'),purchase.sendRecovery('buyer@example.com')]);
await purchase.sendRecovery('unknown@example.com');
check('concurrent recovery sends once, only to checkout mailbox',()=>{ assert.equal(mails.length,1);assert.equal(mails[0].to,'buyer@example.com');assert.ok(mails[0].text.includes('cs_test_1')); });
subscriptions.get('sub_1').status='canceled';
await purchase.refreshPurchaseSubscription('sub_1');
assert.equal(await billing.hasLiveSubscription('user_1'),false);
await purchase.syncPurchase('cs_test_1');
assert.equal(await billing.hasLiveSubscription('user_1'),false);
assert.equal(await purchase.activatePurchase('cs_test_1'),false);
check('cancellation revokes access and delayed completion cannot restore it',()=>{});
paid('cs_test_2','buyer@example.com','sub_2');
await purchase.syncPurchase('cs_test_2');
user={id:'user_1',emailAddresses:[{emailAddress:'buyer@example.com',verification:{status:'verified'}}]};
assert.equal(await purchase.activatePurchase('cs_test_2'),true);
assert.equal(await billing.getStripeCustomerId('user_1'),'cus_sub_2');
check('former member can rejoin without losing subscription history',()=>{});
paid('cs_test_3','buyer@example.com','sub_3');
await purchase.syncPurchase('cs_test_3');
assert.equal(await purchase.activatePurchase('cs_test_3'),false);
check('one account cannot activate two current subscriptions',()=>{});

paid('cs_test_invite','new@example.com','sub_invite');
await purchase.syncPurchase('cs_test_invite');
const result = await purchase.sendRecovery('new@example.com');
check('paid new buyer receives an invitation only by email',()=>{
  assert.equal(result,undefined);
  const invite = invitations.at(-1);
  assert.equal(invite.emailAddress,'new@example.com'); assert.equal(invite.notify,false);
  assert.equal(invite.redirectUrl,'http://localhost:3000/sign-up?purchase=cs_test_invite');
  assert.equal(mails.at(-1).to,'new@example.com'); assert.ok(mails.at(-1).text.includes(invite.url));
  assert.equal(mails.at(-1).subject,'Welcome to Neptune Pro: activate your account');
  assert.ok(mails.at(-1).html.includes('Activate Neptune Pro'));
  assert.ok(mails.at(-1).html.includes('background:#f4f6f5'));
});
const invitesBefore = invitations.length;
await pg.query("UPDATE pro_subscriptions SET recovery_sent_at = NULL WHERE checkout_email = 'new@example.com'");
await purchase.sendRecovery('new@example.com');
check('valid pending invitation is reused on resend',()=>assert.equal(invitations.length,invitesBefore));
invitations.at(-1).publicMetadata.neptune_invite_expires_at = Date.now() - 1000;
await pg.query("UPDATE pro_subscriptions SET recovery_sent_at = NULL WHERE checkout_email = 'new@example.com'");
await purchase.sendRecovery('new@example.com');
check('expired invitation gets a replacement',()=>assert.equal(invitations.length,invitesBefore+1));
paid('cs_test_existing','existing@example.com','sub_existing');
await purchase.syncPurchase('cs_test_existing'); knownEmails.add('existing@example.com');
const beforeExisting = invitations.length;
await purchase.sendRecovery('existing@example.com');
check('existing account gets receipt-preserving sign-in, not another invitation',()=>{
 assert.equal(invitations.length,beforeExisting);
 assert.ok(mails.at(-1).text.includes('/sign-in?purchase=cs_test_existing'));
});
paid('cs_test_failedmail','retry@example.com','sub_failedmail');
await purchase.syncPurchase('cs_test_failedmail'); smtpFails = true;
await assert.rejects(purchase.sendRecovery('retry@example.com'));
const afterFailure = invitations.length;
smtpFails = false;
await purchase.sendRecovery('retry@example.com');
check('failed delivery can retry without creating another invitation',()=>{
 assert.equal(invitations.length,afterFailure);assert.equal(mails.at(-1).to,'retry@example.com');
});
paid('cs_test_stale','canceled@example.com','sub_stale');
await purchase.syncPurchase('cs_test_stale'); subscriptions.get('sub_stale').status='canceled';
const beforeCanceled = invitations.length, emailsBeforeCanceled = mails.length;
await purchase.sendRecovery('canceled@example.com');
check('stale database active status cannot invite a canceled buyer',()=>{
 assert.equal(invitations.length,beforeCanceled);assert.equal(mails.length,emailsBeforeCanceled);
});
paid('cs_test_unpaid','unpaid@example.com','sub_unpaid');
await purchase.syncPurchase('cs_test_unpaid');sessions.get('cs_test_unpaid').payment_status='unpaid';
await purchase.sendRecovery('unpaid@example.com');
await purchase.sendRecovery('unknown@example.com');
check('unpaid and unknown email requests produce no invitation or mail',()=>{
 assert.equal(invitations.length,beforeCanceled);assert.equal(mails.length,emailsBeforeCanceled);
});
user = null;
for (const nextPlan of ['monthly', 'yearly']) {
 const email = `returning-${nextPlan}@example.com`;
 const oldUrl = await purchase.startPurchase('monthly', email);
 const oldId = oldUrl.split('/').at(-1);
 const subId = `sub_returning_${nextPlan}`;
 paid(oldId, email, subId);
 await purchase.syncPurchase(oldId);
 subscriptions.get(subId).status = 'canceled';
 await purchase.refreshPurchaseSubscription(subId);
 const nextUrl = await purchase.startPurchase(nextPlan, email);
 const newSession = sessions.get(nextUrl.split('/').at(-1));
 check(`ended subscription can re-subscribe on ${nextPlan} without recovering the old purchase`, () => {
  assert.notEqual(nextUrl, oldUrl);
  assert.equal(newSession.status, 'open');
  assert.equal(newSession.metadata.plan, nextPlan);
 });
 const beforeRetry = creations;
 assert.equal(await purchase.startPurchase(nextPlan, email), nextUrl);
 assert.equal(creations, beforeRetry);
}
// Exercise a Stripe-confirmed free annual purchase through fulfillment and activation.
const freeUrl = await purchase.startPurchase('yearly', 'free-year@example.com');
const freeId = freeUrl.split('/').at(-1);
paid(freeId, 'free-year@example.com', 'sub_free_year');
Object.assign(sessions.get(freeId), {payment_status:'no_payment_required', amount_total:0, metadata:{flow:'payment_first_v1',plan:'yearly'}});
subscriptions.get('sub_free_year').items.data[0].current_period_end = Math.floor(Date.now()/1000) + 365*86400;
assert.equal((await purchase.syncPurchase(freeId)).active, true);
await purchase.syncPurchase(freeId);
const freeRows = (await pg.query("SELECT * FROM pro_subscriptions WHERE stripe_subscription_id = 'sub_free_year'")).rows;
check('free annual fulfillment is replay-safe and records annual renewal price and access', () => {
  assert.equal(freeRows.length, 1);
  assert.equal(freeRows[0].plan, 'yearly');
  assert.equal(freeRows[0].price_cents, 2000);
});
user = {id:'free_year_user', emailAddresses:[{emailAddress:'free-year@example.com',verification:{status:'verified'}}]};
assert.equal(await purchase.activatePurchase(freeId), true);
check('free annual purchase can activate a verified account', () => {});
subscriptions.get('sub_free_year').status = 'canceled';
assert.equal((await purchase.syncPurchase(freeId)).active, false);
check('a free checkout cannot restore an ended subscription', () => {});
const previousNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';
user = null;
await pg.query("INSERT INTO pro_checkout_attempts (email, attempt_id, plan, expires_at, checkout_session_id) VALUES ('stale-test@example.com', 'stale-attempt', 'yearly', now() + interval '1 hour', 'cs_test_missing')");
const recoveredUrl = await purchase.startPurchase('yearly', 'stale-test@example.com');
check('local test checkout replaces a missing Stripe session with a fresh annual checkout', () => {
  assert.ok(recoveredUrl.startsWith('https://checkout.stripe.test/'));
  assert.equal(sessions.get(recoveredUrl.split('/').at(-1)).metadata.plan, 'yearly');
});
if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = previousNodeEnv;
user = null;
const browserToken = 'aabbccdd-1234-4567-89ab-aabbccddeeff';
const directUrl = await purchase.startPurchase('yearly', '', '', browserToken);
assert.equal(await purchase.startPurchase('yearly', '', '', browserToken), directUrl);
const directId = directUrl.split('/').at(-1);
check('direct annual checkout lets Stripe collect email and reuses browser attempts', () => {
  const direct = sessions.get(directId);
  assert.equal(direct.customer_email, undefined);
  assert.equal(direct.allow_promotion_codes, true);
  assert.equal(prices.get(direct.line_items[0].price).recurring.interval, 'year');
});
const directMonthlyUrl = await purchase.startPurchase('monthly', '', '', browserToken);
check('changing direct checkout plan expires the old session and selects monthly', () => {
  assert.equal(sessions.get(directId).status, 'expired');
  const monthly = sessions.get(directMonthlyUrl.split('/').at(-1));
  assert.equal(monthly.allow_promotion_codes, true);
  assert.equal(monthly.customer_email, undefined);
  assert.equal(prices.get(monthly.line_items[0].price).recurring.interval, 'month');
});
const directMonthlyId = directMonthlyUrl.split('/').at(-1);
paid(directMonthlyId, 'stripe-collected@example.com', 'sub_direct');
await purchase.syncPurchase(directMonthlyId);
check('Stripe-collected email is saved in Neon subscription records', () => {});
assert.equal((await pg.query("SELECT checkout_email FROM pro_subscriptions WHERE stripe_subscription_id = 'sub_direct'")).rows[0].checkout_email, 'stripe-collected@example.com');
assert.equal(await purchase.startPurchase('monthly', '', '', browserToken), billing.siteUrl() + '/pro/recover');
await assert.rejects(purchase.startPurchase('yearly', '', '', 'invalid'));
user = null;
const monthlyFreeUrl = await purchase.startPurchase('monthly', 'elnino-buyer@example.com');
const monthlyFreeId = monthlyFreeUrl.split('/').at(-1);
assert.equal(sessions.get(monthlyFreeId).allow_promotion_codes, true);
assert.equal(sessions.get(monthlyFreeId).payment_method_collection, 'always');
paid(monthlyFreeId, 'elnino-buyer@example.com', 'sub_elnino_monthly');
Object.assign(sessions.get(monthlyFreeId), {payment_status:'no_payment_required',amount_total:0});
assert.equal((await purchase.syncPurchase(monthlyFreeId)).active, true);
user = {id:'elnino_user',emailAddresses:[{emailAddress:'elnino-buyer@example.com',verification:{status:'verified'}}]};
assert.equal(await purchase.activatePurchase(monthlyFreeId), true);
check('free monthly checkout can fulfill and activate a verified account', () => {});
process.env.STRIPE_SECRET_KEY='sk_live_fake';
await assert.rejects(purchase.startPurchase('monthly','new@example.com'));
check('checkout creation itself enforces live kill switch',()=>{});
Object.assign(process.env,{NEPTUNE_PROMO_LIFECYCLE_ENABLED:"true"});
process.env.STRIPE_SECRET_KEY='sk_test_fake';
process.env.NEPTUNE_TEST_CHECKOUT_ENABLED='true';
const promo = load('lib/promoAccess.ts');
const now = Math.floor(Date.now()/1000);
const promoEnd = now + 30 * 86400;
function freePromo(id, email, end = promoEnd) {
 paid(id,email,`sub_${id}`);
 const session=sessions.get(id); session.payment_status='no_payment_required'; session.amount_total=0;session.metadata.promo_no_card='1';
 const sub=subscriptions.get(session.subscription);
 Object.assign(sub,{customer:session.customer,discounts:[{id:'di_free',start:now,end,source:{coupon:{id:'coupon_month',percent_off:100,duration:'repeating',duration_in_months:1}}}]});
 sub.items.data[0]={current_period_end:end,price:{recurring:{interval:'month'}}};
 return sub;
}
let promoUpdates=0;
stripe.subscriptions.update=async(id,params)=>{
 assert.ok(!(params.cancel_at !== undefined && params.cancel_at_period_end !== undefined), "Stripe rejects both cancellation parameters in one request");
 promoUpdates++;
 const sub=subscriptions.get(id);
 if(sub.status==='canceled')throw Error('cannot resume canceled subscription');
 const {metadata,...rest}=params;
 Object.assign(sub,rest);
 if(params.cancel_at==='')sub.cancel_at=null;
 if(metadata)for(const [key,value] of Object.entries(metadata)){if(value==='')delete sub.metadata[key];else sub.metadata[key]=value;}
 return structuredClone(sub);
};
const freeSub=freePromo('cs_test_free','promo@example.com');
// Real hosted Checkout returns paid for some zero-dollar sessions.
sessions.get('cs_test_free').payment_status='paid';
assert.equal(policy.paidCheckout(sessions.get('cs_test_free')),true);
assert.equal(policy.paidCheckout({...sessions.get('cs_test_free'),payment_status:'no_payment_required'}),true);
await purchase.syncPurchase('cs_test_free');
await purchase.syncPurchase('cs_test_free');
check('zero-dollar paid-status fulfillment schedules monthly expiry once before activation',()=>{
 assert.equal(freeSub.cancel_at,promoEnd);assert.equal(promoUpdates,1);
 assert.ok(freeSub.metadata.promo_redeemed_at);
});
user={id:'promo_account',emailAddresses:[{emailAddress:'promo@example.com',verification:{status:'verified'}}]};
assert.equal(await purchase.activatePurchase('cs_test_free'),true);
await purchase.sendRecovery('promo@example.com',true);
check('free activation copy includes deadline and never claims payment',()=>{
 assert.match(mails.at(-1).text,/No card needed/);assert.doesNotMatch(mails.at(-1).text,/Your payment is confirmed|Already paid/);
 assert.equal((mails.at(-1).text.match(/No card needed/g)||[]).length>=1,true);
});
assert.equal((await billing.getAccountState(user.id)).kind,'promo');
const setupUrl=await promo.startKeepPro();
const openedSetup=[...sessions.values()].find(s=>s.url===setupUrl);
assert.equal(openedSetup.mode,'setup');assert.equal(openedSetup.customer,freeSub.customer);
assert.equal(openedSetup.metadata.clerk_user_id,user.id);assert.equal(openedSetup.metadata.flow,'keep_pro_v1');
assert.equal(openedSetup.metadata.subscription_id,freeSub.id);
check('Keep Pro creates setup-only checkout from authenticated subscription ownership',()=>{});
const setup={id:'cs_test_setup' ,mode:'setup',status:'complete',customer:freeSub.customer,metadata:{flow:'keep_pro_v1',subscription_id:freeSub.id,clerk_user_id:user.id},setup_intent:{status:'succeeded',payment_method:'pm_card'}};
sessions.set(setup.id,setup);
await promo.completeKeepPro(setup.id);await promo.completeKeepPro(setup.id);
await purchase.refreshPurchaseSubscription(freeSub.id);
check('Keep Pro sets card, clears expiry, and retains redemption history on replay',()=>{
 assert.equal(freeSub.default_payment_method,'pm_card');assert.equal(freeSub.cancel_at,null);
 assert.equal(promoUpdates,2);
});
assert.equal((await billing.getAccountState(user.id)).kind,'pro');
assert.ok((await pg.query("SELECT promo_redeemed_at FROM pro_subscriptions WHERE clerk_user_id='promo_account'")).rows[0].promo_redeemed_at);
// A delayed original checkout cannot re-arm cancellation after continuation.
await purchase.syncPurchase('cs_test_free');assert.equal(freeSub.cancel_at,null);
freeSub.status='canceled';freeSub.ended_at=now;
await purchase.refreshPurchaseSubscription(freeSub.id);
const rejoin=await purchase.startPurchase('monthly','','ph-promo-member',crypto.randomUUID());
const rejoinSession=[...sessions.values()].find(s=>s.url===rejoin);
check('lapsed resubscribe reuses customer, preserves analytics id, and blocks repeat free promo entry',()=>{
 assert.equal(rejoinSession.customer,freeSub.customer);assert.equal(rejoinSession.allow_promotion_codes,false);
 assert.equal(rejoinSession.metadata.posthog_distinct_id,'ph-promo-member');
 assert.equal(rejoinSession.payment_method_collection,'if_required');
});
const expiredSub=freePromo('cs_test_expiredpromo','expiredpromo@example.com',now-60);
expiredSub.cancel_at=now-60;expiredSub.metadata={promo_no_card:'1',promo_redeemed_at:String(now-30*86400)};
await purchase.syncPurchase('cs_test_expiredpromo');
user={id:'expired_promo',emailAddresses:[{emailAddress:'expiredpromo@example.com',verification:{status:'verified'}}]};
assert.equal(await purchase.activatePurchase('cs_test_expiredpromo'),false);
check('past promo deadline blocks activation even while Stripe status is active',()=>{});
sessions.set('cs_test_late_setup',{...setup,id:'cs_test_late_setup',customer:expiredSub.customer,metadata:{flow:'keep_pro_v1',subscription_id:expiredSub.id,clerk_user_id:user.id}});
await pg.query('UPDATE pro_subscriptions SET clerk_user_id=$1 WHERE stripe_subscription_id=$2',[user.id,expiredSub.id]);
const updatesBeforeLate=promoUpdates;
await promo.completeKeepPro('cs_test_late_setup');
assert.equal(promoUpdates,updatesBeforeLate);
assert.equal(await billing.hasLiveSubscription(user.id),false);
assert.equal((await billing.getAccountState(user.id)).kind,'lapsed');
check('setup completion after expiry cannot resume or charge the subscription',()=>{});
sessions.get('cs_test_late_setup').metadata.clerk_user_id='wrong_account';
await assert.rejects(promo.completeKeepPro('cs_test_late_setup'),/ownership/);
check('setup webhook rejects account ownership mismatch',()=>{});
const annualPromo=structuredClone(expiredSub);annualPromo.items.data[0].price.recurring.interval='year';
assert.throws(()=>promo.promoEndFor(annualPromo),/monthly/);
check('yearly and unsupported promo configurations fail validation',()=>{});
// Expired provisioning leases recover; active ones block concurrent updates.
await pg.query("INSERT INTO pro_promo_operation VALUES ($1,now()+interval '5 minutes','other')",[expiredSub.id]);
const provisionedSnapshot=structuredClone(expiredSub);
const unprovisionedSnapshot=structuredClone(expiredSub);delete unprovisionedSnapshot.metadata.promo_no_card;
subscriptions.get(expiredSub.id).metadata=unprovisionedSnapshot.metadata;
await assert.rejects(promo.reconcilePromo(unprovisionedSnapshot,true),/in progress/);
// A read of already provisioned access does not contend with the operation lease.
assert.equal((await promo.reconcilePromo(provisionedSnapshot,true)).id,expiredSub.id);
await pg.query("UPDATE pro_promo_operation SET lease_until=now()-interval '1 second' WHERE subscription_id=$1",[expiredSub.id]);
await promo.reconcilePromo(expiredSub,true);
check('operation leases serialize scheduling and recover abandoned workers',()=>{});
// Lifecycle SQL runs against PostgreSQL, with SMTP and Stripe mocked above.
await pg.exec('DELETE FROM pro_direct_checkout_reconcile');
expiredSub.status='canceled';expiredSub.ended_at=now-8*86400;
await purchase.refreshPurchaseSubscription(expiredSub.id);
const reminderSub=freePromo('cs_test_reminder','reminder@example.com',now+2*86400);
reminderSub.metadata={promo_no_card:'1',promo_redeemed_at:String(now-28*86400)};reminderSub.cancel_at=now+2*86400;
await purchase.syncPurchase('cs_test_reminder');
const lifecycle=load('lib/proLifecycle.ts');
const beforeLifecycle=mails.length;
await lifecycle.runProLifecycle();await lifecycle.runProLifecycle();
check('lifecycle sends reminder, ended and seven-day winback once',()=>{
 const delivered=mails.slice(beforeLifecycle);
 assert.equal(delivered.filter(m=>m.to==='reminder@example.com').length,1);
 assert.equal(delivered.filter(m=>m.to==='expiredpromo@example.com').length,2);
 assert.match(delivered.find(m=>m.to==='expiredpromo@example.com'&&m.subject.startsWith('Ready')).text,/Stop promotional emails/);
});
// Replacement subscriptions suppress both lapse notices and winback.
await pg.query("DELETE FROM pro_lifecycle_delivery WHERE subscription_id=$1",[expiredSub.id]);
paid('cs_test_replacement','expiredpromo@example.com','sub_replacement');
await purchase.syncPurchase('cs_test_replacement');
const beforeReplacement=mails.length;
await lifecycle.runProLifecycle();assert.equal(mails.length,beforeReplacement);
check('replacement live subscription suppresses lapse and winback delivery',()=>{});
// Failed send releases lease and can retry; a crashed claim expires.
await pg.query("DELETE FROM pro_lifecycle_delivery WHERE subscription_id=$1",[reminderSub.id]);
smtpFails=true;
assert.ok((await lifecycle.runProLifecycle()).failed>0);
smtpFails=false;
const beforeRetry=mails.length;await lifecycle.runProLifecycle();assert.equal(mails.length,beforeRetry+1);
await pg.query("UPDATE pro_lifecycle_delivery SET sent_at=NULL, lease_until=now()+interval '5 minutes' WHERE subscription_id=$1 AND kind='reminder'",[reminderSub.id]);
const beforeLease=mails.length;await lifecycle.runProLifecycle();assert.equal(mails.length,beforeLease);
await pg.query("UPDATE pro_lifecycle_delivery SET lease_until=now()-interval '1 second' WHERE subscription_id=$1",[reminderSub.id]);
await lifecycle.runProLifecycle();assert.equal(mails.length,beforeLease+1);
check('email retries recover failed sends and expired leases without concurrent duplicates',()=>{});

// Short promotions never receive a reminder; winback respects time and opt-out.
const shortSub=freePromo('cs_test_short','short@example.com',now+86400);
shortSub.metadata={promo_no_card:'1',promo_redeemed_at:String(now)};shortSub.cancel_at=now+86400;
await purchase.syncPurchase('cs_test_short');
const recentSub=freePromo('cs_test_recent','recent@example.com',now-86400);
recentSub.metadata={promo_no_card:'1',promo_redeemed_at:String(now-31*86400)};recentSub.cancel_at=now-86400;
recentSub.status='canceled';recentSub.ended_at=now-86400;
await purchase.syncPurchase('cs_test_recent');
await lifecycle.runProLifecycle();
assert.equal(mails.filter(m=>m.to==='short@example.com').length,0);
assert.equal(mails.filter(m=>m.to==='recent@example.com').length,1);
check('short promos skip reminders and recent lapses do not get early winback',()=>{});
await pg.query("UPDATE pro_email_preferences SET marketing_unsubscribed_at=now() WHERE email='expiredpromo@example.com'");
subscriptions.get('sub_replacement').status='canceled';await purchase.refreshPurchaseSubscription('sub_replacement');
await pg.query("INSERT INTO pro_lifecycle_delivery(subscription_id,kind,sent_at) VALUES ($1,'ended',now()) ON CONFLICT (subscription_id,kind) DO UPDATE SET sent_at=now()",[expiredSub.id]);
await pg.query("DELETE FROM pro_lifecycle_delivery WHERE subscription_id=$1 AND kind='winback'",[expiredSub.id]);
const beforeOptOut=mails.length;await lifecycle.runProLifecycle();assert.equal(mails.length,beforeOptOut);
check('marketing unsubscribe suppresses winback independently of account messages',()=>{});
// A Stripe scheduling error never leaves an activated, unscheduled local purchase.
const failedSub=freePromo('cs_test_schedulefail','schedulefail@example.com');
const updateWorks=stripe.subscriptions.update;
stripe.subscriptions.update=async()=>{throw Error('Stripe update unavailable')};
await assert.rejects(purchase.syncPurchase('cs_test_schedulefail'),/unavailable/);
assert.equal((await pg.query('SELECT id FROM pro_subscriptions WHERE stripe_subscription_id=$1',[failedSub.id])).rows.length,0);
stripe.subscriptions.update=updateWorks;
await purchase.syncPurchase('cs_test_schedulefail');assert.equal(failedSub.cancel_at,promoEnd);
check('failed expiry scheduling grants no row and succeeds on reconciliation retry',()=>{});
stripe.subscriptions.cancel=async(id,params)=>{
 assert.equal(params.invoice_now,false);assert.equal(params.prorate,false);
 const sub=subscriptions.get(id);sub.status='canceled';return structuredClone(sub);
};
const unsupported=freePromo('cs_test_unsupported','unsupported@example.com');
unsupported.discounts[0].source.coupon.duration='forever';
await assert.rejects(purchase.syncPurchase('cs_test_unsupported'),/one-month/);
assert.equal(unsupported.status,'canceled');
check('unsupported free discounts cancel without invoice or proration instead of accidentally renewing',()=>{});

user=null;
const repeatFree=freePromo('cs_test_repeatfree','promo@example.com');
await assert.rejects(purchase.syncPurchase('cs_test_repeatfree'),/already redeemed/);
assert.equal(repeatFree.status,'canceled');
check('signed-out repeat redemption with the same checkout email is rejected without a renewal',()=>{});
// Enabling the flag must not alter an existing required-card free purchase.
paid('cs_test_legacy_free','legacy-free@example.com','sub_legacy_free');
Object.assign(sessions.get('cs_test_legacy_free'),{amount_total:0,payment_status:'no_payment_required'});
const beforeLegacy=promoUpdates;await purchase.syncPurchase('cs_test_legacy_free');
assert.equal(promoUpdates,beforeLegacy);
check('existing required-card free purchases do not enter the no-card lifecycle',()=>{});
user=null;
for (const plan of ['monthly','yearly']) {
 const url=await purchase.startPurchase(plan,'','analytics-browser',crypto.randomUUID());
 const created=sessions.get(url.split('/').at(-1));
 assert.equal(created.allow_promotion_codes,true);
 assert.equal(created.payment_method_collection,plan==='monthly'?'if_required':'always');
 assert.equal(created.metadata.promo_no_card,plan==='monthly'?'1':undefined);
 assert.equal(created.metadata.posthog_distinct_id,'analytics-browser');
}
check('flagged monthly checkout skips unnecessary cards while annual promo and analytics behavior stay intact',()=>{});
// Disabling new promo entry must not leave an in-flight no-card checkout renewing.
const disabledSub=freePromo('cs_test_disabled','disabled@example.com');
sessions.get('cs_test_disabled').metadata.promo_no_card='1';
process.env.NEPTUNE_PROMO_LIFECYCLE_ENABLED='false';
await assert.rejects(purchase.syncPurchase('cs_test_disabled'),/not enabled/);
assert.equal(disabledSub.status,'canceled');
process.env.NEPTUNE_PROMO_LIFECYCLE_ENABLED='true';
check('disabled promo provisioning safely cancels an in-flight no-card checkout',()=>{});
// Ordinary paid subscriptions must never enter the no-card promo lifecycle.
for (const [paidPlan,cents] of [['monthly',200],['yearly',2000]]) {
 const receiptId=`cs_test_paid${paidPlan}`;
 const subId=`sub_paid_${paidPlan}`;
 const email=`ordinary-${paidPlan}@example.com`;
 paid(receiptId,email,subId);
 Object.assign(sessions.get(receiptId),{amount_total:cents,amount_subtotal:cents,discounts:[],metadata:{flow:'payment_first_v1',plan:paidPlan}});
 const beforeUpdates=promoUpdates;
 const synced=await purchase.syncPurchase(receiptId);
 assert.equal(synced.active,true);assert.equal(synced.freeUntil,undefined);
 assert.equal(promoUpdates,beforeUpdates);
 user={id:`ordinary_${paidPlan}`,emailAddresses:[{emailAddress:email,verification:{status:'unverified'}}]};
 assert.equal(await purchase.activatePurchase(receiptId),false);
 user.emailAddresses[0].verification.status='verified';
 assert.equal(await purchase.activatePurchase(receiptId),true);
 const stored=(await pg.query('SELECT plan,price_cents,promo_access_ends_at,promo_redeemed_at FROM pro_subscriptions WHERE stripe_subscription_id=$1',[subId])).rows[0];
 assert.equal(stored.plan,paidPlan);assert.equal(stored.price_cents,cents);
 assert.equal(stored.promo_access_ends_at,null);assert.equal(stored.promo_redeemed_at,null);
 assert.equal((await billing.getAccountState(user.id)).kind,'pro');
 check(`paid ${paidPlan} without a code requires verified ownership and grants paid access without promo expiry`,()=>{});
}
const priceConfig = load('lib/checkoutPrices.ts');
const originalMonthly = structuredClone(prices.get('price_monthly'));
for (const [label,patch] of [
 ['inactive',{active:false}],['live/test mismatch',{livemode:true}],['wrong currency',{currency:'eur'}],
 ['wrong amount',{unit_amount:201}],['wrong interval',{recurring:{interval:'year',interval_count:1,usage_type:'licensed'}}],
 ['metered',{recurring:{interval:'month',interval_count:1,usage_type:'metered'}}],
 ['inactive product',{product:{id:'prod_monthly',active:false}}],['deleted product',{product:{id:'prod_monthly',deleted:true}}],
 ['shared product',{product:{id:'prod_yearly',active:true}}],
]) {
 prices.set('price_monthly',{...originalMonthly,...patch});
 await assert.rejects(()=>priceConfig.checkoutPrices());
 check(`fixed prices reject ${label}`,()=>{});
}
prices.set('price_monthly',originalMonthly);
delete process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
await assert.rejects(()=>priceConfig.checkoutPrices(),/not configured/);
process.env.STRIPE_PRO_MONTHLY_PRICE_ID='price_monthly';
check('fixed prices require explicit configuration without inline fallback',()=>{});
user=null;
const legacyUrl=await purchase.startPurchase('monthly','legacy-open-price@example.test');
const legacySession=[...sessions.values()].find(s=>s.url===legacyUrl);
legacySession.line_items=[{quantity:1,price:'price_legacy_inline'}];
const newUrl=await purchase.startPurchase('monthly','legacy-open-price@example.test');
assert.notEqual(newUrl,legacyUrl);assert.equal(legacySession.status,'expired');
const replacement=[...sessions.values()].find(s=>s.url===newUrl);
assert.equal(replacement.line_items[0].price,'price_monthly');
assert.equal(replacement.line_items[0].price_data,undefined);
check('legacy open checkout expires and is replaced with the restricted fixed product',()=>{});
const promoAttempt=crypto.randomUUID();
const promoUrl=await purchase.startPurchase('monthly','','promo-browser',promoAttempt,' elnino ');
const promoSession=[...sessions.values()].find(s=>s.url===promoUrl);
assert.ok(promoSession.custom_text.submit.message.startsWith('Free month of Neptune Pro. No card required. Access ends automatically after one month.'));
assert.equal(promoSession.discounts[0].promotion_code,'promo_elnino');
assert.equal(promoSession.allow_promotion_codes,undefined);
assert.equal(promoSession.payment_method_collection,'if_required');
assert.equal(promoSession.metadata.flow,'payment_first_v1');
assert.equal(promoSession.metadata.plan,'monthly');
assert.equal(promoSession.metadata.posthog_distinct_id,'promo-browser');
assert.equal(promoSession.metadata.promo_no_card,'1');
assert.equal(promoSession.line_items[0].price,'price_monthly');
assert.equal(await purchase.startPurchase('monthly','','promo-browser',promoAttempt,'ELNINO'),promoUrl);
check('promo entry applies the validated Stripe promotion to monthly checkout and reuses retries',()=>{});
await assert.rejects(purchase.startPurchase('yearly','','',crypto.randomUUID(),'ELNINO'),/monthly/);
await assert.rejects(purchase.startPurchase('monthly','','',crypto.randomUUID(),''),/Invalid/);
await assert.rejects(purchase.startPurchase('monthly','','',crypto.randomUUID(),'x'.repeat(65)),/Invalid/);
check('promo entry rejects annual plans and missing or malformed codes before Checkout',()=>{});
const plainUrl=await purchase.startPurchase('monthly','','promo-browser',promoAttempt);
assert.notEqual(plainUrl,promoUrl);assert.equal(promoSession.status,'expired');
assert.equal([...sessions.values()].find(s=>s.url===plainUrl).discounts,undefined);
check('switching from promo to ordinary checkout retires the promo session rather than silently carrying its discount',()=>{});
const plainSession=[...sessions.values()].find(s=>s.url===plainUrl);
assert.notEqual(await purchase.startPurchase('monthly','','promo-browser',promoAttempt,'ELNINO'),plainUrl);
assert.equal(plainSession.status,'expired');
check('switching from ordinary monthly checkout to promo creates a pre-applied discounted session',()=>{});
const validatePromo=load('lib/promoCheckout.ts').checkoutPromotion;
for(const [label,patch] of [
 ['inactive',{active:false}],['wrong code',{code:'OTHER'}],['wrong mode',{livemode:true}],
 ['expired',{expires_at:1}],['exhausted',{max_redemptions:1,times_redeemed:1}],['customer-specific',{customer:'cus_other'}],
 ['partial discount',{promotion:{coupon:{...promoCode.promotion.coupon,percent_off:50}}}],
 ['three months',{promotion:{coupon:{...promoCode.promotion.coupon,duration_in_months:3}}}],
 ['unrestricted coupon',{promotion:{coupon:{...promoCode.promotion.coupon,applies_to:undefined}}}],
 ['annual product',{promotion:{coupon:{...promoCode.promotion.coupon,applies_to:{products:['prod_yearly']}}}}],
 ['invalid coupon',{promotion:{coupon:{...promoCode.promotion.coupon,valid:false}}}],
 ['exhausted coupon',{promotion:{coupon:{...promoCode.promotion.coupon,max_redemptions:1,times_redeemed:1}}}],
]){promotionResults=[{...promoCode,...patch}];await assert.rejects(validatePromo('ELNINO','price_monthly'));check(`promo entry rejects ${label}`,()=>{});}
promotionResults=[promoCode,promoCode];await assert.rejects(validatePromo('ELNINO','price_monthly'));
promotionResults=[promoCode];process.env.NEPTUNE_PROMO_LIFECYCLE_ENABLED='false';
await assert.rejects(validatePromo('ELNINO','price_monthly'));process.env.NEPTUNE_PROMO_LIFECYCLE_ENABLED='true';
check('ambiguous or disabled promos fail closed',()=>{});
const safeDiagnostic=load('lib/checkoutError.ts').checkoutDiagnostic;
const savedSender=process.env.PRO_ACTIVATION_EMAIL_FROM;
delete process.env.PRO_ACTIVATION_EMAIL_FROM;
try{await purchase.startPurchase('monthly','','',crypto.randomUUID(),'ELNINO');assert.fail('Expected missing email configuration to fail');}
catch(error){assert.equal(safeDiagnostic(error).category,'configuration');}
process.env.PRO_ACTIVATION_EMAIL_FROM=savedSender;
try{await purchase.startPurchase('monthly','','',crypto.randomUUID(),'INVALID');assert.fail('Expected invalid code to fail');}
catch(error){assert.equal(safeDiagnostic(error).category,'invalid_promotion');}
check('checkout diagnostics distinguish missing email configuration from invalid promo input',()=>{});
await pg.close();
console.log(`Passed ${checks} payment-flow checks.`);
