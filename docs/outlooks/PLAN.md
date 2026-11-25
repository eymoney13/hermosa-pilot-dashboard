# Water Quality Outlooks: LA and Orange County audit and plan

Status: **Plan approved 2026-11-24 with decisions D1–D9 below. Phase 1 (pipeline) is implemented on project-neptune branch `feature/water-quality-outlooks`. It is not pushed and is off by default.** Audit date: 2026-11-24. Dashboard branch: `feature/addmoreCAbeaches`.

## Approved decisions (2026-11-24)

| # | Decision | How it is implemented |
|---|---|---|
| D1 | **Keep all 19 public forecasts.** 3 are labelled Strong (DHS113, SMB-3-5, SMB-3-6) and 3 Fair (DHS115, SMB-2-10, Huntington State Beach `0`). The other 13 are **grandfathered** forecasts, shown with an asterisk. 12 of those are grandfathered because they have too few exceedances: *"Additional exceedance observations are needed to fully assess forecast reliability."* One, SMB-2-13, is grandfathered because it falls below the requirements: its metrics exist but don't reach Fair. | Labels live in `config/forecast_classification.csv`. They are validated against `beach_performance.csv` and the tiers in `config/forecast_reliability.json`, so the build fails if a label claims more than the metrics show or if a grandfather reason doesn't match. Metrics stay in `beach_performance.csv` and labels stay in config, so the two are kept apart. |
| D2 | **One pin per distinct beach.** Each station's ID, measurements and predictions stay visible inside the beach. Predictions are never averaged across stations. Pins that hold several stations are marked as such. A beach containing any forecast station leads with its forecast. | `config/station_sites.csv` (`site_id`) feeds into the registry. The pin and detail-view behaviour is built in Phase 3. |
| D3 | **Show historical lab results on outlooks.** Each result shows the collection date, MPN/100 mL, the 104 MPN standard, and whether it exceeded the standard. Results sit in their own section, apart from today's conditions, and never read as today. | `outputs/lab_history.csv`: last 2 years, values as the lab reported them (`<10`, `>24,196`), and an `exceeds_standard` column. |
| D4 | **Advisories: link only.** Show prominent links to the LA County and OC official advisory pages, and state that Neptune does not ingest live closure or advisory data. Never show "Open" or "No advisory". Researching an advisory feed is a separate task. | Phase 3 UI. |
| D5 | **Rain uses existing daily data, with calendar-day wording.** Use "today (forecast)", "past 3 days", "4–7 days ago" and "past 30 days". No new hourly requests. | `outlook_rules.py`, plus a test that bans "24/48/72" and "hour". |
| D6 | **Inputs excluded:** swell direction (bug), river gauges with substitute coordinates or no defensible link to the beach, and UV (no source). Missing values are never treated as zero. The swell and river issues are logged as separate forecasting tasks. | `config/outlooks.json` `excluded_inputs` and the `river_gauges.allowed` list. Only the Santa Ana River gauge is allowed, and only within 3 km of its mouth: 7 stations (Huntington State Beach 0/3N/6N, Newport Slough, 2 Newport Bay). Tasks are in project-neptune `docs/OUTLOOKS.md`. |
| D7 | **119 stations: 19 forecast and 100 outlook.** County assignments and beach groupings are verified by hand before release. | The draft registry gives 119 stations at **38 distinct beaches** (LA 65 stations / 23 beaches; OC 54 / 15). 10 LA beaches are unnamed SMB stations that need names, and every row is `verified=false` until checked. |
| D8 | **Forecast and outlook stay distinct.** Forecast beaches keep everything they have now. Outlook beaches show a headline, measurements, lab history and a notify CTA, with no risk classification. | Phases 2–3. The outlook data files contain no prediction columns; this is enforced in code and tests. |
| D9 | **Open-Meteo licensing:** verify it and report back. Nothing is purchased. | See "Open-Meteo licensing (D9)" below. **Follow-up decision (2026-11-25): stay on the free tier for this experiment; no upgrade.** |
| D10 | **(2026-11-25) Sunlight and surf are factors, not headlines.** "Multiple environmental influences" now means rain together with an elevated river. | `FACTOR_ONLY` in `outlook_rules.py`; tested. |

## Open-Meteo licensing (D9), checked 2026-11-24

Sources: open-meteo.com/en/terms, /en/pricing, /en/licence.

**Our current production use already breaks the free terms.**
- The terms say the free API is for non-commercial use only.
- They list as commercial: *"Websites or apps that have subscriptions or display advertisements."*
- Neptune sells Pro at $2/month, so this applies today, outlooks or not.

**Plan fit**
- Paid plans use `customer-api.open-meteo.com` with an `apikey`; the request syntax is otherwise identical.
- **Standard** (1M calls/month) **excludes the Historical Forecast API**, which `daily_refresh.py` step 3 uses.
- **Professional** (5M calls/month) includes it.
- **Professional is the smallest plan that covers today's pipeline unchanged.** An alternative is Standard plus moving step 3 to the Forecast API with `past_days`, which is in Standard; that needs testing.
- Prices did not appear in the page text we could read. Confirm them on the pricing page before deciding. **Nothing has been purchased.**

**Volume**
- Calls are counted with a multiplier: requests over 14 days or over 10 variables count as multiple calls.
- Today's 2 × ~230 daily requests come to roughly 1,100–1,800 counted calls a day, or about 34k–54k a month. That is well within either paid tier.
- Outlooks add **no** Open-Meteo calls.

**Attribution (CC BY 4.0)**
- Required on any paid or free plan: the text "Weather data by Open-Meteo.com" with a link, next to wherever the data is displayed.
- **The live site doesn't show this today.** Outlook pages will add it, and existing forecast pages should too.

**Rate limits**
- Open-Meteo already soft-throttles the forecast step (see the `daily-full-run.yml` timeout notes).
- Paid plans have no per-minute, per-hour or per-day limits, which would also shorten the 40-minute job.
Repos: `hermosa-pilot-dashboard` (Next.js 16 frontend) and `project-neptune` (Python modeling pipeline).
The full station list is in `docs/outlooks/laoc_stations.csv`.

---

## 1. Existing architecture

### Pipeline (project-neptune)

1. A Vercel cron (`0 11 * * *`) calls `app/api/trigger/route.ts`.
2. That dispatches two GitHub Actions in project-neptune. Both run `scripts/daily_refresh.py`.

| Workflow | Stations | What it does |
|---|---|---|
| `daily-full-run.yml` | **All 230** | Fetches lab samples, weather, tide, waves and river flow, then runs the nowcast and the 3-day forecast. It commits `outputs/` to project-neptune and **publishes nothing to the dashboard.** |
| `daily-refresh-southbay.yml` | 28 (`BEACH_FILTER`) | Runs the same steps for 28 stations, then copies `nowcast_latest.csv`, `forecast_3day.csv`, `thresholds.csv`, `history_3day.csv` and `accuracy.csv` into `public/data/southbay/` here. |

Data sources:

| Source | Used for |
|---|---|
| CEDEN / CA Safe to Swim (data.ca.gov CKAN) | Enterococcus lab samples |
| Open-Meteo | Rain, air temperature, wind, solar radiation |
| NOAA CO-OPS | Tide predictions |
| CDIP buoys | Waves and water temperature |
| USGS NWIS | River flow, from **6 gauges only** |

The station master is `data/processed/beach_config.csv`: 230 rows with code, name, lat/lon, nearest tide station, nearest buoy, and beach angle. **There is no county, region or agency column.**

### Frontend (this repo)

**Data and coverage**
- `/california` renders `components/sandbox/SandboxDashboard.tsx`. It has map, list and news views.
- Clicking a beach swaps in `SandboxBeachDetail` as client state. **There are no per-beach URLs.**
- Coverage passes two filters:
  - `LOCATIONS.southbay.stations` in `lib/data.ts`
  - `lib/californiaCoverage.ts`, which holds the 19 public codes. This filter is applied in `loadData.ts:598,608`.
- `loadDashboardData` drops any station without a nowcast row or `exc_probability` (`loadData.ts:452,477`), so an environment-only beach disappears today.
- `BeachData` assumes probability and status throughout: map pins, list bands, hero, alerts, analytics and accuracy.

**Map and display**
- Map: Leaflet with react-leaflet. Pins are `divIcon`s colored red, yellow or green.
- It has no clustering, no legend, no region filter and no search.
- Advisories are static links to LA County DPH and ocbeachinfo.com. **No closure or advisory data is ingested anywhere, in either repo.**

**"Confidence" percentage**
- No confidence metric exists. What shows is "Past prediction accuracy: N%" (`computeAccuracy`, `lib/data.ts:807`).
- It is the share of past lab samples where (probability ≥ 0.50) matched (MPN > 104).
- This is raw agreement, so the base rate inflates it: a beach that is clean 90% of the time scores about 90% by always predicting Low.
- It is not a probability that today's prediction is correct.

**Accounts and alerts**
- Accounts: Clerk is optional, and free readers are anonymous. There are no favorites.
  - Free users verify an email and follow one beach for alerts.
  - Pro users follow many (`set_california_pro_alerts`).
- Alerts: `alert_subscribers` and related tables in Neon. They are sent through Resend from updates@alerts.projectneptune.co, with unsubscribe tokens and a mail guard outside production.
- There is an existing `beach_requests` table behind `/california/request-beach`.

**Analytics and flags**
- PostHog: initialized in `instrumentation-client.ts`, with props from `lib/analytics.ts` (`beachProperties`).
  - These events already exist: `beach_viewed`, `pro_cta_clicked`, `checkout_started`, `locked_feature_clicked`, `alert_signup_completed`, `map_interacted` and `dashboard_view_selected`.
- Feature flags: static per-location flags in `lib/features.ts`, plus server env gates (`NEPTUNE_*`). There are no runtime flags.
- Tests: `scripts/test-*.mjs`, which run TypeScript in a vm with PGlite. CI runs `checks.yml`, which covers lint, tsc and all tests.

## 2. California monitoring locations

**230** stations are in the modeling pipeline (`beach_config.csv`). They are the CEDEN stations that pass the MVP filter: at least 100 samples, at least 3 years of data, at least 20 samples a year, and a 5–50% exceedance rate. CEDEN itself has more LA and OC stations that never passed that filter.

## 3–4. LA County and Orange County counts

County is derived as follows:
1. Use the CEDEN name suffix (", Orange", ", Los Angeles", "Long Beach City").
2. If there is no suffix, use a coastline cut: the LA/OC line at the San Gabriel River mouth (lon −118.105) and the OC/SD line at San Mateo Point (lat 33.387).
3. The suffix overrides the coordinates. This fixes 3 Seal Beach stations whose coordinates sit on the LA side.
4. No stations are on Catalina.

| | Stations | Public forecasts today | Proposed new outlooks |
|---|---|---|---|
| **Los Angeles County** | **65** | 15 | 50 |
| **Orange County** | **54** | 4 | 50 |
| **Total** | **119** | **19** | **100** |

**Caveat on duplicates.** Several "stations" are 0–135 m apart at the same beach. Examples:
- The OC "Point Zero" triplets: `SJC1Z/U/D`, `ACM1Z/U/D`, `POCHEZ/D`
- `BGCD`/`BGCU`, which are 0 m apart
- `BDP12/13/14`
- The `DHS104`/`DHS104B`-style pairs

Putting all 119 on the map as separate pins would read as duplicates. I recommend grouping stations into **beach sites**: one pin per site, with the individual stations listed in its detail view. That needs a hand-checked grouping table (decision D2).

## 5. Proposed rollout list

All 119 stations are in `docs/outlooks/laoc_stations.csv` and in the appendix below.

## 6. Public forecasts by county, with proposed screening tiers

| | Strong (AUC ≥ .85, sens ≥ 80%, spec ≥ 85%) | Fair (≥ .75 / 70% / 80%) | Meets neither | No AUC (fewer than 10 exceedances in holdout) |
|---|---|---|---|---|
| LA (15) | DHS113, SMB-3-5, SMB-3-6 | DHS115, SMB-2-10 | SMB-2-13 | DPH 002B, DHS103, DHS104, DPH 122, SMB-2-11, DHS112B, DHS114, DHS116, SMB-7-9 |
| OC (4) | — | `0` Huntington State Beach | — | OSB04, BNB05, DSB4Z |

**13 of the 19 public forecasts do not meet either proposed tier.** Nearly all of them only lack enough exceedances to compute AUC. Per the brief, they are reported here and not demoted (decision D1).

Five proposed outlook stations already meet the Fair screen: SMB-2-7, SMB-3-8, SMB-2-4 and SMB-1-16 in LA, and S-3 (Doheny) in OC. They are candidates for future promotion, but they stay outlooks in this release.

Correction to my earlier tier list: Surfers Point (13000), Goleta (WP0000037) and Pismo (PB5) are in the 28-station data feed but **are not publicly shown**. Only the 19 above are.

How the metrics were made (`scripts/analyze_beach_performance.py`, run by hand):
- Temporal holdout: trained before 2024-01-01, tested on 2024 onward, with threshold 0.50.
- AUC is only computed with at least 10 exceedances and at least 10 clean samples.
- These are reasonable screening numbers but small-sample. Many stations have only 10–20 holdout exceedances.

## 7. Environmental data sufficiency

The full run on 2026-11-24 covered 117 of 119 LA/OC stations, with all 9 condition fields present.
- `B-64` and `CLEOz` were missing weather today. This looks like a transient Open-Meteo failure.
- Every LA/OC station has a lab sample within the past year, and 117 have one within the past 60 days.

**Expected eligible: 119**, with per-day gaps handled as "partial" or "unavailable".

## 8. Variables available for outlooks

The model has 112 features. They come from about 10 underlying measurements, plus lags and derived terms.

| Factor | Available | Notes |
|---|---|---|
| Rain: today, prior 1–7 days, prior 14 and 30 days | ✅ | **Daily calendar sums, not rolling 24/48/72 h.** Copy should say "today", "past 3 days" and "past 30 days". |
| Air temperature (max, min, mean) | ✅ | |
| Solar radiation (shortwave sum, MJ/m²) | ✅ | **No UV index.** Use "sunlight", not "UV". |
| Wind speed, gust, direction, plus onshore/alongshore components | ✅ | |
| Tide: range, high/low, spring tide, hours since high | ✅ | NOAA predictions, not observations |
| Wave height and period | ✅ | CDIP; 2 LA/OC buoys |
| **Swell direction** | ❌ | `MWD_mean`/`owave`/`awave` are hard-coded to NaN→0 at inference (`generate_nowcast.py:447-451`). This also affects the production model. It is reported here and not changed. |
| Water temperature | ✅ | From the CDIP buoy, not satellite |
| River discharge | ⚠️ | Only 6 USGS gauges. **Two have deliberately fake coordinates** (San Gabriel placed at Ballona, Santa Paula Creek placed at Malibu), and no USGS gauge serves the LA coast. Do not show river discharge for LA/OC until it is fixed. |
| Storm drains, river mouths, permitted discharges | ❌ | No California dataset. Only implied by names (Point Zero = drain/creek outlet, "Pico Kenter Outfall"). |
| Ocean currents | ❌ | |
| Season, moon | ✅ | |
| Bacteria history (lab samples since 2010) | ✅ | `FIB_clean.csv`. Not yet published to the dashboard beyond the last result. |
| **Official advisories and closures** | ❌ | See risk R1 |

## 9. Outlook methodology (deterministic, no LLM, no predictions)

**Inputs.** Use raw, measured values from the full run, with age stamps. Never use model probabilities or SHAP.

**Rules.** Each factor gets a rule that turns a measurement into a *condition*, not a risk:

| Rule | Trigger | Basis |
|---|---|---|
| Post-storm conditions | Rain in the past 3 days ≥ 0.1 in (2.54 mm) | Matches the LA County DPH rain-advisory convention (avoid contact for 72 h after ≥ 0.1 in). Well documented in the SoCal FIB literature. |
| Recent rainfall influence | Rain 4–7 days ago ≥ 0.1 in, and the past 3 days are dry | |
| Elevated runoff potential | Rain today ≥ 0.1 in | Optionally weighted by the 30-day antecedent total. First-flush effect early in the wet season. |
| Dry weather pattern | Less than 0.01 in over 7 days, with weather data fresh | |
| Reduced sunlight exposure | Solar radiation below the station's monthly 25th percentile | Sunlight inactivates enterococci. Percentiles come from that station's own history, so this is location- and season-aware. |
| Spring tide / large tidal range | `tide_spring` or range above the station's 75th percentile | e.g. Boehm & Weisberg 2005 on spring tides and FIB at Huntington Beach |
| Elevated surf | Wave height above the station's 75th percentile | Sediment resuspension; the direction of the effect varies by site |
| Multiple environmental influences | 3 or more rules fire | |
| Typical seasonal conditions | Nothing fires and data is fresh | |
| Environmental data unavailable | Key inputs are stale or missing | |

**Headline.** Rules have a fixed priority, and the highest firing rule sets the headline.

**Influences.** Show 3–5 factors, ranked by priority and then by how far today's value sits from that station's normal.

**Explanation.** Template sentences filled with real numbers and units. A number is never invented: a missing value removes its sentence.

**Location dependence.** Thresholds are station percentiles, not universal cutoffs. Optionally, an offline per-station "rain sensitivity" profile (dry vs wet exceedance rate from history) could be used **only to rank** which factors to mention. It would never be displayed as a rate or risk.

**Freshness.** Each factor has a maximum age (weather and tide 1 day, waves 3 days, already in `env_conditions_region.py`).
- Stale or missing values are labeled and never treated as 0.
- If rain is unavailable, "Dry weather pattern" cannot fire.

**Limitations.** Outlooks describe conditions, not bacteria. Dry-weather contamination (birds, sewage spills, harbors) is invisible to these inputs, and the copy must say so. Rules can be tuned per county later through configuration.

## 10. Required changes

### project-neptune

**Station registry.** Add `data/processed/station_registry.csv`, with one row per station:
- `county`, `region`, `site_id` (beach-site grouping), `display_name`
- `classification`: `forecast`, `outlook` or `hidden`

The county column is derived once, then hand-checked.

**Raw inputs.** Have `generate_nowcast.py` also write `outputs/outlook_inputs.csv`: raw features plus `_age_*` columns per station, written *before* NaN→0 filling. This is about 2 lines, and the model behavior is unchanged.

**Outlook generator.** Add `scripts/generate_outlook.py`, which writes the rule engine output to `outputs/outlook_latest.csv`. Columns:
- `StationCode`, `site_id`, `headline_key`, `headline`, `explanation`
- `influence_1..5` (key, label, value, unit, age)
- `data_status`, `generated_at`, `inputs_as_of`

It will have Python tests. **This file contains no prediction columns by construction.**

**Lab history.** Add `outputs/lab_history.csv` for released stations: the last 2 years of samples (date, MPN, qualifier).

**Publishing.** Add a step at the end of `daily-full-run.yml` that copies `outlook_latest.csv`, `lab_history.csv` and the registry to `public/data/california/` in the dashboard, for released counties only, using the existing `DASHBOARD_PAT`. No new external API calls.

### Dashboard

**Data layer**
- Replace `californiaCoverage.ts` with `lib/coverage.ts`, which reads the registry plus `RELEASED_OUTLOOK_COUNTIES` config.
- Change `Beach` to a discriminated union: `ForecastBeach` keeps today's fields; `OutlookBeach` has **no** probability, status, index or forecast fields.
  - The type system then makes it impossible to render a risk on an outlook.
  - A runtime test also asserts no prediction keys reach the client for outlook beaches.
- Keep the outlook loader separate. The existing forecast loader stays unchanged.
- Gate everything behind `NEPTUNE_OUTLOOKS_ENABLED`: on in Development and Preview, off in Production until approved.

**Map, list and detail**
- Map: outlined blue pins for outlooks, smaller than forecast pins, at a lower z-index.
- Add a legend and an All / Forecasts / Outlooks filter.
- Add clustering or density handling for about 119 pins. Options are `leaflet.markercluster` or the existing label-collision layer plus zoom-based dots.
- List: add a classification filter and a county grouping (already partly there).
- Detail (`OutlookDetail`): show everything in brief §9, including the "Bacteria Forecasting – not yet available" block with the notify CTA, the disclaimer, and nearby forecast beaches.
- Forecast beaches gain an "Environmental outlook" section.

**Forecast launch notifications**
- Add a `forecast_launch_requests` table:
  - `station_code`, `site_id`, `email_normalized`, `clerk_user_id`, `created_at`, `confirmed_at`, `unsubscribe_token`, `unsubscribed_at`
  - Unique on (site, email)
- Use double opt-in through the existing Resend path, and an unsubscribe route modeled on `alertUnsubscribe`.
- Signed-in users get one-click subscribe.
- Add a `forecast_demand` SQL view (requests per site), plus PostHog.

**Per-beach pages and sitemap**
- Add `/california/beaches/[site]` pages, with metadata, canonical URLs and sitemap entries.
- Pages are only generated for sites with data. Read the `node_modules/next/dist/docs` routing and metadata guides first.

**Analytics**
- Extend `beachProperties` with `beach_classification`, `county`, `forecast_available`, `auth_status` and `subscription_status`.
- Add new events:
  - `outlook_viewed`, `forecast_viewed`
  - `forecast_launch_notification_signup`
  - `outlook_details_expanded`, `forecast_reliability_viewed`
  - `nearby_forecast_beach_clicked`
- Reuse existing events instead of duplicating them:
  - `beach_viewed`
  - `pro_cta_clicked`
  - `checkout_started` as the "subscription_started"
  - `alert_signup_completed` as the closest "beach_saved"
- `forecast_requested` would duplicate the signup event (D7).

**Messaging**
- Coverage counts are computed from the registry at render time, never hardcoded.

**Unchanged:** forecasting models, thresholds, nowcast and forecast CSVs, Stripe, Pro entitlements, alert sending, and the accuracy calculation.

## 11. Phases

Each phase is its own PR to a feature branch and is verified on a Vercel Preview (Neon preview branch, mail guard on). Nothing merges to `main` without your approval.

| # | Phase | Repo | Exit check |
|---|---|---|---|
| 0 | Decisions D1–D9 signed off; county and site grouping hand-checked | both | Registry CSV reviewed |
| 1 | `outlook_inputs`, rule engine, `outlook_latest.csv`, `lab_history.csv`, tests. Publish to a **non-production path** only. | project-neptune | Rules produce correct headlines on historical storm and dry days (backtest) |
| 2 | Coverage registry, discriminated `Beach` type, outlook loader, flag, leak tests | dashboard | No prediction field reachable for an outlook (tests) |
| 3 | Map markers, legend, filter, clustering, list, outlook detail page | dashboard | Desktop and mobile review on Preview |
| 4 | Forecast launch notifications: DB, opt-in, unsubscribe, demand view | dashboard | End-to-end on Preview into the test inbox |
| 5 | Per-beach pages, metadata, sitemap | dashboard | Lighthouse and SEO check; no thin pages |
| 6 | Analytics events and a PostHog dashboard (LA vs OC, retention, request rate, Pro conversion) | dashboard | Events visible from Preview with the internal flag |
| 7 | Messaging and coverage stats; optional reliability labels, after D4 | dashboard | Copy review |
| 8 | Production launch: flip the flag, wire publishing to the production path | both | Your approval |

### Phase 1 results (2026-11-24): pipeline, project-neptune `feature/water-quality-outlooks`

**Built.** All of it is off unless the repo variable `NEPTUNE_OUTLOOKS_ENABLED=true`. Details are in project-neptune `docs/OUTLOOKS.md`.
- Station registry with county, beach grouping, classification and validated reliability labels.
- Rule engine `outlook_rules.py`.
- `generate_outlook.py`, which writes `outlook_latest.csv` and `lab_history.csv`.
- Per-station monthly climatology, built from about 200k historical sampling days.
- An opt-in raw-input dump in `generate_nowcast.py`.
- Gated workflow steps that upload the files as a run artifact. **Nothing is published to the dashboard.**

**Tested.**
- 30 unit tests, all passing; the existing suite passes too.
- Missing ≠ zero, stale data, guarded wording, prediction-column guard, lab-value restoration, label-vs-metric validation, county overrides, and nowcast isolation.
- A 2015–2026 backtest on LA/OC days. Rain headlines line up with lab exceedances: rain today 49.6%, post-storm 27.1%, dry 7.5%, against a 13.0% baseline. An early version filed storm days under "Multiple"; that was fixed.
- An end-to-end smoke run on historical inputs. It caught one bug, where fresh feeds with empty values were reported as complete; that was fixed.

**Live run (2026-11-25, project-neptune run 45527340011).** This was a branch run with `outlooks=true`. The repo variable is still unset, and the commit/publish step was skipped, so production was untouched. It took about 20 minutes.
- 119 outlooks: 118 complete. 1 (OSB05) has no weather and shows "Environmental data unavailable".
- Headlines: 45 recent rain, 38 large tide (king-tide period, ~8.5 ft range), 17 post-storm, 11 typical, 7 multiple.
- **Bug found and fixed.** Santa Ana River showed as "High" at 0–1 cfs because the pipeline's flow flags use a 60-day window. Outlooks now compare measured cfs to a long-run threshold (117 cfs, the 2010–2026 p95). The window issue is logged as a forecasting task; production is unchanged.
- **Checked, not a bug.** Buoys read about 23 °C (73 °F) water. CDIP's raw feed confirms it: 22.6–22.8 °C on Nov 23, against 17.9 °C a year earlier.
- **Test count:** 31 tests, all passing.

### Phase 2 results (2026-11-25): dashboard data layer, branch `feature/addmoreCAbeaches`

**Built**
- `lib/outlooks/types.ts`: separate `ForecastStation` and `OutlookStation` types. `OutlookStation` has no field that could hold a probability, risk, colour or forecast (`beach?: never`). Also `BeachSite`, one pin per beach.
- `lib/outlooks/parse.ts`: a pure parser that builds every object from an allow-list of fields.
  - It drops unreleased stations and drops forecasts with an invalid label.
  - A beach with a forecast station leads with it (D2).
  - It keeps the 12 newest lab results per station and computes freshness (stale after 36 h).
  - `assertNoPredictionFields` runs on every outlook station; if it trips, the loader returns null.
- `lib/outlooks/load.ts`: a server-only loader that returns null unless `NEPTUNE_OUTLOOKS_ENABLED === "true"`. It never throws into the page.
- `data/outlooks/`: outside `public/`, so the files can't be downloaded from the site. It holds a review copy of the 2026-11-25 live run, written by project-neptune `scripts/publish_outlooks.py`, which refuses to write any unreleased station.
- **No existing page, loader, alert or Pro code was changed.** The live site is unaffected even if this were merged.

**Tested** (`scripts/test-outlooks.mjs`, 17 checks; all other suites still pass)
- Real data: 119 stations, 19 forecast and 100 outlook, at 38 beaches.
- The forecast set matches `californiaCoverage.ts` exactly.
- Only LA and Orange County are released.
- No outlook station carries a prediction-shaped key.
- Newport Bay leads with BNB05.
- D1 labels are correct, station "0" survives, and freshness is computed correctly.
- With the flag off, no file is even read.
- Missing files return null.
- Injected `exc_probability`, `prediction` and `top_factor` columns, and a `probability` key inside the influences JSON, are all stripped.
- A forecast missing today stays a forecast.

**Not done yet (Phase 3)**
- Wiring into `/california`.
- Setting the flag on the branch Preview.
- `outputFileTracingIncludes` for `data/outlooks`.
- A daily publish step from the pipeline.

## 12. Risks and decisions

### Risks

**R1: No advisory or closure data.**
- Acceptance criterion 9 ("advisories take precedence") can't be met by data today. The options are:
  - (a) Keep prominent official links per county (current state).
  - (b) Research an ingestible feed: LA County DPH beach closures, ocbeachinfo.com closures, or Beach Watch postings. These need research and may require scraping.
- Recommendation: do (a) for launch and research (b) in parallel.

**R2: Data accuracy issues.** Several inputs can't support honest copy yet:
- River discharge uses mislocated gauges.
- Swell direction is always 0.
- There is no UV index, and rain comes as calendar days.
- Mitigation: don't show river or swell, and word copy accurately. Fixing the swell-direction bug is a forecasting-model change and needs separate approval.

**R3: Marketing claim.**
- "100+ variables" is true of model features (112), but they are lags and derivatives of about 10 measurements.
- Suggest "dozens of oceanic and atmospheric measurements" or "112 model inputs". (D8)

**R4: Open-Meteo licensing (verify).**
- The free Open-Meteo API is licensed for non-commercial use, and Neptune sells Pro.
- This exists today. Outlooks don't add calls, but they make the dependency more visible.
- A commercial plan starts around tens of €/month. Confirm the current terms and pricing.

**R5: Timing.**
- The full run and the southbay run are dispatched 30 s apart.
- Outlooks published by the full run land on their own schedule. Data freshness stamps make that visible.

**R6: Map density.** 119 pins in about 100 km needs clustering or grouping, or the map becomes unreadable on mobile.

**R7: The 13 public forecasts without a tier** (D1, D4).

### Still open (not blocking Phase 2)

| # | Question |
|---|---|
| O1 | Replace "Past prediction accuracy %" with Strong / Fair / grandfathered labels. Needs the methodology review first; the current display stays until then. |
| O2 | Anonymous notify flow: double opt-in by link (recommended) vs the existing 6-digit-code flow |
| O3 | Analytics names: reuse `checkout_started` / `alert_signup_completed` instead of the new `subscription_started` / `beach_saved` |
| O4 | Public "variables" claim wording (R3) |
| O5 | Map density: `leaflet.markercluster` vs extending the label layer. 38 pins instead of 119 makes this much less pressing. |
| O7 | Split the two 15-station groupings (Long Beach City Beach, Newport Bay) into sub-beaches during the hand check? |

## 13. Additional costs

| Item | Expected cost |
|---|---|
| External API calls | None new. The full run already fetches all 230 stations. |
| GitHub Actions | About 1 extra minute a day |
| Vercel | About 120 more pages and a few hundred KB of CSV. Negligible. |
| Neon | One small table. Negligible. |
| GitHub Actions minutes | project-neptune is private, with a 2,000 min/month free quota. The full run (~40 min/day) plus the southbay run already use most of it. Outlooks add about 1 min/day. |
| Resend | Opt-in and launch emails. Free tier (3k/month) is likely enough at first; Pro at $20/month if it grows. |
| Open-Meteo commercial plan (D9) | **Required already**, because the site sells subscriptions. Professional is the smallest plan covering the Historical Forecast API; confirm the price. |
| Advisory feed | Unknown until R1 research |
| New npm dependency | Possibly `leaflet.markercluster` (free) |

## 14. Statewide expansion

- All 230 stations go into the registry from day one, with county, site and classification. Expanding a county means adding it to `RELEASED_OUTLOOK_COUNTIES` and hand-checking its site grouping.
- Per-county config holds the advisory link and agency name.
- Known gaps outside SoCal:
  - Santa Cruz buoy 185 has been dead since 2023, so there are no waves there.
  - Buoy 157 stations are also missing waves.
  - Station names need display-name cleanup.
- Promotion from outlook to forecast is a registry change from `outlook` to `forecast`, after approval. The UI is already built for both.

---

## Appendix: LA and OC stations

Screening tiers come from `outputs/beach_performance.csv`. "No-AUC" means fewer than 10 holdout exceedances. Env data covers the 9 condition fields in the 2026-11-24 full run.

#### Public Forecasts

| County | Code | Name | Screening tier | AUC | Sens | Spec | Last lab sample | Env data today |
|---|---|---|---|---|---|---|---|---|
| LA | `DPH 002B` | DPH 002B | no-AUC | — | 0.75 | 0.89 | 2026-10-20 | 9/9 |
| LA | `DHS103` | DHS103-Will Rogers State Beach, Los Angeles | no-AUC | — | 0.75 | 0.91 | 2026-10-19 | 9/9 |
| LA | `DHS104` | DHS104-Santa Monica State Beach, Los Angeles | no-AUC | — | 0.71 | 0.94 | 2026-10-19 | 9/9 |
| LA | `SMB-3-5` | SMB-3-5 | Strong | 0.96 | 0.94 | 0.85 | 2026-10-28 | 9/9 |
| LA | `SMB-3-6` | SMB-3-6 | Strong | 0.90 | 0.91 | 0.89 | 2026-10-27 | 9/9 |
| LA | `DPH 122` | DPH 122 | no-AUC | — | 0.83 | 0.93 | 2026-10-19 | 9/9 |
| LA | `SMB-2-10` | SMB-2-10 | Fair | 0.90 | 0.75 | 0.84 | 2026-10-27 | 9/9 |
| LA | `SMB-2-11` | SMB-2-11 | no-AUC | — | 0.44 | 0.87 | 2026-10-27 | 9/9 |
| LA | `SMB-2-13` | SMB-2-13 | below | 0.87 | 0.64 | 0.85 | 2026-10-27 | 9/9 |
| LA | `DHS112B` | DHS112B-Dockweiler State Beach, Los Angeles | no-AUC | — | 0.00 | 0.93 | 2026-10-19 | 9/9 |
| LA | `DHS113` | DHS113-Manhattan Beach, Los Angeles | Strong | 0.95 | 0.86 | 0.89 | 2026-10-28 | 9/9 |
| LA | `DHS114` | DHS114-Hermosa Beach, Los Angeles | no-AUC | — | 1.00 | 0.94 | 2026-10-19 | 9/9 |
| LA | `DHS115` | DHS115-Hermosa Beach, Los Angeles | Fair | 0.91 | 0.87 | 0.85 | 2026-10-28 | 9/9 |
| LA | `DHS116` | DHS116-Redondo Beach, Los Angeles | no-AUC | — | 0.00 | 0.93 | 2026-10-19 | 9/9 |
| LA | `SMB-7-9` | SMB-7-9 | no-AUC | — | 0.80 | 0.91 | 2026-10-27 | 9/9 |
| OC | `OSB04` | OSB04-Seal Beach Surfside, Orange | no-AUC | — | 0.80 | 0.91 | 2026-10-20 | 9/9 |
| OC | `0` | 0-Huntington State Beach, Orange | Fair | 0.94 | 0.75 | 0.87 | 2026-10-21 | 9/9 |
| OC | `BNB05` | BNB05-Newport Bay, Orange | no-AUC | — | 1.00 | 0.96 | 2026-10-19 | 9/9 |
| OC | `DSB4Z` | Doheny State Beach Drain 4 Point Zero | no-AUC | — | 0.71 | 0.86 | 2026-10-20 | 9/9 |

#### Proposed Outlooks

| County | Code | Name | Screening tier | AUC | Sens | Spec | Last lab sample | Env data today |
|---|---|---|---|---|---|---|---|---|
| LA | `SMB-1-18` | SMB-1-18 | below | 0.72 | 0.79 | 0.45 | 2026-10-28 | 9/9 |
| LA | `SMB-1-13` | SMB-1-13 | below | 0.77 | 0.70 | 0.72 | 2026-10-27 | 9/9 |
| LA | `DHS102` | DHS102-Will Rogers State Beach, Los Angeles | below | 0.76 | 0.58 | 0.85 | 2026-10-19 | 9/9 |
| LA | `SMB-2-4` | SMB-2-4 | Fair | 0.88 | 0.74 | 0.80 | 2026-10-27 | 9/9 |
| LA | `SMB-1-14` | SMB-1-14 | below | 0.72 | 0.43 | 0.67 | 2026-10-27 | 9/9 |
| LA | `SMB-MC-2` | SMB-MC-2 | below | 0.88 | 0.88 | 0.70 | 2026-10-28 | 9/9 |
| LA | `SMB-1-10` | SMB-1-10 | below | 0.75 | 0.70 | 0.64 | 2026-10-20 | 9/9 |
| LA | `SMB-1-12` | SMB-1-12 | below | 0.73 | 0.78 | 0.49 | 2026-10-27 | 9/9 |
| LA | `DHS005` | DHS005-Malibu Beach, Los Angeles | no-AUC | — | 0.17 | 0.88 | 2026-10-13 | 9/9 |
| LA | `SMB-2-7` | SMB-2-7 | Fair | 0.93 | 0.94 | 0.80 | 2026-10-28 | 9/9 |
| LA | `SMB-2-1` | SMB-2-1 | below | 0.57 | 0.71 | 0.38 | 2026-10-21 | 9/9 |
| LA | `SMB-1-8` | SMB-1-8 | below | 0.80 | 0.85 | 0.64 | 2026-10-27 | 9/9 |
| LA | `SMB-1-16` | SMB-1-16 | Fair | 0.84 | 0.79 | 0.82 | 2026-10-06 | 9/9 |
| LA | `DHS006` | DHS006-Malibu Beach, Los Angeles | below | 0.55 | 0.46 | 0.53 | 2026-10-13 | 9/9 |
| LA | `DHS104B` | DHS104B-Santa Monica State Beach, Los Angeles | no-AUC | — | 0.43 | 0.93 | 2026-10-19 | 9/9 |
| LA | `SMB-1-6` | SMB-1-6 | below | 0.71 | 0.64 | 0.70 | 2026-10-20 | 9/9 |
| LA | `DHS105` | DHS105-Santa Monica State Beach, Los Angeles | no-AUC | — | 0.56 | 0.90 | 2026-10-19 | 9/9 |
| LA | `DHS105B` | DHS105B-Santa Monica State Beach, Los Angeles | no-AUC | — | 0.50 | 0.89 | 2026-10-19 | 9/9 |
| LA | `SMB-3-3` | Santa Monica Pier | below | 0.70 | 0.92 | 0.32 | 2026-10-28 | 9/9 |
| LA | `SMB-3-4` | Pico Kenter Outfall | below | 0.90 | 0.89 | 0.75 | 2026-10-28 | 9/9 |
| LA | `DHS106` | DHS106-Santa Monica State Beach, Los Angeles | no-AUC | — | 0.67 | 0.92 | 2026-10-19 | 9/9 |
| LA | `DHS107` | DHS107-Venice City Beach, Los Angeles | no-AUC | — | 0.40 | 0.94 | 2026-10-19 | 9/9 |
| LA | `DHS107B` | DHS107B-Venice City Beach, Los Angeles | no-AUC | — | 0.67 | 0.92 | 2026-10-19 | 9/9 |
| LA | `SMB-3-8` | SMB-3-8 | Fair | 0.88 | 0.82 | 0.83 | 2026-10-27 | 9/9 |
| LA | `MDRH-3` | MDRH-3 | below | 0.68 | 0.73 | 0.57 | 2026-10-26 | 9/9 |
| LA | `MDRH-2` | MDRH-2 | below | 0.63 | 0.71 | 0.43 | 2026-10-28 | 9/9 |
| LA | `MDRH-1` | MDRH-1 | below | 0.66 | 0.64 | 0.52 | 2026-10-28 | 9/9 |
| LA | `DHS108` | DHS108-Venice City Beach, Los Angeles | no-AUC | — | 0.00 | 0.93 | 2026-10-19 | 9/9 |
| LA | `DHS109` | DHS109-Venice City Beach, Los Angeles | no-AUC | — | 0.60 | 0.91 | 2026-10-19 | 9/9 |
| LA | `DHS110` | DHS110-Dockweiler State Beach, Los Angeles | no-AUC | — | 1.00 | 0.93 | 2026-10-19 | 9/9 |
| LA | `DHS111` | DHS111-Dockweiler State Beach, Los Angeles | no-AUC | — | 1.00 | 0.95 | 2026-10-19 | 9/9 |
| LA | `DHS112` | DHS112-Dockweiler State Beach, Los Angeles | no-AUC | — | 0.00 | 0.94 | 2026-10-19 | 9/9 |
| LA | `B-25` | B-25-Long Beach, Long Beach City | below | 0.80 | 0.76 | 0.73 | 2026-10-19 | 9/9 |
| LA | `B-24` | B-24-Long Beach, Long Beach City | below | 0.86 | 0.81 | 0.73 | 2026-10-19 | 9/9 |
| LA | `B-5` | B-5-Long Beach, Long Beach City | below | 0.82 | 0.77 | 0.69 | 2026-10-21 | 9/9 |
| LA | `B-56` | B-56-Long Beach, Long Beach City | below | 0.81 | 0.69 | 0.71 | 2026-10-21 | 9/9 |
| LA | `B-60` | B-60-Long Beach, Long Beach City | below | 0.80 | 0.79 | 0.67 | 2026-10-21 | 9/9 |
| LA | `B-22` | B-22-Long Beach, Long Beach City | below | 0.85 | 0.83 | 0.69 | 2026-10-19 | 9/9 |
| LA | `B-7` | B-7-Long Beach, Long Beach City | below | 0.81 | 0.76 | 0.70 | 2026-10-19 | 9/9 |
| LA | `B-67` | B-67-Long Beach, Long Beach City | below | 0.94 | 0.94 | 0.76 | 2026-10-19 | 9/9 |
| LA | `B-8` | B-8-Long Beach, Long Beach City | below | 0.80 | 0.76 | 0.70 | 2026-10-19 | 9/9 |
| LA | `B-9` | B-9-Long Beach, Long Beach City | below | 0.69 | 0.64 | 0.56 | 2026-10-19 | 9/9 |
| LA | `B-64` | B-64-Long Beach, Long Beach City | below | 0.75 | 0.86 | 0.57 | 2026-10-19 | 4/9 (no weather today) |
| LA | `B-14` | B-14-Long Beach, Long Beach City | below | 0.92 | 0.88 | 0.69 | 2026-10-12 | 9/9 |
| LA | `B-31` | B-31-Long Beach, Long Beach City | below | 0.90 | 0.88 | 0.75 | 2026-10-19 | 9/9 |
| LA | `B-10` | B-10-Long Beach, Long Beach City | below | 0.84 | 0.86 | 0.67 | 2026-10-19 | 9/9 |
| LA | `B-11` | B-11-Long Beach, Long Beach City | below | 0.73 | 0.68 | 0.55 | 2026-10-19 | 9/9 |
| LA | `SMB-7-6` | SMB-7-6 | no-AUC | — | 0.38 | 0.88 | 2026-10-27 | 9/9 |
| LA | `CB-01` | CB-01 | below | 0.82 | 0.81 | 0.67 | 2026-10-28 | 9/9 |
| LA | `CB-02` | CB-02 | below | 0.70 | 0.83 | 0.41 | 2026-10-28 | 9/9 |
| OC | `OSB02` | OSB02-Seal Beach Surfside, Orange | no-AUC | — | 0.50 | 0.88 | 2026-10-20 | 9/9 |
| OC | `OSB03` | OSB03-Seal Beach Surfside, Orange | below | 0.89 | 0.64 | 0.87 | 2026-10-20 | 9/9 |
| OC | `OSB05` | OSB05-Seal Beach Surfside, Orange | no-AUC | — | 0.67 | 0.91 | 2026-10-20 | 9/9 |
| OC | `BHH15` | BHH15-Huntington Harbour, Orange | below | 0.70 | 0.57 | 0.70 | 2026-10-20 | 9/9 |
| OC | `MHH14` | MHH14-Huntington Harbour, Orange | no-AUC | — | 0.00 | 0.96 | 2026-10-20 | 9/9 |
| OC | `BHH13` | BHH13-Huntington Harbour, Orange | no-AUC | — | 0.25 | 0.96 | 2026-10-20 | 9/9 |
| OC | `6N` | 6N-Huntington State Beach, Orange | no-AUC | — | 0.62 | 0.90 | 2026-10-21 | 9/9 |
| OC | `3N` | 3N-Huntington State Beach, Orange | below | 0.85 | 0.67 | 0.86 | 2026-10-21 | 9/9 |
| OC | `BNB24E` | BNB24E-Newport Bay, Orange | no-AUC | — | 0.22 | 0.86 | 2026-10-19 | 9/9 |
| OC | `BNS01` | BNS01-Newport Slough, Orange | no-AUC | — | 0.00 | 0.85 | 2026-10-20 | 9/9 |
| OC | `BNS02` | BNS02-Newport Slough, Orange | below | 0.62 | 0.25 | 0.84 | 2026-10-20 | 9/9 |
| OC | `BNB28` | BNB28-Newport Bay, Orange | no-AUC | — | 0.43 | 0.94 | 2026-10-19 | 9/9 |
| OC | `BNB09` | BNB09-Newport Bay, Orange | below | 0.66 | 0.36 | 0.86 | 2026-10-19 | 9/9 |
| OC | `BNB35` | BNB35-Newport Bay, Orange | no-AUC | — | 0.00 | 0.94 | 2026-10-19 | 9/9 |
| OC | `BNB24N` | BNB24N-Newport Bay, Orange | below | 0.64 | 0.50 | 0.77 | 2026-10-19 | 9/9 |
| OC | `BNB12` | BNB12-Newport Bay, Orange | below | 0.55 | 0.30 | 0.88 | 2026-10-19 | 9/9 |
| OC | `BNB24M` | BNB24M-Newport Bay, Orange | below | 0.69 | 0.20 | 0.87 | 2026-10-19 | 9/9 |
| OC | `BNB14` | BNB14-Newport Bay, Orange | no-AUC | — | 0.00 | 0.91 | 2026-10-19 | 9/9 |
| OC | `BNB02` | BNB02-Newport Bay, Orange | no-AUC | — | 0.43 | 0.89 | 2026-10-19 | 9/9 |
| OC | `BNB31` | BNB31-Newport Bay, Orange | no-AUC | — | 0.38 | 0.86 | 2026-10-19 | 9/9 |
| OC | `BNB01` | BNB01-Newport Bay, Orange | no-AUC | — | 0.33 | 0.88 | 2026-10-19 | 9/9 |
| OC | `BNB21` | BNB21-Newport Bay, Orange | below | 0.62 | 0.27 | 0.87 | 2026-10-19 | 9/9 |
| OC | `BNB20` | BNB20-Newport Bay, Orange | below | 0.76 | 0.45 | 0.85 | 2026-10-20 | 9/9 |
| OC | `BNB33` | BNB33-Newport Bay, Orange | below | 0.68 | 0.38 | 0.90 | 2026-10-19 | 9/9 |
| OC | `BGCD` | BGCD-Newport Beach, Orange | below | 0.56 | 0.32 | 0.76 | 2026-10-21 | 9/9 |
| OC | `BGCU` | BGCU-Newport Beach, Orange | no-AUC | — | 0.56 | 0.87 | 2026-10-21 | 9/9 |
| OC | `MDCU` | MDCU-Crystal Cove State Park, Orange | no-AUC | — | 1.00 | 0.82 | 2026-10-21 | 9/9 |
| OC | `CLEOz` | Cleo St. Point Zero | no-AUC | — | 0.50 | 0.96 | 2026-10-19 | 4/9 (no weather today) |
| OC | `ACM1U` | Aliso Creek. 75 ft Upcoast from Point Zero | no-AUC | — | 0.75 | 0.83 | 2026-10-01 | 9/9 |
| OC | `ACM1Z` | Aliso Creek Point Zero | below | 0.73 | 0.50 | 0.79 | 2026-10-20 | 9/9 |
| OC | `ACM1D` | Aliso Creek. 75 ft Downcoast from Point Zero | no-AUC | — | 0.67 | 0.74 | 2026-10-01 | 9/9 |
| OC | `S9` | S9-Aliso County Beach, Orange | no-AUC | — | 0.56 | 0.89 | 2026-10-20 | 9/9 |
| OC | `S8` | S8-Aliso County Beach, Orange | no-AUC | — | 0.50 | 0.91 | 2026-10-20 | 9/9 |
| OC | `SCM1Z` | Salt Creek Mouth Point Zero | below | 0.60 | 0.53 | 0.57 | 2026-10-19 | 9/9 |
| OC | `BDP14` | BDP14-Dana Point Harbor, Orange | no-AUC | — | 0.22 | 0.88 | 2026-10-19 | 9/9 |
| OC | `BDP13` | BDP13-Dana Point Harbor, Orange | no-AUC | — | 0.14 | 0.87 | 2026-10-19 | 9/9 |
| OC | `BDP12` | BDP12-Dana Point Harbor, Orange | below | 0.46 | 0.10 | 0.81 | 2026-10-19 | 9/9 |
| OC | `S-2` | S-2-Doheny State Beach, Orange | below | 0.80 | 0.61 | 0.79 | 2026-10-20 | 9/9 |
| OC | `S-0` | S-0-Doheny State Beach, Orange | below | 0.84 | 0.68 | 0.76 | 2026-10-20 | 9/9 |
| OC | `SJC1Z` | San Juan Creek Point Zero | below | 0.77 | 0.77 | 0.62 | 2026-10-20 | 9/9 |
| OC | `SJC1U` | San Juan Creek 75 ft upcoast from point zero | below | 0.79 | 0.83 | 0.56 | 2026-05-26 | 9/9 |
| OC | `SJC1D` | San Juan Creek. 75 ft Downcoast from Point Zero | below | 0.70 | 0.80 | 0.36 | 2026-05-28 | 9/9 |
| OC | `DSB5Z` | North Beach Creek Point Zero | below | 0.79 | 0.67 | 0.76 | 2026-10-20 | 9/9 |
| OC | `S-1` | S-1-Doheny State Beach, Orange | below | 0.87 | 0.67 | 0.82 | 2026-10-20 | 9/9 |
| OC | `MDP18` | MDP18-Dana Point Harbor, Orange | no-AUC | — | 0.00 | 0.99 | 2026-10-19 | 9/9 |
| OC | `S-3` | S-3-Doheny State Beach, Orange | Fair | 0.89 | 0.70 | 0.88 | 2026-10-20 | 9/9 |
| OC | `POCHEZ` | Poche Beach Point Zero | below | 0.59 | 0.78 | 0.40 | 2026-10-15 | 9/9 |
| OC | `POCHED` | Poche Beach. 75 ft Downcoast from Point Zero | no-AUC | — | 0.50 | 0.87 | 2026-10-01 | 9/9 |
| OC | `PICOZ` | Pico Point Zero | no-AUC | — | 0.29 | 0.89 | 2026-10-06 | 9/9 |
| OC | `PIERZ` | SC Pier Point Zero | no-AUC | — | 0.25 | 0.93 | 2026-10-06 | 9/9 |
