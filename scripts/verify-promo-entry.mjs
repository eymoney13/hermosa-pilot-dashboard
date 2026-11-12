// Test mode only. Exercise the actual server-side validation against Stripe,
// create an unpaid pre-applied checkout, assert its total, then expire it.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import ts from 'typescript';
assert.match(process.env.STRIPE_SECRET_KEY??'',/^sk_test_/,'Only a Stripe test key is allowed');
const api=new Stripe(process.env.STRIPE_SECRET_KEY);
const price=process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
assert.match(price??'',/^price_/);
const p=await api.prices.retrieve(price);assert.equal(p.livemode,false);assert.equal(p.unit_amount,200);assert.equal(p.currency,'usd');assert.equal(p.recurring.interval,'month');
const testModule={exports:{}};
const code=ts.transpileModule(fs.readFileSync('lib/promoCheckout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date})(name=>{
 if(name==='server-only')return {};
 if(name==='./subscription')return {stripe:()=>api};
 if(name==='./promoAccess')return {promoEnabled:()=>true};
 if(name==='./checkoutError')return {CheckoutError:class extends Error{constructor(category,message){super(message);this.category=category;}}};
 throw Error(name);
},testModule,testModule.exports);
const promotion=await testModule.exports.checkoutPromotion(' elnino ',price);
await assert.rejects(testModule.exports.checkoutPromotion('NOT-A-VALID-CODE',price));
const session=await api.checkout.sessions.create({mode:'subscription',line_items:[{quantity:1,price}],discounts:[{promotion_code:promotion}],payment_method_types:['card'],payment_method_collection:'if_required',metadata:{flow:'promo_entry_verification',neptune_internal:'1'},success_url:'http://localhost:3000/pro/activate?session_id={CHECKOUT_SESSION_ID}',cancel_url:'http://localhost:3000/pro/redeem'});
try{assert.equal(session.livemode,false);assert.equal(session.amount_total,0);assert.equal(session.payment_method_collection,'if_required');console.log(JSON.stringify({testOnly:true,serverValidation:'passed',invalidCode:'rejected',preAppliedPromotion:promotion,totalCents:session.amount_total,cardCollection:session.payment_method_collection,purchaseCompleted:false}));}
finally{await api.checkout.sessions.expire(session.id);}
