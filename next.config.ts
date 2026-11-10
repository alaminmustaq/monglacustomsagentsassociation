import type { NextConfig } from "next";

// The browser talks only to this app. Requests to /api and /sanctum are passed to
// the Laravel API, so the session cookie stays on one origin.
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
      { source: "/sanctum/:path*", destination: `${apiUrl}/sanctum/:path*` },
    ];
  },
};

export default nextConfig;
