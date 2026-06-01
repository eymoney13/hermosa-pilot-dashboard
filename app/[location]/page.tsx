import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DashboardTabs from "@/components/DashboardTabs";
import ProjectNeptuneLogo from "@/components/ProjectNeptuneLogo";
import { loadDashboardData } from "@/lib/loadData";
import { formatMonthDayYear, getLocation, LOCATIONS } from "@/lib/data";

export const dynamic = "force-dynamic";

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

  const { beaches, predictionDate } = await loadDashboardData(config);

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
          {predictionDate && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"
              />
              <span>Forecast for {formatMonthDayYear(predictionDate)}</span>
            </div>
          )}
        </div>
      </header>

      <DashboardTabs
        beaches={beaches}
        locationLabel={config.displayName}
        fallbackCenter={config.mapFallbackCenter}
      />

      <footer className="w-full py-10">
        <div className="mx-auto max-w-6xl px-6 sm:px-10 text-xs text-gray-400">
          Forecasts are estimates based on environmental data. For official
          beach advisories, consult{" "}
          <a
            href="http://publichealth.lacounty.gov/phcommon/public/media/mediapubOdisplay.cfm"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            LA County Department of Public Health
          </a>
          .
        </div>
      </footer>
    </main>
  );
}
