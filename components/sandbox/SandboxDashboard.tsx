"use client";
import SandboxSupportLinks from "@/components/sandbox/SandboxSupportLinks";

import { useEffect, useRef, useState, type ReactNode } from "react";
import posthog from "posthog-js";
import { UserButton } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, ChevronRight, List, Map, Waves } from "lucide-react";
import { formatMonthDayYear, orderForList, STATUS_BAND, type BeachData } from "@/lib/data";
import type { NewsItem } from "@/lib/news";
import ProjectNeptuneLogo from "../ProjectNeptuneLogo";
import OverviewMapClient from "../OverviewMapClient";
import NewsTab from "../NewsTab";
import BeachNeighborNav from "@/components/BeachNeighborNav";
import SandboxBeachDetail, { bandClass } from "./SandboxBeachDetail";
import SandboxProOffer from "./SandboxProOffer";
import SandboxMenu from "./SandboxMenu";
import SandboxYourNeptune from "./SandboxYourNeptune";
import s from "./SandboxDashboard.module.css";

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
  const [view, setView] = useState<"list" | "map" | "news">("list");
  const [selected, setSelected] = useState<string | null>(() => openForecast && entitled ? orderForList(beaches, listTopStations)[0]?.code ?? null : null);
  useEffect(() => {
    posthog.capture("water_quality_dashboard_viewed", {board_location:"California", region:"southbay", access: entitled ? "pro" : "free"});
    if (openForecast && entitled) posthog.capture("pro_activation_dashboard_opened", {board_location:"California"});
  }, [entitled, openForecast]);
  const heading = useRef<HTMLHeadingElement>(null);
  const beachNavigation = useRef<HTMLDivElement>(null);
  const active = beaches.find((beach) => beach.code === selected);
  const ordered = orderForList(beaches, listTopStations);
  const countyStations: [string, string[]][] = [
    ["Los Angeles County", ["DPH 002B", "DHS103", "DHS104", "SMB-3-5", "SMB-3-6", "DPH 122", "SMB-2-10", "SMB-2-11", "SMB-2-13", "DHS112B", "DHS113", "DHS114", "DHS115", "DHS116", "SMB-7-9"]],
    ["Orange County", ["OSB04", "0", "BNB05", "DSB4Z"]],
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
  const openBeach = (code: string) => { setSelected(code); posthog.capture("beach_selected", { board_location: "California", region: "southbay", beach_code: code, source: view }); focusHeading(); };
  const switchView = (next: typeof view) => { setView(next); setSelected(null); posthog.capture("dashboard_view_selected", { board_location: "California", region: "southbay", view: next }); };

  return (
    <main className={s.root}>

      <header className={s.header}>
        <a href="https://projectneptune.co" aria-label="Project Neptune home"><ProjectNeptuneLogo size={22} /></a>
        <div className={s.account}>{!entitled && <a className={s.headerPro} href="#sandbox-pro">Get Pro</a>}{entitled && <UserButton />}<SandboxMenu account={account} /></div>
      </header>
      <div className={s.content}>
        <div className={s.masthead}>
          <div><p className={s.eyebrow}><Waves size={16} /> Daily water-quality</p><h1>Neptune Index</h1><p className={s.intro}>Know what you&apos;re going into.</p></div>
          <div className={s.dateline}><span>Daily forecast</span><strong>{predictionDate ? formatMonthDayYear(predictionDate) : "Awaiting readings"}</strong></div>
        </div>
        <div className={s.toolbar}>
          <nav aria-label="Dashboard views" className={s.tabs}>
            <button aria-current={!active && view === "list" ? "page" : undefined} onClick={() => switchView("list")}><List size={17} /> Beaches</button>
            <button aria-current={!active && view === "map" ? "page" : undefined} onClick={() => switchView("map")}><Map size={17} /> Map</button>
            {newsEnabled && <button aria-current={!active && view === "news" ? "page" : undefined} onClick={() => switchView("news")}>News</button>}
          </nav>

        </div>
        {!entitled && !active && view === "list" && (
          <aside className={s.proBanner} aria-label="Join Neptune Pro">
            <div><strong>Checking the water should be as easy as checking the weather.</strong><p>3-day forecasts and email alerts.</p></div>
            <a href="#sandbox-pro">Join Neptune Pro <ArrowRight size={16} aria-hidden="true" /></a>
          </aside>
        )}
        {active ? (
          <>
            <div className={s.beachNav}>
              <button onClick={() => { setSelected(null); focusHeading(); }}><ArrowLeft size={17} /> Back to {view === "map" ? "map" : "beaches"}</button>
              <label><span className={s.srOnly}>Choose a beach</span><select value={active.code} onChange={(event) => openBeach(event.target.value)}>{ordered.map((beach) => <option key={beach.code} value={beach.code}>{beach.name}</option>)}</select></label>
            </div>
            <div ref={beachNavigation} className={s.beachNavigation}>
              <BeachNeighborNav beach={active} beaches={beaches} onSelect={openBeach} />
            </div>
            <h2 ref={heading} tabIndex={-1} className={s.beachHeading}>{active.name}</h2>
            <SandboxBeachDetail key={active.code} beach={active} beaches={beaches} onSelect={openBeach} advisory={advisory} />
          </>
        ) : beaches.length === 0 ? (
          <div className={s.empty}><h2>No readings published yet.</h2><p>The daily forecast will appear here when it is available.</p></div>
        ) : view === "news" ? <NewsTab items={news} /> : (
          <section className={s.overview}>
            <div className={s.sectionHeading}><h2 ref={heading} tabIndex={-1}>{view === "map" ? "Explore the coast" : "Today’s water quality"}</h2><span>{beaches.length} beaches</span></div>
            <p className={s.supporting}>Click a beach for more information.</p>
            {view === "map" ? <div className={s.map}><OverviewMapClient locateNearby labelMinZoom={11} beaches={beaches} fallbackCenter={fallbackCenter} binaryVerdict={false} onSelect={openBeach} /></div> : (
              <div className={s.countyGroups}>{countyGroups.map((group) => <section key={group.county} aria-label={group.county}><h3 className={s.countyHeading}>{group.county}<span>{group.beaches.length} {group.beaches.length === 1 ? "beach" : "beaches"}</span></h3><ul className={s.beaches}>{group.beaches.map((beach) => <li key={beach.code}><button onClick={() => openBeach(beach.code)}><span className={s.beachName}>{beach.name}</span><span className={`${s.band} ${s.listReading} ${bandClass(beach.status)}`}><span className={s.listBandLabel}><span className={s.dot} />{STATUS_BAND[beach.status].short} risk</span></span><ChevronRight size={18} aria-hidden="true" /></button></li>)}</ul></section>)}</div>
            )}
            {view === "map" && (
              <div className={s.beachRequest}>
                <p>Don’t see your beach?</p>
                <a href="mailto:ethan@projectneptune.co?subject=Request%20a%20beach%20for%20Neptune&body=Hi%20Neptune%2C%0A%0AI%E2%80%99d%20love%20to%20see%20this%20beach%20added%3A%0A%0ABeach%20name%3A%20%0ACity%20or%20county%3A%20%0A">Request your beach <ArrowRight size={16} aria-hidden="true" /></a>
              </div>
            )}
            <div className={s.legend} aria-label="Neptune Index categories">{(["Normal", "Slightly elevated", "Not recommended"] as const).map((status) => <span key={status} className={bandClass(status)}><i className={s.dot} />{STATUS_BAND[status].short} risk</span>)}</div>
            <p className={s.caveat}>Forecasts are estimates, not current lab results. Always follow official beach advisories.</p>
          </section>
        )}
        {!active && view !== "news" && <h2 className={s.coverageNote}>More California beaches coming soon!</h2>}
        {!entitled && <SandboxProOffer checkoutReady={checkoutReady} alertsEnabled={alertsEnabled} />}
        {/* List and map only. Inside a beach card the reader is looking at one
            beach, and a list of every beach they follow is a different job; on
            News it has nothing to do with what is on screen. */}
        {entitled && alertsEnabled && !active && view !== "news" && (
          <SandboxYourNeptune location="california" beaches={beaches.map((b) => ({ code: b.code, name: b.name }))} />
        )}
      </div>
      <div className={s.faq}>{faq}</div>
      <footer className={s.footer}><Waves size={20} /><p>Know the water. Enjoy the coast.</p><small>Forecasts are estimates based on environmental data. For official beach advisories, consult <a href={advisory.href} target="_blank" rel="noopener noreferrer">{advisory.label}</a>.</small><SandboxSupportLinks /></footer>
    </main>
  );
}
