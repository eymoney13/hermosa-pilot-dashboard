import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'neptune-editor-test-'));
const previousEnv = process.env.NODE_ENV;
const cache = new Map();
function load(relative) {
  const file = path.join(root, relative);
  if (cache.has(file)) return cache.get(file).exports;
  const loadedModule = { exports: {} };
  cache.set(file, loadedModule);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const native = createRequire(file);
  const require = (name) => name === 'server-only' ? {} : name.startsWith('@/') ? load(`${name.slice(2)}.ts`) : native(name);
  new Function('require', 'module', 'exports', compiled)(require, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
try {
  process.chdir(temporary);
  process.env.NODE_ENV = 'development';
  const { POST } = load('app/api/local-editor/how-it-works/route.ts');
  const { readHowItWorksDraft, readPageDraft } = load('lib/local-editor/howItWorksDraft.ts');
  const send = (body, origin = 'http://localhost:3001') => POST(new Request('http://localhost:3001/api/local-editor/how-it-works', {
    method: 'POST', headers: { origin, host: 'localhost:3001', 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  assert.deepEqual(await readHowItWorksDraft(), { revision: '', edits: {} });
  const edits = { 'text-1': { original: 'How Neptune Works', value: 'How it works\nNew line' } };
  assert.equal((await send({ revision: '', edits }, 'https://example.com')).status, 403);
  assert.equal((await send({ revision: '', edits }, 'not-a-url')).status, 403);
  assert.equal((await send({ revision: '', edits: { '../bad': { original: 'a', value: 'b' } } })).status, 400);
  assert.equal((await send({ revision: '', edits: { 'text-1': { original: 'a', value: 123 } } })).status, 400);
  const response = await send({ revision: '', edits });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual(await readHowItWorksDraft(), saved);
  assert.deepEqual(JSON.parse(fs.readFileSync('content/local-drafts/how-neptune-works.json')).edits, edits);
  assert.equal((await send({ revision: '', edits: {} })).status, 409);
  const concurrent = await Promise.all([send({ revision: saved.revision, edits: {} }), send({ revision: saved.revision, edits })]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
  // Each editable page persists independently, even when field ids overlap.
  for (const page of ['stories', 'team']) {
    const { POST: savePage } = load(`app/api/local-editor/${page}/route.ts`);
    const pageEdits = { 'text-1': { original: page, value: `${page} edited` } };
    const result = await savePage(new Request(`http://localhost:3001/api/local-editor/${page}`, {
      method: 'POST', headers: { origin: 'http://localhost:3001', host: 'localhost:3001' },
      body: JSON.stringify({ revision: '', edits: pageEdits }),
    }));
    assert.equal(result.status, 200);
    assert.deepEqual((await readPageDraft(page)).edits, pageEdits);
  }
  assert.deepEqual((await readHowItWorksDraft()).edits, {});
  assert.notDeepEqual((await readPageDraft('team')).edits, (await readPageDraft('stories')).edits);
  process.env.NODE_ENV = 'production';
  assert.equal((await send({ revision: '', edits })).status, 404);
  assert.deepEqual(await readHowItWorksDraft(), { revision: '', edits: {} });
  for (const page of ['stories', 'team']) {
    const { POST: savePage } = load(`app/api/local-editor/${page}/route.ts`);
    assert.equal((await savePage(new Request(`http://localhost:3001/api/local-editor/${page}`, { method: 'POST' }))).status, 404);
    assert.deepEqual(await readPageDraft(page), { revision: '', edits: {} });
  }
  console.log('Passed: durable saves, stale/concurrent save protection, validation, origin restrictions, production disabled.');
} finally {
  process.chdir(root);
  if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv;
  fs.rmSync(temporary, { recursive: true, force: true });
}
