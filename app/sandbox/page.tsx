import type { Metadata } from "next";
import SandboxDashboard from "@/components/california-sandbox/components/sandbox/SandboxDashboard";
import FaqAccordion from "@/components/california-sandbox/components/FaqAccordion";
import { LOCATIONS } from "@/components/california-sandbox/lib/data";
import { loadDashboardData } from "@/components/california-sandbox/lib/loadData";
import { featuresFor } from "@/components/california-sandbox/lib/features";
import { redactForEntitlement } from "@/components/california-sandbox/lib/paywall";
import { isNewsEnabled, fetchNewsAlerts, getNewsFeedUrls, resolveNewsFilterTerms } from "@/components/california-sandbox/lib/news";
import { isAlertsConfigured } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "California Water Quality — Sandbox",
  robots: { index: false, follow: false },
};

// Local copy of the current California dashboard (October 30, 2026).
// Presentation, dependencies, roster, readings, and public news are copied.
// This experiment never consults account/billing services or writes alert preferences.
export default async function SandboxPage({ searchParams }: {
  searchParams: Promise<{ pro?: string }>;
}) {
  const config = { ...LOCATIONS.california, dataSlug: "california-sandbox" };
  const { beaches: allBeaches, predictionDate } = await loadDashboardData(config);
  const entitled = false;
  const redacted = redactForEntitlement(allBeaches, {
    entitled,
    features: featuresFor("california"),
    publicTodayInsights: true,
  });

  const beaches = redacted;
  const newsEnabled = isNewsEnabled();
  const news = newsEnabled ? await fetchNewsAlerts(getNewsFeedUrls(), resolveNewsFilterTerms(config.slug, config.newsFilterTerms)) : [];

  return <SandboxDashboard
    beaches={beaches}
    predictionDate={predictionDate}
    fallbackCenter={config.mapFallbackCenter}
    listTopStations={config.listTopStations}
    entitled={entitled}
    alertsEnabled={isAlertsConfigured()}
    checkoutReady={false}
    openForecast={entitled && (await searchParams).pro === "activated"}
    account={null}
    faq={<FaqAccordion />}
    news={news}
    newsEnabled={newsEnabled}
    advisory={config.advisory ?? {
      label: "LA County Department of Public Health",
      href: "http://publichealth.lacounty.gov/phcommon/public/media/mediapubOdisplay.cfm",
    }}
  />;
}
