"use client";
import SandboxSupportLinks from "@/components/sandbox/SandboxSupportLinks";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import posthog from "posthog-js";
import Link from "next/link";
import ProLapsedNotice from "./ProLapsedNotice";
import type { AccountState } from "@/lib/subscription";
import { UserButton } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, ChevronRight, List, Map, Waves } from "lucide-react";
import { formatMonthDayYear, orderForList, STATUS_BAND, type BeachData } from "@/lib/data";
import type { NewsItem } from "@/lib/news";
import { beachProperties, type CtaLocation } from "@/lib/analytics";
import ProjectNeptuneLogo from "../ProjectNeptuneLogo";
import OverviewMapClient from "../OverviewMapClient";
import NewsTab from "../NewsTab";
import BeachNeighborNav from "@/components/BeachNeighborNav";
import SandboxBeachDetail, { bandClass } from "./SandboxBeachDetail";
import SandboxProOffer from "./SandboxProOffer";
import ScrollOnboarding from "./ScrollOnboarding";
import TrustWelcome from "./TrustWelcome";
import ForecastComparison from "./ForecastComparison";
import SandboxMenu from "./SandboxMenu";
import CaliforniaAlertSignup, { type CaliforniaAlertSignupHandle } from "@/components/CaliforniaAlertSignup";
import SandboxYourNeptune from "./SandboxYourNeptune";
import s from "./SandboxDashboard.module.css";
import type { OutlookNetwork, BeachSite, ForecastStation, OutlookStation, SiteStation } from "@/lib/outlooks/types";
import type { OutlookPin } from "../OverviewMap";
import OutlookDetail from "../outlooks/OutlookDetail";
import { DataAttribution, InfluenceList, OutlookPanel, ReliabilityBadge, StationList } from "../outlooks/OutlookParts";
import o from "../outlooks/Outlooks.module.css";

type Layer = "all" | "forecasts" | "outlooks";
const NO_BEACHES: BeachData[] = [];
const NO_PINS: OutlookPin[] = [];

const ORANGE_COUNTY_STATIONS = ["OSB04", "0", "BNB05", "DSB4Z"];
const ORANGE_COUNTY_ADVISORY = { label: "OC Beach Info", href: "https://ocbeachinfo.com/" };

export default function SandboxDashboard({ beaches, predictionDate, fallbackCenter, listTopStations, entitled, alertsEnabled, checkoutReady, promoReady = false, openForecast = false, signedIn = entitled, accountState, account, faq, news, newsEnabled, advisory, outlooks = null }: {
  beaches: BeachData[];
  predictionDate: string | null;
  fallbackCenter: [number, number];
  listTopStations?: string[];
  entitled: boolean;
  signedIn?: boolean;
  accountState?: AccountState;
  alertsEnabled: boolean;
  checkoutReady: boolean;
  promoReady?: boolean;
  openForecast?: boolean;
  account: ReactNode;
  faq: ReactNode;
  news: NewsItem[];
  newsEnabled: boolean;
  advisory: { label: string; href: string };
  /** Water Quality Outlooks. null unless NEPTUNE_OUTLOOKS_ENABLED is on. */
  outlooks?: OutlookNetwork | null;
}) {
  const [alertsRevision, setAlertsRevision] = useState(0);
  const [view, setView] = useState<"list" | "map" | "news">("map");
  const [selected, setSelected] = useState<string | null>(() => openForecast && entitled ? orderForList(beaches, listTopStations)[0]?.code ?? null : null);
  // Outlooks (flag-gated). An outlook page is keyed by beach site and station.
  const [selectedOutlook, setSelectedOutlook] = useState<{ siteId: string; code: string } | null>(null);
  const [layer, setLayer] = useState<Layer>("all");
  const outlookIndex = useMemo(() => {
    const byCode = new globalThis.Map<string, { site: BeachSite; station: SiteStation }>();
    const sites = new globalThis.Map<string, BeachSite>();
    for (const site of outlooks?.sites ?? []) {
      sites.set(site.id, site);
      for (const station of site.stations) byCode.set(station.station.code, { site, station });
    }
    // Beaches with a forecast keep their existing per-station forecast pins;
    // only beaches without one get an outlook pin (one per beach).
    const outlookSites = (outlooks?.sites ?? []).filter((site) => !site.hasForecast);
    const pins: OutlookPin[] = outlookSites.map((site) => ({ id: site.id, name: site.name, latitude: site.latitude, longitude: site.longitude, stationCount: site.stations.length }));
    return { byCode, sites, outlookSites, pins };
  }, [outlooks]);
  const activeOutlookSite = selectedOutlook ? outlookIndex.sites.get(selectedOutlook.siteId) : undefined;
  const activeOutlookStation = activeOutlookSite?.stations.find((st): st is OutlookStation => st.kind === "outlook" && st.station.code === selectedOutlook?.code);
  useEffect(() => {
    posthog.capture("water_quality_dashboard_viewed", {board_location:"California", region:"southbay", access: entitled ? "pro" : "free"});
    if (openForecast && entitled) posthog.capture("pro_activation_dashboard_opened", {board_location:"California"});
  }, [entitled, openForecast]);
  // The last link that sent the reader to the Pro card. Cleared whenever the
  // page changes under them, so a stale click is never credited later.
  const [proMoment, setProMoment] = useState<CtaLocation | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const beachNavigation = useRef<HTMLDivElement>(null);
  const active = beaches.find((beach) => beach.code === selected);
  const activeAdvisory = (active && ORANGE_COUNTY_STATIONS.includes(active.code)) || activeOutlookSite?.county === "Orange" ? ORANGE_COUNTY_ADVISORY : advisory;
  const activeForecastEntry = active ? outlookIndex.byCode.get(active.code) : undefined;
  const activeForecastStation = activeForecastEntry?.station.kind === "forecast" ? activeForecastEntry.station as ForecastStation : undefined;
  const ordered = [...beaches].sort((a, b) => b.latitude - a.latitude || a.name.localeCompare(b.name));
  const countyStations: [string, string[]][] = [
    ["Los Angeles County", ["DPH 002B", "DHS103", "DHS104", "SMB-3-5", "SMB-3-6", "DPH 122", "SMB-2-10", "SMB-2-11", "SMB-2-13", "DHS112B", "DHS113", "DHS114", "DHS115", "DHS116", "SMB-7-9"]],
    ["Orange County", ORANGE_COUNTY_STATIONS],
    ["San Mateo County", ["Francis State Beach"]],
    ["Santa Cruz County", ["O490"]],
    ["San Luis Obispo County", ["PB5"]],
    ["Santa Barbara County", ["WP0000037"]],
    ["Ventura County", ["13000"]],
    ["San Diego County", ["CSD_S8"]],
  ];
  const knownCodes = new Set(countyStations.flatMap(([, codes]) => codes));
  const countyGroups = countyStations.map(([county, codes]) => ({ county, beaches: ordered.filter((beach) => codes.includes(beach.code)) })).filter((group) => group.beaches.length > 0);
  const unassigned = ordered.filter((beach) => !knownCodes.has(beach.code));
  if (unassigned.length) countyGroups.push({ county: "Other beaches", beaches: unassigned });
  const focusHeading = () => requestAnimationFrame(() => {
    heading.current?.focus({ preventScroll: true });
    (beachNavigation.current ?? heading.current)?.scrollIntoView({ block: "start" });
  });
  const openBeach = (code: string) => {
    setSelected(code);
    setSelectedOutlook(null);
    setProMoment(null);
    const beach = beaches.find((b) => b.code === code);
    if (beach) posthog.capture("beach_viewed", { board_location: "California", ...beachProperties(beach, "southbay"), entry_point: view });
    focusHeading();
  };
  const openOutlook = (siteId: string, code?: string) => {
    const site = outlookIndex.sites.get(siteId);
    const station = site?.stations.find((st) => st.kind === "outlook" && (!code || st.station.code === code));
    if (!site || !station) return;
    setSelected(null);
    setSelectedOutlook({ siteId, code: station.station.code });
    setProMoment(null);
    focusHeading();
  };
  const openStation = (station: SiteStation) => {
    if (station.kind === "forecast") { if (beaches.some((b) => b.code === station.station.code)) openBeach(station.station.code); }
    else openOutlook(station.station.siteId, station.station.code);
  };
  const closeDetail = () => { setSelected(null); setSelectedOutlook(null); setProMoment(null); focusHeading(); };
  const mapBeaches = outlooks && layer === "outlooks" ? NO_BEACHES : beaches;
  const mapPins = outlooks && layer !== "forecasts" ? outlookIndex.pins : NO_PINS;
  const showForecastRows = !outlooks || layer !== "outlooks";
  const showOutlookRows = !!outlooks && layer !== "forecasts";
  const inDetail = !!active || !!activeOutlookStation;
  // List rows per county: forecast beaches (existing) plus, with outlooks on,
  // outlook-only beaches. The filter can hide either kind.
  const listGroups = (() => {
    const outlookByCounty: Record<string, BeachSite[]> = {};
    if (showOutlookRows) for (const site of outlookIndex.outlookSites) (outlookByCounty[`${site.county} County`] ??= []).push(site);
    const groups = countyGroups.map((g) => ({ county: g.county, beaches: showForecastRows ? g.beaches : [], outlookSites: [] as BeachSite[] }));
    for (const [county, sites] of Object.entries(outlookByCounty)) {
      const g = groups.find((x) => x.county === county) ?? (groups.push({ county, beaches: [], outlookSites: [] }), groups[groups.length - 1]);
      g.outlookSites = sites;
    }
    return groups.map((g) => ({ ...g, count: g.beaches.length + g.outlookSites.length })).filter((g) => g.count > 0);
  })();
  const switchView = (next: typeof view) => { setView(next); setSelected(null); setSelectedOutlook(null); setProMoment(null); posthog.capture("dashboard_view_selected", { board_location: "California", region: "southbay", view: next }); };

  const alertSignupRef = useRef<CaliforniaAlertSignupHandle>(null);
  const alertSignup = alertsEnabled && view !== "news" ? <CaliforniaAlertSignup ref={alertSignupRef} key={active?.code ?? view} beaches={beaches.map(b => ({code:b.code,name:b.name}))} beach={active?.code} pro={entitled} onSaved={() => setAlertsRevision(value => value + 1)} source={active ? "california_beach" : `california_${view}`} /> : null;

  return (
    <main className={s.root}>
      <TrustWelcome />

      <header className={s.header}>
        <a href="https://projectneptune.co" aria-label="Project Neptune home"><ProjectNeptuneLogo size={22} /></a>
        <div className={s.account}>{!entitled && <a className={s.headerPro} href="#sandbox-pro" onClick={() => {
          setProMoment("header_get_pro");
          posthog.capture("pro_interest_clicked", {
            board_location: "California",
            cta_location: "header_get_pro",
            page_context: active ? "beach_page" : view,
            ...(active ? beachProperties(active, "southbay") : {}),
          });
        }}>Get Pro</a>}{signedIn && <UserButton />}<SandboxMenu account={account} /></div>
      </header>
      <div className={s.content}>
        {accountState?.kind === "lapsed" && accountState.endedAt && <ProLapsedNotice endedAt={accountState.endedAt} promo={accountState.promo} onInterest={() => setProMoment("lapsed_notice")} properties={{ page_context: active ? "beach_page" : view, ...(active ? beachProperties(active, "southbay") : {}) }} />}
        {(view === "map" || view === "list") ? (
          <section className={s.mapIntroduction} aria-label="Beach water quality forecast">
            <h1>Beach water quality.<br /><span>Predicted like the weather.</span></h1>
            <p className={s.mapDescription}>Find your beach. Read the risk. Make your next beach day more informed.</p>
            <div className={s.mapHeadingRow}>
              <div>
                <h2 ref={heading} tabIndex={-1}>Today’s bacteria risk at your beach</h2>
                {predictionDate && <time className={s.mapPredictionDate} dateTime={predictionDate}>{formatMonthDayYear(predictionDate)}</time>}
              </div>
              <nav className={s.mapViewToggle} aria-label="Dashboard views">
                <button aria-current={view === "map" ? "page" : undefined} onClick={() => switchView("map")}><Map size={14} /> Map</button>
                <button aria-current={view === "list" ? "page" : undefined} onClick={() => switchView("list")}><List size={14} /> List</button>
              </nav>
            </div>
            {outlooks && !active && !activeOutlookStation && (
              <div className={`${o.legend} ${o.root}`}>
                <div className={o.filter} role="group" aria-label="Show beaches">
                  {(["all", "forecasts", "outlooks"] as const).map((value) => <button key={value} type="button" aria-pressed={layer === value} onClick={() => setLayer(value)}>{value === "all" ? "All beaches" : value === "forecasts" ? "Forecasts" : "Outlooks"}</button>)}
                </div>
                <span><span className={o.legendPills} aria-hidden="true"><i style={{ background: "#2d8a4e" }} /><i style={{ background: "#D5C82E" }} /><i style={{ background: "#cc3333" }} /></span>Bacteria forecast: today&apos;s predicted risk</span>
                <span><span className={o.ring} aria-hidden="true" />Water Quality Outlook: environmental conditions only, no bacteria prediction</span>
              </div>
            )}
          </section>
        ) : <>
        <div className={s.masthead}>
          <div><p className={s.eyebrow}><Waves size={16} /> Daily water-quality</p><h1>Neptune Index</h1><p className={s.intro}>Know what you&apos;re going into.</p></div>
          <div className={s.dateline}><span>Daily forecast</span><strong>{predictionDate ? formatMonthDayYear(predictionDate) : "Awaiting readings"}</strong></div>
        </div>
        <div className={s.toolbar}>
          <nav aria-label="Dashboard views" className={s.tabs}>
            <button onClick={() => switchView("list")}><List size={17} /> Beaches</button>
            <button onClick={() => switchView("map")}><Map size={17} /> Map</button>
            {newsEnabled && <button aria-current={!active && view === "news" ? "page" : undefined} onClick={() => switchView("news")}>News</button>}
          </nav>
          <div className={s.mobileDateline}>
            <span>Daily forecast</span>
            {predictionDate ? <time dateTime={predictionDate}>{new Date(`${predictionDate}T12:00:00Z`).toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric", timeZone:"UTC"})}</time> : <span>Awaiting readings</span>}
          </div>
        </div>
        </>}
        {!entitled && !inDetail && view === "list" && (
          <aside className={s.proBanner} aria-label="Join Neptune Pro">
            <div><strong>Checking the water should be as easy as checking the weather.</strong><p>3-day forecasts and email alerts.</p></div>
            <a href="#sandbox-pro" onClick={() => setProMoment("list_banner")}>Join Neptune Pro <ArrowRight size={16} aria-hidden="true" /></a>
          </aside>
        )}
        {activeOutlookSite && activeOutlookStation ? (
          <>
            <div className={s.beachNav}>
              <button onClick={closeDetail}><ArrowLeft size={17} /> Back to {view === "map" ? "map" : "beaches"}</button>
            </div>
            <div ref={beachNavigation} className={s.beachNavigation} />
            <h2 ref={heading} tabIndex={-1} className={s.beachHeading}>{activeOutlookSite.name}{activeOutlookSite.multiStation && activeOutlookStation.station.name !== activeOutlookSite.name ? ` · ${activeOutlookStation.station.name}` : ""}</h2>
            {activeOutlookSite.multiStation && <p className={s.supporting}>Monitoring station {activeOutlookStation.station.code} · one of {activeOutlookSite.stations.length} stations at this beach</p>}
            <OutlookDetail key={activeOutlookStation.station.code} site={activeOutlookSite} station={activeOutlookStation} stale={outlooks?.stale ?? false} generatedAt={outlooks?.generatedAt ?? null} forecastBeaches={beaches} onSelectForecast={openBeach} onSelectStation={openStation} />
          </>
        ) : active ? (
          <>
            <div className={s.beachNav}>
              <button onClick={() => { setSelected(null); setProMoment(null); focusHeading(); }}><ArrowLeft size={17} /> Back to {view === "map" ? "map" : "beaches"}</button>
              <label><span className={s.srOnly}>Choose a beach</span><select value={active.code} onChange={(event) => openBeach(event.target.value)}>{ordered.map((beach) => <option key={beach.code} value={beach.code}>{beach.name}</option>)}</select></label>
            </div>
            <div ref={beachNavigation} className={s.beachNavigation}>
              <BeachNeighborNav beach={active} beaches={beaches} onSelect={openBeach} />
            </div>
            <h2 ref={heading} tabIndex={-1} className={s.beachHeading}>{active.name}</h2>
            <SandboxBeachDetail key={active.code} beach={active} beaches={beaches} onSelect={openBeach} onProMoment={() => setProMoment("beach_forecast_lock")} advisory={activeAdvisory} alertSignup={alertSignup}
              reliability={activeForecastStation ? <div className={o.root}><ReliabilityBadge station={activeForecastStation} /></div> : undefined}
              environmental={activeForecastStation && activeForecastEntry ? (
                <div className={`${o.root} ${o.section}`}>
                  <OutlookPanel title="Environmental outlook" outlook={activeForecastStation.outlook} stale={outlooks?.stale ?? false} generatedAt={outlooks?.generatedAt ?? null} />
                  {activeForecastStation.outlook && <InfluenceList influences={activeForecastStation.outlook.influences} />}
                  {activeForecastEntry.site.multiStation && <StationList stations={activeForecastEntry.site.stations} activeCode={active.code} onSelect={openStation} />}
                  <DataAttribution />
                </div>
              ) : undefined} />
          </>
        ) : beaches.length === 0 ? (
          <div className={s.empty}><h2>No readings published yet.</h2><p>The daily forecast will appear here when it is available.</p></div>
        ) : view === "news" ? <NewsTab items={news} /> : (
          <section className={s.overview}>
            {view !== "map" && <>
            <div className={s.sectionHeading}><h2 ref={heading} tabIndex={-1}>Today’s water quality</h2><span>{outlooks ? listGroups.reduce((total, group) => total + group.count, 0) : beaches.length} beaches</span></div>
            <p className={s.supporting}>Click a beach for more information.{alertsEnabled && <> <button type="button" className={s.emailAlertLink} onClick={() => alertSignupRef.current?.open()}>Get email alerts</button></>}</p>
            </>}
            {view === "map" ? <div id="beach-map" className={s.map}><OverviewMapClient locateNearby labelMinZoom={11} beaches={mapBeaches} fallbackCenter={fallbackCenter} binaryVerdict={false} onSelect={openBeach} outlookPins={mapPins} onSelectOutlook={(siteId) => openOutlook(siteId)} /></div> : (
              <div className={s.countyGroups}>{listGroups.map((group) => <section key={group.county} aria-label={group.county}><h3 className={s.countyHeading}>{group.county}<span>{group.count} {group.count === 1 ? "beach" : "beaches"}</span></h3><ul className={s.beaches}>{group.outlookSites.map((site) => { const lead = site.stations.find((st) => st.kind === "outlook"); return <li key={site.id}><button onClick={() => openOutlook(site.id)}><span className={s.beachName}>{site.name}{lead?.outlook && <span className={o.listHeadline}>{lead.outlook.headline}</span>}</span><span className={o.listChip}><span className={o.ring} aria-hidden="true" />Outlook</span><ChevronRight size={18} aria-hidden="true" /></button></li>; })}{group.beaches.map((beach) => <li key={beach.code}><button onClick={() => openBeach(beach.code)}><span className={s.beachName}>{beach.name}</span><span className={`${s.band} ${s.listReading} ${bandClass(beach.status)}`}><span className={s.listBandLabel}><span className={s.dot} />{STATUS_BAND[beach.status].short} risk</span></span><ChevronRight size={18} aria-hidden="true" /></button></li>)}</ul></section>)}</div>
            )}
            {view === "map" && <div className={s.mapRequest}><Link href="/california/request-beach">Request your beach <ArrowRight size={16} aria-hidden="true" /></Link></div>}

          </section>
        )}
        {!inDetail && view !== "map" && alertSignup}
        {!entitled && !activeOutlookStation && <SandboxProOffer promoReady={promoReady} checkoutReady={checkoutReady} alertsEnabled={alertsEnabled} ctaLocation={proMoment ?? "california_bottom"} pageContext={active ? "beach_page" : view} beach={active} />}
        {!inDetail && view === "map" && <ScrollOnboarding />}
        {!inDetail && view === "map" && alertSignup && <div className={s.guideAlert}>{alertSignup}</div>}
        {!inDetail && (view === "map" || view === "list") && <div id="behind-the-forecast"><ForecastComparison /></div>}
        {/* List and map only. Inside a beach card the reader is looking at one
            beach, and a list of every beach they follow is a different job; on
            News it has nothing to do with what is on screen. */}
        {entitled && alertsEnabled && !inDetail && view !== "news" && (
          <SandboxYourNeptune key={alertsRevision} location="california" beaches={beaches.map((b) => ({ code: b.code, name: b.name }))} />
        )}
      </div>
      <div className={s.faq}>{faq}</div>
      <footer className={s.footer}><Waves size={20} /><p>Know the water. Enjoy the coast.</p><small>Forecasts are estimates based on environmental data. For official beach advisories, consult <a href={activeAdvisory.href} target="_blank" rel="noopener noreferrer">{activeAdvisory.label}</a>.</small><SandboxSupportLinks /></footer>
    </main>
  );
}
