import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {userAgent: "*", allow: "/", disallow: ["/api/", "/pro/", "/sign-in", "/sign-up", "/unsubscribe/"]},
    sitemap: "https://dashboard.projectneptune.co/sitemap.xml",
  };
}
