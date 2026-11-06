// The importer's run (scripts/web-import/import.mts is only its command line): reads the old site page by page and,
// for each post, decides and (only with --apply) writes:
//   * new post → a news DRAFT (never published), its photos in the library, where it came from, and its redirects;
//   * imported before and untouched since (same rev, still a draft) → the draft is brought up to date when the old
//     post or the conversion changed; otherwise nothing;
//   * imported before and touched by the team (edited, sent to approval, published, archived) → never touched again.
// A dry run (the default) reads the same and writes NOTHING: no row, no file (with a database at hand it reads it in a
// read-only transaction, to say what would be new, updated or left alone).
import { createHash, randomUUID } from 'node:crypto';
import type { Backend, Sql } from '../../src/lib/db/core';
import { asSystem } from '../../src/lib/db/core';
import { newsSnapshot } from '../../src/lib/web/schema';
import { FLAG_TEXT, type ReviewFlag } from './convert';
import { categoryTarget, draftOf, oldPathOf, planPost, postTarget, slugWithId, tagTarget, type PostPlan, type WpTerm } from './mapping';
import { fetchPhoto, wantFromImage, wantFromWp, type BytesSource, type PhotoWant, type WpMedia } from './media';
import { addPii, piiTotal } from './pii';
import {
  findImported, findImportedMedia, insertItem, insertMedia, mediaBySha, rememberItem, rememberMedia, slugTaken, updateItemDraft, upsertRedirect,
  type MediaStore, type NewMedia, type RedirectOutcome,
} from './store';
import type { WpApi } from './wp-client';

export type RunOptions = {
  api: Pick<WpApi, 'categories' | 'posts' | 'media' | 'tags' | 'counts'>;
  photos: BytesSource & { requests?: number };
  /** The old site's host (web_import_*.site) and every host of its own (with and without www; the first is the main one). */
  site: string;
  ownHosts: string[];
  apply: boolean;
  limit?: number | null;
  since?: string | null;
  /** Only these posts (WordPress ids): to bring or check again a few. */
  ids?: number[] | null;
  noMedia?: boolean;
  /** The largest side of a photo brought (WordPress's own sizes are used when the original is larger). */
  maxSide?: number;
  tz?: string;
  /** --apply: where to write. A dry run may get one to read (read-only), or none. */
  db: Backend | null;
  store: MediaStore | null;
  sample?: number;
  log?: (line: string) => void;
};

export type Action = 'new' | 'update' | 'unchanged' | 'published' | 'in_review' | 'edited' | 'archived' | 'refused' | 'error';

export type SampleRow = {
  id: number;
  from: string | null;
  to: string;
  date: string;
  category: string;
  topics: string[];
  nodes: Record<string, number>;
  photos: number;
  altMissing: number;
  video: boolean;
  flags: ReviewFlag[];
  action: Action;
};

export type PostRow = { id: number; from: string | null; to: string; action: Action; flags: ReviewFlag[] };

export type Report = {
  apply: boolean;
  site: string;
  totalOnSite: number | null;
  pagesOnSite: number | null;
  seen: number;
  actions: Record<Action, number>;
  photos: {
    found: number;
    cover: number;
    inline: number;
    downloaded: number;
    reused: number;
    wouldDownload: number;
    knownBytes: number;
    unknownBytes: number;
    external: number;
    failed: number;
    unsupported: number;
    altMissing: number;
  };
  videos: number;
  pii: { emails: number; phones: number; ids: number; posts: number };
  categories: Record<string, number>;
  topics: Record<string, number>;
  redirects: { posts: number; shortlinks: number; categories: number; tags: number; months: number; feed: number; photos: number; keptManual: number; written: number };
  flags: Partial<Record<ReviewFlag, number>>;
  sample: SampleRow[];
  posts: PostRow[];
  errors: string[];
  requests: number;
};

const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const inc = <K extends string>(o: Partial<Record<K, number>>, k: K, by = 1) => {
  o[k] = (o[k] ?? 0) + by;
};

function emptyReport(apply: boolean, site: string): Report {
  return {
    apply,
    site,
    totalOnSite: null,
    pagesOnSite: null,
    seen: 0,
    actions: { new: 0, update: 0, unchanged: 0, published: 0, in_review: 0, edited: 0, archived: 0, refused: 0, error: 0 },
    photos: { found: 0, cover: 0, inline: 0, downloaded: 0, reused: 0, wouldDownload: 0, knownBytes: 0, unknownBytes: 0, external: 0, failed: 0, unsupported: 0, altMissing: 0 },
    videos: 0,
    pii: { emails: 0, phones: 0, ids: 0, posts: 0 },
    categories: {},
    topics: {},
    redirects: { posts: 0, shortlinks: 0, categories: 0, tags: 0, months: 0, feed: 0, photos: 0, keptManual: 0, written: 0 },
    flags: {},
    sample: [],
    posts: [],
    errors: [],
    requests: 0,
  };
}

/** A read of the database that can never write (dry run), or the system's transaction (apply). */
function reader(db: Backend | null, apply: boolean) {
  return async <T>(fn: (sql: Sql) => Promise<T>, fallback: T): Promise<T> => {
    if (!db) return fallback;
    if (apply) return asSystem(db, fn);
    return db.transaction(async (sql) => {
      await sql.query('set transaction read only');
      return fn(sql);
    });
  };
}

/** A photo of a post once looked at: the library file it is (or will be), and what is still to write for it. */
type Resolved = {
  want: PhotoWant;
  role: 'cover' | 'inline';
  /** The library file (known, a twin, or the id chosen for a new one); null in a dry run for one not brought yet. */
  mediaId: string | null;
  /** Its file in the bucket (for the redirect of its old address). */
  storageKey: string | null;
  /** A new file: its row to insert (the file is already in the bucket). */
  fresh: NewMedia | null;
  /** Remember this address of the old site (a new photo, or a known file under a new address). */
  remember: { sha256: string } | null;
};

export async function runImport(o: RunOptions): Promise<Report> {
  const log = o.log ?? (() => {});
  const report = emptyReport(o.apply, o.site);
  const tz = o.tz ?? 'America/Caracas';
  const maxSide = o.maxSide ?? 2048;
  const read = reader(o.db, o.apply);
  if (o.apply && !o.db) throw new Error('Para escribir hace falta la base (DATABASE_URL o LOCAL_DATA_DIR).');
  if (o.apply && !o.noMedia && !o.store) throw new Error('Para traer las fotos hace falta dónde guardarlas (o usa --no-media).');

  const counts = await o.api.counts();
  report.totalOnSite = counts.posts;
  report.pagesOnSite = counts.pages;
  const categories = new Map((await o.api.categories()).map((c) => [c.id, c]));
  const usedCategories = new Set<number>();
  const usedTags = new Set<number>();
  const months = new Set<string>();

  for await (const page of o.api.posts({ since: o.since, limit: o.limit, ids: o.ids })) {
    report.totalOnSite ??= page.total;
    const plans = page.posts.map((p) => planPost(p, { categories, ownHosts: o.ownHosts, tz }));
    // The photos WordPress knows by id (the post's photo and the ones with their id in the text), a page at a time.
    const ids = plans.flatMap((p) => [p.featuredMediaId ?? 0, ...p.images.map((i) => i.attachmentId ?? 0)]).filter((x) => x > 0);
    const wpMedia = ids.length ? await o.api.media(ids) : new Map<number, WpMedia>();
    for (const plan of plans) {
      try {
        const action = await importOne(plan, wpMedia);
        report.actions[action]++;
        if (action === 'new' || action === 'update' || action === 'unchanged') {
          plan.categoryIds.forEach((c) => usedCategories.add(c));
          plan.tagIds.forEach((t) => usedTags.add(t));
          if (plan.monthPath) months.add(plan.monthPath);
        }
      } catch (e) {
        report.actions.error++;
        report.errors.push(`Artículo ${plan.sourceId}: ${(e as Error).message}`);
        report.posts.push({ id: plan.sourceId, from: plan.oldPath, to: plan.target ?? '', action: 'error', flags: [...plan.flags] });
        log(`  ✗ artículo ${plan.sourceId}: ${(e as Error).message}`);
      }
    }
    log(`  … ${report.seen} artículos revisados`);
  }

  // The old site's lists: categories, tags, month archives and the feed (only for what was imported or is mapped).
  if (o.apply) {
    const tags = usedTags.size ? await o.api.tags([...usedTags]) : new Map<number, WpTerm>();
    const lists: { from: string; to: string; kind: 'categories' | 'tags' | 'months' | 'feed' }[] = [];
    for (const id of usedCategories) {
      const term = categories.get(id);
      const from = term ? oldPathOf(term.link, o.ownHosts) : null;
      if (term && from) lists.push({ from, to: categoryTarget(term), kind: 'categories' });
    }
    for (const id of usedTags) {
      const term = tags.get(id);
      const from = term ? oldPathOf(term.link, o.ownHosts) : null;
      if (term && from) lists.push({ from, to: tagTarget(term), kind: 'tags' });
    }
    for (const m of months) lists.push({ from: m, to: '/actualidad', kind: 'months' });
    // The feed goes to the news (docs/diagnostico.md §5; the client's seed already puts it, by hand: that one stays).
    if (report.seen) lists.push({ from: '/feed', to: '/actualidad', kind: 'feed' });
    if (lists.length) {
      await asSystem(o.db!, async (sql) => {
        for (const r of lists) countRedirect(r.kind, await upsertRedirect(sql, r.from, r.to));
      });
    }
  } else {
    report.redirects.categories = usedCategories.size;
    report.redirects.tags = usedTags.size;
    report.redirects.months = months.size;
    report.redirects.feed = report.seen ? 1 : 0;
  }
  report.requests = o.photos.requests ?? 0;
  return report;

  // --- helpers ---------------------------------------------------------------------------------------------------
  function countRedirect(kind: 'posts' | 'shortlinks' | 'categories' | 'tags' | 'months' | 'feed' | 'photos', outcome: RedirectOutcome) {
    if (outcome === 'manual') {
      report.redirects.keptManual++;
      return;
    }
    report.redirects[kind]++;
    if (outcome !== 'same') report.redirects.written++;
  }

  function wantsOf(plan: PostPlan, wpMedia: Map<number, WpMedia>): { want: PhotoWant; role: 'cover' | 'inline' }[] {
    const out: { want: PhotoWant; role: 'cover' | 'inline' }[] = [];
    const seen = new Set<string>();
    const push = (want: PhotoWant, role: 'cover' | 'inline') => {
      if (seen.has(want.key)) return;
      seen.add(want.key);
      out.push({ want, role });
    };
    if (plan.featuredMediaId) {
      const m = wpMedia.get(plan.featuredMediaId);
      if (m) push(wantFromWp(m, o.ownHosts, maxSide), 'cover');
      else plan.flags.add('image_failed');
    }
    for (const img of plan.images) {
      const m = img.attachmentId ? wpMedia.get(img.attachmentId) : undefined;
      push(m ? wantFromWp(m, o.ownHosts, maxSide, { alt: img.alt, caption: img.caption }) : wantFromImage(img, o.ownHosts), 'inline');
    }
    return out;
  }

  /** The draft with its photos: the post's photo (or the first one) on top, the rest in the gallery (at most 24). A
   * draft past what the database keeps (512 KB) loses its last paragraphs, flagged. */
  function draftFor(plan: PostPlan, resolved: Resolved[]) {
    const ids = resolved.filter((r) => r.mediaId).map((r) => ({ id: r.mediaId!, role: r.role }));
    const coverId = ids.find((r) => r.role === 'cover')?.id ?? ids[0]?.id ?? null;
    const gallery = [...new Set(ids.map((r) => r.id).filter((id) => id !== coverId))];
    if (gallery.length > 24) plan.flags.add('gallery_truncated');
    let draft = draftOf(plan, { coverId, galleryIds: gallery.slice(0, 24) });
    while (JSON.stringify(draft).length > 450_000 && plan.body.length > 1) {
      plan.body = plan.body.slice(0, Math.floor(plan.body.length * 0.9));
      plan.flags.add('text_truncated');
      draft = draftOf(plan, { coverId, galleryIds: gallery.slice(0, 24) });
    }
    return draft;
  }

  async function importOne(plan: PostPlan, wpMedia: Map<number, WpMedia>): Promise<Action> {
    report.seen++;
    const row = (action: Action, to = plan.target ?? ''): Action => {
      report.posts.push({ id: plan.sourceId, from: plan.oldPath, to, action, flags: [...plan.flags] });
      return action;
    };
    if (plan.refused) return row('refused');

    // 1. Was it imported before, and did the team touch it since? Then nothing of it is read further.
    const before = await read((sql) => findImported(sql, o.site, plan.sourceId), null);
    if (before) {
      const to = postTarget(plan, before.slug);
      if (before.has_published) return row('published', to);
      if (before.archived) return row('archived', to);
      if (before.status !== 'draft') return row('in_review', to);
      if (before.rev !== before.item_rev) return row('edited', to);
    }

    // 2. Its photos: the post's photo first, then the ones in the text. Downloaded (apply) before anything is written;
    //    a new one gets its library id here, so the draft can be compared with what was imported before.
    const wants = wantsOf(plan, wpMedia);
    const known = await read((sql) => findImportedMedia(sql, o.site, wants.map((w) => w.want.key)), new Map<string, string>());
    const resolved: Resolved[] = [];
    const uploaded: string[] = [];
    for (const { want, role } of wants) {
      report.photos.found++;
      report.photos[role]++;
      addPii(plan.pii, want.pii);
      if (want.external) {
        plan.flags.add('image_external');
        report.photos.external++;
        continue;
      }
      if (want.altMissing) {
        plan.flags.add('alt_missing');
        report.photos.altMissing++;
      }
      const have = known.get(want.key);
      if (have) {
        report.photos.reused++;
        resolved.push({ want, role, mediaId: have, storageKey: null, fresh: null, remember: null });
        continue;
      }
      if (o.noMedia) {
        plan.flags.add('media_skipped');
        continue;
      }
      if (!o.apply) {
        report.photos.wouldDownload++;
        if (want.bytes) report.photos.knownBytes += want.bytes;
        else report.photos.unknownBytes++;
        resolved.push({ want, role, mediaId: null, storageKey: null, fresh: null, remember: null });
        continue;
      }
      const got = await fetchPhoto(o.photos, want);
      if (!got.ok) {
        plan.flags.add(got.reason === 'unsupported' ? 'image_unsupported' : 'image_failed');
        report.photos[got.reason === 'unsupported' ? 'unsupported' : 'failed']++;
        continue;
      }
      // The same photo under another address (the post's photo again inside the text): one file in the library.
      const twin = await read((sql) => mediaBySha(sql, o.site, got.sha256), null);
      if (twin) {
        report.photos.reused++;
        resolved.push({ want, role, mediaId: twin.mediaId, storageKey: twin.storageKey, fresh: null, remember: { sha256: got.sha256 } });
        continue;
      }
      const id = randomUUID();
      const storageKey = `${randomUUID()}.${got.ext}`;
      await o.store!.put(storageKey, got.bytes, got.mime);
      uploaded.push(storageKey);
      report.photos.downloaded++;
      resolved.push({
        want,
        role,
        mediaId: id,
        storageKey,
        fresh: { id, storageKey, mime: got.mime, bytes: got.bytes.length, width: got.width, height: got.height, alt: want.alt, caption: want.caption },
        remember: { sha256: got.sha256 },
      });
    }

    for (const f of ['email_removed', 'phone_removed', 'id_removed'] as const) {
      if ((f === 'email_removed' && plan.pii.emails) || (f === 'phone_removed' && plan.pii.phones) || (f === 'id_removed' && plan.pii.ids)) plan.flags.add(f);
    }
    const draft = draftFor(plan, resolved);
    const hash = sha(draft);
    const tally = (action: Action, to: string): Action => {
      if (plan.youtubeId) report.videos++;
      report.pii.emails += plan.pii.emails;
      report.pii.phones += plan.pii.phones;
      report.pii.ids += plan.pii.ids;
      if (piiTotal(plan.pii)) report.pii.posts++;
      inc(report.categories, plan.category);
      plan.topics.forEach((t) => inc(report.topics, t));
      plan.flags.forEach((f) => inc(report.flags, f));
      if (report.sample.length < (o.sample ?? 5)) {
        const nodes: Record<string, number> = {};
        for (const x of plan.body) nodes[x.type] = (nodes[x.type] ?? 0) + 1;
        report.sample.push({
          id: plan.sourceId, from: plan.oldPath, to, date: plan.date, category: plan.category, topics: plan.topics, nodes,
          photos: resolved.length, altMissing: resolved.filter((r) => r.want.altMissing).length, video: !!plan.youtubeId, flags: [...plan.flags], action,
        });
      }
      return row(action, to);
    };

    // 3. Dry run: what would happen, nothing written.
    if (!o.apply) {
      const to = postTarget(plan, before?.slug ?? plan.slug);
      if (plan.oldPath) report.redirects.posts++;
      report.redirects.shortlinks++;
      report.redirects.photos += resolved.filter((r) => !r.mediaId && r.want.oldPath).length;
      if (!before) return tally('new', to);
      const allKnown = resolved.every((r) => r.mediaId);
      return tally(allKnown && hash === before.content_hash ? 'unchanged' : 'update', to);
    }

    // 4. Apply. Nothing changed since the last run: nothing is written (the files just brought, if any, go away).
    const dropUploads = async () => {
      for (const key of uploaded) await o.store!.remove(key).catch(() => {});
    };
    if (before && hash === before.content_hash) {
      await dropUploads();
      return tally('unchanged', postTarget(plan, before.slug));
    }
    const check = newsSnapshot.safeParse(draft);
    if (!check.success) {
      await dropUploads();
      const i = check.error.issues[0];
      throw new Error(`el borrador no cumple el esquema (${i?.path.join('.')}: ${i?.message})`);
    }
    const used = new Set([draft.coverId, ...(draft.galleryIds ?? [])].filter(Boolean));
    try {
      // One transaction for the post: its photos, the draft, where it came from and its redirects.
      return await asSystem(o.db!, async (sql) => {
        for (const r of resolved) {
          if (r.fresh && used.has(r.fresh.id)) await insertMedia(sql, r.fresh);
          if (r.remember && r.mediaId && (!r.fresh || used.has(r.fresh.id))) {
            await rememberMedia(sql, { site: o.site, key: r.want.key, url: r.want.url, oldPath: r.want.oldPath, mediaId: r.mediaId, sha256: r.remember.sha256 });
          }
        }
        let itemId: string;
        let rev: number;
        let slug: string;
        let action: Action;
        if (before) {
          const next = await updateItemDraft(sql, before.item_id, before.rev, draft, 'Actualizado desde la web vieja (importador)');
          if (next === null) throw new EditedMeanwhile();
          itemId = before.item_id;
          rev = next;
          slug = before.slug;
          action = 'update';
        } else {
          slug = plan.slug;
          if (await slugTaken(sql, slug, null)) slug = slugWithId(plan.slug, plan.sourceId);
          if (await slugTaken(sql, slug, null)) throw new Error('su dirección ya la usa otro contenido');
          const made = await insertItem(sql, slug, draft, 'Importado de la web vieja');
          itemId = made.id;
          rev = made.rev;
          action = 'new';
        }
        await rememberItem(sql, {
          site: o.site, sourceId: plan.sourceId, itemId, sourceUrl: plan.sourceUrl, sourcePath: plan.oldPath ?? new URL(plan.sourceUrl).pathname,
          publishedAt: plan.publishedAt, modifiedAt: plan.modifiedAt, contentHash: hash, itemRev: rev, flags: [...plan.flags],
        });
        const to = postTarget(plan, slug);
        if (plan.oldPath) countRedirect('posts', await upsertRedirect(sql, plan.oldPath, to));
        countRedirect('shortlinks', await upsertRedirect(sql, `/?p=${plan.sourceId}`, to));
        for (const r of resolved) {
          if (r.remember && r.storageKey && r.want.oldPath && (!r.fresh || used.has(r.fresh.id))) {
            countRedirect('photos', await upsertRedirect(sql, r.want.oldPath, `/api/archivos/web/${r.storageKey}`));
          }
        }
        return tally(action, to);
      });
    } catch (e) {
      // Nothing of this post stays: the files brought for it go too.
      await dropUploads();
      if (e instanceof EditedMeanwhile) return tally('edited', postTarget(plan, before!.slug));
      throw e;
    } finally {
      // Files brought but not used by the draft (past the 24 of the gallery) are not kept.
      for (const r of resolved) if (r.fresh && !used.has(r.fresh.id)) await o.store!.remove(r.fresh.storageKey).catch(() => {});
    }
  }
}

/** Someone saved the draft between the importer's read and its write: it is the team's now. */
class EditedMeanwhile extends Error {}

// --- The report, in words ----------------------------------------------------------------------------------------------
const num = (x: number) => x.toLocaleString('es-VE');
/** «1 mes», «3 meses». */
const count = (x: number | null, one: string, many: string) => (x === null ? `¿?` : `${num(x)} ${x === 1 ? one : many}`);
const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toLocaleString('es-VE', { maximumFractionDigits: 1 })} MB`;

export const ACTION_TEXT: Record<Action, string> = {
  new: 'nuevos',
  update: 'actualizados',
  unchanged: 'sin cambios',
  published: 'ya publicados (no se tocan)',
  in_review: 'en revisión (no se tocan)',
  edited: 'editados por el equipo (no se tocan)',
  archived: 'archivados (no se tocan)',
  refused: 'no importables (con contraseña o no publicados)',
  error: 'con error',
};

export function reportText(r: Report, o: { where?: string } = {}): string {
  const lines: string[] = [];
  const say = (s = '') => lines.push(s);
  say(r.apply ? `Importación de ${r.site}${o.where ? ` → ${o.where}` : ''}` : `Prueba de importación de ${r.site}: no se escribió nada.`);
  say(`En la web vieja: ${count(r.totalOnSite, 'artículo', 'artículos')} y ${count(r.pagesOnSite, 'página', 'páginas')} (las páginas no se importan). Revisados: ${num(r.seen)}.`);
  const acts = (Object.keys(ACTION_TEXT) as Action[]).filter((a) => r.actions[a]).map((a) => `${num(r.actions[a])} ${ACTION_TEXT[a]}`);
  say(`${r.apply ? 'Borradores' : 'Quedarían como borradores'}: ${acts.join(' · ') || 'ninguno'}.`);
  const p = r.photos;
  say(
    `Fotos: ${num(p.found)} (${num(p.cover)} de portada, ${num(p.inline)} dentro del texto) · ` +
      (r.apply
        ? `${num(p.downloaded)} traídas`
        : `se bajarían ${num(p.wouldDownload)}${p.knownBytes ? ` (~${mb(p.knownBytes)}${p.unknownBytes ? ` y ${num(p.unknownBytes)} de tamaño desconocido` : ''})` : ''}`) +
      ` · ${num(p.reused)} ya estaban · ${num(p.altMissing)} sin texto alternativo («[Por escribir]») · ${num(p.external)} de otras páginas (no se traen)` +
      (r.apply ? ` · ${num(p.failed)} fallaron · ${num(p.unsupported)} en formato no admitido` : ''),
  );
  say(`Videos de YouTube: ${num(r.videos)}.`);
  say(`Datos personales quitados: ${num(r.pii.emails)} correos, ${num(r.pii.phones)} teléfonos y ${num(r.pii.ids)} cédulas, en ${num(r.pii.posts)} artículos (nunca se muestran aquí).`);
  const cats = Object.entries(r.categories).map(([k, v]) => `${k} ${num(v)}`).join(' · ');
  const tops = Object.entries(r.topics).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${num(v)}`).join(' · ');
  if (cats) say(`Tipo: ${cats}. Temas: ${tops || 'ninguno'}.`);
  const rd = r.redirects;
  say(
    `Redirecciones${r.apply ? '' : ' que se harían'}: ${count(rd.posts, 'de artículo', 'de artículos')} · ${num(rd.shortlinks)} ?p= · ${count(rd.categories, 'categoría', 'categorías')} · ${count(rd.tags, 'etiqueta', 'etiquetas')} · ${count(rd.months, 'mes', 'meses')} · ${num(rd.feed)} feed · ${count(rd.photos, 'foto', 'fotos')}` +
      (r.apply ? ` (${num(rd.written)} escritas o cambiadas; ${num(rd.keptManual)} hechas a mano, no se tocaron)` : ''),
  );
  const flags = (Object.keys(r.flags) as ReviewFlag[]).sort((a, b) => (r.flags[b] ?? 0) - (r.flags[a] ?? 0));
  if (flags.length) {
    say('Para revisar (artículos):');
    for (const f of flags) say(`  ${num(r.flags[f] ?? 0)} · ${FLAG_TEXT[f]}`);
  }
  if (r.sample.length) {
    say(`Muestra (${r.sample.length}):`);
    for (const s of r.sample) {
      const parts = Object.entries(s.nodes).map(([k, v]) => `${v} ${k}`).join(', ');
      say(
        `  #${s.id} ${s.from ?? '¿?'} → ${s.to} · ${s.date} · ${s.category}${s.topics.length ? ` (${s.topics.join(', ')})` : ''} · ${parts || 'sin texto'}` +
          ` · ${s.photos} fotos${s.altMissing ? ` (${s.altMissing} sin alt)` : ''}${s.video ? ' · video' : ''} · ${ACTION_TEXT[s.action]}${s.flags.length ? ` · revisar: ${s.flags.join(', ')}` : ''}`,
      );
    }
  }
  if (r.errors.length) {
    say(`Errores (${r.errors.length}):`);
    for (const e of r.errors.slice(0, 20)) say(`  ${e}`);
  }
  say(`Peticiones a la web vieja: ${num(r.requests)}.`);
  return lines.join('\n');
}
