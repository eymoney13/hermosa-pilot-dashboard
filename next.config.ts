import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/southbay", destination: "/california?region=southbay", permanent: true },
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
  // PostHog API paths use trailing slashes; don't redirect them away.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
