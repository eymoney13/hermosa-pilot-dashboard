import DashboardTabs from "@/components/DashboardTabs";
import { loadDashboardData } from "@/lib/loadData";
import { formatLongDate } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { beaches, predictionDate, latestSampleDate } = await loadDashboardData();

  return (
    <main className="flex flex-col">
      <header className="w-full border-b border-gray-100">
        <div className="mx-auto max-w-6xl px-6 sm:px-10 py-5 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
          <h1 className="text-sm font-medium text-gray-700">
            Hermosa Beach Water Quality
          </h1>
          <p className="text-sm text-gray-400">
            {predictionDate ? `Nowcast for ${formatLongDate(predictionDate)}` : ""}
            {latestSampleDate
              ? ` · Latest sample ${formatLongDate(latestSampleDate)}`
              : ""}
          </p>
        </div>
      </header>

      <DashboardTabs beaches={beaches} />

      <footer className="w-full py-10">
        <div className="mx-auto max-w-6xl px-6 sm:px-10 text-xs text-gray-400">
          Forecasts are estimates based on environmental data. For official
          beach advisories, consult LA County Department of Public Health.
        </div>
      </footer>
    </main>
  );
}
