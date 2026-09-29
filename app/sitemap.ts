import type { MetadataRoute } from "next";
import { LOCATIONS } from "@/lib/data";
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = Object.values(LOCATIONS).filter(c => !c.noindex && c.slug !== "southbay").map(c => `/${c.slug}`);
  pages.push(...["how-it-works", "stories", "team", "terms", "privacy"].map(p => `/california/${p}`));
  return pages.map(path => ({url: `https://dashboard.projectneptune.co${path}`}));
}
