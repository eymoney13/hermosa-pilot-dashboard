"use client";

import { useState } from "react";
import type { BeachData } from "@/lib/data";
import type { FeatureFlags } from "@/lib/features";
import type { NewsItem } from "@/lib/news";
import BeachCard from "./BeachCard";
import MapClient from "./MapClient";
import NewsTab from "./NewsTab";
import OverviewMapClient from "./OverviewMapClient";

const STATUS_UNDERLINE: Record<string, string> = {
  Normal: "bg-[#2d8a4e]",
  "Slightly elevated": "bg-[#D5C82E]",
  "Not recommended": "bg-[#cc3333]",
};

// Sentinel tab values — neither is a real station code.
const MAP_TAB = "__map__"; // all-beaches overview map
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
  const [activeCode, setActiveCode] = useState<string>(
    showMapTab ? MAP_TAB : beaches[0]?.code ?? ""
  );

  if (beaches.length === 0) return null;

  const mapActive = activeCode === MAP_TAB;
  const newsActive = activeCode === NEWS_TAB;
  const active = beaches.find((b) => b.code === activeCode) ?? beaches[0];
  // The tab bar earns its keep when there's more than one beach to switch
  // between, or a News tab to reach.
  const showTabs = showMapTab || newsEnabled;

  return (
    <>
      {showTabs && (
        <nav className="w-full border-b border-gray-100">
          <div className="mx-auto max-w-6xl px-6 sm:px-10 flex gap-2 sm:gap-8 overflow-x-auto">
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
            {beaches.map((b) => {
              const isActive =
                !mapActive && !newsActive && b.code === active.code;
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
                      className={`absolute bottom-0 left-2 right-2 h-0.5 ${
                        STATUS_UNDERLINE[b.status]
                      }`}
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

      {mapActive ? (
        <section className="w-full">
          <OverviewMapClient
            beaches={beaches}
            fallbackCenter={fallbackCenter}
            hidePercent={features.hidePercentSign}
            onSelect={setActiveCode}
          />
        </section>
      ) : newsActive ? (
        <NewsTab items={news} />
      ) : (
        <>
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
            />
          </section>
        </>
      )}
    </>
  );
}
