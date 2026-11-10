import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { createHash, randomUUID } from 'node:crypto';

// Real PostgreSQL outbox semantics; no Stripe/PostHog network or secrets.
const pg = new PGlite();
const sql = async (parts, ...values) => (await pg.query(parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows;
const invoices = new Map();
let captureFails = false;
let acknowledgementStatus = 'Ok';
const captures = [];
const api = { invoices: {
  retrieve: async id => {if(!invoices.has(id)) throw Error('Stripe unavailable'); return invoices.get(id)},
  list: async ({starting_after,limit}) => {
    const all=[...invoices.values()]; const start=starting_after?all.findIndex(i=>i.id===starting_after)+1:0;
    return {data:all.slice(start,start+limit),has_more:start+limit<all.length};
  },
}};
function load(file, mocks) {
  const module={exports:{}};
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(`(function(require,module,exports,process){${code}\n})`,{Date,console,Response,fetch:async(...args)=>{
    captures.push(JSON.parse(args[1].body));
    if(captureFails==='timeout') throw Error('timeout');
    return {ok:!captureFails,status:captureFails?503:200,json:async()=>({status:acknowledgementStatus})};
  },AbortSignal})(name=>{if(name in mocks)return mocks[name];throw Error(name)},module,module.exports,process);
  return module.exports;
}
process.env.NEXT_PUBLIC_POSTHOG_KEY='phc_fake';process.env.NEXT_PUBLIC_POSTHOG_HOST='https://posthog.test';
const capture=load('lib/posthogCapture.ts',{'server-only':{},'node:crypto':{createHash}});
const sync=load('lib/stripeRevenueSync.ts',{'server-only':{},'node:crypto':{randomUUID},'./subscription':{stripe:()=>api,subscriptionDb:()=>sql},'./posthogCapture':capture});
const base={id:'in_1',livemode:true,status:'paid',status_transitions:{paid_at:1790611200},customer:'cus_1',amount_paid:4000,currency:'usd',billing_reason:'subscription_create',discounts:[],total_discount_amounts:[]};
assert.equal(sync.invoiceRevenuePayload({...base,livemode:false}),null);
assert.equal(sync.invoiceRevenuePayload({...base,status:'open'}),null);
assert.equal(sync.invoiceRevenuePayload({...base,status_transitions:{paid_at:1}}),null);
assert.equal(sync.invoiceRevenuePayload({...base,status_transitions:{paid_at:null}}),null);
assert.equal(sync.invoiceRevenuePayload({...base,discounts:['di_unexpanded']}).properties.discount_code_used,null);
assert.equal(sync.invoiceRevenuePayload({...base,discounts:[{promotion_code:'promo_1'}],amount_paid:0,total_discount_amounts:[{amount:4000}]}).properties.discount_code_used,true);
assert.equal(sync.invoiceRevenuePayload({...base,discounts:[{promotion_code:null}]}).properties.discount_code_used,false);
console.log('ok - paid/live/date filtering and zero-dollar, code, coupon, unknown discount handling');
invoices.set(base.id,base);
await sync.queueRevenueInvoice(base.id); await sync.queueRevenueInvoice(base.id);
assert.equal((await sql`SELECT count(*)::integer AS n FROM stripe_revenue_outbox`)[0].n,1);
captureFails=true;
let result=await sync.deliverRevenue();assert.equal(result.failed,1);assert.equal(result.pending,1);
assert.equal((await sql`SELECT delivered_at FROM stripe_revenue_outbox`)[0].delivered_at,null);
const uuid=captures.at(-1).uuid;
assert.equal((await sync.deliverRevenue()).delivered,0);
await sql`UPDATE stripe_revenue_outbox SET retry_at = now() - interval '1 minute'`;
captureFails=false;result=await sync.deliverRevenue();assert.equal(result.delivered,1);assert.equal(result.pending,0);assert.equal(captures.at(-1).uuid,uuid);
assert.equal((await sync.deliverRevenue()).delivered,0);
console.log('ok - duplicate webhooks, failed HTTP delivery, delayed retry and stable event UUID');
// Model an acknowledged send whose DB acknowledgement was lost. Retrying uses
// the same UUID; dashboard additionally groups by invoice ID for exact totals.
await sql`UPDATE stripe_revenue_outbox SET delivered_at=NULL, lease_until=now()+interval '10 minutes'`;
assert.equal((await sync.deliverRevenue()).delivered,0);
await sql`UPDATE stripe_revenue_outbox SET lease_until=now()-interval '1 minute'`;
assert.equal((await sync.deliverRevenue()).delivered,1);assert.equal(captures.at(-1).uuid,uuid);
console.log('ok - live leases block concurrent workers and expired leases recover crashes');
invoices.set('in_renewal',{...base,id:'in_renewal',billing_reason:'subscription_cycle',amount_paid:500});
invoices.set('in_old',{...base,id:'in_old',status_transitions:{paid_at:1}});
const reconciled=await sync.reconcileStripeRevenue();assert.equal(reconciled.delivered,1);assert.equal(reconciled.complete,true);assert.equal(reconciled.scanned,3);
assert.equal((await sync.reconcileStripeRevenue()).delivered,0);
const [total]=await sql`SELECT sum((payload->'properties'->>'amount_cents')::integer)::integer AS cents FROM stripe_revenue_outbox`;
assert.equal(total.cents,4500);
await sql`UPDATE stripe_revenue_sync_state SET lease_until=now()+interval '10 minutes'`;
assert.equal((await sync.reconcileStripeRevenue()).busy,true);
await sql`UPDATE stripe_revenue_sync_state SET lease_until=NULL`;
console.log('ok - historical backfill, renewal payments, repeat reconciliation and sync lock');
const withCodes={...base,id:'in_codes',amount_paid:0,
 discounts:[{id:'di_1',promotion_code:{id:'promo_A',code:'FREEPRO'}},
 {id:'di_2',promotion_code:{id:'promo_A',code:'FREEPRO'}},
 {id:'di_3',promotion_code:{id:'promo_B',code:'EARLY'}}],
 total_discount_amounts:[{discount:'di_1',amount:1000},{discount:{id:'di_2'},amount:500},{discount:'di_3',amount:2500}]};
const codes=sync.invoiceDiscountPayloads(withCodes);
assert.equal(codes.length,2);
assert.equal(codes[0].properties.discount_code,'FREEPRO');
assert.equal(codes[0].properties.discount_amount_cents,1500);
assert.equal(codes[1].properties.discount_amount_cents,2500);
assert.equal(codes[0].properties.stripe_customer_id,'cus_1');
assert.throws(()=>sync.invoiceDiscountPayloads({...withCodes,discounts:['di_missing']}));
assert.throws(()=>sync.invoiceDiscountPayloads({...withCodes,discounts:[{id:'di_1',promotion_code:'promo_A'}]}));
assert.equal(sync.invoiceDiscountPayloads({...base,livemode:false}).length,0);
invoices.set(withCodes.id,withCodes);
await sync.queueRevenueInvoice(withCodes.id);await sync.queueRevenueInvoice(withCodes.id);
assert.equal((await sql`SELECT count(*)::integer AS n FROM stripe_revenue_outbox WHERE payload->>'event'='stripe_discount_code_used'`)[0].n,2);
assert.equal((await sync.deliverRevenue()).delivered,3);
assert.equal((await sync.reconcileStripeRevenue()).delivered,0);
assert.equal((await sql`SELECT sum((payload->'properties'->>'amount_cents')::integer)::integer AS cents FROM stripe_revenue_outbox WHERE payload->>'event'='stripe_invoice_paid'`)[0].cents,4500);
console.log('ok - multiple code names, code-specific discount amounts, historical enrichment and repeat sync without revenue duplication');
// More than a run's 300-invoice budget must resume, then wrap for discovery.
for(let i=0;i<301;i++)invoices.set(`in_page_${i}`,{...base,id:`in_page_${i}`,amount_paid:0});
const page1=await sync.reconcileStripeRevenue();assert.equal(page1.complete,false);
const [state]=await sql`SELECT cursor FROM stripe_revenue_sync_state`;assert.ok(state.cursor);
const page2=await sync.reconcileStripeRevenue();assert.equal(page2.complete,true);
assert.equal((await sql`SELECT cursor FROM stripe_revenue_sync_state`)[0].cursor,null);
console.log('ok - bounded scans persist pagination and resume without losing older payments');
await assert.rejects(sync.queueRevenueInvoice('in_unavailable'));
console.log('ok - Stripe failures propagate so webhook delivery can be retried');
await pg.close();

// Exercise the actual signed webhook handler with fake external adapters.
let queueFails=false, pending=false, grants=0;
const webhook=load('app/api/pro/webhook/route.ts',{
 '@/lib/purchase':{syncPurchase:async()=>{grants++;return {active:true,email:'fake@example.test'}},sendRecovery:async()=>{},refreshPurchaseSubscription:async()=>{}},
 '@/lib/posthogCapture':{capturePostHogEvent:async()=>{}},
 '@/lib/analytics':{planProperties:()=>({})},
 '@/lib/checkoutPaymentProperties':{checkoutPaymentProperties:()=>({})},
 '@/lib/stripeRevenueSync':{queueRevenueInvoice:async()=>{if(queueFails)throw Error('DB unavailable')},deliverRevenue:async()=>({pending:pending?1:0})},
 '@/lib/subscription':{constructWebhookEvent:payload=>JSON.parse(payload),isProPlan:()=>true,recordSubscription:async()=>{},updateSubscriptionStatus:async()=>{}},
});
function request(event){return {headers:new Headers({'stripe-signature':'fake-valid'}),text:async()=>JSON.stringify(event)}}
const checkout={type:'checkout.session.completed',created:1790611200,livemode:true,data:{object:{id:'cs_1',invoice:'in_1',metadata:{flow:'payment_first_v1'}}}};
assert.equal((await webhook.POST({headers:new Headers()})).status,400);
pending=true;
assert.equal((await webhook.POST(request(checkout))).status,503);
assert.equal(grants,1);
pending=false;
assert.equal((await webhook.POST(request(checkout))).status,204);
assert.equal((await webhook.POST(request({type:'invoice.paid',data:{object:{id:'in_1'}}}))).status,204);
queueFails=true;
assert.equal((await webhook.POST(request({type:'invoice.paid',data:{object:{id:'in_1'}}}))).status,500);
console.log('ok - webhook asks Stripe to retry outages after granting access, handles renewal invoices and rejects unsigned requests');

const input={event:'test',distinctId:null,dedupeKey:'test',timestamp:new Date()};
acknowledgementStatus=0;
await assert.rejects(capture.sendPostHogEvent(input));
acknowledgementStatus=1;
await capture.sendPostHogEvent(input);
acknowledgementStatus='Ok';
await capture.sendPostHogEvent(input);
captureFails='timeout';
await assert.rejects(capture.sendPostHogEvent(input));
console.log('ok - numeric/string capture acknowledgements, rejected events and network timeouts');
let syncCalls=0;
const route=load('app/api/analytics/stripe-sync/route.ts',{'@/lib/stripeRevenueSync':{reconcileStripeRevenue:async()=>{syncCalls++;return {failed:0,pending:0}}}});
delete process.env.CRON_SECRET;
assert.equal((await route.GET({headers:new Headers({'authorization':'Bearer undefined'})})).status,401);
process.env.CRON_SECRET='fake-cron-secret';
assert.equal((await route.GET({headers:new Headers()})).status,401);
assert.equal(syncCalls,0);
assert.equal((await route.GET({headers:new Headers({'authorization':'Bearer fake-cron-secret'})})).status,200);
assert.equal(syncCalls,1);
console.log('ok - cron rejects missing/wrong authorization and only runs for an authenticated caller');
