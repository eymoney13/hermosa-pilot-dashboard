import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
function load(file,mocks){const testModule={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{console})(name=>mocks[name]??require(name),testModule,testModule.exports);return testModule.exports;}
const diagnostics=load('lib/checkoutError.ts',{});
let enabled=true,fail=false,calls=[];
const Direct=props=>React.createElement('div',{'data-promo-entry':props.promoEntry,'data-autostart':props.autoStart});
const link={__esModule:true,default:({children,prefetch,...props})=>{void prefetch;return React.createElement('a',props,children);}};
const Redeem=load('app/pro/redeem/page.tsx',{
 'next/link':link,'next/navigation':{redirect:url=>{throw Error(`redirect:${url}`)},notFound:()=>{throw Error('404')}},
 '@/components/DirectCheckout':{__esModule:true,default:Direct},
 '@/lib/clerkConfig':{isClerkConfigured:()=>true},'@/lib/subscription':{isStripeConfigured:()=>true},
 '@/lib/promoAccess':{promoEnabled:()=>enabled},
 '@/lib/checkoutError':diagnostics,
 '@/lib/purchase':{isPaymentFirstEnabled:()=>true,startPurchase:async(...args)=>{calls.push(args);if(fail)throw Error('private detail');return 'https://checkout.stripe.test/promo';}},
}).default;
let page=await Redeem({searchParams:Promise.resolve({plan:'yearly'})});
const form=React.Children.toArray(page.props.children).find(c=>c.type===Direct);
assert.equal(form.props.plan,'monthly');assert.equal(form.props.autoStart,false);assert.equal(form.props.promoEntry,true);
const data=new FormData();data.set('promo_code','ELNINO');data.set('attempt','browser-id');data.set('ph_id','existing-distinct-id');
await assert.rejects(form.props.action(data),/redirect:https:\/\/checkout.stripe.test\/promo/);
assert.deepEqual(calls[0],['monthly','','existing-distinct-id','browser-id','ELNINO']);
fail=true;await assert.rejects(form.props.action(data),/redirect:\/pro\/redeem\?error=1/);
page=await Redeem({searchParams:Promise.resolve({error:'1'})});const html=renderToStaticMarkup(page);
assert.match(html,/role="alert"/);assert.doesNotMatch(html,/private detail|ELNINO|type="email"/);
enabled=false;await assert.rejects(Redeem({searchParams:Promise.resolve({})}),/404/);
console.log('ok - promo route fixes monthly, validates through purchase, retains existing analytics ID, waits for code, and returns generic errors');

const events=[];const analytics={planProperties:plan=>({plan:plan==='yearly'?'annual':'monthly'}),beachProperties:()=>({})};
for(const path of ['components/sandbox/SandboxProOffer.tsx','components/california-sandbox/components/sandbox/SandboxProOffer.tsx']){
 const css={__esModule:true,default:new Proxy({},{get:(_,key)=>key})};
 const Offer=load(path,{'next/link':link,react:{...React,useRef:()=>({current:null}),useEffect:()=>{}},'posthog-js':{__esModule:true,default:{capture:(...args)=>events.push(args)}},'@/lib/analytics':analytics,'@/components/california-sandbox/lib/analytics':analytics,'./SandboxDashboard.module.css':css}).default;
 const props={checkoutReady:true,promoReady:true,alertsEnabled:true,ctaLocation:'dashboard',pageContext:'dashboard'};
 const tree=Offer(props);const rendered=renderToStaticMarkup(tree);
 assert.match(rendered,/Have a promo code\? Redeem here/);assert.match(rendered,/href="\/pro\/redeem"/);
 assert.match(rendered,/plan=yearly/);assert.match(rendered,/plan=monthly/);
 function find(node){if(!React.isValidElement(node))return; if(node.props.href==='/pro/redeem')return node;for(const c of React.Children.toArray(node.props.children)){const r=find(c);if(r)return r;}}
 find(tree).props.onClick();assert.equal(events.at(-1)[0],'promo_redemption_clicked');
 assert.doesNotMatch(renderToStaticMarkup(Offer({...props,checkoutReady:false})),/href="\/pro\/redeem"/);
 const disabled=renderToStaticMarkup(Offer({...props,promoReady:false}));
 assert.doesNotMatch(disabled,/href="\/pro\/redeem"/);assert.match(disabled,/plan=monthly/);assert.match(disabled,/plan=yearly/);
}
console.log('ok - third CTA exists in both offers, preserves paid links, adds a separate promo event, and respects checkout availability');

for(const category of ['configuration','invalid_promotion','ineligible_account']){
 const value=diagnostics.checkoutDiagnostic(new diagnostics.CheckoutError(category,'secret-code customer@example.test'));
 assert.deepEqual(JSON.parse(JSON.stringify(value)),{category});assert.doesNotMatch(JSON.stringify(value),/secret|@/);
}
assert.deepEqual(JSON.parse(JSON.stringify(diagnostics.checkoutDiagnostic({type:'StripeConnectionError',message:'secret'}))),{category:'stripe',type:'StripeConnectionError'});
assert.deepEqual(JSON.parse(JSON.stringify(diagnostics.checkoutDiagnostic({type:'unsafe-secret',code:'unsafe-code',message:'secret'}))),{category:'internal'});
console.log('ok - diagnostics distinguish configuration, eligibility and provider failures without serializing sensitive error details');
