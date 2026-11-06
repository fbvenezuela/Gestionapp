'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DOCUMENT_CATEGORIES, FAQ_GROUPS, NEWS_CATEGORIES, NOTICE_CATEGORIES, PROJECT_CATEGORIES, PROJECT_STATES, type WebKind } from '@/lib/web/schema';
import { inputToIso, isoToInput } from '@/lib/web/cms/schedule';
import { BlockEditor } from './block-editor';
import { useEditor } from './editor-context';
import { DateField, Group, NumberField, SelectField, SourcesField, TagsField, TextField } from './fields';
import { MediaField, MediaListField } from './media-field';
import { RichTextEditor } from './rich-text-editor';

// The form of each kind of content (src/lib/web/schema.ts), with the rules the site keeps in the person's words: no
// figure without its source (an investment, a progress, an indicator), a notice with when it was updated and until when
// it applies, a document with its PDF. Each field changes its piece of the draft; the editor checks the whole.

type Obj = Record<string, unknown>;
type Props = { draft: Obj; set: (patch: Obj) => void };

const entries = <T extends Record<string, string>>(o: T) => Object.entries(o) as [string, string][];
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Drops a key when the value is empty (optional fields stay out of the draft instead of being ''). */
function opt(v: string): string | undefined {
  return v.trim() ? v : undefined;
}

function Basics({ draft, set, titleLabel = 'Título', excerpt = true, date = true }: Props & { titleLabel?: string; excerpt?: boolean; date?: boolean | string }) {
  return (
    <>
      <TextField label={titleLabel} required value={draft.title} onChange={(v) => set({ title: v })} max={160} />
      {excerpt ? (
        <TextField
          label="Resumen"
          multiline
          rows={2}
          value={draft.excerpt}
          onChange={(v) => set({ excerpt: opt(v) })}
          max={400}
          hint="Una o dos frases: sale en las listas y, si no escribes otra, en los buscadores."
        />
      ) : null}
      {date ? (
        <DateField label="Fecha" value={draft.date} onChange={(v) => set({ date: opt(v) })} hint={typeof date === 'string' ? date : 'La fecha que se muestra y por la que se ordena.'} />
      ) : null}
    </>
  );
}

function Municipality({ value, onChange, label = 'Municipio', empty = 'Todo el estado' }: { value: unknown; onChange: (v: string | null) => void; label?: string; empty?: string }) {
  const { munis } = useEditor();
  return <SelectField label={label} value={value} onChange={(v) => onChange(v || null)} options={munis.map((m) => [m.id, m.name] as const)} empty={empty} />;
}

export function NewsForm({ draft, set }: Props) {
  return (
    <>
      <Group title="Lo principal">
        <Basics draft={draft} set={set} date="La de la nota. Para una nota vieja, la de entonces." />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Tipo" value={draft.category} onChange={(v) => set({ category: v })} options={entries(NEWS_CATEGORIES)} />
          <TextField label="Firma" value={draft.author} onChange={(v) => set({ author: opt(v) })} max={120} hint="Quién la firma: «Prensa» o el nombre." />
        </div>
        <Municipality value={draft.municipalityId} onChange={(v) => set({ municipalityId: v })} />
        <MediaField label="Foto principal" value={draft.coverId} onChange={(id) => set({ coverId: id })} />
      </Group>
      <Group title="Texto">
        <RichTextEditor label="Texto de la nota" value={draft.body} onChange={(nodes) => set({ body: nodes })} />
      </Group>
      <Group title="Fotos, fuentes y temas">
        <MediaListField label="Galería" value={draft.galleryIds} onChange={(ids) => set({ galleryIds: ids })} hint="Fotos al final de la nota (opcional)." />
        <SourcesField label="Fuentes" value={draft.sources} onChange={(v) => set({ sources: v })} hint="De dónde sale lo que dice la nota: una institución, un documento, un enlace." />
        <TagsField label="Temas" value={draft.topics} onChange={(v) => set({ topics: v })} />
      </Group>
    </>
  );
}

export function ProjectForm({ draft, set }: Props) {
  const investment = obj(draft.investment);
  const progress = obj(draft.progress);
  const dates = obj(draft.dates);
  const setDates = (patch: Obj) => {
    const next = Object.fromEntries(Object.entries({ ...dates, ...patch }).filter(([, v]) => typeof v === 'string' && v));
    set({ dates: Object.keys(next).length ? next : undefined });
  };
  return (
    <>
      <Group title="Lo principal">
        <Basics draft={draft} set={set} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Categoría" value={draft.category} onChange={(v) => set({ category: v })} options={entries(PROJECT_CATEGORIES)} />
          <SelectField label="Estado" value={draft.state} onChange={(v) => set({ state: v })} options={entries(PROJECT_STATES)} hint="Lo que se puede decir con seguridad: anunciada, en ejecución o concluida." />
        </div>
        <Municipality value={draft.municipalityId} onChange={(v) => set({ municipalityId: v })} empty="Por precisar" />
        <TextField label="Parroquia, localidad o sector" value={draft.place} onChange={(v) => set({ place: opt(v) })} max={200} hint="Como lo dice la gente: no hay una lista oficial de parroquias todavía." />
        <MediaField label="Foto principal" value={draft.coverId} onChange={(id) => set({ coverId: id })} />
      </Group>
      <Group title="De qué se trata">
        <RichTextEditor label="Descripción" value={draft.description} onChange={(nodes) => set({ description: nodes })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Para quién" value={draft.beneficiaries} onChange={(v) => set({ beneficiaries: opt(v) })} max={200} hint="Por ejemplo: 3.000 familias del sector." />
          <TextField label="Organismo responsable" value={draft.organization} onChange={(v) => set({ organization: opt(v) })} max={160} />
        </div>
      </Group>
      <Group title="Cifras (solo con su fuente)" hint="Nunca un monto ni un porcentaje sin decir de dónde sale: si no hay fuente, déjalos sin poner.">
        {draft.investment ? (
          <div className="flex flex-col gap-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField label="Inversión" value={investment.amount} onChange={(n) => set({ investment: { ...investment, amount: n } })} min={0} step={0.01} />
              <SelectField label="Moneda" value={investment.currency} onChange={(v) => set({ investment: { ...investment, currency: v } })} options={[['USD', 'Dólares (USD)'], ['VES', 'Bolívares (VES)']]} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Fuente de la inversión" required value={obj(investment.source).label} onChange={(v) => set({ investment: { ...investment, source: { ...obj(investment.source), label: v } } })} max={200} />
              <TextField label="Enlace de la fuente (si tiene)" value={obj(investment.source).url} onChange={(v) => set({ investment: { ...investment, source: { label: str(obj(investment.source).label), ...(v.trim() ? { url: v } : {}) } } })} max={500} inputMode="url" />
            </div>
            <Button type="button" variant="ghost" className="self-start" onClick={() => set({ investment: undefined })}>
              Quitar la inversión
            </Button>
          </div>
        ) : (
          <Button type="button" variant="secondary" className="self-start" onClick={() => set({ investment: { currency: 'USD', source: { label: '' } } })}>
            Agregar la inversión (con su fuente)
          </Button>
        )}
        {draft.progress ? (
          <div className="flex flex-col gap-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField label="Avance (%)" value={progress.percent} onChange={(n) => set({ progress: { ...progress, percent: n } })} min={0} max={100} />
              <TextField label="Fuente del avance" required value={obj(progress.source).label} onChange={(v) => set({ progress: { ...progress, source: { ...obj(progress.source), label: v } } })} max={200} />
            </div>
            <Button type="button" variant="ghost" className="self-start" onClick={() => set({ progress: undefined })}>
              Quitar el avance
            </Button>
          </div>
        ) : (
          <Button type="button" variant="secondary" className="self-start" onClick={() => set({ progress: { source: { label: '' } } })}>
            Agregar el avance (con su fuente)
          </Button>
        )}
      </Group>
      <Group title="Fechas y evidencias">
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField label="Anunciada" value={dates.announced} onChange={(v) => setDates({ announced: v })} />
          <DateField label="Inicio" value={dates.started} onChange={(v) => setDates({ started: v })} />
          <DateField label="Fin estimado" value={dates.expected} onChange={(v) => setDates({ expected: v })} />
          <DateField label="Concluida" value={dates.finished} onChange={(v) => setDates({ finished: v })} />
        </div>
        <DateField label="Última actualización" value={draft.updatedOn} onChange={(v) => set({ updatedOn: opt(v) })} hint="El día en que se revisó por última vez lo que dice esta ficha." />
        <MediaListField label="Evidencias" value={draft.evidenceIds} onChange={(ids) => set({ evidenceIds: ids })} hint="Fotos de la obra: antes, durante y después." />
        <TextField label="Video de YouTube (su código)" value={draft.youtubeId} onChange={(v) => set({ youtubeId: v.trim() || null })} max={11} mono hint="Las 11 letras que van después de «v=» en el enlace del video (opcional)." />
      </Group>
    </>
  );
}

export function EpisodeForm({ draft, set }: Props) {
  return (
    <>
      <Group title="El episodio">
        <Basics draft={draft} set={set} date="El día en que salió el programa." />
        <TextField label="Video de YouTube (su código)" value={draft.youtubeId} onChange={(v) => set({ youtubeId: v.trim() || null })} max={11} mono hint="Las 11 letras que van después de «v=». Sin código, la web muestra «Video por enlazar»." />
        <NumberField label="Duración (minutos)" value={draft.minutes} onChange={(n) => set({ minutes: n })} min={1} max={600} />
        <MediaField label="Foto de portada" value={draft.coverId} onChange={(id) => set({ coverId: id })} />
      </Group>
      <Group title="Temas y enlaces">
        <TagsField label="Temas" value={draft.topics} onChange={(v) => set({ topics: v })} />
        <SourcesField label="Enlaces" value={draft.links} onChange={(v) => set({ links: v })} urlRequired max={10} hint="Por ejemplo, las notas que se mencionan en el programa." />
      </Group>
    </>
  );
}

export function DocumentForm({ draft, set }: Props) {
  return (
    <Group title="El documento">
      <Basics draft={draft} set={set} date="La fecha del documento." />
      <SelectField label="Categoría" value={draft.category} onChange={(v) => set({ category: v })} options={entries(DOCUMENT_CATEGORIES)} hint="El Semanario sale en Actualidad › Semanario; el kit de prensa, en El gobernador." />
      <MediaField label="Archivo PDF" kind="document" required value={draft.fileId} onChange={(id) => set({ fileId: id })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Versión" value={draft.versionLabel} onChange={(v) => set({ versionLabel: opt(v) })} max={60} hint="Por ejemplo: «n.º 12» o «Versión final»." />
        <NumberField label="Páginas" value={draft.pages} onChange={(n) => set({ pages: n })} min={1} max={5000} />
      </div>
    </Group>
  );
}

export function NoticeForm({ draft, set }: Props) {
  const { munis, tz } = useEditor();
  const chosen = Array.isArray(draft.municipalityIds) ? (draft.municipalityIds as string[]) : [];
  const setMunis = (ids: string[]) => set({ municipalityIds: ids, municipalityId: ids.length === 1 ? ids[0] : null });
  return (
    <>
      <Group title="El aviso">
        <TextField label="Título" required value={draft.title} onChange={(v) => set({ title: v })} max={160} hint="Qué pasa, corto: «Corte de agua en el centro»." />
        <SelectField label="Servicio" value={draft.category} onChange={(v) => set({ category: v })} options={entries(NOTICE_CATEGORIES)} />
        <TextField label="Texto del aviso" required multiline rows={4} value={draft.body} onChange={(v) => set({ body: v })} max={1200} hint="Dónde, desde cuándo, hasta cuándo y qué hacer. Sin teléfonos que no estén verificados." />
      </Group>
      <Group title="Cuándo" hint="La web muestra el aviso con su fecha de actualización y deja de mostrarlo solo cuando vence.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <DateField type="datetime-local" label="Actualizado" value={isoToInput(str(draft.updatedAt), tz)} onChange={(v) => set({ updatedAt: inputToIso(v, tz) ?? draft.updatedAt })} />
            <Button type="button" size="sm" variant="secondary" className="self-start" onClick={() => set({ updatedAt: new Date().toISOString() })}>
              Ahora
            </Button>
          </div>
          <DateField type="datetime-local" label="Vence (opcional)" value={isoToInput(str(draft.expiresAt), tz)} onChange={(v) => set({ expiresAt: v ? inputToIso(v, tz) : null })} hint="Hora del Táchira. Vacío: no vence." />
        </div>
        <DateField label="Fecha" value={draft.date} onChange={(v) => set({ date: opt(v) })} hint="La que se muestra en las listas." />
      </Group>
      <Group title="Municipios afectados" hint="Sin marcar ninguno, el aviso es para todo el estado.">
        <ul className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
          {munis.map((m) => (
            <li key={m.id}>
              <label className="flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-2 text-[15px] hover:bg-surface-2">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--c-accent)]"
                  checked={chosen.includes(m.id)}
                  onChange={(e) => setMunis(e.target.checked ? [...chosen, m.id] : chosen.filter((x) => x !== m.id))}
                />
                {m.name}
              </label>
            </li>
          ))}
        </ul>
      </Group>
    </>
  );
}

export function FaqForm({ draft, set }: Props) {
  return (
    <Group title="La pregunta">
      <TextField label="Pregunta" required value={draft.title} onChange={(v) => set({ title: v })} max={160} hint="Como la haría la gente: «¿Cómo sigo mi solicitud?»." />
      <SelectField label="Grupo" value={draft.category} onChange={(v) => set({ category: v })} options={entries(FAQ_GROUPS)} hint="«Atención ciudadana» sale en la página de Atención." />
      <RichTextEditor label="Respuesta" required value={draft.answer} onChange={(nodes) => set({ answer: nodes })} />
      <NumberField label="Orden" value={draft.order} onChange={(n) => set({ order: n })} min={0} max={1000} hint="Las de número menor salen primero." />
    </Group>
  );
}

export function IndicatorForm({ draft, set }: Props) {
  const source = draft.source ? obj(draft.source) : null;
  return (
    <>
      <Group title="La cifra">
        <TextField label="Qué se cuenta" required value={draft.title} onChange={(v) => set({ title: v })} max={160} hint="Por ejemplo: «Viviendas entregadas»." />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Cifra" value={draft.value} onChange={(n) => set({ value: n })} step={0.01} />
          <TextField label="Unidad" value={draft.unit} onChange={(v) => set({ unit: opt(v) })} max={40} hint="Por ejemplo: viviendas, personas, km." />
        </div>
        <DateField label="Fecha del dato" value={draft.asOf} onChange={(v) => set({ asOf: opt(v) })} hint="Hasta cuándo cuenta la cifra." />
      </Group>
      <Group title="Fuente (obligatoria para salir en la web)" hint="Una cifra sin fuente nunca sale en la web: escribe de dónde sale (la institución, el informe) y, si lo hay, su enlace.">
        <TextField label="Fuente" required value={source?.label} onChange={(v) => set({ source: v.trim() || source?.url ? { ...(source ?? {}), label: v } : null })} max={200} />
        <TextField label="Enlace de la fuente (si tiene)" value={source?.url} onChange={(v) => set({ source: { label: str(source?.label), ...(v.trim() ? { url: v } : {}) } })} max={500} inputMode="url" />
      </Group>
      <Group title="Más">
        <SelectField
          label="Cálculo"
          value={draft.computedFrom ?? ''}
          onChange={(v) => set({ computedFrom: v || null })}
          options={[
            ['attended_requests', 'Lo cuenta la plataforma: solicitudes atendidas'],
            ['projects_concluded', 'Lo cuenta la plataforma: obras concluidas'],
          ]}
          empty="Escrita a mano"
          hint="Si lo cuenta la plataforma, la web enlaza la lista que respalda la cifra."
        />
        <NumberField label="Orden" value={draft.order} onChange={(n) => set({ order: n })} min={0} max={1000} />
      </Group>
    </>
  );
}

export function PageForm({ draft, set }: Props) {
  return (
    <>
      <Group title="La página">
        <TextField label="Título" required value={draft.title} onChange={(v) => set({ title: v })} max={160} hint="Sale arriba si la página no abre con una portada." />
        <TextField label="Resumen" multiline rows={2} value={draft.excerpt} onChange={(v) => set({ excerpt: opt(v) })} max={400} />
      </Group>
      <BlockEditor value={draft.blocks} onChange={(blocks) => set({ blocks })} />
    </>
  );
}

export const KIND_FORMS: Record<WebKind, (p: Props) => ReactNode> = {
  page: PageForm,
  news: NewsForm,
  project: ProjectForm,
  episode: EpisodeForm,
  document: DocumentForm,
  notice: NoticeForm,
  faq: FaqForm,
  indicator: IndicatorForm,
};

