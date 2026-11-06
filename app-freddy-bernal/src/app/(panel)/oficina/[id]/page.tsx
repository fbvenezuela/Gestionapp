import { notFound } from 'next/navigation';
import { Check } from 'lucide-react';
import { requireRole, db, menuRoles } from '@/lib/auth/session';
import { officeItem, officeScript } from '@/lib/data/office';
import { CREW_LABEL, ROOM, ROOMS, roomIndex, type Room } from '@/lib/domain/office';
import { PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { LinkButton } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { Role } from '@/lib/roles';
import { EditStep, ScriptPanel } from './office-client';

export const metadata = { title: 'Actividad en la oficina' };

const has = (roles: Role[], ...want: Role[]) => roles.some((r) => want.includes(r));

// One activity in the office: the ten rooms as a line (done, here, next) and the work of the room it is in. The
// script and the two edits are done here; the other rooms open the screens where that work already lives.
export default async function OfficeItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await requireRole('admin', 'boss', 'dispatch', 'social', 'camera');
  const data = await db(s, async (sql) => {
    const item = await officeItem(sql, id);
    return item ? { item, script: await officeScript(sql, id) } : null;
  });
  if (!data) notFound();
  const { item, script } = data;
  const roles = menuRoles(s);
  const content = has(roles, 'boss', 'social', 'admin');
  const here = roomIndex(item.room);
  const info = ROOM[item.room];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 py-2">
      <PageHeader back={{ href: `/oficina#sala-${item.room}`, label: 'La oficina' }} title={item.title} subtitle={`${item.code} · está en ${info.label}`} />

      <Card className="p-4">
        <h2 className="text-lg font-bold">El recorrido</h2>
        <ol className="mt-3 flex flex-col gap-1.5">
          {ROOMS.map((room, k) => (
            <li key={room} className={cn('flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5', k === here && 'bg-accent-soft font-semibold')}>
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                  k < here ? 'bg-ok-soft text-ok' : k === here ? 'bg-accent text-on-accent' : 'bg-surface-2 text-text-2',
                )}
                aria-hidden
              >
                {k < here ? <Check className="h-4 w-4" /> : k + 1}
              </span>
              <span>{ROOM[room].label}</span>
              <span className="sr-only">{k < here ? '(hecho)' : k === here ? '(aquí está)' : '(falta)'}</span>
              {k === here ? <Chip tone="accent" className="ml-auto">Aquí está</Chip> : null}
            </li>
          ))}
        </ol>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">{info.label}</h2>
          <Chip tone={info.crew === 'person' ? 'neutral' : 'accent'}>{CREW_LABEL[info.crew]}</Chip>
        </div>
        <p className="mt-1 text-[15px]">{info.does}</p>
        <div className="mt-3">
          <RoomWork room={item.room} id={item.id} roles={roles} content={content} script={script} cleanDone={item.facts.cleanDone} brutalDone={item.facts.brutalDone} />
        </div>
      </Card>

      {item.room !== 'reception' && item.room !== 'script' && script.status !== 'none' ? (
        <Card className="p-4">
          <h2 className="text-lg font-bold">El guion</h2>
          {content ? (
            <div className="mt-2"><ScriptPanel eventId={item.id} initial={script.script} status={script.status} canApprove={has(roles, 'boss')} /></div>
          ) : (
            <p className="mt-2 whitespace-pre-line text-[15px]">{script.script}</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}

function RoomWork({
  room, id, roles, content, script, cleanDone, brutalDone,
}: { room: Room; id: string; roles: Role[]; content: boolean; script: { script: string; status: 'none' | 'draft' | 'approved' }; cleanDone: boolean; brutalDone: boolean }) {
  const boss = has(roles, 'boss');
  switch (room) {
    case 'reception':
    case 'script':
      return content ? (
        <ScriptPanel eventId={id} initial={script.script} status={script.status} canApprove={boss} />
      ) : (
        <p className="text-[15px] text-text-2">{script.status === 'none' ? 'Redes prepara el borrador del guion con la ficha.' : 'El guion espera que el jefe lo apruebe.'}</p>
      );
    case 'storyboard':
      return <LinkButton href={`/eventos/${id}?tab=storyboard`}>Abrir el storyboard</LinkButton>;
    case 'recording':
      return <LinkButton href={`/eventos/${id}?tab=material`}>Subir el material</LinkButton>;
    case 'clean_cut':
      return content ? <EditStep eventId={id} step="clean" done={cleanDone} /> : <p className="text-[15px] text-text-2">El líder de Redes limpia el video.</p>;
    case 'brutal_edit':
      return content ? <EditStep eventId={id} step="brutal" done={brutalDone} /> : <p className="text-[15px] text-text-2">Redes hace la edición final.</p>;
    case 'approval':
      return boss ? (
        <LinkButton href="/aprobar">Ir a Por aprobar</LinkButton>
      ) : content ? (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] text-text-2">Si todavía no subiste el video final como pieza, súbelo para que el jefe lo vea.</p>
          <div><LinkButton href={`/eventos/${id}?tab=piezas`} variant="secondary">Ver las piezas</LinkButton></div>
        </div>
      ) : (
        <p className="text-[15px] text-text-2">El video espera la aprobación del jefe.</p>
      );
    case 'copywriting':
      return content ? <LinkButton href={`/eventos/${id}?tab=piezas`}>Escribir los copies</LinkButton> : <p className="text-[15px] text-text-2">Redes escribe los textos de cada red.</p>;
    case 'publishing':
      return content ? <LinkButton href="/publicar/nueva">Preparar la publicación</LinkButton> : <p className="text-[15px] text-text-2">Redes la publica en cada red.</p>;
    case 'analytics':
      return content ? <LinkButton href="/resultados">Ver los resultados</LinkButton> : <p className="text-[15px] text-text-2">Ya salió: Redes revisa cómo le va.</p>;
  }
}
