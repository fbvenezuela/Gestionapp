import 'server-only';

// One place to read server configuration. Nothing here is sent to the browser.
function flag(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

export const env = {
  // 'demo' = in-memory Postgres (PGlite) with invented data; 'supabase' = real project.
  dataMode: (process.env.DATABASE_URL ? 'supabase' : 'demo') as 'demo' | 'supabase',
  databaseUrl: process.env.DATABASE_URL ?? '',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  sessionSecret: process.env.SESSION_SECRET ?? '',
  appUrl: process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  appTz: process.env.APP_TZ ?? 'America/Caracas',
  brand: process.env.APP_BRAND ?? 'fb',
  email: {
    mode: (process.env.EMAIL_MODE === 'send' ? 'send' : 'outbox') as 'outbox' | 'send',
    from: process.env.EMAIL_FROM ?? 'Operaciones 360 <onboarding@resend.dev>',
    resendKey: process.env.RESEND_API_KEY ?? '',
  },
  ai: {
    enabled: flag('AI_ENABLED'),
    provider: process.env.AI_PROVIDER ?? 'anthropic',
    model: process.env.AI_MODEL ?? '',
    anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
    monthlyCapUsd: Number(process.env.AI_MONTHLY_CAP_USD ?? '20'),
  },
  publishingEnabled: flag('PUBLISHING_ENABLED'),
  cronSecret: process.env.CRON_SECRET ?? '',
  uploadChunkMb: Number(process.env.UPLOAD_CHUNK_MB ?? '4'),
};

export function isDemo() {
  return env.dataMode === 'demo';
}

// Testing shortcuts: one-tap sign-in per role and no 2FA step. ONLY with the
// in-memory demo database (invented data). With a real database (DATABASE_URL) this
// is always false, whatever the variable says. Turn off in demo with DEMO_SHORTCUTS=false.
export function demoShortcuts() {
  return env.dataMode === 'demo' && process.env.DEMO_SHORTCUTS !== 'false';
}
