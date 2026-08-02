/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  // Queue/db clients stay outside the webpack bundle: they are Node-only and
  // bullmq ships optional native drivers that must not be resolved at build time.
  experimental: {
    serverComponentsExternalPackages: ["bullmq", "ioredis", "pg", "adm-zip"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
