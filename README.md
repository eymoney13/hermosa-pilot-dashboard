# Neptune Dashboard

A [Next.js](https://nextjs.org) (App Router) dashboard that displays ocean water-quality
nowcasts and 3-day forecasts for **many beach locations** from a single deployment.

Forecast data is produced by the separate [`project-neptune`](https://github.com/eymoney13/project-neptune)
model repo and pushed into this repo as CSVs by GitHub Actions.

## Architecture

- **One repo, one `main`** serves every location.
- **Location is a URL route segment**: `/hermosa`, `/manhattan`, `/<slug>`.
- A **`LOCATIONS` registry** in [`lib/data.ts`](lib/data.ts) holds every per-location
  value (display name, station codes, beach names, map fallback center).
- **Per-location data folders** live under `public/data/<slug>/` and each contain:
  `nowcast_latest.csv`, `forecast_3day.csv`, `history_3day.csv`, `thresholds.csv`.
- **Per-location nowcast archives** live under `data/nowcast-archive/<slug>/` — one
  `nowcast_<date>.csv` per published day, written by
  [`scripts/archive-nowcast.py`](scripts/archive-nowcast.py) in the same commit as the
  nowcast it copies. `scripts/build-history.py` reads these in preference to
  project-neptune's shared archive so the 7-day window's past cells replay exactly what
  the board published that day. Deliberately outside `public/` — it is a build-time
  input, not something to serve.
- Components are generic — they receive location values as props and hardcode nothing.
- `/` redirects to the default location (`/hermosa`); unknown slugs return a 404.

## Adding a location

1. Add one entry to the `LOCATIONS` registry in `lib/data.ts`:

   ```ts
   newslug: {
     slug: "newslug",
     displayName: "New Beach, CA",
     stations: ["DHS999"],
     beachNames: { DHS999: "New Beach - Main" },
     mapFallbackCenter: [33.0, -118.0], // [lat, lng]
   },
   ```

2. Create `public/data/newslug/` and populate it with that location's CSVs (this is what
   the `project-neptune` daily-refresh workflow writes into).

No per-location code changes are required.

## Getting Started

### California sandbox

Visit `/sandbox?local=1` for an editable local copy of the current `/california`
implementation, refreshed October 30, 2026. The query bypasses an older cached
browser redirect. Presentation and readings match the local California page,
including its roster, map, beach details, free alert form, and Pro offer.

- Edit `app/sandbox/page.tsx` for sandbox data orchestration.
- Edit `components/california-sandbox/components/` for the copied UI and CSS.
- Edit `components/california-sandbox/lib/` for its copied data and display logic.
- Sandbox secondary pages live in `app/sandbox/` and link within that route.
- Readings and public news are snapshots in `public/data/california-sandbox/`;
  they do not auto-refresh. News uses the same feed configuration as California.
- The experiment runs only in development; `/sandbox` returns 404 in production.
- The sandbox does not consult account or billing services. Pro checkout stays disabled;
  alert forms preview locally without sending email or saving subscriptions.
- The sandbox is marked `noindex` and stays out of the sitemap.

The root layout, global CSS, public images, and service endpoints remain shared.
Dashboard presentation dependencies are copied, so editing their sandbox versions
will not change `/california`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000); it redirects to the default location.
Visit `/hermosa` or `/manhattan` directly to view a specific location.

## Build

```bash
npm run build
```

## Deploy

Deploys on the [Vercel Platform](https://vercel.com). See the
[Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying)
for details.

### Long Beach / standardized Neptune Index experiment

The earlier experiment data is retained for reference but is no longer displayed.
It added B-5, B-60, B-7, B-8, B-10, B-31, B-14, B-67, and B-22 with
published October 2 nowcasts and experimental station cutoffs. Raw probabilities
remain intact in the CSV and data objects. The copied loader applies the tuned
cutoffs to today's classifications instead of the published 0.50-based calls.

`components/california-sandbox/lib/neptuneIndex.ts` computes
`100 * p * (1-t) / (p*(1-t) + (1-p)*t)`, the log-odds shift.
The details panel shows an integer score without a percent sign and a fixed
0–29 / 30–49 / 50–74 / 75–100 legend. Scores truncate to prevent rounding a
below-boundary value into a higher category. All sandbox badges and gauge
positions use the same normalization; production helpers are unchanged.

The nine Long Beach stations include September 29–October 1 history and
October 3–5 forecasts, plus 307 actual lab/prediction pairs. Their tuned station
cutoffs apply to today, history, future forecasts, and accuracy scoring in this
experiment, overriding published baseline classifications. Long Beach windows
are unlocked locally without authentication. Historical accuracy compares raw
probability >= tuned cutoff against actual MPN > 104, without rounding the decision.
These historical nowcast match rates do not validate multi-day forecast accuracy.
Import provenance and counts are in `public/data/california-sandbox/long-beach-experiment.json`.
The 30 and 75 bands are experimental display bands, not independently validated
severity or probability boundaries.

Run `node scripts/test-sandbox-neptune-index.mjs` for normalization and loader checks.

### Edit “How Neptune Works” locally

Open `/sandbox/how-it-works` on localhost, click **Edit text**, edit the outlined
headings/paragraphs directly, then click **Save changes**. **Cancel** restores the
last saved draft; **Done editing** previews the page. FAQ answers open in edit mode.
Risk legend values and diagrams remain generated by the page.

Draft text is saved to `content/local-drafts/how-neptune-works.json`, with each
field’s original text and replacement. This is a local draft, not a deployment.
The write endpoint is development-only, accepts same-origin localhost requests,
and rejects stale saves from other tabs. Production neither reads these drafts
nor exposes editing controls or a working save endpoint.

When publishing is explicitly requested, apply the saved replacements to the
current production page source and review the original-text matches; do not
publish the local editor or unrelated sandbox experiments. Keep the draft until
its changes have been applied and verified on the live page.

Verify save isolation with `node scripts/test-local-page-editor.mjs`.

The same local editor is available on `/sandbox/stories` (**Why It Matters**)
and `/sandbox/team` (**Meet the Team**). Each page uses its own draft file:
`why-it-matters.json` and `meet-the-team.json` in `content/local-drafts/`.
Text labels can be edited in place; link destinations and photos stay unchanged.
The same explicit deployment requirement applies to all three pages.

### Beach requests

The on-site form lives at `/california/request-beach` (preview: `/sandbox/request-beach`).
Apply its additive database schema with `node scripts/apply-beach-requests-schema.mjs` before deployment.
Submissions store email, message, source, and creation time in `beach_requests`; sandbox requests are tagged separately.
To export live requests privately: `node scripts/export-beach-requests.mjs /absolute/path/beach-requests.csv`.
The export excludes sandbox records and refuses to overwrite an existing file. Requests are not marketing subscriptions.
Run `node scripts/test-beach-requests.mjs` for storage and endpoint validation.
