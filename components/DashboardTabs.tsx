"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { VERDICT_AS_STATUS, type BeachData } from "@/lib/data";
import type { FeatureFlags } from "@/lib/features";
import type { NewsItem } from "@/lib/news";
import BeachCard from "./BeachCard";
import MapClient from "./MapClient";
import NewsTab from "./NewsTab";
import OverviewMapClient from "./OverviewMapClient";
import BeachList from "./BeachList";

const STATUS_UNDERLINE: Record<string, string> = {
  Normal: "bg-[#2d8a4e]",
  "Slightly elevated": "bg-[#D5C82E]",
  "Not recommended": "bg-[#cc3333]",
};

// Sentinel tab values — neither is a real station code.
const MAP_TAB = "__map__"; // all-beaches overview map
const LIST_TAB = "__list__"; // all-beaches list, one row each
const NEWS_TAB = "__news__"; // global (not per-beach) news

export default function DashboardTabs({
  beaches,
  locationLabel,
  fallbackCenter,
  features,
  news,
  newsEnabled,
}: {
  beaches: BeachData[];
  locationLabel: string;
  fallbackCenter: [number, number];
  features: FeatureFlags;
  news: NewsItem[];
  newsEnabled: boolean;
}) {
  // The overview map only earns its own tab when there's more than one beach to
  // glance across; single-beach locations open straight to that beach.
  const showMapTab = beaches.length > 1;
  // Same threshold as the map: a list of one is not a list.
  const showListTab = features.listTab && beaches.length > 1;
  // The list opens the board when present. It answers the first question a
  // reader arrives with - how is the coast this week - where the map answers
  // the second, which of these is near me. Boards that opt into openOnMap keep
  // the Map as the way in and treat the List as the second view.
  const listIsLanding = showListTab && !features.openOnMap;
  const [activeCode, setActiveCode] = useState<string>(
    listIsLanding ? LIST_TAB : showMapTab ? MAP_TAB : beaches[0]?.code ?? ""
  );
  // Which view a beach card was opened from, so "back" returns there rather
  // than to a fixed guess. Both the List and the Map open cards, and being sent
  // to the other one is the small betrayal that makes a back control feel
  // broken. Defaults to whichever view the board opens on.
  const [cameFrom, setCameFrom] = useState<string>(
    listIsLanding ? LIST_TAB : MAP_TAB
  );

  const openBeach = (code: string, from: string) => {
    setCameFrom(from);
    setActiveCode(code);
  };

  if (beaches.length === 0) return null;

  // On binary boards the tab underline must agree with the card's Good/Poor
  // call, not the 3-tier status — a beach can be Poor while its status still
  // reads "Normal" under the shared tiers.
  const underlineFor = (b: BeachData): string => {
    if (!features.binaryVerdict) return STATUS_UNDERLINE[b.status];
    return STATUS_UNDERLINE[
      b.verdict ? VERDICT_AS_STATUS[b.verdict] : b.status
    ];
  };

  const mapActive = activeCode === MAP_TAB;
  const listActive = activeCode === LIST_TAB;
  const newsActive = activeCode === NEWS_TAB;
  const active = beaches.find((b) => b.code === activeCode) ?? beaches[0];
  // The tab bar earns its keep when there's more than one beach to switch
  // between, or a News tab to reach.
  const showTabs = showMapTab || showListTab || newsEnabled;

  return (
    <>
      {showTabs && (
        <nav className="w-full border-b border-gray-100">
          <div className="mx-auto max-w-6xl px-6 sm:px-10 flex gap-2 sm:gap-8 overflow-x-auto">
            {showListTab && (
              <button
                type="button"
                onClick={() => setActiveCode(LIST_TAB)}
                aria-current={listActive ? "page" : undefined}
                className={`relative shrink-0 py-4 px-2 text-sm font-medium transition-colors ${
                  listActive
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                List
                {listActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-gray-900" />
                )}
              </button>
            )}
            {showMapTab && (
              <button
                type="button"
                onClick={() => setActiveCode(MAP_TAB)}
                aria-current={mapActive ? "page" : undefined}
                className={`relative shrink-0 py-4 px-2 text-sm font-medium transition-colors ${
                  mapActive
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Map
                {mapActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-gray-900" />
                )}
              </button>
            )}
            {/* Per-beach tabs. Hidden on boards that opt out: with a long
                roster they overflow into a scroller, so most sit off-screen,
                and the List and Map are better ways in. A beach card is still
                reached by clicking a List row or a Map pin, and the List / Map
                tabs stay visible while one is open so there is always a way
                back. */}
            {!features.hideBeachTabs &&
              beaches.map((b) => {
              const isActive =
                !mapActive && !newsActive && !listActive && b.code === active.code;
              return (
                <button
                  key={b.code}
                  type="button"
                  onClick={() => setActiveCode(b.code)}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative shrink-0 py-4 px-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {b.name}
                  {isActive && (
                    <span
                      className={`absolute bottom-0 left-2 right-2 h-0.5 ${underlineFor(
                        b
                      )}`}
                    />
                  )}
                </button>
              );
            })}
            {newsEnabled && (
              <button
                type="button"
                onClick={() => setActiveCode(NEWS_TAB)}
                aria-current={newsActive ? "page" : undefined}
                className={`relative shrink-0 py-4 px-2 text-sm font-medium transition-colors ${
                  newsActive
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                News
                {newsActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-gray-900" />
                )}
              </button>
            )}
          </div>
        </nav>
      )}

      {listActive ? (
        <BeachList
          beaches={beaches}
          locationLabel={locationLabel}
          binaryVerdict={features.binaryVerdict}
          hidePercent={features.hidePercentSign}
          onSelect={(code) => openBeach(code, LIST_TAB)}
        />
      ) : mapActive ? (
        <section className="w-full">
          <OverviewMapClient
            beaches={beaches}
            fallbackCenter={fallbackCenter}
            hidePercent={features.hidePercentSign}
            binaryVerdict={features.binaryVerdict}
            onSelect={(code) => openBeach(code, MAP_TAB)}
          />
        </section>
      ) : newsActive ? (
        <NewsTab items={news} />
      ) : (
        <>
          {/* Back to wherever this card was opened from. Only on boards whose
              per-beach tabs are hidden: everywhere else the tab bar still shows
              which beach is open and clicking another is the way around, so a
              back control would be a second, competing idea of "where am I".
              Matches the card's own container width so it reads as part of it
              rather than as page furniture. */}
          {features.hideBeachTabs && (
            <div className="mx-auto w-full max-w-3xl px-6 sm:px-10 pt-6">
              <button
                type="button"
                onClick={() => setActiveCode(cameFrom)}
                className="inline-flex items-center gap-1.5 rounded-sm text-sm text-gray-500 transition-colors hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Back to {cameFrom === MAP_TAB ? "map" : "list"}
              </button>
            </div>
          )}

          <BeachCard
            beach={active}
            locationLabel={locationLabel}
            features={features}
          />

          <section className="w-full">
            <MapClient
              beaches={beaches}
              selectedCode={active.code}
              fallbackCenter={fallbackCenter}
              hidePercent={features.hidePercentSign}
              binaryVerdict={features.binaryVerdict}
            />
          </section>
        </>
      )}
    </>
  );
}
