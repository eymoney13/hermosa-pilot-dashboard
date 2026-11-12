import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file,globals={}){const testModule={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:testModule.exports,...globals});return testModule.exports;}
let now=0, focused=true, visible='visible', currentSession='s1', nextTimer=0;
const timers=new Map(),listeners=new Map(),documentListeners=new Map(),storage=new Map(),events=[];
const win={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
const doc={get visibilityState(){return visible},hasFocus:()=>focused,addEventListener:(name,fn)=>documentListeners.set(name,fn),removeEventListener:name=>documentListeners.delete(name)};
const {startActiveSessionTracking}=load('lib/activeSession.ts',{window:win,document:doc,performance:{now:()=>now},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setInterval:fn=>{timers.set(++nextTimer,fn);return nextTimer},clearInterval:id=>timers.delete(id)});
const analytics={get_session_id:()=>currentSession,capture:(name,props)=>events.push({name,props})};
const advance=ms=>{for(let elapsed=0;elapsed<ms;elapsed+=250){now+=250;for(const fn of [...timers.values()])fn()}};
const stop=startActiveSessionTracking(analytics);
advance(10000);assert.equal(events.length,0);
listeners.get('pointerdown')({isTrusted:false});advance(6000);assert.equal(events.length,0);
listeners.get('pointerdown')({isTrusted:true});advance(2000);
focused=false;listeners.get('blur')();advance(60000);assert.equal(events.length,0);
focused=true;advance(6000);assert.equal(events.length,0);
listeners.get('wheel')({isTrusted:true});advance(3000);assert.equal(events.length,1);
listeners.get('keydown')({isTrusted:true});advance(6000);assert.equal(events.length,1);
stop();startActiveSessionTracking(analytics);listeners.get('pointerdown')({isTrusted:true});advance(6000);assert.equal(events.length,1);
currentSession='s2';listeners.get('pointerdown')({isTrusted:true});advance(5000);assert.equal(events.length,2);
assert.equal(events.every(e=>e.name==='engaged_session'&&e.props.active_seconds===5),true);
console.log('ok - no idle/restored-tab engagement; trusted input, foreground cumulative time, one event per session');
class FakeElement {constructor(zoom=false){this.zoom=zoom}closest(){return this.zoom?this:null}}
const surfaceListeners=new Map(),mapListeners=new Map(),captured=[];
const container={addEventListener:(name,fn,options)=>surfaceListeners.set(name,{fn,capture:options===true}),removeEventListener:name=>surfaceListeners.delete(name)};
const {trackMapInteractions}=load('lib/mapInteractionTracking.ts',{Element:FakeElement});
const unbind=trackMapInteractions({getContainer:()=>container,on:(name,fn)=>mapListeners.set(name,fn),off:name=>mapListeners.delete(name)},type=>captured.push(type));
assert.equal(surfaceListeners.get('click').capture,true);
// Model Leaflet consuming the bubble phase. The capture listener must see it.
surfaceListeners.get('click').fn({isTrusted:false,target:new FakeElement(true)});assert.equal(captured.length,0);
surfaceListeners.get('click').fn({isTrusted:true,target:new FakeElement(false)});assert.equal(captured.length,0);
surfaceListeners.get('click').fn({isTrusted:true,target:new FakeElement(true)});
surfaceListeners.get('click').fn({isTrusted:true,target:new FakeElement(true)});assert.deepEqual(captured,['zoom']);
mapListeners.get('dragend')();assert.deepEqual(captured,['zoom','pan']);
unbind();assert.equal(surfaceListeners.size,0);assert.equal(mapListeners.size,0);
console.log('ok - real zoom control clicks survive Leaflet propagation blocking; programmatic/unrelated clicks ignored and cleanup works');
