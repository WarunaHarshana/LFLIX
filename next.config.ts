import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for mobile app (Capacitor)
  // Set NEXT_EXPORT=1 to build static files, otherwise normal build for web
  output: process.env.NEXT_EXPORT === '1' ? 'export' : undefined,
  distDir: process.env.NEXT_EXPORT === '1' ? 'mobile' : '.next',
  // For static export, use trailing slashes
  trailingSlash: process.env.NEXT_EXPORT === '1',
  // Images must be unoptimized for static export
  images: {
    unoptimized: process.env.NEXT_EXPORT === '1',
  },
};

export default nextConfig;
