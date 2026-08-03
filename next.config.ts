import type { NextConfig } from "next";

const isExport = process.env.NEXT_EXPORT === '1';

const nextConfig: NextConfig = {
  // Static export for mobile app (Capacitor)
  // Set NEXT_EXPORT=1 to build static files, otherwise normal build for web
  output: isExport ? 'export' : undefined,
  // Export to mobile/app/ subfolder so launcher at mobile/index.html isn't overwritten
  distDir: isExport ? 'mobile/app' : '.next',
  // For static export, use trailing slashes
  trailingSlash: isExport,
  // Images must be unoptimized for static export
  images: {
    unoptimized: isExport,
    // Next 16 rejects any quality not listed here with HTTP 400, and the
    // default is [75] alone. TMDB artwork now bypasses the optimizer entirely,
    // but declaring these keeps any other optimized image from failing the
    // same way if a component asks for a nicer quality.
    qualities: [75, 80, 90],
    remotePatterns: isExport ? [] : [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
      {
        protocol: 'https',
        hostname: 'm.media-amazon.com',
        pathname: '/images/**',
      },
    ],
  },
  // Prevent Turbopack from bundling native Node modules
  serverExternalPackages: ['webtorrent', 'node-datachannel'],
};

export default nextConfig;
