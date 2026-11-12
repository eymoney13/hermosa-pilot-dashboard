import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
function load(file, mocks = {}) {
  const testModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(`(function(require,module,exports,process){${code}\n})`, { console, Date, Response })(name => {
    if (name in mocks) return mocks[name];
    throw Error(name);
  }, testModule, testModule.exports, process);
  return testModule.exports;
}
const properties = load('lib/checkoutPaymentProperties.ts');
const events = [], revenue = [], setups = [], lifecycle = [];
const webhook = load('app/api/pro/webhook/route.ts', {
  '@/lib/purchase': { syncPurchase: async () => ({ active: true, email: 'promo@example.test' }), sendRecovery: async () => {}, refreshPurchaseSubscription: async () => {} },
  '@/lib/promoAccess': { completeKeepPro: async id => setups.push(id) },
  '@/lib/proLifecycle': { runProLifecycle: async id => { lifecycle.push(id); return { failed: 0 }; } },
  '@/lib/posthogCapture': { capturePostHogEvent: async event => events.push(event) },
  '@/lib/analytics': { planProperties: plan => ({ plan: plan === 'yearly' ? 'annual' : 'monthly', price: plan === 'yearly' ? 20 : 2 }) },
  '@/lib/checkoutPaymentProperties': properties,
  '@/lib/stripeRevenueSync': { queueRevenueInvoice: async id => revenue.push(id), deliverRevenue: async () => ({ pending: 0 }) },
  '@/lib/subscription': { constructWebhookEvent: JSON.parse, isProPlan: value => ['monthly','yearly'].includes(value), recordSubscription: async () => {}, updateSubscriptionStatus: async () => {} },
});
const request = event => ({ headers: new Headers({ 'stripe-signature': 'signed-fixture' }), text: async () => JSON.stringify(event) });
const free = { type: 'checkout.session.completed', created: 1790611200, livemode: false, data: { object: { id: 'cs_test_free', payment_status: 'paid', amount_total: 0, amount_subtotal: 200, total_details: { amount_discount: 200 }, discounts: [{ promotion_code: 'promo_free' }], currency: 'usd', metadata: { flow: 'payment_first_v1', plan: 'monthly', posthog_distinct_id: 'browser-123' } } } };
await webhook.POST(request(free));
await webhook.POST(request(free));
assert.equal(events.length, 2);
assert.equal(events[0].event, 'payment_succeeded');
assert.equal(events[0].distinctId, 'browser-123');
assert.equal(events[0].dedupeKey, 'cs_test_free');
assert.equal(events[1].dedupeKey, events[0].dedupeKey);
assert.deepEqual(JSON.parse(JSON.stringify(events[0].properties)), { plan: 'monthly', price: 0, board_location: 'California', amount_cents: 0, subtotal_cents: 200, discount_amount_cents: 200, discount_code_used: true, currency: 'USD', livemode: false });
assert.equal(properties.checkoutPaymentProperties({}).discount_code_used, null);
assert.equal(properties.checkoutPaymentProperties({ discounts: [] }).discount_code_used, false);
for (const [plan,cents] of [['monthly',200],['yearly',2000]]) {
 const paidSession={...free.data.object,id:`cs_test_paid_${plan}`,amount_total:cents,amount_subtotal:cents,total_details:{amount_discount:0},discounts:[],metadata:{flow:'payment_first_v1',plan,posthog_distinct_id:'paid-browser'}};
 await webhook.POST(request({...free,data:{object:paidSession}}));
 const recorded=events.at(-1);
 assert.equal(recorded.event,'payment_succeeded');assert.equal(recorded.distinctId,'paid-browser');
 assert.equal(recorded.dedupeKey,paidSession.id);
 assert.deepEqual(JSON.parse(JSON.stringify(recorded.properties)),{plan:plan==='yearly'?'annual':'monthly',price:cents/100,board_location:'California',amount_cents:cents,subtotal_cents:cents,discount_amount_cents:0,discount_code_used:false,currency:'USD',livemode:false});
}
console.log('ok - no-code monthly/yearly completion preserves existing payment event, annual plan value, amounts and discount properties');
const before = events.length;
await webhook.POST(request({ ...free, data: { object: { id: 'cs_test_setup', metadata: { flow: 'keep_pro_v1', subscription_id: 'sub_promo' } } } }));
assert.deepEqual(setups, ['cs_test_setup']);
assert.equal(events.length, before);
assert.equal(revenue.length, 0);
await webhook.POST(request({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_promo', metadata: { flow: 'payment_first_v1', promo_no_card: '1' } } } }));
assert.deepEqual(lifecycle, ['sub_promo']);
console.log('ok - free fulfillment preserves event/property names, zero amounts, distinct ID and replay dedupe key; setup emits no purchase/revenue event');

const clicks = [];
let interested = 0;
const Notice = load('components/sandbox/ProLapsedNotice.tsx', {
  react: { ...React, useSyncExternalStore: () => false },
  'react/jsx-runtime': await import('react/jsx-runtime'),
  'posthog-js': { __esModule: true, default: { capture: (...args) => clicks.push(args) } },
  './ProLapsedNotice.module.css': { __esModule: true, default: {} },
}).default;
const tree = Notice({ endedAt: '2026-11-01T18:00:00Z', promo: true, onInterest: () => interested++, properties: { page_context: 'map' } });
const html = renderToStaticMarkup(tree);
assert.match(html, /free Neptune Pro access ended/);
assert.match(html, /account and saved beaches/);
const link = React.Children.toArray(tree.props.children).find(child => child.type === 'a');
link.props.onClick();
assert.equal(interested, 1);
assert.equal(clicks[0][0], 'pro_interest_clicked');
assert.deepEqual(JSON.parse(JSON.stringify(clicks[0][1])), { page_context: 'map', board_location: 'California', cta_location: 'lapsed_notice' });
assert.doesNotMatch(renderToStaticMarkup(Notice({ endedAt: '2026-11-01T18:00:00Z' })), /free Neptune Pro/);
console.log('ok - lapse notice renders accurate promo/paid copy and preserves CTA analytics with page context');

const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
for (const [path, schedule] of [['/api/trigger', '0 11 * * *'], ['/api/alerts/send', '0 14 * * *'], ['/api/analytics/stripe-sync', '30 14 * * *'], ['/api/pro/lifecycle', '0 16 * * *']]) {
  assert.equal(config.crons.filter(cron => cron.path === path).length, 1);
  assert.equal(config.crons.find(cron => cron.path === path).schedule, schedule);
}
for (const branch of ['codex/subscription-flow', 'codex/pro-launch-followup', 'codex/california-rollout', 'codex/california-public-launch', 'codex/california-redirect-fix']) assert.equal(config.git.deploymentEnabled[branch], false);
const cron = load('app/api/pro/lifecycle/route.ts', { '@/lib/proLifecycle': { runProLifecycle: async () => ({ sent: 0, failed: 0 }) } });
const oldSecret = process.env.CRON_SECRET;
delete process.env.CRON_SECRET;
assert.equal((await cron.GET({ headers: new Headers({ authorization: 'Bearer undefined' }) })).status, 401);
process.env.CRON_SECRET = 'fixture';
assert.equal((await cron.GET({ headers: new Headers({ authorization: 'Bearer wrong' }) })).status, 401);
assert.equal((await cron.GET({ headers: new Headers({ authorization: 'Bearer fixture' }) })).status, 200);
if (oldSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = oldSecret;
console.log('ok - existing cron schedules and hosting switches preserved; lifecycle cron rejects missing/wrong secrets');
