// The «prebuild» of `npm run build` (snapshot.mts is its command line): decides whether this build carries the official
// site's content (settings.ts buildDecision) and, when it does, fetches it (build.ts with sources.ts) and writes
// .real-site/. It never fails the build because of the official site:
//   * off → .real-site/ is removed (a stale one would show real content in an invented build) and that is all, at once;
//   * the site does not answer → the last good snapshot kept in .next/cache/real-site/last is put back, or, without one,
//     nothing (the demo shows the invented content) and a loud warning;
//   * YouTube or the weekly's Drive file do not answer → that part comes from the last good snapshot, when there is one.
//     YouTube is asked three ways first (sources.ts): its list of long videos, the channel's own feed and, only with
//     YOUTUBE_API_KEY, its official API. The key is read here and handed to the network code: never logged or kept.
import fs from 'node:fs';
import path from 'node:path';
import type { ClientConfig } from '../../src/lib/client-config';
import { REAL_SITE, parseRealSnapshot, type RealItem, type RealSnapshot } from '../../src/lib/web/real-site';
import type { Fetcher } from '../web-import/wp-client';
import type { BuildResult } from './build';
import { buildDecision, programNameOf, readRealSiteConfig } from './settings';

export type PrebuildOptions = {
  appDir: string;
  env: Record<string, string | undefined>;
  config: ClientConfig;
  fetcher?: Fetcher;
  log?: (line: string) => void;
  warn?: (line: string) => void;
  now?: () => Date;
  /** Pauses between requests and before a retry (the tests make them instant). */
  delays?: { api: number; files: number };
  sleep?: (ms: number) => Promise<void>;
};

export type PrebuildResult =
  | { status: 'off'; why: string }
  | { status: 'written'; snapshot: RealSnapshot; ms: number }
  | { status: 'reused'; snapshot: RealSnapshot; ms: number; error: string }
  | { status: 'none'; ms: number; error: string };

/** Which media a set of items names (cover, gallery, PDF). */
function mediaIdsOf(items: readonly RealItem[]): Set<string> {
  const out = new Set<string>();
  for (const it of items) {
    const d = it.draft as { coverId?: unknown; galleryIds?: unknown; fileId?: unknown };
    for (const v of [d.coverId, d.fileId, ...(Array.isArray(d.galleryIds) ? d.galleryIds : [])]) if (typeof v === 'string') out.add(v);
  }
  return out;
}

/** The parts that did not answer this time, taken from the last good snapshot (and its files). */
export function carryOver(next: BuildResult, last: { snapshot: RealSnapshot; dir: string }): BuildResult {
  const kinds: Record<'youtube' | 'semanario', 'episode' | 'document'> = { youtube: 'episode', semanario: 'document' };
  const s = structuredClone(next.snapshot);
  const files = new Map(next.files);
  const carried: string[] = [];
  for (const part of next.failed) {
    const kind = kinds[part];
    if (s.items.some((i) => i.kind === kind)) continue;
    const old = last.snapshot.items.filter((i) => i.kind === kind);
    if (!old.length) continue;
    const ids = mediaIdsOf(old);
    const have = new Set(s.media.map((m) => m.id));
    for (const m of last.snapshot.media) {
      if (!ids.has(m.id) || have.has(m.id)) continue;
      s.media.push(m);
      files.set(m.key, new Uint8Array(fs.readFileSync(path.join(last.dir, REAL_SITE.media, m.key))));
    }
    s.items.push(...old);
    if (part === 'youtube') s.accounts = last.snapshot.accounts;
    carried.push(part);
  }
  if (!carried.length) return next;
  s.media.sort((a, b) => a.id.localeCompare(b.id));
  const order: Record<string, number> = { news: 0, episode: 1, document: 2 };
  const date = (it: RealItem) => String((it.draft as { date?: string }).date ?? '');
  s.items.sort((a, b) => order[a.kind] - order[b.kind] || date(b).localeCompare(date(a)) || a.id.localeCompare(b.id));
  s.report = {
    ...s.report,
    episodes: s.items.filter((i) => i.kind === 'episode').length,
    documents: s.items.filter((i) => i.kind === 'document').length,
    photos: s.media.filter((m) => m.kind === 'image').length,
    mediaBytes: s.media.reduce((n, m) => n + m.bytes, 0),
    carriedOver: carried,
  };
  return { snapshot: s, files, failed: next.failed.filter((f) => !carried.includes(f)) };
}

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;

export async function prebuild(o: PrebuildOptions): Promise<PrebuildResult> {
  const log = o.log ?? ((l: string) => console.log(l));
  const warn = o.warn ?? ((l: string) => console.warn(l));
  const realDir = path.join(o.appDir, REAL_SITE.dir);
  const block = readRealSiteConfig((o.config.web as { realSite?: unknown }).realSite);
  if (!block.ok && block.error) warn(`[contenido real] ${block.error}`);
  const decision = buildDecision(o.env, block.ok);
  if (!decision.on || !block.ok) {
    fs.rmSync(realDir, { recursive: true, force: true });
    log(`[contenido real] apagado: ${decision.why}. La demo usa el contenido inventado.`);
    return { status: 'off', why: decision.why };
  }

  const t0 = Date.now();
  const cacheDir = path.join(o.appDir, '.next', 'cache', 'real-site');
  const youtubeApiKey = (o.env.YOUTUBE_API_KEY ?? '').trim() || null;
  log(`[contenido real] encendido (${decision.why}): se lee ${block.config.source}, YouTube${youtubeApiKey ? ' (con la API, si hace falta)' : ''} y el Semanario…`);
  // Loaded only now: an «off» build (CI, every local build) stays under a second.
  const { buildSnapshot } = await import('./build');
  const { networkSources, Deadline } = await import('./sources');
  const { DownloadCache, readLastGood, restoreLastGood, saveLastGood, writeRealSite } = await import('./cache');
  const budgetS = Number(o.env.REAL_SITE_BUDGET_S);
  const deadline = new Deadline((Number.isFinite(budgetS) && budgetS > 0 ? budgetS : 480) * 1000);
  const cache = new DownloadCache(path.join(cacheDir, 'files'));
  try {
    const cfg = o.config;
    const settings = cfg.web.settings as Record<string, unknown>;
    const accounts = [
      ...((settings['site.social_accounts'] as { url?: unknown }[] | undefined) ?? []),
      ...(settings['site.youtube_channel'] ? [settings['site.youtube_channel'] as { url?: unknown }] : []),
    ].filter((a): a is { url: string } => typeof a?.url === 'string');
    const sources = networkSources({
      config: block.config,
      fetcher: o.fetcher ?? ((u, i) => fetch(u, i)),
      deadline,
      cache,
      youtubeApiKey,
      log: (l) => log(`[contenido real] ${l.trim()}`),
      apiDelayMs: o.delays?.api,
      fileDelayMs: o.delays?.files,
      sleep: o.sleep,
    });
    let result = await buildSnapshot(
      {
        config: block.config,
        programName: programNameOf(cfg.brand.programName),
        tz: o.env.APP_TZ || cfg.timezone || 'America/Caracas',
        accounts,
        fallbackIdentity: { name: cfg.brand.clientName, tagline: `${cfg.brand.clientName} - ${cfg.web.structuredData.jobTitle}` },
        now: (o.now ?? (() => new Date()))(),
        log: (l) => log(`[contenido real] ${l.trim()}`),
      },
      sources,
    );
    if (result.failed.length) {
      const last = readLastGood(cacheDir);
      if (last) result = carryOver(result, last);
      const again = parseRealSnapshot(result.snapshot);
      if (!again.ok) throw new Error(`lo traído de la vez anterior no encaja: ${again.error}`);
    }
    writeRealSite(realDir, result.snapshot, result.files);
    saveLastGood(realDir, cacheDir);
    cache.prune();
    const r = result.snapshot.report;
    const ms = Date.now() - t0;
    log(
      `[contenido real] listo en ${(ms / 1000).toFixed(1)} s: ${r.news} noticias, ${r.opinion} de opinión, ${r.episodes} emisiones, ` +
        `${r.documents} Semanario, ${r.photos} fotos (${mb(r.mediaBytes ?? 0)}), ${r.requests ?? 0} peticiones, ${cache.hits} archivos ya guardados` +
        `${r.carriedOver?.length ? `; de la vez anterior: ${r.carriedOver.join(', ')}` : ''}; ${r.skipped.length} cosas quedaron fuera.`,
    );
    for (const s of r.skipped.slice(0, 40)) log(`[contenido real]   fuera: ${s.ref} (${s.reason})`);
    return { status: 'written', snapshot: result.snapshot, ms };
  } catch (e) {
    const error = (e as Error).message;
    const ms = Date.now() - t0;
    const kept = restoreLastGood(cacheDir, realDir);
    if (kept) {
      warn(`[contenido real] ⚠ La web oficial no respondió (${error}). Se usa la copia anterior, del ${kept.fetchedAt}.`);
      return { status: 'reused', snapshot: kept, ms, error };
    }
    fs.rmSync(realDir, { recursive: true, force: true });
    warn(`[contenido real] ⚠⚠ La web oficial no respondió (${error}) y no hay copia anterior: la demo sale con el contenido INVENTADO.`);
    return { status: 'none', ms, error };
  } finally {
    deadline.dispose();
  }
}
