'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { createWebItem } from '@/lib/actions/web';
import { ADMIN_WEB } from '@/lib/web/cms/kinds';
import { slugFromTitle, type WebKind } from '@/lib/web/schema';
import { itemPath } from '@/lib/web/routes';

/** The title of a new item; the database creates the draft and the editor opens. */
export function NewItemForm({ kind }: { kind: Exclude<WebKind, 'page'> }) {
  const router = useRouter();
  const id = useId();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const path = title.trim() ? itemPath(kind, slugFromTitle(title)) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await createWebItem({ kind, title });
    if (r.ok && r.data) {
      toast.success('Borrador creado. Sigue escribiendo y guárdalo.');
      router.push(ADMIN_WEB.edit(r.data.id));
      return;
    }
    setBusy(false);
    setError(r.ok ? 'No se pudo crear. Vuelve a intentarlo.' : r.error);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Título" htmlFor={id} error={error} hint={path ? `Su dirección en la web: ${path}` : 'Claro y corto: es lo primero que se lee.'}>
        <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required autoFocus aria-invalid={!!error || undefined} />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy || !title.trim()}>
          {busy ? 'Creando…' : 'Crear borrador'}
        </Button>
      </div>
    </form>
  );
}
