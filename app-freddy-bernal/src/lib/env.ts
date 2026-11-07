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
  // Shown on the public privacy and terms pages (Google asks for them to publish the OAuth app).
  contactEmail: process.env.CONTACT_EMAIL ?? '',
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
  // «Organizar por orden del feed» in Ajustes → Google Drive (R4, D-74). Off by default; it also needs Drive as the
  // storage, Drive connected and administración with 2FA (src/lib/actions/drive-organize.ts checks all four).
  redesDriveOrganize: flag('REDES_DRIVE_ORGANIZE'),
  // Phone notifications (Web Push). Keys are optional: without them they are derived
  // from SESSION_SECRET (src/lib/push). PUSH_ENABLED=false turns them off.
  push: {
    enabled: process.env.PUSH_ENABLED !== 'false',
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: process.env.VAPID_SUBJECT ?? 'mailto:avisos@operaciones360.invalid',
  },
  // Team assistant (docs/ASISTENTE.md). ASISTENTE_MODELOS = "provider:model,provider:model";
  // empty = demo brain without AI. Provider keys are read by name (GEMINI_API_KEY, ...).
  assistant: {
    enabled: process.env.ASISTENTE_ENABLED !== 'false',
    models: process.env.ASISTENTE_MODELOS ?? '',
  },
  cronSecret: process.env.CRON_SECRET ?? '',
  uploadChunkMb: Number(process.env.UPLOAD_CHUNK_MB ?? '4'),
  // Where NEW files go (docs/DRIVE.md). Empty = as today (Supabase Storage, or the temp disk in
  // the demo). 'drive' = the client's Google Drive. Read it through storageProvider()
  // (src/lib/storage/provider.ts), which never turns Drive on for the demo by accident.
  storage: {
    provider: process.env.STORAGE_PROVIDER ?? '',
  },
  // Google OAuth web client and Picker key (server only; the Picker key reaches only an admin's
  // browser, through an admin-only action).
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    projectNumber: process.env.GOOGLE_PROJECT_NUMBER ?? '',
    pickerApiKey: process.env.GOOGLE_PICKER_API_KEY ?? '',
  },
  drive: {
    // 32 random bytes in base64 for the sealed Drive grant. Empty = derived from SESSION_SECRET.
    tokenKey: process.env.DRIVE_TOKEN_KEY ?? '',
    // 'proxy' sends upload chunks through the platform (counts against Vercel's transfer).
    // Anything else = straight from the browser to Google.
    uploadMode: (process.env.DRIVE_UPLOAD_MODE === 'proxy' ? 'proxy' : 'direct') as 'direct' | 'proxy',
    // In-memory fake Drive. Only honoured with the demo database (no DATABASE_URL).
    fake: flag('DRIVE_FAKE'),
    // Monthly cap (GB) on Drive bytes the platform serves or relays. Vercel Hobby includes about
    // 10 GB of origin transfer and pauses the project past it. 0 = no cap (Pro).
    transferCapGb: Number(process.env.DRIVE_TRANSFER_CAP_GB ?? '7'),
  },
  // Local work with data that stays (D-94): the demo database as a PGlite on disk (seeded once) and the demo's files,
  // under this folder. Empty = as always (in memory, the temp disk). Never with DATABASE_URL (src/lib/db/local-data.ts).
  localDataDir: process.env.LOCAL_DATA_DIR ?? '',
  // The public website (D-91, D-95): its address (canonical links, sitemap, Open Graph) and whether search engines may
  // index it. Off until production and Juan's decision: robots, meta and X-Robots-Tag say noindex. Never the demo (no
  // DATABASE_URL): its content is invented, or a copy of the official site's (D-101), and neither may be indexed.
  site: {
    url: process.env.SITE_URL ?? '',
    indexable: flag('SITE_INDEXABLE') && !!process.env.DATABASE_URL,
  },
  // Citizen participation (D-92, D-96). Server only. The pepper keys the HMAC of the receipt's secret and of the rate
  // limit's device and network keys; the data key encrypts the contact (AES-256-GCM). Demo mode uses fixed demo values;
  // with DATABASE_URL nothing is stored without them (src/lib/participation/keys.ts and contact-crypto.ts).
  participation: {
    pepper: process.env.PARTICIPATION_PEPPER ?? '',
    dataKey: process.env.PARTICIPATION_DATA_KEY ?? '',
    previousDataKeys: process.env.PARTICIPATION_DATA_KEYS_PREVIOUS ?? '',
  },
  // Cloudflare Turnstile on the public forms: only when both keys are set; otherwise off (the honeypot and the
  // persistent limits stay). The site key reaches the browser through the page; the secret never does.
  turnstile: {
    siteKey: process.env.TURNSTILE_SITE_KEY ?? '',
    secretKey: process.env.TURNSTILE_SECRET_KEY ?? '',
  },
  // The two logical buckets of the website (design §6) and the scanner of the private files.
  buckets: {
    webPublic: process.env.STORAGE_BUCKET_WEB_PUBLIC || 'web-public',
    participation: process.env.STORAGE_BUCKET_PARTICIPATION || 'participacion-privado',
  },
  attachments: {
    scanner: (process.env.ATTACHMENT_SCANNER === 'clamav' ? 'clamav' : 'none') as 'clamav' | 'none',
    clamavHost: process.env.CLAMAV_HOST || '127.0.0.1',
    clamavPort: Number(process.env.CLAMAV_PORT || '3310'),
    clamavTimeoutMs: Number(process.env.CLAMAV_TIMEOUT_MS || '15000'),
  },
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
