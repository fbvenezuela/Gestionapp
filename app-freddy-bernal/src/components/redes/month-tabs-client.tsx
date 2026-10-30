'use client';

import { useRef, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { chooseMonth, createMonth, deleteMonth, renameMonth } from '@/lib/actions/redes';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { menuPanelClass } from '@/components/ui/menu-panel';
import { MenuDetails } from '@/components/shell/menu-details';
import { deleteMonthText } from '@/lib/domain/redes';
import { MONTH_SLOT } from './card/card-core';
import { cn } from '@/lib/cn';

// The parts of the month tabs that answer a tap (month-tabs.tsx draws the rest on the server): a tab remembers the
// month for this person without waiting (chooseMonth; the address already carries ?mes=), «+ Nuevo mes» creates the
// next one and opens it, and «⋯» renames or deletes the open month. A new month's address is built from `hrefTemplate`
// (the tab address with MONTH_SLOT where the id goes), so the same component serves the sections and the feed.
const goTo = (template: string, id: string) => template.replace(MONTH_SLOT, encodeURIComponent(id));

export function MonthTabLink({ href, monthId, current, children }: { href: string; monthId: string; current: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      onClick={() => void chooseMonth({ monthId })}
      className={cn(
        'inline-flex min-h-11 items-center whitespace-nowrap rounded-[var(--radius-control)] border px-4 text-sm font-semibold',
        current ? 'border-slate bg-slate text-on-slate' : 'border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text',
      )}
    >
      {children}
    </Link>
  );
}

export function NewMonthButton({ hrefTemplate, ...rest }: { hrefTemplate: string; 'data-tour'?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      data-tour={rest['data-tour']}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await createMonth({});
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message ?? 'Mes creado');
          router.push(goTo(hrefTemplate, r.data!.month.id));
        })
      }
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-dashed border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-2 disabled:opacity-60"
    >
      + Nuevo mes
    </button>
  );
}

export function MonthMenu({
  month, canRename, canDelete, total, target, hrefTemplate,
}: {
  month: { id: string; label: string };
  canRename: boolean;
  canDelete: boolean; // Redes and the boss, while another month is left
  total: { pieces: number; placed: number } | null; // what «Borrar este mes» says before asking
  target: string; // the month its pieces go to
  hrefTemplate: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const item = 'flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] px-3 text-left text-[15px] hover:bg-surface-2 disabled:opacity-50';
  const del = canDelete && total !== null;
  if (!canRename && !del) return null;

  const rename = async () => {
    const yes = await confirm({
      title: 'Cambiar nombre',
      body: (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mes-nuevo-nombre" className="text-sm font-semibold text-text">
            Nombre del mes
          </label>
          <Input id="mes-nuevo-nombre" ref={input} defaultValue={month.label} maxLength={40} />
          <p className="text-sm">Sin fecha ni hora: todo Redes lo lee («Mes 2», «Cierre de año»).</p>
        </div>
      ),
      confirmLabel: 'Guardar',
    });
    const label = input.current?.value.trim() ?? '';
    if (!yes || !label || label === month.label) return;
    start(async () => {
      const r = await renameMonth({ monthId: month.id, label });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? 'Nombre guardado');
      router.refresh();
    });
  };

  const remove = async () => {
    if (!total) return;
    const yes = await confirm({ title: 'Borrar este mes', body: deleteMonthText(month.label, total.pieces, total.placed, target), confirmLabel: 'Borrar este mes', tone: 'danger' });
    if (!yes) return;
    start(async () => {
      const r = await deleteMonth({ monthId: month.id, expected: total.pieces });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? 'Mes borrado');
      router.push(r.data?.targetId ? goTo(hrefTemplate, r.data.targetId) : hrefTemplate.split('?')[0]);
    });
  };

  return (
    <>
      {dialog}
      <MenuDetails className="relative shrink-0">
        <summary className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'list-none cursor-pointer [&::-webkit-details-marker]:hidden' })} aria-label={`Opciones de ${month.label}`}>
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        </summary>
        <div className={cn(menuPanelClass, 'absolute right-0 z-30 mt-2 w-60 max-w-[calc(100vw-2rem)]')}>
          {canRename ? (
            <button type="button" className={item} disabled={pending} onClick={() => void rename()}>
              <Pencil className="h-4 w-4" aria-hidden /> Cambiar nombre
            </button>
          ) : null}
          {del ? (
            <button type="button" className={cn(item, 'text-danger')} disabled={pending} onClick={() => void remove()}>
              <Trash2 className="h-4 w-4" aria-hidden /> Borrar este mes
            </button>
          ) : null}
        </div>
      </MenuDetails>
    </>
  );
}
