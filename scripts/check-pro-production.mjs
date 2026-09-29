// Read-only checks. Loads DATABASE_URL from the supplied environment; no secrets
// or customer identifiers are printed. It never sends mail or starts checkout.
import {neon} from '@neondatabase/serverless';
const origin='https://dashboard.projectneptune.co';
const report={checkedAt:new Date().toISOString(),pages:{},redirects:{},subscriptions:null};
let failed=false;
for(const path of ['/california','/california/terms','/california/privacy','/sandbox','/southbay','/pro/start?from=/california&plan=monthly','/pro/start?from=/california&plan=yearly','/pro/start?from=/sandbox&plan=monthly','/pro/recover','/sitemap.xml','/robots.txt']) {
 const response=await fetch(origin+path,{signal:AbortSignal.timeout(20000),redirect:'manual'});
 report.pages[path]=response.status;
 const destination=path==='/southbay'?'/california?region=southbay':path==='/sandbox'?'/california':null;
 if(destination){
   const target=new URL(response.headers.get('location')||'/',origin);
   const valid=response.status===308 && target.origin===origin && target.pathname+target.search===destination;
   report.redirects[path]=valid?'correct':'unexpected';
   if(!valid)failed=true;
 } else if(response.status!==200)failed=true;
}
if(process.env.DATABASE_URL) {
 const sql=neon(process.env.DATABASE_URL);
 const [counts]=await sql`SELECT
 count(*) FILTER (WHERE status='past_due')::int AS past_due,
 count(*) FILTER (WHERE status='unpaid')::int AS unpaid,
 count(*) FILTER (WHERE clerk_user_id IS NULL AND created_at < now()-interval '30 minutes' AND status='active')::int AS unclaimed_over_30m,
 count(*) FILTER (WHERE recovery_sent_at IS NULL AND created_at < now()-interval '10 minutes' AND status='active')::int AS activation_email_not_recorded,
 count(*) FILTER (WHERE status='active' AND current_period_end < now())::int AS active_past_expiry
 FROM pro_subscriptions WHERE checkout_session_id LIKE 'cs_live_%'`;
 report.subscriptions=counts;
}
console.log(JSON.stringify(report,null,2));
if(failed||!report.subscriptions||Object.values(report.subscriptions).some(n=>n>0))process.exitCode=1;
