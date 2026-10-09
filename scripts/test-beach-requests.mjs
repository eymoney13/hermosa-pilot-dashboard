import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.exec(fs.readFileSync('scripts/beach-requests-schema.sql', 'utf8'));
function load(relative) {
 const file = path.resolve(relative), loadedModule = { exports: {} };
 const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
 const native = createRequire(file);
 const require = name => name === '@neondatabase/serverless' ? { neon: () => async (strings, ...values) => (await db.query(strings.reduce((sql,part,i)=>sql+(i ? '$'+i : '')+part,''), values)).rows } : name.startsWith('@/') ? load(name.slice(2)+'.ts') : native(name);
 new Function('require','module','exports',compiled)(require,loadedModule,loadedModule.exports);
 return loadedModule.exports;
}
const old = process.env.DATABASE_URL;
process.env.DATABASE_URL = 'test';
try {
 const { POST } = load('app/api/beach-requests/route.ts');
 const send = (data, origin='http://localhost:3001') => POST(new Request('http://localhost:3001/api/beach-requests',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)}));
 const request = {email:' BEACH@example.com ',message:'My beach, California',source:'sandbox'};
 assert.equal((await send(request,'https://elsewhere.example')).status,403);
 assert.equal((await send({...request,email:'bad'})).status,400);
 assert.equal((await send({...request,message:' '})).status,400);
 assert.equal((await send({...request,message:'x'.repeat(2001)})).status,400);
 assert.equal((await send({...request,message:'x'.repeat(16001)})).status,413);
 assert.equal((await send({...request,website:'spam'})).status,200);
 assert.equal((await db.query('SELECT * FROM beach_requests')).rows.length,0);
 assert.equal((await send(request)).status,200);
 assert.equal((await send(request)).status,200);
 const rows=(await db.query('SELECT * FROM beach_requests')).rows;
 assert.equal(rows.length,1); assert.equal(rows[0].email,'beach@example.com'); assert.equal(rows[0].message,request.message);
 for(let i=0;i<4;i++) assert.equal((await send({...request,message:'Another beach '+i})).status,200);
 assert.equal((await send({...request,message:'Too many beaches'})).status,429);
 delete process.env.DATABASE_URL;
 assert.equal((await send(request)).status,503);
 console.log('Passed: durable SQL storage, duplicate protection, validation, honeypot, request limits, origin restrictions, unavailable storage.');
} finally { if(old === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL=old; await db.close(); }
