import type { Metadata } from "next";
import NewsTab from "@/components/NewsTab";
import { LOCATIONS } from "@/lib/data";
import { fetchNewsAlerts, getNewsFeedUrls, resolveNewsFilterTerms } from "@/lib/news";

export const metadata: Metadata = { title: "Water Quality News" };
export const dynamic = "force-dynamic";

export default async function WaterQualityNewsPage() {
  const config = LOCATIONS.california;
  const feeds = getNewsFeedUrls();
  const items = feeds.length ? await fetchNewsAlerts(feeds, resolveNewsFilterTerms(config.slug, config.newsFilterTerms)) : [];
  return <section aria-labelledby="water-quality-news-title">
    <h1 id="water-quality-news-title" className="text-3xl font-semibold tracking-tight">Water Quality News</h1>
    {feeds.length ? <NewsTab items={items} /> : <p className="mt-6 text-sm text-slate-500">Water quality news is temporarily unavailable. Please check back soon.</p>}
  </section>;
}
