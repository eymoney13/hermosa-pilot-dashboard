import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
