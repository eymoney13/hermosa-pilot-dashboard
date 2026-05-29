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
