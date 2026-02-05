import type { NextConfig } from "next";

const isExport = process.env.NEXT_EXPORT === '1';

const nextConfig: NextConfig = {
  // Static export for mobile app (Capacitor)
  // Set NEXT_EXPORT=1 to build static files, otherwise normal build for web
  output: isExport ? 'export' : undefined,
  distDir: isExport ? 'mobile' : '.next',
  // For static export, use trailing slashes
  trailingSlash: isExport,
  // Images must be unoptimized for static export
  images: {
    unoptimized: isExport,
  },
};

export default nextConfig;
