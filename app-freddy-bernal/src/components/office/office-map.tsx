import { CREW_LABEL, ROOM, ROOMS, type Room } from '@/lib/domain/office';

// The office drawn in isometric view (pedido del 06/11/2026): ten rooms in two rows, in the order the work goes (the
// back row left to right, then the front row right to left). Plain SVG with the color tokens only, so it is light on
// a cheap phone and follows the dark mode. Each room is a link to its list below; the bubble says how many activities
// are in it. Nothing here says when or where.

const A = 56; // half a cell, across
const B = 32; // half a cell, down
const OX = 2 * A + 20;
const OY = 92;
const WALL = 72;
const W = 7 * A + 40;
const H = OY + 7 * B + 34;

type Pt = [number, number];
// Floor point (i across to the right, j across to the left) lifted z pixels.
const P = (i: number, j: number, z = 0): Pt => [OX + (i - j) * A, OY + (i + j) * B - z];
const pts = (...p: Pt[]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

// Back row left to right, then the front row right to left: the line turns like a snake.
export const ROOM_CELL: Record<Room, [number, number]> = Object.fromEntries(
  ROOMS.map((r, n) => [r, n < 5 ? [n, 0] : [9 - n, 1]]),
) as Record<Room, [number, number]>;

function Box({ i, j, w, d, h, z = 0, top, left, right }: { i: number; j: number; w: number; d: number; h: number; z?: number; top: string; left: string; right: string }) {
  return (
    <g>
      <polygon points={pts(P(i, j + d, z), P(i + w, j + d, z), P(i + w, j + d, z + h), P(i, j + d, z + h))} fill={left} />
      <polygon points={pts(P(i + w, j, z), P(i + w, j + d, z), P(i + w, j + d, z + h), P(i + w, j, z + h))} fill={right} />
      <polygon points={pts(P(i, j, z + h), P(i + w, j, z + h), P(i + w, j + d, z + h), P(i, j + d, z + h))} fill={top} />
    </g>
  );
}

const DESK = { top: 'var(--c-surface)', left: 'var(--c-border)', right: 'var(--c-surface-2)' };
const DARK = { top: 'var(--c-slate)', left: 'var(--c-slate)', right: 'var(--c-text-2)' };
const OLIVE = { top: 'var(--c-accent)', left: 'var(--c-accent-ink)', right: 'var(--c-olive)' };

function Desk({ i, j, w = 0.42, d = 0.26 }: { i: number; j: number; w?: number; d?: number }) {
  return <Box i={i} j={j} w={w} d={d} h={13} {...DESK} />;
}

// A screen standing on a desk: a thin dark slab facing the viewer's left.
function Screen({ i, j, z = 13, w = 0.2, h = 14, glow = false }: { i: number; j: number; z?: number; w?: number; h?: number; glow?: boolean }) {
  return (
    <g>
      <polygon points={pts(P(i, j, z), P(i + w, j, z), P(i + w, j, z + h), P(i, j, z + h))} fill="var(--c-slate)" />
      <polygon
        points={pts(P(i + 0.02, j, z + 2), P(i + w - 0.02, j, z + 2), P(i + w - 0.02, j, z + h - 2), P(i + 0.02, j, z + h - 2))}
        fill={glow ? 'var(--c-bg-tint-2)' : 'var(--c-accent-soft)'}
        className={glow ? 'office-glow' : undefined}
      />
    </g>
  );
}

// A person seen from the front-left: shadow, body and head. `n` staggers the little bob.
function Person({ i, j, n = 0, shirt = 'var(--c-accent)' }: { i: number; j: number; n?: number; shirt?: string }) {
  const [x, y] = P(i, j);
  return (
    <g>
      <ellipse cx={x} cy={y} rx={9} ry={4} fill="var(--c-border)" />
      <g className="office-bob" style={{ animationDelay: `${(n % 5) * 0.35}s` }}>
        <path d={`M${x - 7},${y - 2} q0,-16 7,-17 q7,1 7,17 z`} fill={shirt} />
        <circle cx={x} cy={y - 24} r={5.5} fill="var(--c-bg-tint-2)" stroke="var(--c-text-2)" strokeWidth={0.6} />
      </g>
    </g>
  );
}

// The AI helper: a little robot head floating next to the person (rooms where «la IA propone y una persona revisa»).
function Bot({ i, j }: { i: number; j: number }) {
  const [x, y] = P(i, j, 26);
  return (
    <g className="office-float">
      <rect x={x - 7} y={y - 6} width={14} height={11} rx={3} fill="var(--c-surface)" stroke="var(--c-accent-ink)" strokeWidth={1.2} />
      <circle cx={x - 3} cy={y - 0.5} r={1.4} fill="var(--c-accent-ink)" />
      <circle cx={x + 3} cy={y - 0.5} r={1.4} fill="var(--c-accent-ink)" />
      <line x1={x} y1={y - 6} x2={x} y2={y - 9} stroke="var(--c-accent-ink)" strokeWidth={1.2} />
      <circle cx={x} cy={y - 10} r={1.5} fill="var(--c-accent)" />
    </g>
  );
}

function Plant({ i, j }: { i: number; j: number }) {
  const [x, y] = P(i, j, 8);
  return (
    <g>
      <Box i={i - 0.05} j={j - 0.05} w={0.1} d={0.1} h={8} top="var(--c-text-2)" left="var(--c-slate)" right="var(--c-text-2)" />
      <circle cx={x} cy={y - 6} r={6} fill="var(--c-olive)" />
      <circle cx={x - 4} cy={y - 2} r={4} fill="var(--c-accent)" />
    </g>
  );
}

// What makes each room look like its job.
function Props({ room, c, r }: { room: Room; c: number; r: number }) {
  switch (room) {
    case 'reception':
      return (
        <g>
          <Plant i={c + 0.12} j={r + 0.15} />
          <Box i={c + 0.25} j={r + 0.3} w={0.55} d={0.18} h={16} {...OLIVE} />
          <Screen i={c + 0.45} j={r + 0.3} z={16} w={0.16} h={10} />
          <Person i={c + 0.55} j={r + 0.2} n={0} shirt="var(--c-slate)" />
          <Box i={c + 0.18} j={r + 0.72} w={0.12} d={0.12} h={10} {...DESK} />
        </g>
      );
    case 'script':
      return (
        <g>
          <Desk i={c + 0.25} j={r + 0.3} w={0.5} />
          <Box i={c + 0.32} j={r + 0.35} w={0.1} d={0.08} h={2} z={13} top="var(--c-surface)" left="var(--c-border)" right="var(--c-border)" />
          <Box i={c + 0.47} j={r + 0.38} w={0.1} d={0.08} h={4} z={13} top="var(--c-surface)" left="var(--c-border)" right="var(--c-border)" />
          <Person i={c + 0.35} j={r + 0.72} n={1} />
          <Person i={c + 0.68} j={r + 0.7} n={2} shirt="var(--c-olive)" />
          <Bot i={c + 0.85} j={r + 0.55} />
        </g>
      );
    case 'storyboard': {
      // An easel with four little frames (the shots).
      const z = 10;
      return (
        <g>
          <polygon points={pts(P(c + 0.2, r + 0.25, z), P(c + 0.75, r + 0.25, z), P(c + 0.75, r + 0.25, z + 34), P(c + 0.2, r + 0.25, z + 34))} fill="var(--c-surface)" stroke="var(--c-border)" />
          {[0, 1].map((a) =>
            [0, 1].map((b) => {
              const i0 = c + 0.25 + a * 0.24;
              const z0 = z + 4 + b * 15;
              return <polygon key={`${a}${b}`} points={pts(P(i0, r + 0.25, z0), P(i0 + 0.2, r + 0.25, z0), P(i0 + 0.2, r + 0.25, z0 + 11), P(i0, r + 0.25, z0 + 11))} fill={(a + b) % 2 ? 'var(--c-accent-soft)' : 'var(--c-bg-tint-2)'} />;
            }),
          )}
          <line x1={P(c + 0.3, r + 0.25, z)[0]} y1={P(c + 0.3, r + 0.25, z)[1]} x2={P(c + 0.3, r + 0.25)[0]} y2={P(c + 0.3, r + 0.25)[1]} stroke="var(--c-text-2)" strokeWidth={1.5} />
          <line x1={P(c + 0.65, r + 0.25, z)[0]} y1={P(c + 0.65, r + 0.25, z)[1]} x2={P(c + 0.65, r + 0.25)[0]} y2={P(c + 0.65, r + 0.25)[1]} stroke="var(--c-text-2)" strokeWidth={1.5} />
          <Person i={c + 0.45} j={r + 0.7} n={3} />
          <Bot i={c + 0.75} j={r + 0.6} />
        </g>
      );
    }
    case 'recording': {
      const [tx, ty] = P(c + 0.4, r + 0.4);
      return (
        <g>
          {/* Tripod and camera */}
          <line x1={tx} y1={ty - 22} x2={tx - 8} y2={ty} stroke="var(--c-slate)" strokeWidth={1.6} />
          <line x1={tx} y1={ty - 22} x2={tx + 8} y2={ty} stroke="var(--c-slate)" strokeWidth={1.6} />
          <line x1={tx} y1={ty - 22} x2={tx} y2={ty + 3} stroke="var(--c-slate)" strokeWidth={1.6} />
          <Box i={c + 0.33} j={r + 0.36} w={0.16} d={0.08} h={9} z={22} {...DARK} />
          {/* A light on its stand */}
          <line x1={P(c + 0.15, r + 0.75)[0]} y1={P(c + 0.15, r + 0.75)[1]} x2={P(c + 0.15, r + 0.75, 34)[0]} y2={P(c + 0.15, r + 0.75, 34)[1]} stroke="var(--c-slate)" strokeWidth={1.6} />
          <circle cx={P(c + 0.15, r + 0.75, 36)[0]} cy={P(c + 0.15, r + 0.75, 36)[1]} r={6} fill="var(--c-bg-tint-2)" className="office-glow" />
          <Person i={c + 0.62} j={r + 0.62} n={4} shirt="var(--c-slate)" />
        </g>
      );
    }
    case 'clean_cut':
      return (
        <g>
          <Desk i={c + 0.25} j={r + 0.3} />
          <Screen i={c + 0.35} j={r + 0.35} />
          <Person i={c + 0.5} j={r + 0.75} n={0} shirt="var(--c-accent-ink)" />
          {/* A star: the human lead works here */}
          <circle cx={P(c + 0.5, r + 0.75, 40)[0]} cy={P(c + 0.5, r + 0.75, 40)[1]} r={4} fill="var(--c-accent)" stroke="var(--c-accent-ink)" />
        </g>
      );
    case 'brutal_edit':
      return (
        <g>
          <Desk i={c + 0.2} j={r + 0.3} w={0.6} />
          <Screen i={c + 0.25} j={r + 0.33} glow />
          <Screen i={c + 0.5} j={r + 0.33} glow />
          <Box i={c + 0.12} j={r + 0.65} w={0.1} d={0.1} h={18} {...DARK} />
          <Person i={c + 0.5} j={r + 0.75} n={1} />
          <Bot i={c + 0.82} j={r + 0.62} />
        </g>
      );
    case 'approval':
      return (
        <g>
          <Plant i={c + 0.12} j={r + 0.18} />
          <Box i={c + 0.25} j={r + 0.3} w={0.55} d={0.3} h={14} top="var(--c-accent-soft)" left="var(--c-accent-ink)" right="var(--c-olive)" />
          <Screen i={c + 0.45} j={r + 0.35} z={14} w={0.18} h={12} />
          <Box i={c + 0.45} j={r + 0.72} w={0.2} d={0.14} h={8} {...DARK} />
          <Person i={c + 0.55} j={r + 0.82} n={2} shirt="var(--c-slate)" />
        </g>
      );
    case 'copywriting':
      return (
        <g>
          <Desk i={c + 0.25} j={r + 0.3} w={0.5} />
          <Box i={c + 0.32} j={r + 0.36} w={0.14} d={0.1} h={1} z={13} {...DARK} />
          <Screen i={c + 0.32} j={r + 0.36} z={14} w={0.14} h={8} />
          <Box i={c + 0.55} j={r + 0.36} w={0.14} d={0.1} h={1} z={13} {...DARK} />
          <Screen i={c + 0.55} j={r + 0.36} z={14} w={0.14} h={8} />
          <Person i={c + 0.38} j={r + 0.72} n={3} />
          <Person i={c + 0.66} j={r + 0.72} n={4} shirt="var(--c-olive)" />
          <Bot i={c + 0.88} j={r + 0.5} />
        </g>
      );
    case 'publishing':
      return (
        <g>
          <Desk i={c + 0.25} j={r + 0.3} />
          {/* A phone on its stand */}
          <polygon points={pts(P(c + 0.4, r + 0.38, 13), P(c + 0.48, r + 0.38, 13), P(c + 0.48, r + 0.38, 31), P(c + 0.4, r + 0.38, 31))} fill="var(--c-slate)" />
          <polygon points={pts(P(c + 0.41, r + 0.38, 15), P(c + 0.47, r + 0.38, 15), P(c + 0.47, r + 0.38, 29), P(c + 0.41, r + 0.38, 29))} fill="var(--c-accent)" />
          <Person i={c + 0.5} j={r + 0.75} n={0} />
          <Plant i={c + 0.85} j={r + 0.2} />
        </g>
      );
    case 'analytics': {
      // A wall screen with growing bars.
      const z = 14;
      return (
        <g>
          <polygon points={pts(P(c + 0.2, r + 0.22, z), P(c + 0.8, r + 0.22, z), P(c + 0.8, r + 0.22, z + 34), P(c + 0.2, r + 0.22, z + 34))} fill="var(--c-slate)" />
          {[10, 18, 14, 26].map((h, k) => {
            const i0 = c + 0.26 + k * 0.13;
            return <polygon key={k} className="office-bar" style={{ animationDelay: `${k * 0.2}s` }} points={pts(P(i0, r + 0.22, z + 3), P(i0 + 0.08, r + 0.22, z + 3), P(i0 + 0.08, r + 0.22, z + 3 + h), P(i0, r + 0.22, z + 3 + h))} fill={k === 3 ? 'var(--c-accent)' : 'var(--c-bg-tint-1)'} />;
          })}
          <Desk i={c + 0.3} j={r + 0.45} w={0.36} d={0.2} />
          <Person i={c + 0.48} j={r + 0.82} n={1} />
          <Bot i={c + 0.82} j={r + 0.7} />
        </g>
      );
    }
  }
}

export function OfficeMap({ counts, mine }: { counts: Record<Room, number>; mine?: Room[] }) {
  // Back to front, so the front rooms cover what is behind them.
  const order = [...ROOMS].sort((a, b) => ROOM_CELL[a][0] + ROOM_CELL[a][1] - (ROOM_CELL[b][0] + ROOM_CELL[b][1]));
  const corner = P(0, 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none" role="group" aria-label="Dibujo de la oficina con sus diez salas">
      <style>{`
        @keyframes office-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1.5px) } }
        @keyframes office-glow { 0%,100% { opacity: 1 } 50% { opacity: .55 } }
        @keyframes office-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
        @keyframes office-bar { 0%,100% { opacity: 1 } 50% { opacity: .6 } }
        .office-bob { animation: office-bob 2.4s ease-in-out infinite }
        .office-glow { animation: office-glow 1.6s ease-in-out infinite }
        .office-float { animation: office-float 3s ease-in-out infinite }
        .office-bar { animation: office-bar 2s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .office-bob, .office-glow, .office-float, .office-bar { animation: none } }
        .office-room:focus-visible .office-floor { stroke: var(--c-focus); stroke-width: 3 }
        .office-room:hover .office-floor { fill: var(--c-accent-soft) }
      `}</style>

      {/* The two tall outer walls, with windows */}
      <polygon points={pts(P(0, 0), P(5, 0), P(5, 0, WALL), P(0, 0, WALL))} fill="var(--c-surface-2)" stroke="var(--c-border)" />
      <polygon points={pts(P(0, 0), P(0, 2), P(0, 2, WALL), P(0, 0, WALL))} fill="var(--c-border)" stroke="var(--c-border)" />
      {[0, 1, 2, 3, 4].map((k) => (
        <polygon key={`w${k}`} points={pts(P(k + 0.2, 0, 28), P(k + 0.8, 0, 28), P(k + 0.8, 0, 60), P(k + 0.2, 0, 60))} fill="var(--c-bg-tint-3)" stroke="var(--c-surface)" strokeWidth={2} />
      ))}
      {[0, 1].map((k) => (
        <polygon key={`v${k}`} points={pts(P(0, k + 0.25, 28), P(0, k + 0.75, 28), P(0, k + 0.75, 60), P(0, k + 0.25, 60))} fill="var(--c-bg-tint-1)" stroke="var(--c-surface)" strokeWidth={2} />
      ))}
      <text x={corner[0] + 8} y={corner[1] - WALL + 18} fontSize={13} fontWeight={700} fill="var(--c-text)">La oficina</text>

      {order.map((room) => {
        const [c, r] = ROOM_CELL[room];
        const n = counts[room] ?? 0;
        const n1 = ROOMS.indexOf(room) + 1;
        const info = ROOM[room];
        const highlight = mine?.includes(room);
        return (
          <a key={room} href={`#sala-${room}`} className="office-room" aria-label={`${n1}. ${info.label}: ${n === 1 ? '1 actividad' : `${n} actividades`}. ${CREW_LABEL[info.crew]}.`}>
            <polygon
              className="office-floor"
              points={pts(P(c, r), P(c + 1, r), P(c + 1, r + 1), P(c, r + 1))}
              fill={highlight ? 'var(--c-accent-soft)' : (c + r) % 2 ? 'var(--c-surface-2)' : 'var(--c-surface)'}
              stroke="var(--c-border)"
            />
            {/* Low glass partitions on the room's back edges, with a door gap */}
            {r > 0 ? <polygon points={pts(P(c, r), P(c + 0.3, r), P(c + 0.3, r, 10), P(c, r, 10))} fill="var(--c-border)" opacity={0.8} /> : null}
            {r > 0 ? <polygon points={pts(P(c + 0.7, r), P(c + 1, r), P(c + 1, r, 10), P(c + 0.7, r, 10))} fill="var(--c-border)" opacity={0.8} /> : null}
            {c > 0 ? <polygon points={pts(P(c, r), P(c, r + 0.3), P(c, r + 0.3, 10), P(c, r, 10))} fill="var(--c-border)" opacity={0.8} /> : null}
            {c > 0 ? <polygon points={pts(P(c, r + 0.7), P(c, r + 1), P(c, r + 1, 10), P(c, r + 0.7, 10))} fill="var(--c-border)" opacity={0.8} /> : null}
            <Props room={room} c={c} r={r} />
          </a>
        );
      })}

      {/* Labels last, on top of everything: the number and the count always; the name where there is room for it */}
      {ROOMS.map((room, k) => {
        const [c, r] = ROOM_CELL[room];
        const [x, y0] = P(c + 0.5, r + 1);
        const y = y0 - 7;
        const n = counts[room] ?? 0;
        const name = `${k + 1} ${ROOM[room].label}`;
        const w = name.length * 5.1 + 12;
        return (
          <g key={`l-${room}`} aria-hidden pointerEvents="none">
            <g className="sm:hidden">
              <circle cx={x} cy={y + 6} r={9} fill="var(--c-slate)" />
              <text x={x} y={y + 10} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--c-on-slate)">{k + 1}</text>
              {n > 0 ? <circle cx={x + 12} cy={y} r={7} fill="var(--c-accent)" stroke="var(--c-surface)" strokeWidth={1.5} /> : null}
              {n > 0 ? <text x={x + 12} y={y + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="var(--c-on-accent)">{n}</text> : null}
            </g>
            <g className="hidden sm:inline">
              <rect x={x - w / 2} y={y} width={w} height={13} rx={6.5} fill="var(--c-slate)" opacity={0.92} />
              <text x={x} y={y + 9.5} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="var(--c-on-slate)">{name}</text>
              {n > 0 ? <circle cx={x + w / 2} cy={y + 1} r={7} fill="var(--c-accent)" stroke="var(--c-surface)" strokeWidth={1.5} /> : null}
              {n > 0 ? <text x={x + w / 2} y={y + 4.2} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--c-on-accent)">{n}</text> : null}
            </g>
          </g>
        );
      })}
    </svg>
  );
}
