'use client';

import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { markFailed, markPublished } from '@/lib/actions/publications';
import { addMetrics } from '@/lib/actions/results';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Uploader } from '@/components/media/uploader';
import { DownloadLink } from '@/components/media/drive-download';

export type PackageFile = { id: string; label: string; size: number; drive: boolean };

const FILE_BUTTON = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border px-3 font-semibold hover:bg-surface-2';

export function Package({ video, cover, copy, collaborators, network, title }: { video: PackageFile | null; cover: PackageFile | null; copy: string; collaborators: string[]; network: string; title: string }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  return (
    <Card>
      <CardHeader title="Paquete para publicar" subtitle={`Todo lo que necesitas para subirlo a ${network}.`} />
      <CardBody className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-3">
          {video ? <DownloadLink file={{ ...video, label: video.label || 'Video' }} drive={video.drive} icon className={FILE_BUTTON}>Video</DownloadLink> : null}
          {cover ? <DownloadLink file={{ ...cover, label: cover.label || 'Portada' }} drive={cover.drive} icon className={FILE_BUTTON}>Portada</DownloadLink> : null}
          <Button variant="secondary" onClick={() => {
            const blob = new Blob([copy], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${title.slice(0, 40)}-${network}-copy.txt`.replace(/[^\w.-]+/g, '-');
            a.click();
          }}><Download className="h-4 w-4" aria-hidden /> Copy (.txt)</Button>
        </div>
        <div className="rounded-[var(--radius-control)] bg-surface-2 p-3">
          <p className="whitespace-pre-wrap text-[15px]">{copy || 'Sin copy.'}</p>
        </div>
        <Button variant="secondary" onClick={() => navigator.clipboard.writeText(copy).then(() => toast.success('Copy copiado.'))}><Copy className="h-4 w-4" aria-hidden /> Copiar el copy</Button>
        {collaborators.length ? (
          <div>
            <p className="label-caps mb-1">Invitar como colaboradores</p>
            <ul className="flex flex-col gap-1">
              {collaborators.map((c) => (
                <li key={c}>
                  <label className="flex min-h-10 items-center gap-2 text-[15px]">
                    <input type="checkbox" className="h-5 w-5 accent-accent" checked={!!checked[c]} onChange={(e) => setChecked({ ...checked, [c]: e.target.checked })} /> {c}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

// Admin, Redes and the boss: all three may upload the evidence screenshot (20261027001900_media_handoff.sql).
export function PublishedForm({ id }: { id: string }) {
  const { run, pending } = useAction();
  const [url, setUrl] = useState('');
  const [evidence, setEvidence] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="¿Ya lo publicaste?" subtitle="Pega el link y, si puedes, una captura como evidencia." />
      <CardBody className="flex flex-col gap-3">
        <Field label="Link de la publicación" htmlFor="pu"><Input id="pu" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></Field>
        {evidence ? <p className="text-sm text-ok">Captura subida.</p> : <Uploader eventId={null} kind="evidence" accept="image/*" multiple={false} compact label="Subir captura" onUploaded={(a) => setEvidence(a.id)} />}
        <Button size="lg" disabled={pending || !url} onClick={() => run(() => markPublished({ id, url, evidenceId: evidence }), { success: '¡Listo! Marcada como publicada.' })}>
          <Check className="h-5 w-5" aria-hidden /> Ya lo publiqué
        </Button>
      </CardBody>
    </Card>
  );
}

export function FailForm({ id }: { id: string }) {
  const { run, pending } = useAction();
  const [reason, setReason] = useState('');
  return (
    <details className="rounded-[var(--radius-card)] border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-3 font-semibold">No se pudo publicar</summary>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <Field label="¿Qué pasó?" htmlFor="pf"><Input id="pf" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: la red rechazó el video por la duración" /></Field>
        <Button variant="danger" disabled={pending || !reason} onClick={() => run(() => markFailed({ id, reason }), { success: 'Anotado.' })}>Marcar como fallida</Button>
      </div>
    </details>
  );
}

export function MetricsForm({ publicationId }: { publicationId: string }) {
  const { run, pending } = useAction();
  const empty = { views: '', reach: '', likes: '', comments: '', shares: '', saves: '' };
  const [f, setF] = useState(empty);
  const fields: [keyof typeof f, string][] = [['views', 'Vistas'], ['reach', 'Alcance'], ['likes', 'Me gusta'], ['comments', 'Comentarios'], ['shares', 'Compartidos'], ['saves', 'Guardados']];
  return (
    <Card>
      <CardHeader title="Cargar resultados" subtitle="Copia los números de la red. Puedes cargarlos varias veces (se guarda cada foto)." />
      <CardBody>
        <form className="grid grid-cols-2 gap-3 sm:grid-cols-3" onSubmit={(e) => {
          e.preventDefault();
          const clean = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : Number(v.replace(/\D/g, ''))]));
          run(() => addMetrics({ publicationId, ...clean }), { success: 'Resultados guardados.', onOk: () => setF(empty) });
        }}>
          {fields.map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`m-${k}`}><Input id={`m-${k}`} inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
          ))}
          <Button type="submit" className="col-span-2 sm:col-span-3" disabled={pending}>Guardar resultados</Button>
        </form>
      </CardBody>
    </Card>
  );
}
