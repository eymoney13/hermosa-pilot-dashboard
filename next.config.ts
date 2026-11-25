import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/southbay", destination: "/california?region=southbay", permanent: true },
      // Retired boards: California is the only product. Old QR codes and links land there.
      ...["hermosa", "manhattan", "cabrillo", "boston"].map((slug) => ({
        source: `/${slug}`,
        destination: "/california",
        permanent: true,
      })),
      { source: "/sandbox", destination: "/california", permanent: true },
      { source: "/sandbox/:path*", destination: "/california/:path*", permanent: true },
    ];
  },
  // Reverse proxy for PostHog so ad blockers don't drop client events.
  async rewrites() {
    return [
      {
        source: "/relay-np/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/relay-np/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  // Water Quality Outlooks read data/outlooks/*.csv with fs at request time.
  // The files are deliberately outside public/ (not downloadable), so the
  // tracer has to be told to ship them with the location page.
  outputFileTracingIncludes: {
    "/\\[location\\]": ["./data/outlooks/**/*"],
  },
  // PostHog API paths use trailing slashes; don't redirect them away.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
