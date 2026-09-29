// Explicit opt-in: sends exactly two labeled demonstrations to the approved owner.
// Synthetic beaches only. No production forecasts, alert rows, or subscriber lists.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import nodemailer from 'nodemailer';
if (process.env.NEPTUNE_OWNER_EMAIL_REHEARSAL !== 'true') throw Error('Explicit rehearsal opt-in required');
const testModule={exports:{}};
const js=ts.transpileModule(readFileSync('lib/sandboxAlertPolicy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInNewContext(`(function(module,exports){${js}\n})`)(testModule,testModule.exports);
const transport=nodemailer.createTransport({service:'gmail',auth:{user:process.env.PRO_ACTIVATION_EMAIL_FROM,pass:process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g,'')}});
const demo={code:'DEMO',name:'Example Beach (test data)',status:'Not recommended'};
for (const [high,low] of [[[demo],[]],[[],[{...demo,status:'Normal'}]]]) {
 const mail=testModule.exports.sandboxAlertEmail(high,low,new Date().toISOString().slice(0,10),'https://dashboard.projectneptune.co/sandbox/support');
 await transport.sendMail({from:'Neptune Pro <ethan@projectneptune.co>',to:'ethan@projectneptune.co',replyTo:'ethan@projectneptune.co',subject:`[TEST — no real beach conditions] ${mail.subject}`,text:`TEST ONLY. This is a requested demonstration, not a real water-quality alert. The unsubscribe link is a demonstration.\n\n${mail.text}`,html:mail.html.replace('<main ', '<p><strong>TEST ONLY — synthetic beach data, not a real alert. Unsubscribe link is a demonstration.</strong></p><main ')});
 console.log('Accepted owner demonstration:', high.length?'elevated':'clear-up');
}
transport.close();
