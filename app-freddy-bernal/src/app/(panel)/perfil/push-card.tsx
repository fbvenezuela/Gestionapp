'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { removePushSubscription, savePushSubscription, sendTestPush, syncPushSubscription } from '@/lib/actions/profile';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { detectPushEnv, InstallGuide, type PushEnv } from '@/components/shell/install-guide';
import { currentSubscription, keyBytes, sameKey } from '@/lib/push/client';
import { deniedHelp, firstCheck } from '@/lib/push/card-state';

type State = 'loading' | 'unsupported' | 'denied' | 'off' | 'on';

function subInput(sub: PushSubscription) {
  const j = sub.toJSON();
  return { endpoint: j.endpoint ?? '', p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '', userAgent: navigator.userAgent.slice(0, 300) };
}

// «Avisos en este teléfono»: the permission is asked ONLY when the person taps «Activar avisos».
// «Activos» is shown only after the server confirms this phone is the signed-in person's.
export function PushCard({ publicKey, devices, appName }: { publicKey: string | null; devices: number; appName: string }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [env, setEnv] = useState<PushEnv | null>(null);
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const e = detectPushEnv();
    const settle = (s: State) => {
      if (!alive) return;
      setEnv(e);
      setState(s);
    };
    (async () => {
      const sub = e.supported ? await currentSubscription().catch(() => null) : null;
      const check = firstCheck({
        supported: e.supported,
        permission: e.supported ? Notification.permission : 'default',
        hasSub: !!sub,
        keyMatches: !!sub && !!publicKey && sameKey(sub.options.applicationServerKey, keyBytes(publicKey)),
      });
      if (check !== 'sync' || !sub) return settle(check === 'sync' ? 'off' : check);
      const r = await syncPushSubscription(subInput(sub)).catch(() => null);
      settle(r?.ok ? 'on' : 'off');
      if (r?.ok && r.data?.changed && alive) router.refresh();
    })().catch(() => settle('off'));
    return () => {
      alive = false;
    };
  }, [publicKey, router]);

  async function activate() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        toast.error('Sin permiso no llegan los avisos.');
        return;
      }
      if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;
      const key = keyBytes(publicKey);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub.options.applicationServerKey, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const input = subInput(sub);
      const r = await run(() => savePushSubscription(input), { success: 'Listo: los avisos llegan a este teléfono.' });
      if (r?.ok) setState('on');
      else await sub.unsubscribe().catch(() => {});
    } catch {
      toast.error('No se pudo activar. Vuelve a intentar.');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await run(() => removePushSubscription({ endpoint: sub.endpoint }), { success: 'Avisos apagados en este teléfono.' });
        await sub.unsubscribe().catch(() => {});
      }
      setState('off');
    } catch {
      toast.error('No se pudo apagar. Vuelve a intentar.');
    } finally {
      setBusy(false);
    }
  }

  const status: Record<State, string> = {
    loading: 'Revisando este teléfono…',
    unsupported: 'Este teléfono todavía no puede recibir avisos.',
    denied: deniedHelp(env?.platform ?? 'other', env?.standalone ?? false, appName),
    off: 'Apagados en este teléfono.',
    on: 'Activos en este teléfono.',
  };
  const Icon = state === 'on' ? BellRing : state === 'off' || state === 'loading' ? Bell : BellOff;
  const disabled = busy || pending;

  return (
    <Card>
      <CardHeader title="Avisos en este teléfono" subtitle="Te avisa aunque la app esté cerrada. De noche solo llegan los importantes." />
      <CardBody className="flex flex-col gap-3">
        {!publicKey ? (
          <p className="text-[15px] text-text-2">Los avisos al teléfono están apagados en el servidor.</p>
        ) : (
          <>
            <p className="flex items-start gap-2 text-[15px]" role="status">
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <span>{status[state]}</span>
            </p>
            {devices > 0 ? (
              <p className="text-sm text-text-2">{devices === 1 ? 'Tienes avisos activos en 1 teléfono o navegador.' : `Tienes avisos activos en ${devices} teléfonos o navegadores.`}</p>
            ) : null}
            {state === 'unsupported' && env ? <InstallGuide platform={env.platform} standalone={env.standalone} /> : null}
            <div className="flex flex-wrap gap-2">
              {state === 'off' ? (
                <Button disabled={disabled} onClick={activate}>
                  <Bell className="h-4 w-4" aria-hidden /> Activar avisos
                </Button>
              ) : null}
              {state === 'on' ? (
                <>
                  <Button variant="secondary" disabled={disabled} onClick={() => run(() => sendTestPush())}>
                    <BellRing className="h-4 w-4" aria-hidden /> Probar aviso
                  </Button>
                  <Button variant="ghost" disabled={disabled} onClick={deactivate}>
                    <BellOff className="h-4 w-4" aria-hidden /> Desactivar
                  </Button>
                </>
              ) : null}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
