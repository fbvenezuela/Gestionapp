'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Copy, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { BLOCK_LABEL, BLOCK_TYPES, type BlockType } from '@/lib/web/blocks';
import { DOCUMENT_CATEGORIES, FAQ_GROUPS, NEWS_CATEGORIES, PROJECT_CATEGORIES, PROJECT_STATES } from '@/lib/web/schema';
import { plainText } from '@/lib/web/cms/markup';
import { cn } from '@/lib/cn';
import { useEditor } from './editor-context';
import { CheckField, NumberField, SelectField, TextField } from './fields';
import { MediaField, MediaListField } from './media-field';
import { RichTextEditor } from './rich-text-editor';

// The block editor of the website's pages (design §3; the home «inicio» first): add a block from the menu of allowed
// types, move it up or down, hide or show it, edit its form, duplicate it, delete it (with a confirmation). Every control
// is a real button with its name, focus follows a moved block, and a hidden line tells a screen reader what happened.
// Works at 360 px: one column, buttons that wrap.

type B = { id: string; type: BlockType; visible: boolean; data: Record<string, unknown> };

const BLOCK_HELP: Record<BlockType, string> = {
  hero: 'La portada: un título grande, un mensaje corto, una foto y un botón.',
  text: 'Texto con títulos, listas, negritas y enlaces.',
  image: 'Una foto con su pie.',
  gallery: 'Varias fotos juntas.',
  video: 'El Reporte Bernal más reciente o un video de YouTube (carga solo si lo tocan).',
  documents: 'Documentos de Transparencia, elegidos o los últimos de una categoría.',
  faq: 'Preguntas frecuentes de un grupo o elegidas.',
  indicators: 'Las cifras de «Lo hecho» (solo salen las que tienen fuente).',
  projects: 'Obras y acciones: las últimas, de un municipio o elegidas.',
  news: 'Las últimas noticias, o las de una categoría.',
  cta: 'Un llamado a la acción con su botón.',
  notices: 'Los avisos de servicio vigentes.',
  channels: 'Los canales oficiales verificados.',
  participation: 'Los botones de Atención ciudadana (reporte, petición, denuncia, consultar).',
  attended: 'Lo atendido que publicó la coordinación.',
};

const STARTERS: Record<BlockType, Record<string, unknown>> = {
  hero: { title: 'Nuevo título', text: '', mediaId: null },
  text: { title: '', content: [] },
  image: { caption: '' },
  gallery: { title: '', mediaIds: [] },
  video: { title: 'Reporte Bernal', latestEpisode: true },
  documents: { title: 'Documentos', ids: [], limit: 6 },
  faq: { title: 'Preguntas frecuentes', group: 'atencion' },
  indicators: { title: 'Lo hecho', ids: [] },
  projects: { title: 'Gestión y obras', limit: 3 },
  news: { title: 'Actualidad', limit: 4 },
  cta: { title: '', text: '', label: '', href: '/atencion/nueva' },
  notices: { title: 'Avisos de servicio' },
  channels: { title: 'Canales oficiales' },
  participation: { title: '¿Qué quieres hacer?' },
  attended: { title: 'Lo atendido', limit: 3 },
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Whatever was saved → blocks the editor can show (unknown types are kept out). */
export function coerceBlocks(v: unknown): B[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: B[] = [];
  for (const b of v as Record<string, unknown>[]) {
    if (!b || typeof b !== 'object' || !(BLOCK_TYPES as string[]).includes(String(b.type))) continue;
    let id = typeof b.id === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(b.id) ? b.id : newId(String(b.type), seen);
    if (seen.has(id)) id = newId(String(b.type), seen);
    seen.add(id);
    out.push({ id, type: b.type as BlockType, visible: b.visible !== false, data: b.data && typeof b.data === 'object' ? (b.data as Record<string, unknown>) : {} });
  }
  return out;
}

function newId(type: string, taken: Set<string>): string {
  for (;;) {
    const id = `${type}-${Math.random().toString(36).slice(2, 7)}`.slice(0, 40);
    if (!taken.has(id)) return id;
  }
}

function summary(b: B): string {
  const d = b.data;
  if (b.type === 'text') return str(d.title) || plainText(d.content, 90) || 'Sin texto todavía';
  if (b.type === 'cta') return [str(d.title), str(d.label)].filter(Boolean).join(' · ') || 'Sin texto todavía';
  return str(d.title) || (b.type === 'image' ? str(d.caption) : '') || '';
}

export function BlockEditor({ value, onChange }: { value: unknown; onChange: (blocks: B[]) => void }) {
  const { readOnly } = useEditor();
  const [list, setList] = useState<B[]>(() => coerceBlocks(value));
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [say, setSay] = useState('');
  // Where the focus goes after a move, a copy or a removal: a button marked data-focus="<block id>:<which>".
  const focusNext = useRef<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const { confirm, dialog } = useConfirm();
  const menuId = useId();

  useEffect(() => {
    const key = focusNext.current;
    if (!key) return;
    focusNext.current = null;
    root.current?.querySelector<HTMLElement>(`[data-focus="${CSS.escape(key)}"]`)?.focus();
  });
  const setFocusNext = (key: string) => {
    focusNext.current = key;
  };

  const commit = (next: B[]) => {
    setList(next);
    onChange(next);
  };
  const name = (b: B, i: number) => {
    const sum = summary(b);
    return `${BLOCK_LABEL[b.type]}${sum && sum !== BLOCK_LABEL[b.type] ? ` «${sum.slice(0, 40)}»` : ''} (bloque ${i + 1})`;
  };

  const move = (i: number, d: -1 | 1) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    commit(next);
    const to = i + d;
    setSay(`${BLOCK_LABEL[next[to].type]} movido a la posición ${to + 1} de ${next.length}.`);
    // Focus stays on the moved block: on the same arrow, or on the other one when it reached an end.
    const which = (d === -1 && to === 0) || (d === 1 && to === next.length - 1) ? (d === -1 ? 'down' : 'up') : d === -1 ? 'up' : 'down';
    setFocusNext(`${next[to].id}:${which}`);
  };
  const toggle = (i: number) => {
    const b = list[i];
    commit(list.map((x, j) => (j === i ? { ...x, visible: !x.visible } : x)));
    setSay(b.visible ? `${BLOCK_LABEL[b.type]} oculto: no se ve en la web.` : `${BLOCK_LABEL[b.type]} visible.`);
  };
  const duplicate = (i: number) => {
    const taken = new Set(list.map((b) => b.id));
    const copy: B = { ...list[i], id: newId(list[i].type, taken), data: structuredClone(list[i].data) };
    const next = [...list];
    next.splice(i + 1, 0, copy);
    commit(next);
    setSay(`${BLOCK_LABEL[copy.type]} duplicado en la posición ${i + 2}.`);
    setFocusNext(`${copy.id}:edit`);
  };
  const remove = async (i: number) => {
    const b = list[i];
    const ok = await confirm({
      title: `¿Eliminar el bloque «${BLOCK_LABEL[b.type]}»?`,
      body: 'Sale del borrador. Lo publicado no cambia hasta que se publique de nuevo, y las versiones anteriores lo guardan.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) return;
    const next = list.filter((_, j) => j !== i);
    commit(next);
    setSay(`${BLOCK_LABEL[b.type]} eliminado.`);
    const neighbor = next[Math.min(i, next.length - 1)];
    setFocusNext(neighbor ? `${neighbor.id}:edit` : 'add');
  };
  const add = (type: BlockType) => {
    const taken = new Set(list.map((b) => b.id));
    const b: B = { id: newId(type, taken), type, visible: true, data: structuredClone(STARTERS[type]) };
    commit([...list, b]);
    setAdding(false);
    setOpen(b.id);
    setSay(`${BLOCK_LABEL[type]} agregado al final.`);
    setFocusNext(`${b.id}:edit`);
  };
  const setData = (i: number, patch: Record<string, unknown>) => commit(list.map((x, j) => (j === i ? { ...x, data: clean({ ...x.data, ...patch }) } : x)));

  const ref = (key: string) => ({ 'data-focus': key });

  return (
    <section ref={root} aria-labelledby={`${menuId}-t`} className="flex flex-col gap-3">
      {dialog}
      <div>
        <h3 id={`${menuId}-t`} className="text-base font-bold">
          Bloques de la página
        </h3>
        <p className="text-sm text-text-2">Se ven en este orden. Un bloque oculto se queda en el borrador pero no sale en la web.</p>
      </div>
      <p className="sr-only" aria-live="polite">
        {say}
      </p>
      {!list.length ? <p className="rounded-[var(--radius-control)] border border-dashed border-border p-4 text-sm text-text-2">Esta página no tiene bloques todavía.</p> : null}
      <ol className="flex flex-col gap-3">
        {list.map((b, i) => {
          const isOpen = open === b.id;
          const formId = `${menuId}-${b.id}`;
          return (
            <li key={b.id} className={cn('rounded-[var(--radius-control)] border bg-surface', b.visible ? 'border-border' : 'border-dashed border-border opacity-90')}>
              <div className="flex flex-col gap-2 p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="grid h-7 min-w-7 place-items-center rounded-full bg-surface-2 px-2 text-sm font-bold tabular" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{BLOCK_LABEL[b.type]}</span>
                    {summary(b) ? <span className="line-clamp-2 block text-sm text-text-2">{summary(b)}</span> : null}
                  </span>
                  {!b.visible ? <Chip tone="warn">Oculto</Chip> : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    {...ref(`${b.id}:edit`)}
                    type="button"
                    size="sm"
                    variant={isOpen ? 'slate' : 'secondary'}
                    aria-expanded={isOpen}
                    aria-controls={formId}
                    onClick={() => setOpen(isOpen ? null : b.id)}
                  >
                    <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} aria-hidden />
                    {readOnly ? 'Ver' : 'Editar'}
                    <span className="sr-only"> {name(b, i)}</span>
                  </Button>
                  {!readOnly ? (
                    <>
                      <Button {...ref(`${b.id}:up`)} type="button" size="sm" variant="secondary" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir ${name(b, i)}`} title="Subir">
                        <ArrowUp className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Subir</span>
                      </Button>
                      <Button {...ref(`${b.id}:down`)} type="button" size="sm" variant="secondary" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={`Bajar ${name(b, i)}`} title="Bajar">
                        <ArrowDown className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Bajar</span>
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => toggle(i)} aria-label={`${b.visible ? 'Ocultar' : 'Mostrar'} ${name(b, i)}`} title={b.visible ? 'Ocultar' : 'Mostrar'}>
                        {b.visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                        <span className="hidden sm:inline">{b.visible ? 'Ocultar' : 'Mostrar'}</span>
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
              {isOpen ? (
                <div id={formId} className="flex flex-col gap-4 border-t border-border p-3 sm:p-4">
                  <p className="text-sm text-text-2">{BLOCK_HELP[b.type]}</p>
                  <BlockForm block={b} set={(p) => setData(i, p)} />
                  {!readOnly ? (
                    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                      <Button type="button" size="sm" variant="secondary" onClick={() => duplicate(i)}>
                        <Copy className="h-4 w-4" aria-hidden /> Duplicar<span className="sr-only"> {name(b, i)}</span>
                      </Button>
                      <Button type="button" size="sm" variant="danger" onClick={() => remove(i)}>
                        <Trash2 className="h-4 w-4" aria-hidden /> Eliminar el bloque<span className="sr-only"> {name(b, i)}</span>
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {!readOnly ? (
        <div className="flex flex-col gap-2">
          <Button {...ref('add')} type="button" variant="secondary" className="self-start" aria-expanded={adding} aria-controls={`${menuId}-menu`} onClick={() => setAdding(!adding)}>
            <Plus className="h-4 w-4" aria-hidden /> Agregar un bloque
          </Button>
          {adding ? (
            <ul id={`${menuId}-menu`} aria-label="Tipos de bloque" className="grid gap-2 sm:grid-cols-2">
              {BLOCK_TYPES.map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => add(t)}
                    className="flex min-h-14 w-full flex-col items-start gap-0.5 rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-left hover:border-accent focus-visible:border-accent"
                  >
                    <span className="font-semibold">{BLOCK_LABEL[t]}</span>
                    <span className="text-sm text-text-2">{BLOCK_HELP[t]}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Empty strings and undefined out of a block's data (optional fields stay optional). */
function clean(d: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined && v !== ''));
}

function RefChecklist({ label, kind, value, onChange, group }: { label: string; kind: 'document' | 'faq' | 'indicator' | 'project' | 'episode'; value: unknown; onChange: (ids: string[]) => void; group?: string }) {
  const { refs, readOnly } = useEditor();
  const ids = Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  const options = refs.filter((r) => r.kind === kind && (!group || r.group === group));
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-semibold">{label}</legend>
      <p className="text-sm text-text-2">Salen en el orden en que los marques. Sin marcar ninguno, se usan los últimos.</p>
      {options.length ? (
        <ul className="max-h-72 overflow-y-auto rounded-[var(--radius-control)] border border-border">
          {options.map((o) => {
            const at = ids.indexOf(o.id);
            return (
              <li key={o.id} className="border-b border-border last:border-0">
                <label className="flex min-h-11 items-center gap-3 px-3 py-2 text-[15px]">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 accent-[var(--c-accent)]"
                    checked={at >= 0}
                    disabled={readOnly}
                    onChange={(e) => onChange(e.target.checked ? [...ids, o.id] : ids.filter((x) => x !== o.id))}
                  />
                  <span className="min-w-0 flex-1">
                    {at >= 0 ? <span className="mr-1 font-bold tabular">{at + 1}.</span> : null}
                    {o.title || 'Sin título'}
                    {!o.live ? <span className="ml-1 text-sm text-text-2">(no publicado: no se verá)</span> : null}
                    {kind === 'indicator' && !o.hasSource ? <span className="ml-1 text-sm text-warn">(sin fuente: no se verá)</span> : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-text-2">No hay contenidos de este tipo todavía.</p>
      )}
    </fieldset>
  );
}

const entries = <T extends Record<string, string>>(o: T) => Object.entries(o) as [string, string][];

function BlockForm({ block, set }: { block: B; set: (patch: Record<string, unknown>) => void }) {
  const { munis, refs } = useEditor();
  const d = block.data;
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  switch (block.type) {
    case 'hero':
      return (
        <>
          <TextField label="Título grande" required value={d.title} onChange={(v) => set({ title: v })} max={160} />
          <TextField label="Mensaje corto" multiline value={d.text} onChange={(v) => set({ text: v })} max={600} hint="Una o dos frases. Si todavía no está, escribe «Por completar desde el administrador: …» y sale como un espacio por llenar." />
          <MediaField label="Foto" value={d.mediaId} onChange={(id) => set({ mediaId: id })} hint="Sin foto, la web muestra «Foto por subir desde el administrador»." />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Texto del botón (opcional)" value={d.ctaLabel} onChange={(v) => set({ ctaLabel: v })} max={60} />
            <TextField label="Enlace del botón" value={d.ctaHref} onChange={(v) => set({ ctaHref: v })} max={500} placeholder="/atencion/nueva o https://…" inputMode="url" />
          </div>
        </>
      );
    case 'text':
      return (
        <>
          <TextField label="Título del bloque (opcional)" value={d.title} onChange={(v) => set({ title: v })} max={120} />
          <RichTextEditor label="Texto" value={d.content} onChange={(nodes) => set({ content: nodes })} />
        </>
      );
    case 'image':
      return (
        <>
          <MediaField label="Foto" required value={d.mediaId} onChange={(id) => set({ mediaId: id ?? undefined })} />
          <TextField label="Pie de foto (opcional)" value={d.caption} onChange={(v) => set({ caption: v })} max={500} hint="Si lo dejas vacío, sale el pie que tiene en la biblioteca." />
          <CheckField label="A todo lo ancho" checked={d.wide === true} onChange={(v) => set({ wide: v || undefined })} />
        </>
      );
    case 'gallery':
      return (
        <>
          <TextField label="Título (opcional)" value={d.title} onChange={(v) => set({ title: v })} max={120} />
          <MediaListField label="Fotos" value={d.mediaIds} onChange={(ids) => set({ mediaIds: ids })} hint="Al menos una. La primera sale más grande." />
        </>
      );
    case 'video': {
      const episodes = refs.filter((r) => r.kind === 'episode');
      return (
        <>
          <TextField label="Título del bloque" value={d.title} onChange={(v) => set({ title: v })} max={120} />
          <CheckField label="Mostrar el episodio más reciente" hint="Cambia solo cada vez que se publica un episodio." checked={d.latestEpisode === true} onChange={(v) => set({ latestEpisode: v || undefined, ...(v ? { episodeId: undefined, youtubeId: undefined } : {}) })} />
          {d.latestEpisode !== true ? (
            <>
              <SelectField label="Un episodio en particular" value={d.episodeId} onChange={(v) => set({ episodeId: v || undefined })} options={episodes.map((e) => [e.id, e.title] as const)} empty="Ninguno" />
              <TextField label="O un video de YouTube (su código)" value={d.youtubeId} onChange={(v) => set({ youtubeId: v.trim() || undefined })} max={11} mono hint="Las 11 letras que van después de «v=» en el enlace del video." />
            </>
          ) : null}
        </>
      );
    }
    case 'documents':
      return (
        <>
          <TextField label="Título del bloque" value={d.title} onChange={(v) => set({ title: v })} max={120} />
          <RefChecklist label="Documentos elegidos" kind="document" value={d.ids} onChange={(ids) => set({ ids })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="O los últimos de una categoría" value={d.category} onChange={(v) => set({ category: v || undefined })} options={entries(DOCUMENT_CATEGORIES)} empty="Todas" />
            <NumberField label="Cuántos" value={num(d.limit)} onChange={(v) => set({ limit: v })} min={1} max={30} />
          </div>
        </>
      );
    case 'faq':
      return (
        <>
          <TextField label="Título del bloque" value={d.title} onChange={(v) => set({ title: v })} max={120} />
          <SelectField label="Grupo de preguntas" value={d.group} onChange={(v) => set({ group: v || undefined })} options={entries(FAQ_GROUPS)} empty="Todos" />
          <RefChecklist label="O preguntas elegidas" kind="faq" group={str(d.group) || undefined} value={d.ids} onChange={(ids) => set({ ids: ids.length ? ids : undefined })} />
        </>
      );
    case 'indicators':
      return (
        <>
          <TextField label="Título del bloque" value={d.title} onChange={(v) => set({ title: v })} max={120} />
          <RefChecklist label="Indicadores" kind="indicator" value={d.ids} onChange={(ids) => set({ ids })} />
        </>
      );
    case 'projects':
      return (
        <>
          <TextField label="Título del bloque" value={d.title} onChange={(v) => set({ title: v })} max={120} />
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Cuántas" value={num(d.limit)} onChange={(v) => set({ limit: v })} min={1} max={24} />
            <SelectField label="Municipio" value={d.municipalityId} onChange={(v) => set({ municipalityId: v || undefined })} options={munis.map((m) => [m.id, m.name] as const)} empty="Todos" />
            <SelectField label="Categoría" value={d.category} onChange={(v) => set({ category: v || undefined })} options={entries(PROJECT_CATEGORIES)} empty="Todas" />
            <SelectField label="Estado" value={d.state} onChange={(v) => set({ state: v || undefined })} options={entries(PROJECT_STATES)} empty="Todos" />
          </div>
          <RefChecklist label="O obras elegidas" kind="project" value={d.ids} onChange={(ids) => set({ ids: ids.length ? ids : undefined })} />
        </>
      );
    case 'news':
      return (
        <>
          <TextField label="Título del bloque" value={d.title} onChange={(v) => set({ title: v })} max={120} />
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Cuántas" value={num(d.limit)} onChange={(v) => set({ limit: v })} min={1} max={24} />
            <SelectField label="Categoría" value={d.category} onChange={(v) => set({ category: v || undefined })} options={entries(NEWS_CATEGORIES)} empty="Todas" />
          </div>
        </>
      );
    case 'cta':
      return (
        <>
          <TextField label="Título" required value={d.title} onChange={(v) => set({ title: v })} max={120} />
          <TextField label="Texto (opcional)" multiline rows={2} value={d.text} onChange={(v) => set({ text: v })} max={400} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Texto del botón" required value={d.label} onChange={(v) => set({ label: v })} max={60} />
            <TextField label="Enlace del botón" required value={d.href} onChange={(v) => set({ href: v })} max={500} placeholder="/atencion/nueva o https://…" inputMode="url" />
          </div>
        </>
      );
    case 'notices':
    case 'attended':
      return (
        <>
          <TextField label="Título del bloque" value={d.title} onChange={(v) => set({ title: v })} max={120} />
          <NumberField label="Cuántos como máximo" value={num(d.limit)} onChange={(v) => set({ limit: v })} min={1} max={block.type === 'notices' ? 12 : 24} />
        </>
      );
    case 'channels':
    case 'participation':
      return <TextField label="Título del bloque" value={d.title} onChange={(v) => set({ title: v })} max={120} hint={block.type === 'channels' ? 'Los canales se cambian en «Ajustes del sitio».' : 'Los botones son siempre los mismos y llevan al formulario.'} />;
    default:
      return null;
  }
}
