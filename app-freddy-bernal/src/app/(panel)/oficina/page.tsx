import Link from 'next/link';
import { Bot, ChevronRight, User } from 'lucide-react';
import { requireRole, db, menuRoles } from '@/lib/auth/session';
import { byRoom, officeItems } from '@/lib/data/office';
import { CREW_LABEL, ROOM, ROOMS, type Room } from '@/lib/domain/office';
import { myRooms } from '@/lib/domain/office-roles';
import { OfficeMap } from '@/components/office/office-map';
import { PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/cn';

export const metadata = { title: 'Oficina' };

// «La oficina» (pedido del 06/11/2026): every activity of the boss in the room where its work is, from the reception
// to the analyst. The drawing on top; each room below with what it does, an example and its activities (titles only:
// never when or where). Each activity opens its own page with the line and the work of its room.
export default async function OfficePage() {
  const s = await requireRole('admin', 'boss', 'dispatch', 'social', 'camera');
  const items = await db(s, (sql) => officeItems(sql));
  const rooms = byRoom(items);
  const counts = Object.fromEntries(ROOMS.map((r) => [r, rooms[r].length])) as Record<Room, number>;
  const mine = myRooms(menuRoles(s));
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 py-2">
      <PageHeader title="La oficina" subtitle="Cada actividad del jefe, en la sala donde está su trabajo. Toca una sala para ver qué hay." />
      <Card className="p-2 sm:p-4">
        <OfficeMap counts={counts} mine={mine} />
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-sm text-text-2">
          <span className="sm:hidden">Desliza el dibujo de lado para ver toda la oficina.</span>
          <span className="inline-flex items-center gap-1"><User className="h-4 w-4" aria-hidden /> Trabaja una persona</span>
          <span className="inline-flex items-center gap-1"><Bot className="h-4 w-4" aria-hidden /> La IA propone y una persona revisa</span>
          {mine.length ? <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-5 rounded-full bg-slate ring-2 ring-accent" aria-hidden /> Tus salas</span> : null}
        </p>
      </Card>

      <ol className="flex flex-col gap-3">
        {ROOMS.map((room, k) => {
          const info = ROOM[room];
          const list = rooms[room];
          return (
            <li key={room} id={`sala-${room}`} className="scroll-mt-20">
              <Card className={cn('p-4', mine.includes(room) && 'ring-2 ring-accent')}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-slate text-sm font-bold text-on-slate" aria-hidden>{k + 1}</span>
                  <h2 className="text-lg font-bold">{info.label}</h2>
                  <Chip tone={info.crew === 'person' ? 'neutral' : 'accent'}>
                    {info.crew === 'person' ? <User className="mr-1 inline h-3.5 w-3.5" aria-hidden /> : <Bot className="mr-1 inline h-3.5 w-3.5" aria-hidden />}
                    {CREW_LABEL[info.crew]}
                  </Chip>
                  <span className="ml-auto text-sm font-semibold text-text-2">{list.length === 1 ? '1 actividad' : `${list.length} actividades`}</span>
                </div>
                <p className="mt-2 text-[15px]">{info.does} <span className="text-text-2">Trabaja: {info.who}.</span></p>
                <details className="mt-1 text-sm text-text-2">
                  <summary className="min-h-11 cursor-pointer content-center font-medium">Ver un ejemplo</summary>
                  <p className="pb-1">{info.example}</p>
                </details>
                {list.length ? (
                  <ul className="mt-2 divide-y divide-border rounded-[var(--radius-control)] border border-border bg-surface">
                    {list.map((it) => (
                      <li key={it.id}>
                        <Link href={`/oficina/${it.id}`} className="flex min-h-12 items-center gap-2 px-3 py-2 hover:bg-surface-2">
                          <span className="text-xs font-semibold text-text-2 tabular">{it.code}</span>
                          <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{it.title}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-text-2">Nada en esta sala por ahora.</p>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
