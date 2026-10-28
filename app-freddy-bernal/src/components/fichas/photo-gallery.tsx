import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { MediaThumb } from '@/components/media/media-thumb';
import { DownloadLink } from '@/components/media/drive-download';
import { Uploader } from '@/components/media/uploader';
import type { MediaKind } from '@/lib/domain/media-mime';
import type { FichaMedia } from '@/lib/data/fichas';

// The photos and papers of a ficha (cambios del 27/10/2026, §4.1 and §4.2), by kind: Antes, Avance (obra), Después
// (report), Documentos. Each file shows its small picture through the platform (MediaThumb: /api/media/<id>/thumb
// checks permissions first), or its type icon. Uploading uses the same resumable Uploader as the event material:
// several files at once, it waits while there is no signal and goes on by itself, and photos leave the phone without
// their location (probe.ts compressImage). Who may upload is the database's (media_insert: obra photos admin, boss,
// despacho and IVT; report evidence boss, despacho and política); `canUpload` only shows the buttons.

const KIND: Record<string, { title: string; upload: string; accept: string; hint: string }> = {
  before: { title: 'Antes', upload: 'Subir fotos del antes', accept: 'image/*,video/*', hint: 'Fotos o videos de cómo estaba.' },
  progress: { title: 'Avance', upload: 'Subir fotos del avance', accept: 'image/*,video/*', hint: 'Fotos o videos de cómo va la obra.' },
  after: { title: 'Después', upload: 'Subir fotos del después', accept: 'image/*,video/*', hint: 'Fotos o videos de cómo quedó.' },
  document: { title: 'Documentos', upload: 'Subir documentos', accept: 'application/pdf,image/*', hint: 'Un PDF o la foto de un papel.' },
};

// Who sees each kind, said to whoever uploads (media_select, 20261027002100_obra_documents.sql and
// 20261028002300_report_files_notes.sql). An obra's photos reach Redes and the camera person of its visit; its
// documents (names and phones of the community) never do. A report's documents never reach Administración (D-41).
function whoSees(obra: boolean, kind: string): string {
  if (!obra && kind === 'document') return 'Los ven solo política, el jefe y el despacho: nunca Administración, Redes ni Grabación.';
  if (!obra) return 'Los ven política, el jefe, el despacho y Administración. Redes y Grabación nunca ven un reporte.';
  if (kind === 'document') return 'Los ven solo el IVT, el jefe, el despacho y Administración: nunca Redes ni Grabación.';
  return 'Cuando la visita tenga fecha, también las ven Redes y quien la grabe.';
}

function size(b: number) {
  return b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
}

export function PhotoGallery({
  target,
  kinds,
  media,
  canUpload,
  title,
  subtitle,
}: {
  target: { obraFichaId: string } | { reportId: string };
  kinds: readonly MediaKind[];
  media: FichaMedia[];
  canUpload: boolean;
  title: string;
  subtitle?: string;
}) {
  const shown = media.filter((m) => kinds.includes(m.kind as MediaKind));
  const obra = 'obraFichaId' in target;
  const where = obra ? { obraFichaId: target.obraFichaId } : { reportId: target.reportId };
  return (
    // Solid once it holds a long list (no blur behind many pictures).
    <Card solid={shown.length > 8}>
      <CardHeader title={title} subtitle={subtitle} action={shown.length ? <Chip tone="ok">{shown.length}</Chip> : <Chip>Vacío</Chip>} />
      <div className="flex flex-col gap-5 p-4 sm:p-5">
        {canUpload ? <p className="text-sm text-text-2">Puedes elegir varias a la vez. Cada una queda guardada en la ficha en cuanto termina de subir; si se va la señal, sigue sola cuando vuelva. Las fotos se suben sin la ubicación del teléfono.</p> : null}
        {kinds.map((kind) => {
          const k = KIND[kind] ?? { title: kind, upload: 'Subir', accept: 'image/*', hint: '' };
          const list = shown.filter((m) => m.kind === kind);
          if (!list.length && !canUpload) return null;
          return (
            <section key={kind} aria-label={k.title} className="flex flex-col gap-2">
              <h3 className="label-caps">
                {k.title} {list.length ? <span className="tabular">({list.length})</span> : null}
              </h3>
              {list.length ? (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {list.map((m) => {
                    const drive = m.bucket === 'drive';
                    const pictured = drive || m.mime.startsWith('image/') || m.mime.startsWith('video/');
                    const file = { id: m.id, label: m.label, size: Number(m.size_bytes) };
                    const thumb = <MediaThumb ids={pictured ? [m.id] : []} mime={m.mime} className="aspect-square h-auto w-full" />;
                    return (
                      <li key={m.id} className="flex min-w-0 flex-col gap-1">
                        {/* A photo outside Drive opens big in a new tab; anything else is downloaded (a Drive file in pieces). */}
                        {!drive && m.mime.startsWith('image/') ? (
                          <a href={`/api/media/${m.id}?ver=1`} target="_blank" rel="noopener noreferrer" aria-label={`Ver ${m.label}`} className="block rounded-[var(--radius-control)]">
                            {thumb}
                          </a>
                        ) : (
                          thumb
                        )}
                        <span className="truncate text-sm font-semibold">{m.label}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-sm text-text-2">
                          <span className="tabular">{size(Number(m.size_bytes))}</span>
                          <DownloadLink file={file} drive={drive} icon className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent-ink">
                            Descargar<span className="sr-only"> {m.label}</span>
                          </DownloadLink>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {canUpload ? (
                <>
                  <p className="text-sm text-text-2">{whoSees(obra, kind)}</p>
                  <Uploader {...where} kind={kind} label={k.upload} hint={k.hint} accept={k.accept} compact={list.length > 0} />
                </>
              ) : null}
            </section>
          );
        })}
        {!shown.length && !canUpload ? <p className="text-[15px] text-text-2">Todavía no hay fotos ni documentos.</p> : null}
      </div>
    </Card>
  );
}
