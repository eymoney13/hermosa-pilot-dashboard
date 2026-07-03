// News alerts sourced from Google Alerts RSS/Atom feeds.
//
// Each keyword in Google Alerts can be delivered as an RSS feed (edit the alert
// → "Deliver to" → "RSS feed"); that gives a permanent feed URL. Set one or more
// comma-separated feed URLs in the NEWS_ALERTS_FEEDS env var and the dashboard's
// News tab renders them automatically — no inbox scraping, no credentials.

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string | null;
  published: string | null; // ISO 8601, or null if the feed omitted it
  snippet: string | null;
}

// The dashboard is server-rendered per request, so cache each feed response in
// Next's Data Cache and only re-pull every 30 min — fresh enough to feel like an
// inbox without hammering Google on every page view.
const REVALIDATE_SECONDS = 1800;
const MAX_ITEMS = 30;
const SNIPPET_MAX = 220;

// Comma-separated Google Alerts RSS feed URLs. Empty → the News tab is hidden.
export function getNewsFeedUrls(): string[] {
  return (process.env.NEWS_ALERTS_FEEDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isNewsEnabled(): boolean {
  return getNewsFeedUrls().length > 0;
}

// Optional geographic filter. Google Alerts keywords like "ocean water quality"
// pull nationwide stories; a region filter keeps only items whose text mentions
// one of the region's signals. Named presets keep the env config to one word.
const REGION_TERMS: Record<string, string[]> = {
  california: [
    "california",
    "calif.",
    "los angeles",
    "l.a.",
    "orange county",
    "san diego",
    "san francisco",
    "bay area",
    "santa monica",
    "malibu",
    "hermosa",
    "redondo",
    "manhattan beach",
    "laguna",
    "huntington beach",
    "newport beach",
    "ventura",
    "santa barbara",
    "santa cruz",
    "monterey",
    "long beach",
    "san clemente",
    "oceanside",
    "dana point",
    "carlsbad",
    "big sur",
    // California outlet domains (matched against the article URL) catch local
    // stories that never spell out the state.
    "latimes.com",
    "ktla.com",
    "dailybreeze.com",
    "easyreadernews",
    "fox5sandiego",
    "kfiam640",
    "lacounty.gov",
  ],
};

// Lowercase terms an article must match one of. NEWS_FILTER_TERMS (custom,
// comma-separated) wins; else NEWS_FILTER_REGION selects a preset; else empty
// (no filtering).
export function getNewsFilterTerms(): string[] {
  const custom = (process.env.NEWS_FILTER_TERMS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (custom.length > 0) return custom;
  const region = (process.env.NEWS_FILTER_REGION ?? "").trim().toLowerCase();
  return REGION_TERMS[region] ?? [];
}

// Resolve the effective filter terms for a page: a per-location override (e.g.
// the Manhattan dashboard's beach + LA list, from LocationConfig.newsFilterTerms)
// wins when present; otherwise fall back to the global env-driven terms. Always
// normalized to lowercase.
export function resolveNewsFilterTerms(override?: string[]): string[] {
  const custom = (override ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return custom.length > 0 ? custom : getNewsFilterTerms();
}

function matchesAnyTerm(item: NewsItem, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const hay =
    `${item.title} ${item.snippet ?? ""} ${item.source ?? ""} ${item.url}`.toLowerCase();
  return terms.some((t) => hay.includes(t));
}

// Merge every configured feed into one newest-first, de-duplicated list.
// `terms` overrides the filter for this call (e.g. per-location); defaults to
// the global env-driven terms.
export async function fetchNewsAlerts(
  urls: string[] = getNewsFeedUrls(),
  terms: string[] = getNewsFilterTerms()
): Promise<NewsItem[]> {
  if (urls.length === 0) return [];

  const settled = await Promise.allSettled(urls.map(fetchFeed));
  const allItems = settled.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );

  const items = allItems.filter((item) => matchesAnyTerm(item, terms));

  const seen = new Set<string>();
  const deduped = items.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  // Newest first; entries without a date sort to the bottom.
  deduped.sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
  return deduped.slice(0, MAX_ITEMS);
}

async function fetchFeed(url: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: { "User-Agent": "neptune-dashboard-news" },
    });
    if (!res.ok) return [];
    return parseAtom(await res.text());
  } catch {
    // A single flaky feed must never take down the page — just contribute nothing.
    return [];
  }
}

// ── Atom parsing ──────────────────────────────────────────────────────────
// Google Alerts feeds are Atom 1.0 with a stable shape, so a focused extractor
// over <entry> blocks is enough and keeps us dependency-free.

function parseAtom(xml: string): NewsItem[] {
  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/g) ?? [];
  return entries.map(entryToItem).filter((i): i is NewsItem => i !== null);
}

function entryToItem(block: string): NewsItem | null {
  const rawTitle = tagContent(block, "title");
  const href = attr(block, "link", "href");
  if (!rawTitle && !href) return null;

  const url = unwrapGoogleUrl(decodeEntities(href ?? ""));
  const published = tagContent(block, "published") ?? tagContent(block, "updated");
  const id = tagContent(block, "id") ?? url;
  const source = authorName(block);
  const snippet = truncate(stripHtml(tagContent(block, "content") ?? ""), SNIPPET_MAX);

  return {
    id: id.trim(),
    title: stripHtml(rawTitle ?? "") || "(untitled)",
    url,
    source,
    published: published ? published.trim() : null,
    snippet: snippet || null,
  };
}

function tagContent(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

function attr(block: string, tag: string, name: string): string | null {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function authorName(block: string): string | null {
  const author = tagContent(block, "author");
  if (!author) return null;
  const name = tagContent(author, "name");
  return name ? stripHtml(name) || null : null;
}

// Google wraps every link as https://www.google.com/url?...&url=<real>&... —
// pull the real destination out so links go straight to the article.
function unwrapGoogleUrl(href: string): string {
  try {
    const u = new URL(href);
    if (u.hostname.endsWith("google.com") && u.searchParams.has("url")) {
      return u.searchParams.get("url") as string;
    }
  } catch {
    // fall through to the raw href
  }
  return href;
}

function stripHtml(input: string): string {
  return decodeEntities(
    decodeEntities(input) // titles are double-encoded (&lt;b&gt; → <b> → strip)
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&"); // last, so we don't re-trigger the rules above
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}
