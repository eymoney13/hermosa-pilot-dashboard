import {readFileSync} from 'node:fs';
import {neon} from '@neondatabase/serverless';

// Explicit database URL only. Never silently loads a production environment.
if (!process.env.DATABASE_URL || process.env.NEPTUNE_ALERT_MIGRATION_CONFIRMED !== 'true') {
  throw new Error('Set DATABASE_URL and NEPTUNE_ALERT_MIGRATION_CONFIRMED=true for the reviewed target database.');
}
const sql=neon(process.env.DATABASE_URL);
const schema=readFileSync(new URL('./california-free-alerts-schema.sql',import.meta.url),'utf8');
// Keep PL/pgSQL function bodies intact when splitting the migration.
const statements=[];
let statement='',quoted=false,body=false,comment=false;
for(let i=0;i<schema.length;i++){
  const c=schema[i],next=schema[i+1];
  if(comment){statement+=c;if(c==='\n')comment=false;continue;}
  if(!quoted&&!body&&c==='-'&&next==='-'){comment=true;statement+=c;continue;}
  if(!quoted&&c==='$'&&next==='$'){body=!body;statement+='$$';i++;continue;}
  if(!body&&c==="'"){
    statement+=c;
    if(quoted&&next==="'"){statement+=next;i++;continue;}
    quoted=!quoted;continue;
  }
  if(c===';'&&!quoted&&!body){
    const value=statement.replace(/--[^\n]*/g,'').trim();
    if(value&&!['BEGIN','COMMIT'].includes(value))statements.push(value);
    statement='';
  }else statement+=c;
}
if(quoted||body||statement.trim())throw Error('Unterminated migration statement.');
const preservation=()=>sql`SELECT
 (SELECT count(*)::int FROM alert_subscribers) AS subscribers,
 (SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY id),'')) FROM alert_subscribers s) AS subscriber_fingerprint,
 (SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY subscriber_id,station_code),'')) FROM alert_subscriptions x) AS follow_fingerprint,
 (SELECT md5(coalesce(string_agg(to_jsonb(g)::text,'' ORDER BY subscriber_id,station_code),'')) FROM legacy_alert_grants g) AS legacy_fingerprint,
 (SELECT count(*)::int FROM pro_subscriptions) AS pro_records,
 (SELECT md5(coalesce(string_agg(to_jsonb(p)::text,'' ORDER BY id),'')) FROM pro_subscriptions p) AS pro_fingerprint`;
const [before]=await preservation();
await sql.transaction(statements.map(statement=>sql.query(statement)));
const [after]=await preservation();
if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Existing records changed during migration; inspect before release.');
console.log(JSON.stringify({migration:'california-free-alerts',applied:true,existing_records_unchanged:true,subscribers:after.subscribers,pro_records:after.pro_records}));
