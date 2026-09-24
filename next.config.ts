import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Lesson generation commonly takes longer than Next's 30-second rewrite
    // proxy default. Keep this aligned with the long-running Copilot requests in
    // api-client.ts so the backend can return the created draft and lesson id.
    proxyTimeout: 360_000,
  },
  async rewrites() {
    const backend = process.env.BACKEND_API_URL || "http://localhost:3002";
    const posthogIngestionHost = process.env.POSTHOG_INGEST_HOST
      || process.env.NEXT_PUBLIC_POSTHOG_HOST
      || "https://us.i.posthog.com";
    return [
      // Keep PostHog traffic first-party so browser content blockers do not drop
      // the study-session events before they reach the ingestion API.
      {
        source: "/dfr-collect/:path*",
        destination: `${posthogIngestionHost}/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${backend}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
