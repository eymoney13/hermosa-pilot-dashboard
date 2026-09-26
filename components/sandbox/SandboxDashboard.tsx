"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronRight, List, Map, Waves } from "lucide-react";
import { formatMonthDayYear, orderForList, STATUS_BAND, type BeachData } from "@/lib/data";
import type { NewsItem } from "@/lib/news";
import ProjectNeptuneLogo from "../ProjectNeptuneLogo";
import OverviewMapClient from "../OverviewMapClient";
import NewsTab from "../NewsTab";
import SandboxBeachDetail, { bandClass, bandLabel } from "./SandboxBeachDetail";
import SandboxProOffer from "./SandboxProOffer";
import SandboxMenu from "./SandboxMenu";
import SandboxYourNeptune from "./SandboxYourNeptune";
import s from "./SandboxDashboard.module.css";

export default function SandboxDashboard({ beaches, predictionDate, fallbackCenter, listTopStations, entitled, alertsEnabled, checkoutReady, account, faq, news, newsEnabled, advisory }: {
  beaches: BeachData[];
  predictionDate: string | null;
  fallbackCenter: [number, number];
  listTopStations?: string[];
  entitled: boolean;
  alertsEnabled: boolean;
  checkoutReady: boolean;
  account: ReactNode;
  faq: ReactNode;
  news: NewsItem[];
  newsEnabled: boolean;
  advisory: { label: string; href: string };
}) {
  const [view, setView] = useState<"list" | "map" | "news">("list");
  const [selected, setSelected] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const active = beaches.find((beach) => beach.code === selected);
  const ordered = orderForList(beaches, listTopStations);
  const focusHeading = () => requestAnimationFrame(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start" });
  });
  const openBeach = (code: string) => { setSelected(code); focusHeading(); };
  const switchView = (next: typeof view) => { setView(next); setSelected(null); };

  return (
    <main className={s.root}>
      <div className={s.sandboxNote}><div><strong>Sandbox</strong><span>South Bay readings · experimental design</span><Link href="/southbay">Live board <ArrowRight size={13} /></Link></div></div>
      <header className={s.header}>
        <a href="https://projectneptune.co" aria-label="Project Neptune home"><ProjectNeptuneLogo size={22} /></a>
        <div className={s.account}>{entitled && <span className={s.proBadge}>PRO</span>}{account}<SandboxMenu /></div>
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
          {!entitled && <a className={s.proLink} href="#sandbox-pro">Explore Pro <ArrowRight size={15} /></a>}
        </div>
        {active ? (
          <>
            <div className={s.beachNav}>
              <button onClick={() => { setSelected(null); focusHeading(); }}><ArrowLeft size={17} /> Back to {view === "map" ? "map" : "beaches"}</button>
              <label><span className={s.srOnly}>Choose a beach</span><select value={active.code} onChange={(event) => openBeach(event.target.value)}>{ordered.map((beach) => <option key={beach.code} value={beach.code}>{beach.name}</option>)}</select></label>
            </div>
            <h2 ref={heading} tabIndex={-1} className={s.beachHeading}>{active.name}</h2>
            <SandboxBeachDetail key={active.code} beach={active} />
          </>
        ) : beaches.length === 0 ? (
          <div className={s.empty}><h2>No readings published yet.</h2><p>The daily forecast will appear here when it is available.</p></div>
        ) : view === "news" ? <NewsTab items={news} /> : (
          <section className={s.overview}>
            <div className={s.sectionHeading}><h2 ref={heading} tabIndex={-1}>{view === "map" ? "Explore the coast" : "Find your beach"}</h2><span>{beaches.length} beaches</span></div>
            <p className={s.supporting}>Predicted bacteria levels. Choose a beach for its daily outlook.</p>
            {view === "map" ? <div className={s.map}><OverviewMapClient beaches={beaches} fallbackCenter={fallbackCenter} binaryVerdict={false} onSelect={openBeach} /></div> : (
              <ul className={s.beaches}>{ordered.map((beach) => <li key={beach.code}><button onClick={() => openBeach(beach.code)}><span className={s.beachName}>{beach.name}</span><span className={`${s.band} ${bandClass(beach.status)}`}><span className={s.dot} />{bandLabel(beach.status)}</span><ChevronRight size={18} aria-hidden="true" /></button></li>)}</ul>
            )}
            <div className={s.legend} aria-label="Neptune Index categories">{(["Normal", "Slightly elevated", "Not recommended"] as const).map((status) => <span key={status} className={bandClass(status)}><i className={s.dot} />{STATUS_BAND[status].short} bacteria</span>)}</div>
            <p className={s.caveat}>Forecasts are estimates, not current lab results. Always follow official beach advisories.</p>
          </section>
        )}
        {!entitled && <SandboxProOffer checkoutReady={checkoutReady} alertsEnabled={alertsEnabled} />}
        {/* List and map only. Inside a beach card the reader is looking at one
            beach, and a list of every beach they follow is a different job; on
            News it has nothing to do with what is on screen. */}
        {entitled && alertsEnabled && !active && view !== "news" && (
          <SandboxYourNeptune location="sandbox" beaches={beaches.map((b) => ({ code: b.code, name: b.name }))} />
        )}
      </div>
      <div className={s.faq}>{faq}</div>
      <footer className={s.footer}><Waves size={20} /><p>Know the water. Enjoy the coast.</p><small>Forecasts are estimates based on environmental data. For official beach advisories, consult <a href={advisory.href} target="_blank" rel="noopener noreferrer">{advisory.label}</a>.</small></footer>
    </main>
  );
}
