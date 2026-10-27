import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  // The whole panel is per-user and dynamic; see docs/DECISIONES.md (D-03).
  cacheComponents: false,
  experimental: {
    // Failed navigations and server actions wait and retry when the signal comes back.
    useOffline: true,
  },
  serverExternalPackages: ['@electric-sql/pglite'],
  // Read from disk when the demo database seeds itself (src/lib/db/migrations.ts, src/lib/db/seed-parts/thumbs.ts):
  // Vercel ships only what is listed here.
  outputFileTracingIncludes: {
    '/**': ['./supabase/migrations/*.sql', './supabase/shim/*.sql', './src/lib/db/demo-assets/*.jpg'],
  },
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
