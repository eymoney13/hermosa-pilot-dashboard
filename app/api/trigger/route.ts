// Vercel Cron entrypoint that fires the project-neptune GitHub Actions on a
// reliable schedule, replacing GitHub's flaky `schedule` trigger.
//
// Vercel Cron (reliable clock) -> this route -> GitHub workflow_dispatch API.
// We use workflow_dispatch (not schedule) because dispatched runs start
// promptly and reliably, and they bypass each workflow's 2am-7am PT
// check_time guard (the per-day dedup check still applies).

const OWNER = 'eymoney13';
const REPO = 'project-neptune';

// Triggered in this order; they run concurrently on GitHub. The publish
// workflows regenerate their own data, so strict ordering vs the full run
// is not required.
const WORKFLOWS = [
  'daily-full-run.yml',
  'daily-refresh.yml',
  'daily-refresh-manhattan.yml',
];

export const dynamic = 'force-dynamic';

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

  const results = await Promise.all(
    WORKFLOWS.map(async (wf) => {
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
      return { workflow: wf, status: res.status, ok, error: ok ? undefined : await res.text() };
    }),
  );

  const allOk = results.every((r) => r.ok);
  // Surfaces in Vercel function logs so you can confirm the morning dispatch fired.
  console.log('[cron/trigger]', JSON.stringify({ allOk, results }));
  return Response.json({ triggered: results }, { status: allOk ? 200 : 502 });
}
