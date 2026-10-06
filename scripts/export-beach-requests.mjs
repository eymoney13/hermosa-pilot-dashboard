// Private operator command: node scripts/export-beach-requests.mjs /absolute/path/requests.csv
import { readFileSync, writeFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
const output = process.argv[2];
if (!output) throw new Error('Provide a CSV output path.');
let url = process.env.DATABASE_URL;
if (!url) {
  const line = readFileSync('.env.local', 'utf8').split('\n').find(l => l.startsWith('DATABASE_URL='));
  url = line?.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
}
if (!url) throw new Error('DATABASE_URL is not configured');
const sql = neon(url);
const rows = await sql`SELECT email, message, created_at FROM beach_requests WHERE source = 'california' ORDER BY created_at DESC`;
const cell = value => {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};
writeFileSync(output, ['email,message,created_at', ...rows.map(r => [r.email, r.message, r.created_at].map(cell).join(','))].join('\r\n') + '\r\n', { mode: 0o600, flag: 'wx' });
console.log(`Exported ${rows.length} beach requests.`);
