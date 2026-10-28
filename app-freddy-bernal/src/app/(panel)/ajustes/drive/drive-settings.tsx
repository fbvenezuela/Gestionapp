'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, HardDrive, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { disconnectDrive, finishDriveProbe, removeDriveGrant, startDriveConnect, startDriveProbe, testDrive } from '@/lib/actions/drive';
import { checkLine, checkSummary, DRIVE_STATE, gb, type DriveCheckLevel, type DriveCheckStep } from '@/lib/domain/drive-check';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/cn';

type Status = 'ok' | 'expired' | 'error' | 'disconnected' | null;

type Props = {
  enabled: boolean;
  fake: boolean;
  missing: string[];
  uploadMode: 'direct' | 'proxy';
  status: Status;
  account: string | null;
  since: string | null;
  rootReady: boolean;
  monthBytes: number;
  capBytes: number | null;
  folder: string;
  justConnected: boolean;
  error: string | null;
};

const ICON: Record<DriveCheckLevel, { Icon: typeof CheckCircle2; cls: string; sr: string }> = {
  ok: { Icon: CheckCircle2, cls: 'text-ok', sr: 'Bien' },
  warn: { Icon: AlertTriangle, cls: 'text-warn', sr: 'Aviso' },
  fail: { Icon: XCircle, cls: 'text-danger', sr: 'Falta' },
};

export function DriveSettings(p: Props) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState<null | 'connect' | 'test' | 'disconnect'>(null);
  const [steps, setSteps] = useState<DriveCheckStep[] | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  if (!p.enabled) {
    return (
      <Card>
        <CardHeader title="Drive no está activado" action={<Chip>Apagado</Chip>} />
        <CardBody className="flex flex-col gap-2 text-[15px]">
          <p>Los archivos se guardan como siempre, en la plataforma.</p>
          <p className="text-text-2">Para guardarlos en el Google Drive del cliente hay que poner <code>STORAGE_PROVIDER=drive</code> en Vercel (solo Production) y las variables de Google. Los pasos están en <code>docs/DRIVE.md</code>.</p>
        </CardBody>
      </Card>
    );
  }

  const state = DRIVE_STATE[p.status ?? 'disconnected'];
  const connected = p.status === 'ok';
  const hasGrant = p.status === 'ok' || p.status === 'expired' || p.status === 'error';
  const configured = p.missing.length === 0;

  async function connect() {
    setBusy('connect');
    const r = await startDriveConnect({});
    if (r.ok && r.data) {
      window.location.assign(r.data.url);
      return;
    }
    setBusy(null);
    toast.error(r.ok ? 'No se pudo conectar.' : r.error);
  }

  async function test() {
    setBusy('test');
    setSteps(null);
    setTesting('Revisando la conexión con Google…');
    try {
      const r = await testDrive({});
      if (!r.ok || !r.data) {
        toast.error(r.ok ? 'No se pudo probar.' : r.error);
        return;
      }
      const server = r.data;
      setSteps(server);
      if (server.some((s) => s.level === 'fail')) return;
      // Now this browser sends a small file straight to Google, as phones do with videos.
      setTesting('Probando una subida desde este navegador…');
      let direct = false;
      let problem: string | undefined;
      const st = await startDriveProbe({});
      if (st.ok && st.data) {
        try {
          const size = st.data.size;
          const res = await fetch(st.data.sessionUrl, { method: 'PUT', headers: { 'Content-Range': `bytes 0-${size - 1}/${size}` }, body: new Uint8Array(size) });
          direct = res.status === 200 || res.status === 201;
        } catch {
          direct = false;
        }
      } else if (!st.ok) problem = st.error;
      const fin = await finishDriveProbe({ direct });
      const message = problem ?? (fin.ok && fin.data ? fin.data.message : undefined);
      setSteps([...server, { key: 'direct', level: direct ? 'ok' : p.uploadMode === 'proxy' && !problem ? 'warn' : 'fail', message }]);
    } catch {
      toast.error('No se pudo probar. Revisa la señal y vuelve a intentar.');
    } finally {
      setTesting(null);
      setBusy(null);
    }
  }

  async function disconnect(o: { changeAccount?: boolean; revoke?: boolean } = {}) {
    const ok = await confirm(
      o.revoke
        ? { title: '¿Quitar el permiso en Google?', body: 'Google le quita el acceso a la plataforma y al script de importación. Úsalo solo si crees que alguien de afuera tiene el permiso. Después hay que conectar de nuevo, y puede que haya que volver a elegir lo que se trajo con «Elegir de Drive».', confirmLabel: 'Quitar el permiso', tone: 'danger' }
        : o.changeAccount
          ? { title: '¿Cambiar de cuenta de Google?', body: 'Los archivos guardados en la cuenta actual dejan de abrirse en la plataforma. Úsalo solo si el cliente cambió de cuenta a propósito.', confirmLabel: 'Cambiar de cuenta', tone: 'danger' }
          : { title: '¿Desconectar Drive?', body: 'Mientras tanto no se puede subir ni abrir lo que está en Drive. No se borra nada: al conectar la misma cuenta, todo vuelve.', confirmLabel: 'Desconectar', tone: 'danger' },
    );
    if (!ok) return;
    setBusy('disconnect');
    const r = o.revoke ? await removeDriveGrant({}) : await disconnectDrive({ changeAccount: !!o.changeAccount });
    setBusy(null);
    setSteps(null);
    if (r.ok) {
      toast.success(o.revoke ? 'Listo: Google ya no le da acceso a la plataforma.' : 'Drive quedó desconectado.');
      router.refresh();
    } else toast.error(r.error);
  }

  const summary = steps && !testing ? checkSummary(steps, p.folder) : null;
  const pct = p.capBytes ? Math.min(100, Math.round((p.monthBytes / p.capBytes) * 100)) : 0;

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      {p.justConnected ? (
        <p role="status" className="rounded-[var(--radius-control)] bg-ok-soft px-3 py-2 text-[15px] text-ok">Drive quedó conectado. Toca «Probar» para revisar que todo funcione.</p>
      ) : null}
      {p.error ? <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-[15px] text-danger">{p.error}</p> : null}

      <Card>
        <CardHeader title="Conexión" action={<Chip tone={state.tone}>{state.label}</Chip>} />
        <CardBody className="flex flex-col gap-3 text-[15px]">
          {p.fake ? <p className="rounded-[var(--radius-control)] bg-info-soft px-3 py-2 text-info">Drive de prueba (en memoria): nada sale a Google.</p> : null}
          {!configured ? (
            <div className="rounded-[var(--radius-control)] bg-warn-soft px-3 py-2 text-warn">
              <p className="font-semibold">Falta llenar en Vercel (solo Production):</p>
              <ul className="mt-1 list-disc pl-5">{p.missing.map((m) => <li key={m}><code>{m}</code></li>)}</ul>
              <p className="mt-1">Después, «Redeploy». Los pasos están en <code>docs/DRIVE.md</code>.</p>
            </div>
          ) : null}
          <dl className="grid gap-2">
            <Row label="Cuenta de Google">{p.account ?? 'Ninguna todavía'}</Row>
            {p.since && hasGrant ? <Row label="Conectado desde">{p.since}</Row> : null}
            <Row label="Carpeta">
              «{p.folder}» · {p.rootReady ? 'lista' : 'se crea al conectar'}
            </Row>
            <Row label="Subidas">{p.uploadMode === 'proxy' ? 'pasan por la plataforma (DRIVE_UPLOAD_MODE=proxy)' : 'van del teléfono directo a Drive'}</Row>
          </dl>
          <p className="text-sm text-text-2">Adentro de la carpeta: Videos, Fotos, Portadas, Audios y Documentos, con una carpeta por evento con su código (nunca con la fecha).</p>
          {p.status === 'expired' || p.status === 'error' ? (
            <p className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-danger">
              {p.status === 'expired' ? 'Google dejó de darle permiso a la plataforma.' : 'No se puede leer el permiso guardado.'} Toca «Volver a conectar» con la misma cuenta. No se pierde nada.
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {!connected ? (
              <Button onClick={connect} disabled={!configured || busy !== null} className="w-full sm:w-auto">
                {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <HardDrive className="h-4 w-4" aria-hidden />}
                {hasGrant ? 'Volver a conectar' : 'Conectar Drive'}
              </Button>
            ) : null}
            <Button variant={connected ? 'primary' : 'secondary'} onClick={test} disabled={busy !== null} className="w-full sm:w-auto">
              {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Probar
            </Button>
            {hasGrant ? (
              <Button variant="danger" onClick={() => disconnect()} disabled={busy !== null} className="w-full sm:w-auto">Desconectar</Button>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {testing || steps ? (
        <Card>
          <CardHeader title={summary ? summary.title : 'Probando…'} action={summary ? <Chip tone={summary.level === 'ok' ? 'ok' : summary.level === 'warn' ? 'warn' : 'danger'}>{summary.level === 'ok' ? 'Bien' : summary.level === 'warn' ? 'Aviso' : 'Falta algo'}</Chip> : null} />
          <CardBody className="flex flex-col gap-2 text-[15px]">
            {summary?.todo ? <p className={cn('font-semibold', summary.level === 'fail' ? 'text-danger' : 'text-warn')}>{summary.todo}</p> : null}
            <ul className="flex flex-col gap-2" aria-live="polite">
              {(steps ?? []).map((s, i) => {
                const { Icon, cls, sr } = ICON[s.level];
                return (
                  <li key={`${s.key}-${i}`} className="flex items-start gap-2">
                    <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', cls)} aria-hidden />
                    <span><span className="sr-only">{sr}: </span>{checkLine(s, p.folder)}</span>
                  </li>
                );
              })}
              {testing ? (
                <li className="flex items-center gap-2 text-text-2">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden /> {testing}
                </li>
              ) : null}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {p.capBytes ? (
        <Card>
          <CardHeader title="Transferencia de este mes" subtitle="Ver, adelantar y descargar videos de Drive pasa por la plataforma." />
          <CardBody className="flex flex-col gap-2 text-[15px]">
            <p>{gb(p.monthBytes)} de {gb(p.capBytes)}</p>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Transferencia usada este mes">
              <div className={cn('h-full', pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warn' : 'bg-accent')} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-sm text-text-2">Al llegar al tope se pausa ver y descargar desde Drive hasta el mes que viene, para que Vercel no pause la plataforma. Subir sigue funcionando.</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Si el permiso se vence" />
        <CardBody className="flex flex-col gap-2 text-[15px]">
          <p>Te llega un aviso y aquí sale «Se venció el permiso». Toca «Volver a conectar» y entra con la misma cuenta de Google. No se pierde nada.</p>
          <p className="text-text-2">Mientras tanto, quien use la plataforma ve «El material no se puede abrir ahora» en vez de una pantalla rota.</p>
        </CardBody>
      </Card>

      {hasGrant ? (
        <Card>
          <details>
            <summary className="flex min-h-12 cursor-pointer items-center rounded-[var(--radius-card)] px-4 font-semibold">Más opciones</summary>
            <div className="flex flex-col gap-3 border-t border-border p-4 text-[15px]">
              <div className="flex flex-col gap-1">
                <Button variant="secondary" onClick={() => disconnect({ revoke: true })} disabled={busy !== null} className="w-full sm:w-auto">Quitar el permiso en Google</Button>
                <p className="text-sm text-text-2">Solo si crees que alguien de afuera tiene el permiso.</p>
              </div>
              <div className="flex flex-col gap-1">
                <Button variant="secondary" onClick={() => disconnect({ changeAccount: true })} disabled={busy !== null} className="w-full sm:w-auto">Cambiar de cuenta de Google</Button>
                <p className="text-sm text-text-2">Lo guardado en la cuenta actual deja de abrirse aquí.</p>
              </div>
            </div>
          </details>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-2">
      <dt className="text-sm text-text-2 sm:w-40 sm:shrink-0 sm:text-[15px]">{label}</dt>
      <dd className="min-w-0 break-words font-semibold">{children}</dd>
    </div>
  );
}
