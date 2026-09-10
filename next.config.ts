import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Ensure the Prisma query engine binary (.so) ships inside the standalone
  // output — without this the production server fails on first DB access.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/.prisma/**", "./node_modules/@prisma/client/**"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
