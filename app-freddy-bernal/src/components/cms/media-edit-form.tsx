'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { archiveWebMedia, updateWebMedia } from '@/lib/actions/web-site';
import type { MediaInfo } from '@/lib/data/web-admin';
import { ALT_HELP, ALT_MISSING } from '@/lib/web/cms/media-file';
import { FocalPicker } from './focal-picker';

/** The words around a file of the library and its focal point (the file itself never changes: upload another). */
export function MediaEditForm({ m, canEdit, usedLive }: { m: MediaInfo; canEdit: boolean; usedLive: boolean }) {
  const id = useId();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [v, setV] = useState({ alt: m.alt, caption: m.caption, credit: m.credit, title: m.title, focalX: m.focalX, focalY: m.focalY });
  const [busy, setBusy] = useState(false);
  const [altError, setAltError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (m.kind === 'image' && v.alt.trim().length < 3) {
      setAltError(ALT_MISSING);
      return;
    }
    setBusy(true);
    const r = await updateWebMedia({ id: m.id, ...v });
    setBusy(false);
    if (!r.ok) toast.error(r.error);
    else {
      toast.success(usedLive ? 'Guardado. Lo ya publicado conserva los textos con que se aprobó hasta que se publique de nuevo.' : 'Guardado.');
      router.refresh();
    }
  }

  async function archive(archived: boolean) {
    if (archived) {
      const ok = await confirm({
        title: '¿Archivar este archivo?',
        body: 'Sale de la biblioteca y nadie podrá elegirlo. Las páginas ya publicadas que lo usan lo siguen mostrando; un borrador que lo use no se podrá publicar hasta cambiarlo.',
        confirmLabel: 'Archivar',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusy(true);
    const r = await archiveWebMedia({ id: m.id, archived });
    setBusy(false);
    if (!r.ok) toast.error(r.error);
    else {
      toast.success(archived ? 'Archivado.' : 'De vuelta en la biblioteca.');
      router.refresh();
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      {dialog}
      {m.kind === 'image' ? (
        <FocalPicker src={m.url} alt={v.alt || 'Foto de la biblioteca'} x={v.focalX} y={v.focalY} onChange={(x, y) => setV((s) => ({ ...s, focalX: x, focalY: y }))} disabled={!canEdit} />
      ) : null}
      {m.kind === 'image' ? (
        <Field label={<>Texto alternativo <span className="text-danger">*</span></>} htmlFor={`${id}-alt`} hint={ALT_HELP} error={altError}>
          <Textarea id={`${id}-alt`} rows={2} maxLength={300} value={v.alt} disabled={!canEdit} aria-invalid={!!altError || undefined} onChange={(e) => {
            setAltError(null);
            setV((s) => ({ ...s, alt: e.target.value }));
          }} />
        </Field>
      ) : null}
      <Field label={m.kind === 'document' ? <>Título del documento <span className="text-danger">*</span></> : 'Título (opcional)'} htmlFor={`${id}-title`}>
        <Input id={`${id}-title`} maxLength={200} value={v.title} disabled={!canEdit} onChange={(e) => setV((s) => ({ ...s, title: e.target.value }))} />
      </Field>
      {m.kind === 'image' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pie de foto" htmlFor={`${id}-caption`}>
            <Input id={`${id}-caption`} maxLength={500} value={v.caption} disabled={!canEdit} onChange={(e) => setV((s) => ({ ...s, caption: e.target.value }))} />
          </Field>
          <Field label="Crédito" htmlFor={`${id}-credit`}>
            <Input id={`${id}-credit`} maxLength={200} value={v.credit} disabled={!canEdit} onChange={(e) => setV((s) => ({ ...s, credit: e.target.value }))} />
          </Field>
        </div>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            <Save className="h-4 w-4" aria-hidden /> Guardar
          </Button>
          {m.archived ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => archive(false)}>
              <ArchiveRestore className="h-4 w-4" aria-hidden /> Devolver a la biblioteca
            </Button>
          ) : (
            <Button type="button" variant="danger" disabled={busy} onClick={() => archive(true)}>
              <Archive className="h-4 w-4" aria-hidden /> Archivar
            </Button>
          )}
        </div>
      ) : null}
    </form>
  );
}
