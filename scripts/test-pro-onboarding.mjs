// Exercise real Next page/action code with isolated auth and receipt fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require=createRequire(import.meta.url);
let user=null, receipt={active:true,email:'buyer@example.com',freeUntil:'2030-01-01T00:00:00Z'}, claim=true, claims=0;
const session='cs_test_inline';
const jar=new Map();
const components={SignUp:props=>React.createElement('div',{'data-widget':'signup','data-email':props.initialValues?.emailAddress}),SignIn:props=>React.createElement('div',{'data-widget':'signin','data-email':props.initialValues?.emailAddress})};
const mocks={
 'next/navigation':{redirect:url=>{throw Error(`redirect:${url}`)},notFound:()=>{throw Error('404')}},
 'next/headers':{cookies:async()=>({get:key=>jar.has(key)?{value:jar.get(key)}:undefined,set:(key,value)=>jar.set(key,value),delete:key=>jar.delete(key)})},
 'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},
 '@clerk/nextjs/server':{currentUser:async()=>user},
 '@clerk/nextjs':components,
 '@/lib/clerkConfig':{isClerkConfigured:()=>true},
 '@/lib/purchase':{syncPurchase:async()=>receipt,activatePurchase:async()=>{claims++;return claim}},
 './ActivatePurchase':{__esModule:true,default:props=>React.createElement('form',{action:props.action,'data-auto':props.automatic})},
};
function load(file){const testModule={exports:{}};const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;vm.runInNewContext(`(function(require,module,exports,process){${code}\n})`,{Date,console})(name=>mocks[name]??require(name),testModule,testModule.exports,{env:{NODE_ENV:'development'}});return testModule.exports;}
const activate=load('app/pro/activate/page.tsx').default;
const signup=load('app/sign-up/[[...sign-up]]/page.tsx').default;
const signin=load('app/sign-in/[[...sign-in]]/page.tsx').default;
const page=(fn,query)=>fn({searchParams:Promise.resolve(query)});
await assert.rejects(page(activate,{session_id:session}),/redirect:\/sign-up\?purchase=cs_test_inline/);
assert.equal(claims,0);
let tree=await page(signup,{purchase:session});
const widget=React.Children.toArray(tree.props.children).find(child=>child.type===components.SignUp);
assert.equal(widget.props.initialValues.emailAddress,'buyer@example.com');
assert.equal(widget.props.forceRedirectUrl,`/pro/activate?session_id=${session}`);
assert.equal(widget.props.signInForceRedirectUrl,widget.props.forceRedirectUrl);
assert.match(renderToStaticMarkup(tree),/Finish creating your account/);
console.log('ok - checkout skips request-email page and signup prefills checkout email with receipt-preserving redirects');
user={id:'verified_buyer'};
tree=await page(activate,{session_id:session});
const findAuto=node=>{if(!node||typeof node!=='object')return null;if(node.props?.automatic!==undefined)return node;for(const child of React.Children.toArray(node.props?.children)){const found=findAuto(child);if(found)return found;}return null;};
const automatic=findAuto(tree);assert.equal(automatic.props.automatic,true);
await assert.rejects(automatic.props.action(),/redirect:\/california\?pro=activated/);
assert.equal(claims,1);assert.equal(jar.has('neptune_activation'),false);
console.log('ok - signed-in verification return automatically claims receipt and opens Pro dashboard');
claim=false;
await assert.rejects(automatic.props.action(),/redirect:\/pro\/activate\?session_id=cs_test_inline&error=identity/);
tree=await page(activate,{session_id:session,error:'identity'});
assert.equal(findAuto(tree).props.automatic,false);
assert.match(renderToStaticMarkup(tree),/couldn’t link this purchase/);
console.log('ok - failed ownership check retains receipt and stops automatic retries');
user=null;claims=0;
await assert.rejects(automatic.props.action(),/redirect:\/sign-up\?purchase=cs_test_inline/);assert.equal(claims,0);
receipt={...receipt,active:false};
await assert.rejects(page(signup,{purchase:session}),/redirect:\/pro\/recover/);
assert.doesNotMatch(renderToStaticMarkup(await page(activate,{session_id:session})),/Email my account activation link/);
await assert.rejects(automatic.props.action(),/redirect:\/pro\/activate\?session_id=cs_test_inline&error=payment/);
console.log('ok - actions recheck authentication and active subscription; inactive receipts never open signup');
receipt={...receipt,active:true};
tree=await page(signin,{purchase:session});
const signInWidget=tree.props.children;
assert.equal(signInWidget.props.initialValues.emailAddress,'buyer@example.com');
assert.equal(signInWidget.props.signUpUrl,`/sign-up?purchase=${session}`);
assert.equal(signInWidget.props.forceRedirectUrl,`/pro/activate?session_id=${session}`);
console.log('ok - existing-account signin and switching to signup both retain the purchase');

// Paid monthly and yearly receipts use exactly the same signup/verification return.
for (const plan of ['monthly','yearly']) {
 user=null;claim=true;claims=0;jar.clear();
 receipt={active:true,email:`${plan}@example.com`,plan,freeUntil:undefined};
 await assert.rejects(page(activate,{session_id:session}),/redirect:\/sign-up\?purchase=cs_test_inline/);
 const signupTree=await page(signup,{purchase:session});
 const paidWidget=React.Children.toArray(signupTree.props.children).find(child=>child.type===components.SignUp);
 assert.equal(paidWidget.props.initialValues.emailAddress,receipt.email);
 assert.equal(paidWidget.props.forceRedirectUrl,`/pro/activate?session_id=${session}`);
 const html=renderToStaticMarkup(signupTree);
 assert.match(html,/payment is confirmed/);assert.match(html,/Set a password and verify/);
 assert.doesNotMatch(html,/free Neptune Pro|Email my account activation link/);
 user={id:`verified_${plan}`};
 const activationTree=await page(activate,{session_id:session});
 const paidAction=findAuto(activationTree);
 assert.equal(paidAction.props.automatic,true);
 await assert.rejects(paidAction.props.action(),/redirect:\/california\?pro=activated/);
 assert.equal(claims,1);
 console.log(`ok - paid ${plan} checkout without a code uses password, one verification, and automatic activation`);
}
