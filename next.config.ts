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
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
