'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { deleteRedirect, saveRedirect } from '@/lib/actions/web-site';

// Redirects of old addresses (design §2): «/2024/05/una-nota» → «/actualidad/una-nota», 301 by default. Only to an
// address of this site (no open redirect, also in the database). The importer fills most of them; here they are added
// or fixed by hand.

const STATUS = [
  ['301', '301 · para siempre (lo normal)'],
  ['308', '308 · para siempre, mismo método'],
  ['302', '302 · por un tiempo'],
  ['307', '307 · por un tiempo, mismo método'],
] as const;

export function NewRedirectForm() {
  const router = useRouter();
  const id = useId();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('301');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await saveRedirect({ from, to, status: Number(status) });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    toast.success('Redirección guardada. La dirección vieja ya lleva a la nueva.');
    setFrom('');
    setTo('');
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Dirección vieja" htmlFor={`${id}-from`} hint="Como estaba en la web vieja, por ejemplo /2024/05/una-nota">
          <Input id={`${id}-from`} value={from} onChange={(e) => setFrom(e.target.value)} maxLength={500} className="font-mono text-[15px]" placeholder="/…" />
        </Field>
        <Field label="Lleva a" htmlFor={`${id}-to`} hint="Una dirección de esta web, por ejemplo /actualidad/una-nota">
          <Input id={`${id}-to`} value={to} onChange={(e) => setTo(e.target.value)} maxLength={500} className="font-mono text-[15px]" placeholder="/…" />
        </Field>
      </div>
      <Field label="Tipo" htmlFor={`${id}-st`}>
        <Select id={`${id}-st`} value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-80">
          {STATUS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      {error ? (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="self-start" disabled={busy || !from.trim() || !to.trim()}>
        <Plus className="h-4 w-4" aria-hidden /> Agregar la redirección
      </Button>
    </form>
  );
}

export function RedirectRowForm({ r }: { r: { id: string; from: string; to: string; status: number } }) {
  const router = useRouter();
  const id = useId();
  const { confirm, dialog } = useConfirm();
  const [to, setTo] = useState(r.to);
  const [status, setStatus] = useState(String(r.status));
  const [busy, setBusy] = useState(false);
  const changed = to !== r.to || status !== String(r.status);
  async function save() {
    setBusy(true);
    const res = await saveRedirect({ id: r.id, from: r.from, to, status: Number(status) });
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success('Guardado.');
      router.refresh();
    }
  }
  async function remove() {
    const ok = await confirm({ title: '¿Quitar esta redirección?', body: `Quien entre a ${r.from} verá «Esta página no existe».`, confirmLabel: 'Quitar', tone: 'danger' });
    if (!ok) return;
    setBusy(true);
    const res = await deleteRedirect({ id: r.id });
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success('Redirección quitada.');
      router.refresh();
    }
  }
  return (
    <div className="flex flex-col gap-2">
      {dialog}
      <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
        <Input id={`${id}-to`} value={to} onChange={(e) => setTo(e.target.value)} maxLength={500} className="font-mono text-[15px]" aria-label={`Destino de ${r.from}`} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={`Tipo de la redirección de ${r.from}`}>
          {STATUS.map(([v]) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={save} disabled={busy || !changed}>
          <Save className="h-4 w-4" aria-hidden /> Guardar<span className="sr-only"> la redirección de {r.from}</span>
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={busy}>
          <Trash2 className="h-4 w-4" aria-hidden /> Quitar<span className="sr-only"> la redirección de {r.from}</span>
        </Button>
      </div>
    </div>
  );
}
