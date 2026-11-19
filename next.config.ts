import type { NextConfig } from "next";

// Keep SSO on the frontend origin so Laravel session cookies are scoped there.
const apiUrl = "https://monglacustomsagentsassociation.datadss.com";

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_BACKEND_URL: apiUrl.replace(/\/+$/, ""),
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
      { source: "/sanctum/:path*", destination: `${apiUrl}/sanctum/:path*` },
      { source: "/sso/:path*", destination: `${apiUrl}/sso/:path*` },
    ];
  },
};

export default nextConfig;
