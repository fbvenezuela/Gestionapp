'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Eye, History, Save, Send, Undo2 } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui/button';
import { menuPanelClass } from '@/components/ui/menu-panel';
import { saveWebDraft, submitWebItem, withdrawWebItem } from '@/lib/actions/web';
import type { MediaInfo, Municipality, RefOption, WebCaps } from '@/lib/data/web-admin';
import { sameJson, useDraft } from '@/lib/hooks/use-draft';
import { draftProblems, issueText } from '@/lib/web/cms/drafts';
import { ADMIN_WEB, sectionOf } from '@/lib/web/cms/kinds';
import { slug as slugSchema, slugFromTitle, type WebKind } from '@/lib/web/schema';
import { itemPath } from '@/lib/web/routes';
import { cn } from '@/lib/cn';
import { EditorContext, type EditorCtx } from './editor-context';
import { TextField } from './fields';
import { KIND_FORMS } from './kind-forms';
import { SeoPanel } from './seo-panel';

// The editor of one item of the website (design §3): the kind's form, its address, «Buscadores y redes» with the live
// card, and the flow — «Guardar borrador» (a version each time, with an optional note), «Vista previa» (exactly as the
// public would see it) and «Enviar a aprobación» (only a whole draft: the list says what is missing). What was typed and
// not saved stays in this phone (useDraft) and comes back after a reload. Publishing is the publisher's, in «Revisar».

type Obj = Record<string, unknown>;
export type EditorItem = {
  id: string;
  kind: WebKind;
  slug: string;
  status: 'draft' | 'in_review' | 'scheduled' | 'published' | 'archived';
  rev: number;
  draftVersion: number;
  hasPublished: boolean;
};

type Local = { base: number; slug: string; draft: Obj };

// `unused`: a page the web never shows (APP-20, the page «Atención ciudadana»): it can be saved, but nothing here offers
// to preview it or send it to approval, and it has no address on the web (R01).
export function Editor({
  item, draft: initialDraft, caps, media: initialMedia, munis, refs, baseUrl, tz, programName, unused = false,
}: {
  item: EditorItem; draft: Obj; caps: WebCaps; media: Record<string, MediaInfo>; munis: Municipality[]; refs: RefOption[]; baseUrl: string; tz: string; programName: string; unused?: boolean;
}) {
  const router = useRouter();
  const section = sectionOf(item.kind);
  const start: Local = { base: item.draftVersion, slug: item.slug, draft: initialDraft };
  const { value, setValue, restored, reset } = useDraft<Local>(`web:${item.id}`, start, {
    restore: (saved) => {
      const s = saved as Partial<Local> | null;
      return s && s.base === item.draftVersion && typeof s.slug === 'string' && s.draft && typeof s.draft === 'object' ? (s as Local) : null;
    },
  });
  const [saved, setSaved] = useState<{ slug: string; draft: Obj }>({ slug: item.slug, draft: initialDraft });
  const [rev, setRev] = useState(item.rev);
  const [epoch, setEpoch] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<null | 'save' | 'send' | 'preview' | 'withdraw'>(null);
  const [media, setMedia] = useState(initialMedia);

  // A draft that came back from this phone (restored), or one thrown away (epoch): the forms start again from it.
  const formKey = `${epoch}:${restored ? 1 : 0}`;

  const dirty = !sameJson({ slug: value.slug, draft: value.draft }, saved);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = useCallback((patch: Obj) => setValue((v) => ({ ...v, draft: { ...v.draft, ...patch } })), [setValue]);
  const problems = useMemo(() => draftProblems(item.kind, value.draft), [item.kind, value.draft]);
  const slugOk = slugSchema.safeParse(value.slug).success;
  const slugEditable = item.kind !== 'page' && (!item.hasPublished || caps.canPublish);
  const ctx: EditorCtx = useMemo(
    () => ({ media, addMedia: (m) => setMedia((all) => ({ ...all, [m.id]: m })), munis, refs, readOnly: false, tz, programName }),
    [media, munis, refs, tz, programName],
  );

  async function save(): Promise<boolean> {
    if (!slugOk) {
      toast.error('Revisa la dirección: minúsculas, números y guiones.');
      return false;
    }
    setBusy('save');
    const r = await saveWebDraft({ id: item.id, rev, slug: value.slug, draft: value.draft, note: note.trim() || undefined });
    setBusy(null);
    if (!r.ok || !r.data) {
      toast.error(r.ok ? 'No se pudo guardar.' : r.error);
      return false;
    }
    setRev(r.data.rev);
    setNote('');
    const now = { slug: value.slug, draft: value.draft };
    reset({ base: r.data.draftVersion, ...now });
    setSaved(now);
    toast.success(r.data.problems.length && !unused ? `Guardado (versión ${r.data.draftVersion}). Para enviarlo falta algo: mira la lista.` : `Guardado (versión ${r.data.draftVersion}).`);
    if (r.data.redirected) toast.info(`La dirección vieja ${r.data.redirected} lleva ahora a la nueva.`);
    router.refresh();
    return true;
  }

  async function preview() {
    if (dirty && !(await save())) return;
    setBusy('preview');
    router.push(ADMIN_WEB.preview(item.id));
  }

  async function send() {
    if (problems.length) {
      toast.error('Antes de enviarlo, completa lo que falta (está en la lista de abajo).');
      document.getElementById('falta')?.focus();
      return;
    }
    if (dirty && !(await save())) return;
    setBusy('send');
    const r = await submitWebItem({ id: item.id });
    setBusy(null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    if (r.data) setRev(r.data.rev);
    toast.success('Enviado a aprobación. Quien aprueba la web ya lo ve en «Por aprobar».');
    router.refresh();
  }

  async function withdraw() {
    setBusy('withdraw');
    const r = await withdrawWebItem({ id: item.id });
    setBusy(null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    if (r.data) setRev(r.data.rev);
    toast.success('Retirado de la revisión: sigue en borrador.');
    router.refresh();
  }

  function discardLocal() {
    reset({ base: item.draftVersion, ...saved });
    setEpoch((e) => e + 1);
  }

  const Form = KIND_FORMS[item.kind];
  const path = item.kind === 'page' ? itemPath('page', item.slug) : itemPath(item.kind, value.slug);
  const inReview = item.status === 'in_review';

  return (
    <EditorContext.Provider value={ctx}>
      <div className="flex flex-col gap-4">
        {restored ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] bg-info-soft px-4 py-3 text-[15px]" role="status">
            <span className="flex-1 text-text">Recuperamos cambios que no se habían guardado en este teléfono o en esta computadora.</span>
            <Button type="button" size="sm" variant="secondary" onClick={discardLocal}>
              Descartarlos
            </Button>
          </div>
        ) : null}

        <div className={cn(menuPanelClass, 'sticky top-16 z-10 flex flex-wrap items-center gap-2 p-2.5')} role="toolbar" aria-label={unused ? 'Guardar' : 'Guardar y enviar'}>
          <Button type="button" size="sm" onClick={save} disabled={!!busy || !dirty}>
            <Save className="h-4 w-4" aria-hidden /> {busy === 'save' ? 'Guardando…' : 'Guardar borrador'}
          </Button>
          {unused ? null : (
            <Button type="button" size="sm" variant="secondary" onClick={preview} disabled={!!busy}>
              <Eye className="h-4 w-4" aria-hidden /> Vista previa
            </Button>
          )}
          {unused && !inReview ? null : inReview ? (
            <Button type="button" size="sm" variant="secondary" onClick={withdraw} disabled={!!busy}>
              <Undo2 className="h-4 w-4" aria-hidden /> Retirar de revisión
            </Button>
          ) : (
            <Button type="button" size="sm" variant="secondary" onClick={send} disabled={!!busy}>
              <Send className="h-4 w-4" aria-hidden /> {dirty ? 'Guardar y enviar a aprobación' : 'Enviar a aprobación'}
            </Button>
          )}
          {caps.canPublish && !unused ? (
            <LinkButton href={ADMIN_WEB.review(item.id)} size="sm" variant="slate">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Revisar y publicar
            </LinkButton>
          ) : null}
          <span className="ml-auto text-sm text-text-2" aria-live="polite">
            {dirty ? 'Cambios sin guardar' : 'Todo guardado'}
          </span>
        </div>

        <div className="flex flex-col gap-4">
          {item.kind === 'page' ? (
            unused ? null : (
              <p className="text-sm text-text-2">
                Dirección en la web: <span className="font-mono">{path ?? 'esta página no tiene dirección propia'}</span>
              </p>
            )
          ) : (
            <div className="flex flex-col gap-2">
              <TextField
                label="Dirección en la web"
                value={value.slug}
                onChange={(v) => setValue((x) => ({ ...x, slug: v.toLowerCase() }))}
                max={120}
                mono
                disabled={!slugEditable}
                error={slugOk ? null : 'Solo minúsculas, números y guiones (sin espacios ni acentos).'}
                hint={
                  slugEditable
                    ? path
                      ? `Queda en ${path}${item.hasPublished ? '. La dirección vieja seguirá llevando aquí.' : ''}`
                      : 'Este contenido no tiene página propia: la dirección solo lo identifica.'
                    : 'Ya está publicado: la dirección la cambia quien aprueba la web (y deja la vieja llevando aquí).'
                }
              />
              {slugEditable && !item.hasPublished && typeof value.draft.title === 'string' && value.draft.title.trim() && slugFromTitle(value.draft.title) !== value.slug ? (
                <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setValue((x) => ({ ...x, slug: slugFromTitle(String(x.draft.title)) }))}>
                  Usar el título como dirección
                </Button>
              ) : null}
            </div>
          )}

          <Form key={formKey} draft={value.draft} set={set} />

          {section.ownPage && !unused ? <SeoPanel key={`seo-${formKey}`} kind={item.kind} slug={value.slug} draft={value.draft} onChange={(seo) => set({ seo: Object.keys(seo).length ? seo : undefined })} baseUrl={baseUrl} /> : null}

          <section id="falta" tabIndex={-1} aria-labelledby="falta-t" hidden={unused} className={cn('rounded-[var(--radius-control)] px-4 py-3', problems.length ? 'bg-warn-soft' : 'bg-ok-soft')}>
            <h2 id="falta-t" className={cn('font-semibold', problems.length ? 'text-warn' : 'text-ok')}>
              {problems.length ? 'Para enviarlo a aprobación falta esto' : 'Listo para enviar a aprobación'}
            </h2>
            {problems.length ? (
              <ul className="mt-1 list-disc pl-5 text-[15px] text-text">
                {problems.slice(0, 12).map((p, i) => (
                  <li key={i}>{issueText(p)}</li>
                ))}
                {problems.length > 12 ? <li>Y {problems.length - 12} más.</li> : null}
              </ul>
            ) : (
              <p className="text-[15px] text-text">Puedes guardarlo como borrador las veces que quieras; cada vez queda una versión.</p>
            )}
          </section>

          <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border p-4">
            <TextField label="Nota de esta versión (opcional)" value={note} onChange={setNote} max={300} hint="Para saber después qué cambió: «Corregí la fecha», «Nueva foto de portada»." />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={save} disabled={!!busy || !dirty}>
                <Save className="h-4 w-4" aria-hidden /> Guardar borrador
              </Button>
              <Link href={ADMIN_WEB.versions(item.id)} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-accent-ink underline underline-offset-4">
                <History className="h-4 w-4" aria-hidden /> Versiones
              </Link>
            </div>
          </div>
        </div>
      </div>
    </EditorContext.Provider>
  );
}
