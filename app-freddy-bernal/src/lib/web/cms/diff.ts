import { BLOCK_LABEL, type BlockType } from '../blocks';
import type { WebKind } from '../schema';
import { FIELD_LABELS } from './drafts';
import { plainText } from './markup';

// What changes if the publisher publishes this draft (design §3, «Por aprobar»): field by field against what is live,
// and for a page block by block (added, removed, changed, hidden or shown, and whether the order changed). Simple on
// purpose: the person sees which parts changed and a short before → after; the preview shows the whole. Pure.

export type FieldChange = { field: string; label: string; kind: 'added' | 'removed' | 'changed'; before: string; after: string };
export type BlockChange = { id: string; label: string; kind: 'added' | 'removed' | 'changed' | 'hidden' | 'shown'; details: string[] };
export type SnapshotDiff = {
  /** Nothing is live yet: everything is new. */
  first: boolean;
  fields: FieldChange[];
  blocks: BlockChange[];
  /** The blocks that stay, in a different order. */
  reordered: { before: string[]; after: string[] } | null;
  same: boolean;
};

type Obj = Record<string, unknown>;

/** The same value whatever the order of an object's keys (empty strings, null and missing are the same: empty). */
export function stable(x: unknown): string {
  if (x === undefined || x === null || x === '') return '';
  if (Array.isArray(x)) return x.length ? `[${x.map(stable).join(',')}]` : '';
  if (typeof x === 'object') {
    const keys = Object.keys(x as Obj).filter((k) => stable((x as Obj)[k]) !== '').sort();
    return keys.length ? `{${keys.map((k) => `${JSON.stringify(k)}:${stable((x as Obj)[k])}`).join(',')}}` : '';
  }
  return JSON.stringify(x);
}

const RICH = new Set(['body', 'description', 'answer', 'content']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const cut = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** A value as a short text for a person. */
export function describe(field: string, v: unknown): string {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '(vacío)';
  if (RICH.has(field) && Array.isArray(v)) return cut(plainText(v, 200)) || '(vacío)';
  if (typeof v === 'string') return UUID.test(v) ? 'una foto o archivo de la biblioteca' : cut(`«${v}»`);
  if (typeof v === 'number') return new Intl.NumberFormat('es-VE').format(v);
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string' && UUID.test(x))) return v.length === 1 ? '1 elemento de la biblioteca' : `${v.length} elementos de la biblioteca`;
    if (v.every((x) => typeof x === 'string')) return cut(v.join(', '));
    if (v.every((x) => x && typeof x === 'object' && 'label' in (x as Obj))) return cut((v as Obj[]).map((x) => String(x.label)).join(' · '));
    return v.length === 1 ? '1 elemento' : `${v.length} elementos`;
  }
  if (typeof v === 'object') {
    const o = v as Obj;
    if ('amount' in o) return cut(`${describe('amount', o.amount)} ${String(o.currency ?? '')} (fuente: ${String((o.source as Obj | undefined)?.label ?? 'sin fuente')})`);
    if ('percent' in o) return cut(`${String(o.percent)} % (fuente: ${String((o.source as Obj | undefined)?.label ?? 'sin fuente')})`);
    if ('label' in o) return cut(`${String(o.label)}${o.url ? ` (${String(o.url)})` : ''}`);
    return cut(
      Object.entries(o)
        .filter(([, x]) => stable(x) !== '')
        .map(([k, x]) => `${k}: ${describe(k, x)}`)
        .join(' · '),
    );
  }
  return String(v);
}

const SEO_LABELS: Record<string, string> = {
  title: 'título para buscadores', description: 'descripción para buscadores', imageId: 'imagen para redes', canonical: 'dirección canónica',
  noindex: 'ocultar de los buscadores',
};
const BLOCK_DATA_LABELS: Record<string, string> = {
  title: 'título', text: 'texto', mediaId: 'foto', ctaLabel: 'texto del botón', ctaHref: 'enlace del botón', content: 'texto', caption: 'pie de foto',
  wide: 'a lo ancho', mediaIds: 'fotos', youtubeId: 'video', latestEpisode: 'el episodio más reciente', episodeId: 'episodio', ids: 'contenidos elegidos',
  category: 'categoría', limit: 'cuántos', group: 'grupo', municipalityId: 'municipio', state: 'estado', label: 'texto del botón', href: 'enlace',
};

function fieldChanges(kind: WebKind, before: Obj, after: Obj): FieldChange[] {
  const labels = FIELD_LABELS[kind];
  const keys = [...new Set([...Object.keys(labels), ...Object.keys(before), ...Object.keys(after)])].filter((k) => k !== 'blocks');
  const out: FieldChange[] = [];
  for (const k of keys) {
    if (k === 'seo') {
      const b = (before.seo ?? {}) as Obj;
      const a = (after.seo ?? {}) as Obj;
      for (const s of [...new Set([...Object.keys(SEO_LABELS), ...Object.keys(b), ...Object.keys(a)])]) {
        if (stable(b[s]) === stable(a[s])) continue;
        out.push(change(`seo.${s}`, `Buscadores y redes: ${SEO_LABELS[s] ?? s}`, s, b[s], a[s]));
      }
      continue;
    }
    if (stable(before[k]) === stable(after[k])) continue;
    out.push(change(k, labels[k] ?? k, k, before[k], after[k]));
  }
  return out;
}

function change(field: string, label: string, key: string, b: unknown, a: unknown): FieldChange {
  const kind = stable(b) === '' ? 'added' : stable(a) === '' ? 'removed' : 'changed';
  return { field, label, kind, before: describe(key, b), after: describe(key, a) };
}

type B = { id: string; type: string; visible?: boolean; data?: Obj };
const blocksOf = (v: Obj): B[] => (Array.isArray(v.blocks) ? (v.blocks as B[]).filter((b) => b && typeof b.id === 'string') : []);
const blockName = (b: B, i: number) => {
  const label = BLOCK_LABEL[b.type as BlockType] ?? b.type;
  const title = b.data && typeof b.data.title === 'string' ? b.data.title.trim() : '';
  return `${label}${title && title !== label ? ` «${cut(title, 60)}»` : ''} (${i + 1})`;
};

function blockChanges(before: Obj, after: Obj): Pick<SnapshotDiff, 'blocks' | 'reordered'> {
  const b = blocksOf(before);
  const a = blocksOf(after);
  const bById = new Map(b.map((x) => [x.id, x]));
  const aById = new Map(a.map((x) => [x.id, x]));
  const out: BlockChange[] = [];
  a.forEach((x, i) => {
    const old = bById.get(x.id);
    if (!old) {
      out.push({ id: x.id, label: blockName(x, i), kind: 'added', details: [] });
      return;
    }
    if (old.visible !== false && x.visible === false) out.push({ id: x.id, label: blockName(x, i), kind: 'hidden', details: [] });
    if (old.visible === false && x.visible !== false) out.push({ id: x.id, label: blockName(x, i), kind: 'shown', details: [] });
    const od = old.data ?? {};
    const nd = x.data ?? {};
    const details = [...new Set([...Object.keys(od), ...Object.keys(nd)])]
      .filter((k) => stable(od[k]) !== stable(nd[k]))
      .map((k) => `${BLOCK_DATA_LABELS[k] ?? k}: ${describe(k, od[k])} → ${describe(k, nd[k])}`);
    if (old.type !== x.type) details.unshift('cambió de tipo');
    if (details.length) out.push({ id: x.id, label: blockName(x, i), kind: 'changed', details });
  });
  b.forEach((x, i) => {
    if (!aById.has(x.id)) out.push({ id: x.id, label: blockName(x, i), kind: 'removed', details: [] });
  });
  const keptBefore = b.filter((x) => aById.has(x.id)).map((x) => x.id);
  const keptAfter = a.filter((x) => bById.has(x.id)).map((x) => x.id);
  const name = (id: string, list: B[]) => {
    const i = list.findIndex((x) => x.id === id);
    return blockName(list[i], i);
  };
  const reordered = keptBefore.join('|') !== keptAfter.join('|') ? { before: keptBefore.map((id) => name(id, b)), after: keptAfter.map((id) => name(id, a)) } : null;
  return { blocks: out, reordered };
}

/** What changes from what is live (null: nothing is live) to this draft. */
export function diffSnapshots(kind: WebKind, published: unknown, draft: unknown): SnapshotDiff {
  const before = (published && typeof published === 'object' ? published : {}) as Obj;
  const after = (draft && typeof draft === 'object' ? draft : {}) as Obj;
  const fields = fieldChanges(kind, before, after);
  const { blocks, reordered } = kind === 'page' ? blockChanges(before, after) : { blocks: [], reordered: null };
  return { first: !published, fields, blocks, reordered, same: !fields.length && !blocks.length && !reordered };
}
