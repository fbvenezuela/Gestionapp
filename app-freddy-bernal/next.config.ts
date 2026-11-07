import type { NextConfig } from 'next';
import { securityHeaderRules } from './src/lib/web/headers';

// The public website's address decides whether the browser is told to upgrade http to https (never on http://localhost,
// where the tests run), and the Supabase project is where the media library lives in production.
const siteUrl = process.env.SITE_URL || process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
const supabaseOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  // The whole panel is per-user and dynamic; see docs/DECISIONES.md (D-03). The public website caches its pages with
  // revalidation instead (src/lib/web/cache.ts, src/lib/web/revalidate.ts).
  cacheComponents: false,
  experimental: {
    // Failed navigations and server actions wait and retry when the signal comes back.
    useOffline: true,
  },
  serverExternalPackages: ['@electric-sql/pglite'],
  // Read from disk when the demo database seeds itself (src/lib/db/migrations.ts, src/lib/db/seed-parts/thumbs.ts) and,
  // when the build fetched it, the official site's content (.real-site/, src/lib/web/real-site.ts): its snapshot for
  // every server and its photos and PDFs for the public files' route. Vercel ships only what is listed here; a folder
  // that is not there (every build but the demo's) matches nothing.
  outputFileTracingIncludes: {
    '/**': ['./supabase/migrations/*.sql', './supabase/shim/*.sql', './src/lib/db/demo-assets/*.jpg', './.real-site/snapshot.json'],
    '/api/archivos/web/*': ['./.real-site/media/*'],
  },
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
  // The media library's photos on the public website (src/components/web/media.tsx): AVIF or WebP of the right size,
  // optimized only from the library (its local route in the demo, the Supabase public bucket in production).
  images: {
    formats: ['image/avif', 'image/webp'],
    localPatterns: [{ pathname: '/api/archivos/web/**', search: '' }],
    remotePatterns: supabaseOrigin ? [new URL(`${supabaseOrigin}/storage/v1/object/public/**`)] : [],
  },
  poweredByHeader: false,
  // Security headers (src/lib/web/headers.ts): the base ones everywhere, plus a CSP and a narrower Permissions-Policy on
  // the public website, and X-Robots-Tag noindex until SITE_INDEXABLE=true (D-95; the panel, the private lookup and
  // the API always).
  async headers() {
    return securityHeaderRules({
      csp: {
        dev: process.env.NODE_ENV !== 'production',
        upgradeInsecure: siteUrl.startsWith('https://'),
        imageOrigins: supabaseOrigin ? [supabaseOrigin] : [],
        turnstile: !!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY),
      },
      indexable: process.env.SITE_INDEXABLE === 'true' || process.env.SITE_INDEXABLE === '1',
    });
  },
};

export default nextConfig;
