import Link from 'next/link';
import { DateTime } from 'luxon';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/card';
import { TZ } from '@/lib/time';

export type CalEvent = { id: string; title: string; place_name: string; starts_at: string; ends_at: string; boss_decision: string; priority: number | null; cancelled_at?: string | Date | null };

const HOUR_START = 6;
const HOUR_END = 23;
const HOUR_PX = 56;

// A cancelled event stays in its place, struck through (it is not deleted: who and why are on its page).
function tone(e: CalEvent) {
  if (e.cancelled_at) return 'border-muted bg-surface-2 text-text-2 line-through';
  if (e.boss_decision === 'rejected') return 'border-danger bg-danger-soft text-danger line-through';
  if (e.boss_decision === 'pending') return 'border-warn bg-warn-soft text-text';
  return 'border-accent bg-accent-soft text-text';
}

const local = (iso: string) => DateTime.fromJSDate(new Date(iso)).setZone(TZ).setLocale('es');

// Both views are long grids (up to 42 days, or 17 hours a day): a solid Card, without blur behind them (docs/DISENO.md).
export function MonthView({ anchor, events }: { anchor: DateTime; events: CalEvent[] }) {
  const first = anchor.startOf('month').startOf('week');
  const last = anchor.endOf('month').endOf('week');
  const days: DateTime[] = [];
  for (let d = first; d <= last; d = d.plus({ days: 1 })) days.push(d);
  const todayKey = DateTime.now().setZone(TZ).toISODate();
  return (
    <Card solid className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center">
        {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => (
          <div key={d} className="label-caps py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = d.toISODate();
          const list = events.filter((e) => local(e.starts_at).toISODate() === key);
          const out = d.month !== anchor.month;
          return (
            <div key={key} className={cn('min-h-20 border-b border-r border-border p-1 sm:min-h-28', out && 'bg-surface-2/60')}>
              <Link href={`/agenda?vista=dia&fecha=${key}`} className={cn('mb-1 inline-grid h-7 w-7 place-items-center rounded-full text-sm font-semibold', key === todayKey ? 'bg-accent text-on-accent' : out ? 'text-muted' : 'text-text')}>
                {d.day}
              </Link>
              <ul className="flex flex-col gap-1">
                {list.slice(0, 3).map((e) => (
                  <li key={e.id}>
                    <Link href={`/eventos/${e.id}`} className={cn('block truncate rounded-[var(--radius-chip)] border-l-2 px-1 py-0.5 text-[11px] font-medium sm:text-xs', tone(e))}>
                      <span className="hidden font-mono sm:inline">{local(e.starts_at).toFormat('H:mm')} </span>
                      {e.cancelled_at ? <span className="sr-only">Cancelado: </span> : null}
                      {e.title}
                    </Link>
                  </li>
                ))}
                {list.length > 3 ? <li className="px-1 text-[11px] text-text-2">+{list.length - 3} más</li> : null}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function TimeGrid({ days, events }: { days: DateTime[]; events: CalEvent[] }) {
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const todayKey = DateTime.now().setZone(TZ).toISODate();
  return (
    <Card solid className="overflow-x-auto">
      <div style={{ minWidth: days.length > 1 ? 720 : undefined }}>
        <div className="grid border-b border-border bg-surface-2" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0,1fr))` }}>
          <div />
          {days.map((d) => (
            <Link key={d.toISODate()} href={`/agenda?vista=dia&fecha=${d.toISODate()}`} className="py-2 text-center">
              <span className="label-caps block">{d.toFormat('ccc')}</span>
              <span className={cn('mx-auto mt-0.5 grid h-8 w-8 place-items-center rounded-full font-bold', d.toISODate() === todayKey && 'bg-accent text-on-accent')}>{d.day}</span>
            </Link>
          ))}
        </div>
        <div className="relative grid" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0,1fr))` }}>
          <div>
            {hours.map((h) => (
              <div key={h} className="relative border-b border-border text-right font-mono text-[11px] text-text-2" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-1.5 bg-surface px-0.5">{DateTime.fromObject({ hour: h }).toFormat('h a')}</span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const key = d.toISODate();
            const list = events.filter((e) => local(e.starts_at).toISODate() === key);
            return (
              <div key={key} className="relative border-l border-border">
                {hours.map((h) => (
                  <div key={h} className="border-b border-border" style={{ height: HOUR_PX }} />
                ))}
                {list.map((e) => {
                  const s = local(e.starts_at);
                  const en = local(e.ends_at);
                  const top = Math.max(0, (s.hour + s.minute / 60 - HOUR_START) * HOUR_PX);
                  const height = Math.max(26, (en.diff(s, 'minutes').minutes / 60) * HOUR_PX - 2);
                  return (
                    <Link
                      key={e.id}
                      href={`/eventos/${e.id}`}
                      className={cn('absolute inset-x-1 overflow-hidden rounded-[var(--radius-chip)] border-l-4 px-1.5 py-1 text-xs shadow-sm', tone(e))}
                      style={{ top, height }}
                    >
                      <span className="block font-mono font-semibold">{s.toFormat('h:mm a')}</span>
                      <span className="block font-semibold leading-tight">{e.cancelled_at ? <span className="sr-only">Cancelado: </span> : null}{e.title}</span>
                      <span className="block truncate text-text-2">{e.place_name}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
