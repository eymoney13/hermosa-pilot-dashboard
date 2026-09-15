import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import DashboardTabs from "@/components/DashboardTabs";
import ProjectNeptuneLogo from "@/components/ProjectNeptuneLogo";
import BeachAlertSignup from "@/components/BeachAlertSignup";
import FaqAccordion from "@/components/FaqAccordion";
import { loadDashboardData } from "@/lib/loadData";
import { isAlertsConfigured } from "@/lib/alerts";
import { formatMonthDayYear, getLocation, LOCATIONS } from "@/lib/data";
import { faqHref, FAQ_LINKS } from "@/lib/faq";
import { featuresFor } from "@/lib/features";
import {
  fetchNewsAlerts,
  getNewsFeedUrls,
  isNewsEnabled,
  resolveNewsFilterTerms,
} from "@/lib/news";

export const dynamic = "force-dynamic";

// The CA boards all defer to LA County; a location can name its own authority
// via LocationConfig.advisory.
const DEFAULT_ADVISORY = {
  label: "LA County Department of Public Health",
  href: "http://publichealth.lacounty.gov/phcommon/public/media/mediapubOdisplay.cfm",
};

export function generateStaticParams() {
  return Object.keys(LOCATIONS).map((location) => ({ location }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ location: string }>;
}): Promise<Metadata> {
  const { location } = await params;
  const config = getLocation(location);
  if (!config) return { title: "Water Quality" };
  return {
    title: `${config.displayName} Water Quality`,
    description: `Daily water quality forecast for ${config.displayName}.`,
  };
}

export default async function LocationPage({
  params,
}: {
  params: Promise<{ location: string }>;
}) {
  const { location } = await params;
  const config = getLocation(location);
  if (!config) notFound();

  const features = featuresFor(location);
  // A signup form we cannot record anything from is worse than no form, so the
  // card hides itself when the database isn't wired up (see lib/alerts.ts).
  const alertsEnabled = features.beachAlerts && isAlertsConfigured();
  const newsEnabled = isNewsEnabled();
  const newsFilterTerms = resolveNewsFilterTerms(
    config.slug,
    config.newsFilterTerms
  );
  const [{ beaches, predictionDate }, news] = await Promise.all([
    loadDashboardData(config),
    newsEnabled
      ? fetchNewsAlerts(getNewsFeedUrls(), newsFilterTerms)
      : Promise.resolve([]),
  ]);

  return (
    <main className="flex flex-col">
      <header className="w-full border-b border-gray-100">
        <div className="mx-auto max-w-6xl px-6 sm:px-10 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex flex-col">
            <a
              href="https://projectneptune.co"
              className="inline-flex items-center"
            >
              <ProjectNeptuneLogo size={24} />
            </a>
            <p
              className="pl-0.5 text-[13px] leading-tight"
              style={{
                fontFamily: "var(--font-poppins), sans-serif",
                fontWeight: 700,
                color: "#2C8487",
              }}
            >
              Ocean Water Quality
            </p>
          </div>
          {/* The date, unadorned. The pulsing dot promised live data on a board
              that publishes once a morning, and "Forecast for" named the thing
              the whole page already is. What a reader needs from the header is
              which day they are looking at. */}
          {predictionDate && (
            <div className="text-sm text-slate-600">
              {formatMonthDayYear(predictionDate)}
            </div>
          )}
        </div>
      </header>

      {beaches.length > 0 ? (
        <DashboardTabs
          beaches={beaches}
          locationLabel={config.displayName}
          fallbackCenter={config.mapFallbackCenter}
          features={features}
          // Rendered inside the tabs: on a beach it belongs between the card
          // and the map, and only that component knows which tab is open.
          alertSignup={
            alertsEnabled ? (
              <BeachAlertSignup
                beaches={beaches.map((b) => ({ code: b.code, name: b.name }))}
                location={config.slug}
              />
            ) : null
          }
          news={news}
          newsEnabled={newsEnabled}
        />
      ) : (
        // A registered location whose backend hasn't published its first run
        // yet. Without this the page renders as a bare header (DashboardTabs
        // returns null on an empty roster).
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-10 py-16">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              No readings published yet for {config.displayName}.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              This dashboard goes live as soon as the daily model run publishes
              its first forecast.
            </p>
          </div>
        </div>
      )}

      {/* After the data and the signup, before the disclaimer. A reader reaches
          it having already seen a forecast, which is when "how do they know
          this" occurs to them; the footer's one-line caveat directly below is
          the short version of two of these answers. */}
      <FaqAccordion />

      <footer className="w-full py-10">
        <div className="mx-auto max-w-6xl px-6 sm:px-10 text-xs text-gray-400">
          Forecasts are estimates based on environmental data. For official
          beach advisories, consult{" "}
          <a
            href={(config.advisory ?? DEFAULT_ADVISORY).href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            {(config.advisory ?? DEFAULT_ADVISORY).label}
          </a>
          .{" "}
          <Link
            href={faqHref(FAQ_LINKS.officialAdvisories)}
            className="underline hover:text-gray-600"
          >
            How this relates to official advisories
          </Link>
          .
        </div>
      </footer>
    </main>
  );
}
