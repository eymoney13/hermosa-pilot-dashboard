// Real Stripe test-mode verification. No database access, completed purchases,
// emails, or live-mode requests. Explicitly opt in to replacing test ELNINO.
import assert from 'node:assert/strict';
import Stripe from 'stripe';
const key=process.env.STRIPE_SECRET_KEY;
assert.match(key??'',/^sk_test_/, 'Only a Stripe test key is allowed');
const api=new Stripe(key);
const ids={monthly:process.env.STRIPE_PRO_MONTHLY_PRICE_ID,yearly:process.env.STRIPE_PRO_YEARLY_PRICE_ID};
const prices={};
for(const [plan,id] of Object.entries(ids)){
 assert.match(id??'',/^price_/);
 const p=await api.prices.retrieve(id,{expand:['product']});
 assert.equal(p.livemode,false);assert.equal(p.active,true);assert.equal(p.currency,'usd');
 assert.equal(p.unit_amount,plan==='monthly'?200:2000);
 assert.equal(p.recurring?.interval,plan==='monthly'?'month':'year');assert.equal(p.recurring.interval_count,1);
 assert.equal(p.recurring.usage_type,'licensed');assert.equal(p.product.active,true);prices[plan]=p;
}
assert.notEqual(prices.monthly.product.id,prices.yearly.product.id);
const codes=await api.promotionCodes.list({code:'ELNINO',active:true,limit:100,expand:['data.promotion.coupon']});
let promo=codes.data.find(p=>{const c=p.promotion.coupon;return typeof c==='object'&&c.percent_off===100&&c.duration==='repeating'&&c.duration_in_months===1&&c.applies_to?.products?.length===1&&c.applies_to.products[0]===prices.monthly.product.id;});
if(!promo){
 assert.ok(process.argv.includes('--prepare-elnino'),'Test ELNINO needs a one-month coupon restricted to the monthly product. Re-run with --prepare-elnino to replace it in TEST MODE ONLY.');
 const coupon=await api.coupons.create({name:'Neptune Pro Monthly - 1 Month Free',percent_off:100,duration:'repeating',duration_in_months:1,applies_to:{products:[prices.monthly.product.id]},max_redemptions:200});
 for(const old of codes.data)await api.promotionCodes.update(old.id,{active:false});
 promo=await api.promotionCodes.create({code:'ELNINO',promotion:{type:'coupon',coupon:coupon.id}});
}
const sessions=[];
async function create(plan,promotion=false){
 const s=await api.checkout.sessions.create({mode:'subscription',line_items:[{price:ids[plan],quantity:1}],payment_method_types:['card'],payment_method_collection:plan==='monthly'?'if_required':'always',...(promotion?{discounts:[{promotion_code:promo.id}]}:{allow_promotion_codes:true}),metadata:{flow:'fixed_price_verification',neptune_internal:'1'},success_url:'http://localhost:3000/pro/activate?session_id={CHECKOUT_SESSION_ID}',cancel_url:'http://localhost:3000/california'});
 sessions.push(s.id);assert.equal(s.livemode,false);return s;
}
try{
 const monthly=await create('monthly',true);assert.equal(monthly.amount_total,0);assert.equal(monthly.payment_method_collection,'if_required');
 console.log('PASS: ELNINO monthly checkout is $0 with no required card');
 let annual;
 try{annual=await create('yearly',true);}catch(error){assert.equal(error.type,'StripeInvalidRequestError');assert.match(error.message,/appl|eligib|product|discount/i);}
 if(annual){assert.equal(annual.amount_total,2000);assert.equal(annual.total_details.amount_discount,0);}
 console.log('PASS: ELNINO cannot discount annual checkout');
 for(const [plan,amount] of [['monthly',200],['yearly',2000]]){const s=await create(plan);assert.equal(s.amount_total,amount);console.log(`PASS: ${plan} checkout without code retains ${amount} cents`);}
 console.log(JSON.stringify({testOnly:true,prices:ids,monthlyProduct:prices.monthly.product.id,annualProduct:prices.yearly.product.id,promotion:promo.id,coupon:typeof promo.promotion.coupon==='string'?promo.promotion.coupon:promo.promotion.coupon.id}));
}finally{for(const id of sessions)await api.checkout.sessions.expire(id);}
