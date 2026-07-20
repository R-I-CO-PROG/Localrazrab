import type { NextConfig } from "next";

const apiUrl = process.env.SUVENIR_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const isProd = process.env.NODE_ENV === "production";
const siteHost = process.env.NEXT_PUBLIC_SITE_HOST;

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: isProd
      ? [
          ...(siteHost
            ? [{ protocol: "https" as const, hostname: siteHost, pathname: "/uploads/**" }]
            : []),
          { protocol: "http", hostname: "localhost", port: "3001", pathname: "/uploads/**" },
        ]
      : [
          { protocol: "http", hostname: "localhost", port: "3001", pathname: "/uploads/**" },
          { protocol: "https", hostname: "**" },
        ],
  },
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: `${apiUrl}/uploads/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // Slide preview is embedded in an iframe on the same site (presentation editor).
        source: "/api/presentations/ai/:id/slides/:slideId/preview",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default nextConfig;
