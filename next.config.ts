import type { NextConfig } from "next";

import { getSecurityHeaders } from "./src/lib/security-headers";

const isDevelopment = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    /*
     * How long a `<Link prefetch>` payload stays usable in the client cache.
     * The library routes prefetch in full but hold no server data, so the
     * default five minutes only means the first tab tap after a pause pays a
     * round trip again. `router.prefetch` cannot re-arm them — it can only
     * issue an auto prefetch, which stores nothing for a dynamic route — so
     * the lifetime is the lever. Mutations call `router.refresh`, which drops
     * the cache, and the only other pages this reaches are static ones.
     */
    staleTimes: { static: 1800 },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeaders(isDevelopment),
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
