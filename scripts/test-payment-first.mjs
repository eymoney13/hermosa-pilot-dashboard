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
const legacyAfter = (await legacy.query('SELECT * FROM pro_subscriptions ORDER BY id')).rows;
for (let i = 0; i < legacyBefore.length; i++) {
  for (const key of Object.keys(legacyBefore[i])) assert.deepEqual(legacyAfter[i][key], legacyBefore[i][key]);
}
await legacy.close();
await pg.exec(readFileSync('scripts/subscriptions-schema.sql', 'utf8'));
await pg.exec(readFileSync('scripts/payment-first-schema.sql', 'utf8'));
await pg.exec(readFileSync('scripts/payment-first-schema.sql', 'utf8')); // re-runnable
const sql = async (parts, ...values) => (await pg.query(parts.reduce((s, p, i) => s + (i ? `$${i}` : '') + p, ''), values)).rows;
let user = null;
const sessions = new Map(), subscriptions = new Map(), keys = new Map(), mails = [];
let creations = 0;
let smtpFails = false;
const invitations = [], knownEmails = new Set();
const stripe = {
  checkout: {sessions: {
    retrieve: async id => { if (!sessions.has(id)) throw Error('missing'); return structuredClone(sessions.get(id)); },
    expire: async id => { const session=sessions.get(id); if (session.status !== 'open') throw Error('not open'); session.status='expired'; return structuredClone(session); },
    create: async (params, opts) => {
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
Object.assign(process.env, {STRIPE_SECRET_KEY:'sk_test_fake', DATABASE_URL:'memory', NEPTUNE_PAYMENT_FIRST_ENABLED:'true', NEPTUNE_TEST_CHECKOUT_ENABLED:'true', NEXT_PUBLIC_SITE_URL:'http://localhost:3000', PRO_ACTIVATION_EMAIL_FROM:'sender@example.com', GMAIL_APP_PASSWORD:'fake'});
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
check('switching monthly to annual expires the old checkout and bills $40/year', () => {
  assert.equal(oldMonthly.status,'expired');
  assert.equal(annual.line_items[0].price_data.unit_amount,4000);
  assert.equal(annual.line_items[0].price_data.recurring.interval,'year');
  assert.equal(annual.metadata.plan,'yearly');
});
const annualRetry = await purchase.startPurchase('yearly','annual-buyer@example.com');
check('annual retries reuse the same checkout', () => assert.equal(annualRetry, annual.url));
const session = sessions.get('cs_test_1');
check('checkout is anonymous, fixed price, and returns to activation', () => {
  assert.equal(session.client_reference_id,undefined); assert.equal(session.line_items[0].price_data.unit_amount,500);
  assert.ok(session.success_url.includes('/pro/activate?session_id={CHECKOUT_SESSION_ID}'));
});
assert.equal(await purchase.syncPurchase('cs_test_1'),null);
assert.equal((await pg.query('SELECT * FROM pro_subscriptions')).rows.length,0);
check('unpaid checkout grants no database row', () => {});
function paid(id,email,subId) {
  sessions.set(id,{id,mode:'subscription',status:'complete',payment_status:'paid',metadata:{flow:'payment_first_v1',plan:'monthly'},subscription:subId,customer:`cus_${subId}`,customer_details:{email}});
  subscriptions.set(subId,{id:subId,status:'active',items:{data:[{current_period_end:Math.floor(Date.now()/1000)+86400}]}});
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
  assert.equal(mails.at(-1).subject,'Welcome to Neptune Pro — activate your account');
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
process.env.STRIPE_SECRET_KEY='sk_live_fake';
await assert.rejects(purchase.startPurchase('monthly','new@example.com'));
check('checkout creation itself enforces live kill switch',()=>{});
await pg.close();
console.log(`Passed ${checks} payment-flow checks.`);
