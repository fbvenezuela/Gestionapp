// What the real-site build reads from the client's config (config/clients/fb.json → web.realSite: public identifiers
// only, never content) and whether it runs at all. Pure.
//
// The switch at build time (design §1): ON only when there is no DATABASE_URL (the demo, never the real database), the
// config names the official site, and either REAL_SITE_CONTENT is 1/true, or this is Vercel's production deployment
// (VERCEL=1, VERCEL_ENV=production) of the demo's own repository (web.realSite.vercelRepo: a fork of this public
// repository never republishes the official site by itself) and REAL_SITE_CONTENT is not 0/false. GitHub's CI never
// sets VERCEL: it stays invented. The runtime has its own check (src/lib/web/real-site.ts).
import { z } from 'zod';
import { switchOf } from '../../src/lib/web/real-site';

const host = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'el sitio va como dominio (sin https://)');
const positive = z.number().int().positive();

export const realSiteConfig = z.object({
  source: host,
  bioPostId: positive,
  officePostIds: z.array(positive).max(10),
  heroMediaId: positive,
  bioMediaId: positive,
  maxNews: z.number().int().min(0).max(100),
  maxOpinion: z.number().int().min(0).max(100),
  maxEpisodes: z.number().int().min(0).max(15),
  semanarioName: z.string().trim().min(3).max(120).optional(),
  /** «owner/name» of the repository whose production deployment on Vercel turns the switch on by itself. */
  vercelRepo: z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/).optional(),
  youtube: z.object({
    channelId: z.string().regex(/^UC[A-Za-z0-9_-]{22}$/),
    playlistId: z.string().regex(/^UU[A-Za-z0-9_-]{22,}$/),
    handle: z.string().regex(/^@[A-Za-z0-9._-]{3,60}$/),
  }),
});
export type RealSiteConfig = z.infer<typeof realSiteConfig>;

/** The config's block, checked; null when the client has none (or it is broken: then the build says why). */
export function readRealSiteConfig(raw: unknown): { ok: true; config: RealSiteConfig } | { ok: false; error: string | null } {
  if (raw === undefined || raw === null) return { ok: false, error: null };
  const r = realSiteConfig.safeParse(raw);
  if (r.success) return { ok: true, config: r.data };
  const i = r.error.issues[0];
  return { ok: false, error: `web.realSite: ${i?.message ?? 'no tiene la forma esperada'}${i?.path.length ? ` (${i.path.join('.')})` : ''}` };
}

export type BuildDecision = { on: boolean; why: string };

/** Whether this build fetches the official site. The reason names what the build saw of Vercel's variables (none of
 * them is a secret): a production build that stays off says why. */
export function buildDecision(env: Record<string, string | undefined>, hasSource: boolean, vercelRepo?: string): BuildDecision {
  if (env.DATABASE_URL) return { on: false, why: 'hay DATABASE_URL (la base real)' };
  if (!hasSource) return { on: false, why: 'la configuración no tiene web.realSite.source' };
  const flag = switchOf(env.REAL_SITE_CONTENT);
  if (flag === true) return { on: true, why: 'REAL_SITE_CONTENT=1' };
  if (flag === false) return { on: false, why: 'REAL_SITE_CONTENT=0' };
  const saw = `VERCEL=${env.VERCEL || '(vacía)'}, VERCEL_ENV=${env.VERCEL_ENV || '(vacía)'}`;
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production') return { on: false, why: `sin REAL_SITE_CONTENT y fuera del despliegue de producción de Vercel (${saw})` };
  if (vercelRepo) {
    const repo = `${env.VERCEL_GIT_REPO_OWNER ?? ''}/${env.VERCEL_GIT_REPO_SLUG ?? ''}`;
    if (repo.toLowerCase() !== vercelRepo.toLowerCase()) {
      return { on: false, why: `el despliegue de producción es del repositorio «${repo === '/' ? 'sin nombre' : repo}», no de ${vercelRepo} (REAL_SITE_CONTENT=1 lo enciende)` };
    }
  }
  return { on: true, why: 'despliegue de producción en Vercel' };
}

/** The official site's addresses: its origin and its own hosts (with and without www, the first is the main one). */
export function siteOf(config: Pick<RealSiteConfig, 'source'>): { origin: string; host: string; ownHosts: string[] } {
  const h = config.source.replace(/^www\./, '');
  return { origin: `https://${h}`, host: h, ownHosts: [h, `www.${h}`] };
}

/** «Mi Programa 2.0» → «Mi Programa»: the program's name (brand.programName) without its version, as its titles say it. */
export function programNameOf(brandProgramName: string): string {
  return brandProgramName.replace(/\s+v?\d+(?:\.\d+)*\s*$/i, '').trim() || brandProgramName.trim();
}
