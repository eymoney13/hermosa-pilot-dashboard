// Alert email composition.
//
// The load-bearing test is the first one: the grandfathered subscribers are the
// large group (198 of 203) and their email is the format everything else is
// being moved TO, so unifying must not alter a single byte of what they get.
// That is asserted against the previous implementation read straight out of
// git, not against a copy that could drift.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';

const formatMonthDayYear = (iso) => {           // lib/data.ts:934, verbatim
  const [y,m,d] = iso.split('-').map(Number);
  if (!y||!m||!d) return iso;
  return new Date(Date.UTC(y,m-1,d)).toLocaleDateString('en-US',
    {timeZone:'UTC',month:'long',day:'numeric',year:'numeric'});
};

const load = (file, mocks={}) => {
  const m={exports:{}};
  const js=ts.transpileModule(readFileSync(file,'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(`(function(require,module,exports,process,console){${js}\n})`,
    {Date,Math,JSON,Object,Array,String,Number,Boolean,RegExp,Intl})
    (n=>{if(n in mocks)return mocks[n];throw Error(n);},m,m.exports,process,{log(){},error(){}});
  return m.exports;
};

// The implementation as it stands on main, for the regression comparison.
const dir = mkdtempSync(join(tmpdir(),'alertmail-'));
const prevPath = join(dir,'prev.ts');
writeFileSync(prevPath, execFileSync('git',['show','origin/main:lib/alertMail.ts'],{encoding:'utf8'}));

const prev = load(prevPath, {'./data':{formatMonthDayYear}});
const next = load('lib/alertMail.ts', {'./data':{formatMonthDayYear}});

const B=(code,name,p)=>({code,name,probability:p,status:'Not recommended'});
const DATE='2026-10-13';
const UNSUB='https://dashboard.projectneptune.co/unsubscribe/TOKEN';
const one=[B('DHS114','Hermosa Beach - 26th St',0.71)];
const many=[B('DHS114','Hermosa Beach - 26th St',0.71),B('DHS113','Manhattan Beach - 28th St',0.68),B('DHS116','Redondo Beach',0.55)];

let n=0,bad=0;
const check=(label,fn)=>{ try{fn();console.log(`ok ${++n} - ${label}`);}catch(e){bad++;console.log(`not ok ${++n} - ${label}\n  ${e.message}`);} };

// ---- the regression that protects the 198 --------------------------------
for (const [label,beaches] of [['one beach',one],['several beaches',many]]) {
  const a = prev.composeAlertEmail(beaches,DATE,'california',UNSUB);
  const b = next.composeAlertEmail(beaches,DATE,'california',UNSUB);
  check(`grandfathered ${label}: subject unchanged`,()=>assert.equal(b.subject,a.subject));
  check(`grandfathered ${label}: HTML byte-identical`,()=>assert.equal(b.html,a.html));
  check(`grandfathered ${label}: text byte-identical`,()=>assert.equal(b.text,a.text));
}
check('an explicitly empty cleared list is also unchanged',()=>{
  const a = prev.composeAlertEmail(one,DATE,'california',UNSUB);
  const b = next.composeAlertEmail(one,DATE,'california',UNSUB,{cleared:[]});
  assert.equal(b.html,a.html); assert.equal(b.text,a.text);
});

// ---- the new free subscriber: same format, no cleared section ------------
{
  const m = next.composeAlertEmail(one,DATE,'california',UNSUB,{cleared:[],pro:false});
  check('new free gets the grandfathered masthead',()=>
    assert.match(m.html,/PROJECT NEPTUNE \(The Neptune Index\)/));
  check('new free gets the probability table',()=>
    assert.match(m.html,/Hermosa Beach - 26th St[\s\S]*?High 71%/));
  check('new free sees no cleared section',()=>assert.ok(!/Low \d+%/.test(m.html)));
}

// ---- Pro ------------------------------------------------------------------
{
  const cleared=[B('DHS116','Redondo Beach',0.12)];
  const high = next.composeAlertEmail(one,DATE,'california',UNSUB,{pro:true});
  check('Pro swaps only the masthead',()=>{
    assert.match(high.html,/NEPTUNE PRO/);
    assert.ok(!/The Neptune Index/.test(high.html));
    assert.match(high.html,/High 71%/);
  });
  const both = next.composeAlertEmail(one,DATE,'california',UNSUB,{cleared,pro:true});
  check('Pro elevated + cleared: both tables, own subject',()=>{
    assert.equal(both.subject,'Your Neptune beach update');
    assert.match(both.html,/High 71%/);
    assert.match(both.html,/Redondo Beach[\s\S]*?Low 12%/);
  });
  const only = next.composeAlertEmail([],DATE,'california',UNSUB,{cleared,pro:true});
  check('Pro cleared only: back-to-low subject and no High row',()=>{
    assert.equal(only.subject,'Redondo Beach is back to low bacteria levels');
    assert.ok(!/High \d+%/.test(only.html));
    assert.match(only.html,/Low 12%/);
  });
  const many2 = next.composeAlertEmail([],DATE,'california',UNSUB,{cleared:[cleared[0],B('DHS113','Manhattan Beach - 28th St',0.1)],pro:true});
  check('plural back-to-low subject',()=>
    assert.equal(many2.subject,'2 of your beaches are back to low bacteria levels'));
  check('cleared beaches appear in the plain-text part',()=>
    assert.match(only.text,/Redondo Beach: Low 12%/));
}

// ---- escaping survives the rewrite ---------------------------------------
check('beach names are still HTML-escaped',()=>{
  const m = next.composeAlertEmail([B('X','<script>alert(1)</script>',0.9)],DATE,'california',UNSUB);
  assert.ok(!/<script>/.test(m.html));
  assert.match(m.html,/&lt;script&gt;/);
});

console.log(`\n${n-bad}/${n} alert email checks passed.`);
process.exit(bad?1:0);
