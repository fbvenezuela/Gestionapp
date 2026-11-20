import { z } from 'zod';
import { getClientConfig } from '../client-config';
import { internalPath, safeHref } from './blocks';

// The public website's settings (web_settings, editable from the administrator) turned into what the pages show, with
// the client's config (config/clients/fb.json «web») as the starting values. A value that does not have the right shape
// is ignored and the starting value stays. The two legal notices (emergencies, denuncia) are not settings: they are one
// text each, in src/lib/participation/notices.ts, said the same way on every page, form, receipt and email (copy audit
// F4). Channels follow one rule everywhere (header, footer, /canales, JSON-LD):
//   * an inactive account (active: false) never shows;
//   * in production only VERIFIED accounts show; the test version also shows the unverified ones, marked «sin verificar»;
//   * the institutional portal shows only when verified (D-95); JSON-LD sameAs carries only verified accounts.
// Pure (no database, no Next): site.ts reads and caches, this decides.

const text = (max: number) => z.string().trim().max(max);
// Only https: the old site's mix of http and https is problem 1 of docs/diagnostico.md.
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'https:' && !!u.hostname && !/\s/.test(v);
    } catch {
      return false;
    }
  }, 'El enlace empieza con https://');

export const NETWORK_LABEL: Record<string, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  x: 'X',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  threads: 'Threads',
  mastodon: 'Mastodon',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  blog: 'Blog',
  web: 'Web',
};

const navLink = z.object({ label: text(40).min(1), path: internalPath });
const account = z.object({
  network: text(30).min(1),
  label: text(60).optional(),
  handle: text(80).min(1),
  url: httpsUrl,
  verified: z.boolean().default(false),
  active: z.boolean().default(true),
  note: text(300).optional(),
});
const channel = z.object({
  label: text(80).optional(),
  handle: text(80).optional(),
  url: httpsUrl,
  verified: z.boolean().default(false),
  active: z.boolean().default(true),
});
const contact = z.object({ label: text(80).min(1), value: text(200).min(1), href: safeHref.optional(), verified: z.boolean().default(false) });

const SCHEMAS = {
  'site.navigation': z.array(navLink).min(1).max(12),
  'site.footer': z.object({ about: text(600).default(''), legal: z.array(navLink).max(8).default([]) }),
  'site.contacts': z.array(contact).max(20),
  'site.social_accounts': z.array(account).max(40),
  'site.whatsapp_channel': channel.nullable(),
  'site.institutional_portal': channel.nullable(),
  'site.youtube_channel': channel.nullable(),
  'site.demo_banner': text(200).min(1),
  'site.identity': z.object({
    name: text(120).min(1),
    title: text(160).min(1),
    region: text(80).optional(),
    greeting: text(120).optional(),
    wordmark: text(200).optional(),
  }),
  'site.structured_data': z.object({ personName: text(120).optional(), jobTitle: text(160).optional(), organizationName: text(200).optional() }),
} as const;

// --- The new website's fields (design of 19/11/2026, wave 0: the types and their defaults; no screen uses them yet) ---
//
// «Autoridades competentes» (design §5.8): who a person can also go to when there is a risk to life or a crime under
// way. Stored in web_settings under AUTHORITIES_KEY, but NOT in SCHEMAS on purpose: SCHEMAS is what the settings screen
// saves in one step (src/lib/actions/web-site.ts), and the authorities are published by a second person (WP2 adds that
// action). Only a phone (shown as a tel: link) and an https link are accepted. Nothing is shown until it is verified:
// until then the page says «Los datos de las autoridades se publican cuando estén verificados.»
export const AUTHORITIES_KEY = 'site.authorities';
const phoneNumber = z
  .string()
  .trim()
  .max(40)
  // «(0276) 000-0000» is how a landline is usually written; short numbers («911») count too.
  .refine((v) => /^\+?\(?[0-9](?:[0-9 ()-]*[0-9])?$/.test(v) && v.replace(/\D/g, '').length >= 3, 'Revisa el teléfono: solo números, espacios, guiones o paréntesis.');
export const authoritySchema = z.object({
  nombre: text(120).min(2),
  telefono: phoneNumber.optional(),
  enlace: httpsUrl.optional(),
  nota: text(300).optional(),
  verificado: z.boolean().default(false),
  activa: z.boolean().default(true),
});
export const AUTHORITIES_SCHEMA = z.array(authoritySchema).max(12);
export type Authority = z.infer<typeof authoritySchema>;
/** An authority as the public pages show it: verified and active only, its phone ready as a tel: link. */
export type PublicAuthority = { nombre: string; telefono: string | null; telHref: string | null; enlace: string | null; nota: string | null };

// The logo slot (design §2.8): config/clients/fb.json → brand.identity, optional; absent means today's look (the text
// wordmark, the panel's «FB» tile). The files live in public/marca/ (PNG at 1× and 2×, made by `npm run marca:preparar`).
const logoFile = z.object({
  src: z.string().regex(/^\/marca\/[a-z0-9-]+\.png$/),
  src2x: z.string().regex(/^\/marca\/[a-z0-9-]+@2x\.png$/).optional(),
  width: z.number().int().min(8).max(1200),
  height: z.number().int().min(8).max(600),
});
const LOGO_NONE = { primary: null, white: null, black: null, olive: null, orange: null };
const MARK_NONE = { primary: null, white: null };
export const brandIdentitySchema = z.object({
  logo: z
    .object({
      primary: logoFile.nullable().default(null),
      white: logoFile.nullable().default(null),
      black: logoFile.nullable().default(null),
      olive: logoFile.nullable().default(null),
      orange: logoFile.nullable().default(null),
    })
    .default(LOGO_NONE),
  mark: z.object({ primary: logoFile.nullable().default(null), white: logoFile.nullable().default(null) }).default(MARK_NONE),
  slogan: text(160).min(1).nullable().default(null),
  pattern: z.string().regex(/^\/marca\/[a-z0-9-]+\.png$/).nullable().default(null),
});
export type BrandIdentity = z.infer<typeof brandIdentitySchema>;
export type LogoFile = z.infer<typeof logoFile>;

/** The client's identity of brand.identity, or null when there is none (today's look) or it does not have the shape. */
export function brandIdentityOf(brand: Record<string, unknown>): BrandIdentity | null {
  if (brand.identity === undefined || brand.identity === null) return null;
  const r = brandIdentitySchema.safeParse(brand.identity);
  if (r.success) return r.data;
  console.error('[web] brand.identity de la configuración no tiene la forma esperada; se usa el aspecto de hoy.');
  return null;
}

type Key = keyof typeof SCHEMAS;
type Value<K extends Key> = z.infer<(typeof SCHEMAS)[K]>;

/** The shape of each setting: the administrator's settings screen checks a value with these before saving it. */
export const SITE_SETTING_SCHEMAS = SCHEMAS;
export type SiteSettingKey = Key;
export type SiteSettingValue<K extends Key> = Value<K>;

export type NavLink = z.infer<typeof navLink>;
export type Contact = z.infer<typeof contact>;
/** An account or channel as the public pages show it (already filtered by the rule above). */
export type PublicChannel = { network: string; networkLabel: string; label: string; handle: string; url: string; verified: boolean };

export type Site = {
  demo: boolean;
  indexable: boolean;
  baseUrl: string;
  name: string;
  title: string;
  region: string;
  greeting: string;
  wordmark: string;
  /** The weekly program's name (the client's brand), for the episodes' page when the navigation does not name it. */
  programName: string;
  /** The weekly bulletin's name (the client's brand: «Semanario …»), for its page and its links. */
  weeklyName: string;
  navigation: NavLink[];
  legal: NavLink[];
  about: string;
  accounts: PublicChannel[];
  sameAs: string[];
  youtube: PublicChannel | null;
  portal: PublicChannel | null;
  whatsapp: PublicChannel | null;
  contacts: Contact[];
  demoBanner: string;
  person: { name: string; jobTitle: string };
  organization: { name: string; areaServed: string; country: string };
  /** «Autoridades competentes»: only the verified and active ones; empty until one is verified. */
  authorities: PublicAuthority[];
  /** With the official site's content (D-101): when the build read it (ISO 8601), for the footer's «Contenido de la web
   * oficial leído el …»; null with the invented content. */
  realReadAt: string | null;
  /** The logo slot of the client's brand.identity, or null: today's text wordmark. */
  identity: BrandIdentity | null;
  /** The slogan (brand.identity.slogan): under the home's subtitle from 1024 px and in the footer; null without one. */
  slogan: string | null;
};

export type SiteOptions = { demo: boolean; indexable: boolean; baseUrl: string; realReadAt?: string | null };

function pick<K extends Key>(raw: Record<string, unknown>, key: K, fallback: Value<K>): Value<K> {
  if (!(key in raw)) return fallback;
  const r = SCHEMAS[key].safeParse(raw[key]);
  if (r.success) return r.data as Value<K>;
  console.error(`[web] el ajuste ${key} no tiene la forma esperada; se usa el valor inicial.`);
  return fallback;
}

/** The starting values: the client's config (what the seed puts in web_settings) and its brand. */
export function defaultSettings(): Record<string, unknown> {
  const cfg = getClientConfig();
  const b = cfg.brand;
  // The office as the official site writes it (seed-client.ts puts the same).
  const title = cfg.web.structuredData.jobTitle || b.clientTitle;
  return {
    ...cfg.web.settings,
    'site.identity': { name: b.clientName, title, region: b.region, greeting: b.greeting, wordmark: `${b.clientName} · ${title}` },
    'site.structured_data': { personName: b.clientName, jobTitle: cfg.web.structuredData.jobTitle, organizationName: cfg.web.structuredData.organizationName },
  };
}

function fallbackOf<K extends Key>(defaults: Record<string, unknown>, key: K): Value<K> {
  return SCHEMAS[key].parse(defaults[key]) as Value<K>;
}

/** Whether a channel shows on the public site: never inactive; verified, or unverified (marked) in the test version. */
export function channelShown(c: { verified: boolean; active: boolean }, demo: boolean): boolean {
  return c.active && (c.verified || demo);
}

/** The authorities as the public pages show them: a stored list that does not have the shape shows none (and says so in
 * the log); never one that is not verified or not active. */
export function publicAuthorities(raw: Record<string, unknown>): PublicAuthority[] {
  if (!(AUTHORITIES_KEY in raw)) return [];
  const r = AUTHORITIES_SCHEMA.safeParse(raw[AUTHORITIES_KEY]);
  if (!r.success) {
    console.error(`[web] el ajuste ${AUTHORITIES_KEY} no tiene la forma esperada; no se muestra ninguna autoridad.`);
    return [];
  }
  return r.data
    .filter((a) => a.verificado && a.activa)
    .map((a) => ({
      nombre: a.nombre,
      telefono: a.telefono ?? null,
      telHref: a.telefono ? `tel:${a.telefono.replace(/[^\d+]/g, '')}` : null,
      enlace: a.enlace ?? null,
      nota: a.nota ?? null,
    }));
}

const toPublic = (c: { network?: string; label?: string; handle?: string; url: string; verified: boolean }, network = c.network ?? 'web'): PublicChannel => ({
  network,
  networkLabel: NETWORK_LABEL[network] ?? (c.label || network),
  label: c.label || NETWORK_LABEL[network] || network,
  handle: c.handle ?? '',
  url: c.url,
  verified: c.verified,
});

export function normalizeSite(raw: Record<string, unknown>, opts: SiteOptions): Site {
  const defaults = defaultSettings();
  const get = <K extends Key>(key: K) => pick(raw, key, fallbackOf(defaults, key));
  const cfg = getClientConfig();
  const identity = get('site.identity');
  const structured = get('site.structured_data');
  const footer = get('site.footer');
  const accounts = get('site.social_accounts');
  const youtube = get('site.youtube_channel');
  const portal = get('site.institutional_portal');
  const whatsapp = get('site.whatsapp_channel');
  const sd = cfg.web.structuredData;
  const brandIdentity = brandIdentityOf(cfg.brand as Record<string, unknown>);
  return {
    demo: opts.demo,
    indexable: opts.indexable,
    baseUrl: opts.baseUrl.replace(/\/+$/, ''),
    name: identity.name,
    title: identity.title,
    region: identity.region ?? cfg.brand.region,
    greeting: identity.greeting ?? cfg.brand.greeting,
    wordmark: identity.wordmark || `${identity.name} · ${identity.title}`,
    programName: cfg.brand.programName,
    weeklyName: cfg.brand.weeklyName || 'Semanario',
    navigation: get('site.navigation'),
    legal: footer.legal,
    about: footer.about,
    accounts: accounts.filter((a) => channelShown(a, opts.demo)).map((a) => toPublic(a)),
    sameAs: [...new Set(accounts.filter((a) => a.active && a.verified).map((a) => a.url))],
    youtube: youtube && channelShown(youtube, opts.demo) ? toPublic(youtube, 'youtube') : null,
    portal: portal && portal.active && portal.verified ? toPublic(portal, 'web') : null,
    whatsapp: whatsapp && channelShown(whatsapp, opts.demo) ? toPublic(whatsapp, 'whatsapp') : null,
    contacts: get('site.contacts').filter((c) => c.verified),
    demoBanner: get('site.demo_banner'),
    person: { name: structured.personName || identity.name, jobTitle: structured.jobTitle || sd.jobTitle },
    organization: { name: structured.organizationName || sd.organizationName, areaServed: sd.areaServed, country: sd.country },
    authorities: publicAuthorities(raw),
    realReadAt: opts.realReadAt ?? null,
    identity: brandIdentity,
    slogan: brandIdentity?.slogan ?? null,
  };
}

/** The label the site's navigation gives an address (the program's route → the program's name), or the fallback. */
export function navLabel(site: Pick<Site, 'navigation'>, path: string, fallback: string): string {
  return site.navigation.find((n) => n.path === path)?.label ?? fallback;
}
