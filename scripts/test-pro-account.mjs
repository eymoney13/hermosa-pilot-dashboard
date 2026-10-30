// Server-rendered account states and action authorization; no services or billing writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
let userId = 'account', subscription = null, customer = 'customer', portalCalls = 0;
const mocks = {
 '@/lib/purchase': { isPaymentFirstEnabled: () => true },
 'next/link': { __esModule: true, default: ({children, ...props}) => { delete props.prefetch; return React.createElement('a', props, children); } },
 'next/navigation': { notFound: () => { throw Error('404'); }, redirect: url => { throw Error(`redirect:${url}`); } },
 '@clerk/nextjs/server': { auth: async () => ({userId}) },
 '@/lib/clerkConfig': { isClerkConfigured: () => true },
 '@/lib/paywall': { paywalledReturnPath: path => path === '/california' ? path : null },
 '@/lib/subscription': {
  isLiveBillingEnabled: () => true, isStripeConfigured: () => true,
  entitlementFrom: row => !!row && ['active', 'trialing', 'past_due'].includes(row.status) && (!row.current_period_end || new Date(row.current_period_end) >= new Date()),
  getAccountSubscription: async () => subscription, getStripeCustomerId: async () => customer,
  createBillingPortalSession: async (id, returnTo) => { assert.equal(id, 'customer'); assert.ok(returnTo.startsWith('/pro/manage?')); portalCalls++; return 'https://billing.stripe.test/session'; },
  PRO_PLANS: { monthly: {label:'$5/month'}, yearly: {label:'$40/year'} },
 },
};
const code = ts.transpileModule(readFileSync('app/pro/manage/page.tsx', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, esModuleInterop:true}}).outputText;
const mod = {exports:{}};
vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {Intl, Date, process: {env: {NODE_ENV:"production"}}})(name => mocks[name] ?? require(name), mod, mod.exports);
const page = (query = {from:'/california'}) => mod.exports.default({searchParams:Promise.resolve(query)});
subscription = {status:'canceled', plan:'monthly', current_period_end:'2026-01-01T00:00:00Z'};
let tree = await page(), html = renderToStaticMarkup(tree);
assert.match(html, /Your Pro subscription has ended/);
assert.match(html, /December 31, 2025/);
for (const href of ['/california', '/pro/start?from=%2Fcalifornia&plan=monthly', '/pro/start?from=%2Fcalifornia&plan=yearly', 'mailto:ethan@projectneptune.co']) {
 assert.ok(html.includes(`href="${href.replaceAll('&', '&amp;')}"`), `correct destination: ${href}`);
}
assert.match(html, /Renews automatically/);
assert.match(html, /View invoices and payment methods/);
assert.equal(portalCalls, 0, 'rendering must not create a Stripe session');
const portalAction = tree.props.billingAction;
userId = null;
await assert.rejects(portalAction(), /redirect:\/sign-in/);
assert.equal(portalCalls, 0);
userId = 'account';
await assert.rejects(portalAction(), /redirect:https:\/\/billing.stripe.test/);
assert.equal(portalCalls, 1);
subscription = {status:'active', plan:'yearly', current_period_end:'2030-01-01T00:00:00Z'};
html = renderToStaticMarkup(await page());
assert.match(html, /Pro access is active/); assert.match(html, /\$40\/year/);
assert.match(html, /Manage billing in Stripe/); assert.doesNotMatch(html, /plan=monthly/);
subscription.status = 'past_due';
html = renderToStaticMarkup(await page());
assert.match(html, /payment issue/); assert.doesNotMatch(html, /plan=monthly/);
subscription.status = 'unpaid';
html = renderToStaticMarkup(await page());
assert.match(html, /payment needs attention/); assert.doesNotMatch(html, /plan=monthly/);
subscription = null; customer = null;
html = renderToStaticMarkup(await page());
assert.match(html, /You’re on the free plan/); assert.doesNotMatch(html, /View invoices/);
await assert.rejects(page({from:'https://example.com'}), /404/);
userId = null;
await assert.rejects(page(), /redirect:\/sign-in/);
await assert.rejects(page({preview:'ended'}), /redirect:\/sign-in/);
console.log('Passed account-page state, renewal disclosure, and billing authorization checks.');
