// Vercel Cron entrypoint that fires the project-neptune GitHub Actions on a
// reliable schedule, replacing GitHub's flaky `schedule` trigger.
//
// Vercel Cron (reliable clock) -> this route -> GitHub workflow_dispatch API.
// We use workflow_dispatch (not schedule) because dispatched runs start
// promptly and reliably, and they bypass each workflow's 2am-7am PT
// check_time guard (the per-day dedup check still applies).

const OWNER = 'eymoney13';
const REPO = 'project-neptune';

// Dispatched in this order, spaced by DISPATCH_GAP_MS. The publish workflows
// regenerate their own data, so strict ordering vs the full run is not required.
const WORKFLOWS = [
  'daily-full-run.yml',
  'daily-refresh.yml',
  'daily-refresh-manhattan.yml',
  'daily-refresh-southbay.yml',
  'daily-refresh-cabrillo.yml',
  'daily-refresh-boston.yml',
];

// Dispatching all six at once put every location workflow on the shared upstream
// APIs in the same second. cdip.ucsd.edu served the first few and returned 403
// to the rest, and a wave-blind run publishes noticeably elevated predictions
// (2026-08-24 DHS113 read 46% high before project-neptune grew a guard against
// publishing one). Each workflow reaches its CDIP step ~20s after its job
// starts, so a 30s gap clears the collision window with room for GitHub's queue
// jitter. It also spreads the location workflows' pushes to the dashboard repo,
// which previously raced on `git pull --rebase`.
const DISPATCH_GAP_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const dynamic = 'force-dynamic';

// The staggered walk has to outlive the default execution window: five gaps plus
// the dispatch calls themselves is ~155s, so budget the 300s ceiling. If this
// ever times out mid-walk the trailing workflows are silently never dispatched,
// so keep WORKFLOWS.length * DISPATCH_GAP_MS comfortably under it.
export const maxDuration = 300;

export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
  // the CRON_SECRET env var is set. Reject anything else so the endpoint can't
  // be triggered by the public.
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    return new Response('GH_DISPATCH_TOKEN not configured', { status: 500 });
  }

  // Sequential, not Promise.all — the gap between dispatches is the whole point.
  // A failed dispatch is recorded and the walk continues, so one bad workflow
  // name can't strand the ones behind it.
  const results = [];
  for (const [i, wf] of WORKFLOWS.entries()) {
    if (i > 0) await sleep(DISPATCH_GAP_MS);
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${wf}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'neptune-dashboard-cron',
        },
        body: JSON.stringify({ ref: 'main' }),
      },
    );
    // GitHub returns 204 No Content on a successful dispatch.
    const ok = res.status === 204;
    results.push({ workflow: wf, status: res.status, ok, error: ok ? undefined : await res.text() });
  }

  const allOk = results.every((r) => r.ok);
  // Surfaces in Vercel function logs so you can confirm the morning dispatch fired.
  console.log('[cron/trigger]', JSON.stringify({ allOk, results }));
  return Response.json({ triggered: results }, { status: allOk ? 200 : 502 });
}
