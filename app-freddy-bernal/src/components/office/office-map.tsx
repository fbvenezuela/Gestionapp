import { CREW_LABEL, ROOM, ROOMS, type Room } from '@/lib/domain/office';
import { cn } from '@/lib/cn';

// The office (pedido del 06/11/2026): the isometric picture Juan chose (public/oficina, 1672 × 941, two sizes in WebP
// for slow phones) with live labels on top. The picture brings its own labels and counts drawn in; each live label is
// laid exactly over the drawn one (and its bubble) so the count is always the real one, and it is the link to the
// room's list below. On a phone the picture keeps a readable width and slides sideways inside its card.

const IMG_W = 1672;
const IMG_H = 941;

// Where each drawn label is in the picture, in pixels of the 1672-wide picture: left, top, right and bottom of the dark
// pill (its count bubble sticks out up and to the right; the live label covers both).
export const ROOM_SPOT: Record<Room, [number, number, number, number]> = {
  reception: [390, 240, 560, 272],
  script: [562, 390, 718, 420],
  storyboard: [762, 513, 930, 543],
  recording: [1062, 446, 1220, 476],
  clean_cut: [1302, 586, 1535, 618],
  brutal_edit: [1118, 720, 1325, 752],
  approval: [712, 732, 945, 765],
  copywriting: [508, 601, 690, 632],
  publishing: [222, 563, 394, 594],
  analytics: [115, 412, 295, 442],
};

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;

// `base`: where a label leads; the room's list is on /oficina (the boss sees the picture in «Digital» too).
export function OfficeMap({ counts, mine, base = '' }: { counts: Record<Room, number>; mine?: Room[]; base?: string }) {
  return (
    <div className="-mx-2 overflow-x-auto sm:mx-0" role="group" aria-label="Dibujo de la oficina con sus diez salas">
      <div className="relative min-w-[720px] [container-type:inline-size]">
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed picture with its own sizes; no optimizer */}
        <img
          src="/oficina/oficina-1672.webp"
          srcSet="/oficina/oficina-960.webp 960w, /oficina/oficina-1672.webp 1672w"
          sizes="(min-width: 1024px) 960px, 720px"
          width={IMG_W}
          height={IMG_H}
          alt=""
          decoding="async"
          className="block h-auto w-full rounded-[var(--radius-control)]"
        />
        {ROOMS.map((room, k) => {
          const [x0, y0, x1, y1] = ROOM_SPOT[room];
          const n = counts[room] ?? 0;
          const info = ROOM[room];
          return (
            <a
              key={room}
              href={`${base}#sala-${room}`}
              aria-label={`${k + 1}. ${info.label}: ${n === 1 ? '1 actividad' : `${n} actividades`}. ${CREW_LABEL[info.crew]}.`}
              className={cn(
                'absolute flex items-center gap-[0.4em] whitespace-nowrap rounded-full bg-slate pl-[0.7em] pr-[0.25em] font-bold leading-none text-on-slate',
                'text-[clamp(11px,1.15cqw,19px)] shadow-[var(--glass-shadow)] outline-offset-2 hover:brightness-125',
                mine?.includes(room) && 'ring-2 ring-accent',
              )}
              style={{
                left: pct(x0 - 6, IMG_W),
                top: pct(y0 - 16, IMG_H),
                minWidth: pct(x1 - x0 + 34, IMG_W),
                minHeight: pct(y1 - y0 + 20, IMG_H),
              }}
            >
              <span className="flex-1">{k + 1} {info.label}</span>
              <span
                className={cn(
                  'grid h-[1.6em] min-w-[1.6em] place-items-center rounded-full px-[0.3em] text-[0.9em]',
                  n > 0 ? 'bg-accent text-on-accent' : 'bg-surface-2 text-text-2',
                )}
                aria-hidden
              >
                {n}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
