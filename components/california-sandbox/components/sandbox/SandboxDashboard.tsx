"use client";
import SandboxSupportLinks from "@/components/california-sandbox/components/sandbox/SandboxSupportLinks";

import { useEffect, useRef, useState, type ReactNode } from "react";
import posthog from "posthog-js";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, ChevronRight, List, Map, Waves } from "lucide-react";
import { formatMonthDayYear, orderForList, STATUS_BAND, type BeachData } from "@/components/california-sandbox/lib/data";
import type { NewsItem } from "@/components/california-sandbox/lib/news";
import { beachProperties, type CtaLocation } from "@/components/california-sandbox/lib/analytics";
import ProjectNeptuneLogo from "../ProjectNeptuneLogo";
import OverviewMapClient from "../OverviewMapClient";
import NewsTab from "../NewsTab";
import BeachNeighborNav from "@/components/california-sandbox/components/BeachNeighborNav";
import SandboxBeachDetail, { bandClass } from "./SandboxBeachDetail";
import SandboxProOffer from "./SandboxProOffer";
import ForecastComparison from "./ForecastComparison";
import ScrollOnboarding from "./ScrollOnboarding";
import TrustWelcome from "./TrustWelcome";
import SandboxMenu from "./SandboxMenu";
import CaliforniaAlertSignup, { type CaliforniaAlertSignupHandle } from "@/components/california-sandbox/components/CaliforniaAlertSignup";
import SandboxYourNeptune from "./SandboxYourNeptune";
import s from "./SandboxDashboard.module.css";

const ORANGE_COUNTY_STATIONS = ["OSB04", "0", "BNB05", "DSB4Z"];
const ORANGE_COUNTY_ADVISORY = { label: "OC Beach Info", href: "https://ocbeachinfo.com/" };

export default function SandboxDashboard({ beaches, predictionDate, fallbackCenter, listTopStations, entitled, alertsEnabled, checkoutReady, openForecast = false, account, faq, news, newsEnabled, advisory }: {
  beaches: BeachData[];
  predictionDate: string | null;
  fallbackCenter: [number, number];
  listTopStations?: string[];
  entitled: boolean;
  alertsEnabled: boolean;
  checkoutReady: boolean;
  openForecast?: boolean;
  account: ReactNode;
  faq: ReactNode;
  news: NewsItem[];
  newsEnabled: boolean;
  advisory: { label: string; href: string };
}) {
  const [alertsRevision, setAlertsRevision] = useState(0);
  const [view, setView] = useState<"list" | "map" | "news">("map");
  const [selected, setSelected] = useState<string | null>(() => openForecast && entitled ? orderForList(beaches, listTopStations)[0]?.code ?? null : null);
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
  const activeAdvisory = active && ORANGE_COUNTY_STATIONS.includes(active.code) ? ORANGE_COUNTY_ADVISORY : advisory;
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
    setProMoment(null);
    const beach = beaches.find((b) => b.code === code);
    if (beach) posthog.capture("beach_viewed", { board_location: "California", ...beachProperties(beach, "southbay"), entry_point: view });
    focusHeading();
  };
  const switchView = (next: typeof view) => { setView(next); setSelected(null); setProMoment(null); posthog.capture("dashboard_view_selected", { board_location: "California", region: "southbay", view: next }); };

  const alertSignupRef = useRef<CaliforniaAlertSignupHandle>(null);
  const alertSignup = alertsEnabled && view !== "news" ? <CaliforniaAlertSignup ref={alertSignupRef} key={active?.code ?? view} beaches={beaches.map(b => ({code:b.code,name:b.name}))} beach={active?.code} pro={entitled} onSaved={() => setAlertsRevision(value => value + 1)} source={active ? "california_beach" : `california_${view}`} /> : null;

  return (
    <main className={s.root}>
      <TrustWelcome />

      <header className={s.header}>
        <a href="https://projectneptune.co" aria-label="Project Neptune home"><ProjectNeptuneLogo size={22} /></a>
        <div className={s.account}>{!entitled && <a className={s.headerPro} href="#sandbox-pro" onClick={() => setProMoment("header_get_pro")}>Get Pro</a>}{entitled && <UserButton />}<SandboxMenu account={account} /></div>
      </header>
      <div className={s.content}>
        {(view === "map" || view === "list") ? (
          <section className={s.mapIntroduction} aria-label="Beach water quality forecast">
            <h1>Beach water quality.<br /><span>Predicted like the weather.</span></h1>
            <p className={s.mapDescription}>Find your beach. Read the risk. Make your next ocean day a little more informed.</p>
            <div className={s.mapHeadingRow}>
              <div>
                <h2 ref={heading} tabIndex={-1}>Today’s water quality at your beach</h2>
                {predictionDate && <time className={s.mapPredictionDate} dateTime={predictionDate}>{formatMonthDayYear(predictionDate)}</time>}
              </div>
              <nav className={s.mapViewToggle} aria-label="Dashboard views">
                <button aria-current={view === "map" ? "page" : undefined} onClick={() => switchView("map")}><Map size={14} /> Map</button>
                <button aria-current={view === "list" ? "page" : undefined} onClick={() => switchView("list")}><List size={14} /> List</button>
              </nav>
            </div>
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
        {!entitled && !active && view === "list" && (
          <aside className={s.proBanner} aria-label="Join Neptune Pro">
            <div><strong>Checking the water should be as easy as checking the weather.</strong><p>3-day forecasts and email alerts.</p></div>
            <a href="#sandbox-pro" onClick={() => setProMoment("list_banner")}>Join Neptune Pro <ArrowRight size={16} aria-hidden="true" /></a>
          </aside>
        )}
        {active ? (
          <>
            <div className={s.beachNav}>
              <button onClick={() => { setSelected(null); setProMoment(null); focusHeading(); }}><ArrowLeft size={17} /> Back to {view === "map" ? "map" : "beaches"}</button>
              <label><span className={s.srOnly}>Choose a beach</span><select value={active.code} onChange={(event) => openBeach(event.target.value)}>{ordered.map((beach) => <option key={beach.code} value={beach.code}>{beach.name}</option>)}</select></label>
            </div>
            <div ref={beachNavigation} className={s.beachNavigation}>
              <BeachNeighborNav beach={active} beaches={beaches} onSelect={openBeach} />
            </div>
            <h2 ref={heading} tabIndex={-1} className={s.beachHeading}>{active.name}</h2>
            <SandboxBeachDetail key={active.code} beach={active} beaches={beaches} onSelect={openBeach} onProMoment={() => setProMoment("beach_forecast_lock")} advisory={activeAdvisory} alertSignup={alertSignup} />
          </>
        ) : beaches.length === 0 ? (
          <div className={s.empty}><h2>No readings published yet.</h2><p>The daily forecast will appear here when it is available.</p></div>
        ) : view === "news" ? <NewsTab items={news} /> : (
          <section className={s.overview}>
            {view !== "map" && <>
            <div className={s.sectionHeading}><h2 ref={heading} tabIndex={-1}>Today’s water quality</h2><span>{beaches.length} beaches</span></div>
            <p className={s.supporting}>Click a beach for more information.{alertsEnabled && <> <button type="button" className={s.emailAlertLink} onClick={() => alertSignupRef.current?.open()}>Get email alerts</button></>}</p>
            </>}
            {view === "map" ? <div id="beach-map" className={s.map}><OverviewMapClient locateNearby labelMinZoom={11} beaches={beaches} fallbackCenter={fallbackCenter} binaryVerdict={false} onSelect={openBeach} /></div> : (
              <div className={s.countyGroups}>{countyGroups.map((group) => <section key={group.county} aria-label={group.county}><h3 className={s.countyHeading}>{group.county}<span>{group.beaches.length} {group.beaches.length === 1 ? "beach" : "beaches"}</span></h3><ul className={s.beaches}>{group.beaches.map((beach) => <li key={beach.code}><button onClick={() => openBeach(beach.code)}><span className={s.beachName}>{beach.name}</span><span className={`${s.band} ${s.listReading} ${bandClass(beach.status)}`}><span className={s.listBandLabel}><span className={s.dot} />{STATUS_BAND[beach.status].short} risk</span></span><ChevronRight size={18} aria-hidden="true" /></button></li>)}</ul></section>)}</div>
            )}
            {view === "map" && <div className={s.mapRequest}><Link href="/sandbox/request-beach">Request your beach <ArrowRight size={16} aria-hidden="true" /></Link></div>}
            {view === "map" && <a className={s.scrollInvitation} href="#read-the-water"><span><small>THE MAP IS JUST THE START</small><strong>What is the water telling you?</strong><span>A quick guide to the colors, the forecast, and your next beach day.</span></span><span className={s.scrollArrow} aria-hidden="true">↓</span></a>}
            {view === "map" && <ScrollOnboarding />}
            {view === "map" && alertSignup && <div className={s.guideAlert}>{alertSignup}</div>}

          </section>
        )}
        {!active && view !== "map" && alertSignup}
        {!active && (view === "map" || view === "list") && <div id="behind-the-forecast"><ForecastComparison /></div>}
        {!entitled && <SandboxProOffer checkoutReady={checkoutReady} alertsEnabled={alertsEnabled} ctaLocation={proMoment ?? "california_bottom"} pageContext={active ? "beach_page" : view} beach={active} />}
        {/* List and map only. Inside a beach card the reader is looking at one
            beach, and a list of every beach they follow is a different job; on
            News it has nothing to do with what is on screen. */}
        {entitled && alertsEnabled && !active && view !== "news" && (
          <SandboxYourNeptune key={alertsRevision} location="california" beaches={beaches.map((b) => ({ code: b.code, name: b.name }))} />
        )}
      </div>
      <div className={s.faq}>{faq}</div>
      <footer className={s.footer}><Waves size={20} /><p>Know the water. Enjoy the coast.</p><small>Forecasts are estimates based on environmental data. For official beach advisories, consult <a href={activeAdvisory.href} target="_blank" rel="noopener noreferrer">{activeAdvisory.label}</a>.</small><SandboxSupportLinks /></footer>
    </main>
  );
}
