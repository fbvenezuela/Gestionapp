import { z } from 'zod';
import { getClientConfig } from '../client-config';
import { internalPath, safeHref } from './blocks';

// The public website's settings (web_settings, editable from the administrator) turned into what the pages show, with
// the client's config (config/clients/fb.json «web») as the starting values. A value that does not have the right shape
// is ignored and the starting value stays. Channels follow one rule everywhere (header, footer, /canales, JSON-LD):
//   * an inactive account (active: false) never shows;
//   * in production only VERIFIED accounts show; the test version also shows the «por confirmar» ones, marked;
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
  'site.emergency_notice': text(400).min(1),
  'site.denuncia_notice': text(400).min(1),
  'site.identity': z.object({
    name: text(120).min(1),
    title: text(160).min(1),
    region: text(80).optional(),
    greeting: text(120).optional(),
    wordmark: text(200).optional(),
  }),
  'site.structured_data': z.object({ personName: text(120).optional(), jobTitle: text(160).optional(), organizationName: text(200).optional() }),
} as const;

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
  emergencyNotice: string;
  denunciaNotice: string;
  person: { name: string; jobTitle: string };
  organization: { name: string; areaServed: string; country: string };
};

export type SiteOptions = { demo: boolean; indexable: boolean; baseUrl: string };

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
  return {
    ...cfg.web.settings,
    'site.identity': { name: b.clientName, title: b.clientTitle, region: b.region, greeting: b.greeting, wordmark: `${b.clientName} · ${b.clientTitle}` },
    'site.structured_data': { personName: b.clientName, jobTitle: cfg.web.structuredData.jobTitle, organizationName: cfg.web.structuredData.organizationName },
  };
}

function fallbackOf<K extends Key>(defaults: Record<string, unknown>, key: K): Value<K> {
  return SCHEMAS[key].parse(defaults[key]) as Value<K>;
}

/** Whether a channel shows on the public site: never inactive; verified, or «por confirmar» in the test version. */
export function channelShown(c: { verified: boolean; active: boolean }, demo: boolean): boolean {
  return c.active && (c.verified || demo);
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
    emergencyNotice: get('site.emergency_notice'),
    denunciaNotice: get('site.denuncia_notice'),
    person: { name: structured.personName || identity.name, jobTitle: structured.jobTitle || sd.jobTitle },
    organization: { name: structured.organizationName || sd.organizationName, areaServed: sd.areaServed, country: sd.country },
  };
}

/** The label the site's navigation gives an address («/reporte-bernal» → «Reporte Bernal»), or the fallback. */
export function navLabel(site: Pick<Site, 'navigation'>, path: string, fallback: string): string {
  return site.navigation.find((n) => n.path === path)?.label ?? fallback;
}
