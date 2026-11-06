import type { ReactNode } from 'react';
import { CREW_LABEL, ROOM, ROOMS, type Room } from '@/lib/domain/office';

// «La oficina» (pedido del 06/11/2026), drawn by hand in isometric view as a luxury factory («gigante, espaciosa, de
// lujo, estilo fábrica con cajas y máquinas que pasan las cajas»): ten rooms in two rows, dark walls with gold and big
// windows, a marble floor, and down the wide middle a conveyor belt that runs through every room in the order of the
// work, with a machine at each room and boxes riding from the reception to the analyst. People work in their place
// (they type, look at their screens, present to the camera) while others walk the aisles carrying the work. Plain SVG with the office palette of
// tokens.css: light on a cheap phone, no picture to download. People and screens move with CSS and SVG animations;
// with «reduce motion» everything stays still and nobody walks. Each room's label is a link to its list below (or on
// /oficina, `base`), with the real count. Nothing here says when or where.

const A = 64; // half a cell, across
const B = 37; // half a cell, down
const DEPTH = 1.25; // a room's depth
const FRONT = 2.55; // where the front row starts: the hall in between is 1.3 deep, with the belt in the middle
const DMAX = FRONT + DEPTH;
const OX = DMAX * A + 30;
const OY = 160;
const WALL = 140;
const W = (5 + DMAX) * A + 60;
const H = OY + (5 + DMAX) * B + 40;
const LANE_BACK = 1.7; // the belt going right, in front of the back rooms
const LANE_FRONT = 2.12; // and coming back, in front of the front rooms
const AISLE_BACK = 1.42; // where people walk
const AISLE_FRONT = 2.4;

type Pt = [number, number];
// Floor point (i across to the right, j across to the left) lifted z pixels.
const P = (i: number, j: number, z = 0): Pt => [OX + (i - j) * A, OY + (i + j) * B - z];
const pts = (...p: Pt[]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

// Back row left to right, then the front row right to left: the line turns like a snake, so the two editors and the
// boss's office end up side by side. [column, where the room starts in depth].
export const ROOM_CELL: Record<Room, [number, number]> = Object.fromEntries(
  ROOMS.map((r, n) => [r, n < 5 ? [n, 0] : [9 - n, FRONT]]),
) as Record<Room, [number, number]>;

const v = (name: string) => `var(--c-office-${name})`;
const WHITE = { top: v('white'), left: v('white-3'), right: v('white-2') };
const WOOD = { top: v('wood'), left: v('wood-dark'), right: v('wood') };
const METAL = { top: v('metal-2'), left: v('metal'), right: v('metal-2') };
const OLIVE = { top: 'var(--c-accent)', left: 'var(--c-accent-ink)', right: 'var(--c-olive)' };
type Faces = typeof WHITE;

function Box({ i, j, w, d, h, z = 0, f }: { i: number; j: number; w: number; d: number; h: number; z?: number; f: Faces }) {
  return (
    <g>
      <polygon points={pts(P(i, j + d, z), P(i + w, j + d, z), P(i + w, j + d, z + h), P(i, j + d, z + h))} fill={f.left} />
      <polygon points={pts(P(i + w, j, z), P(i + w, j + d, z), P(i + w, j + d, z + h), P(i + w, j, z + h))} fill={f.right} />
      <polygon points={pts(P(i, j, z + h), P(i + w, j, z + h), P(i + w, j + d, z + h), P(i, j + d, z + h))} fill={f.top} />
    </g>
  );
}

// A flat panel standing on the plane j (a screen, a board), from i to i + w, between heights z and z + h.
const panel = (i: number, j: number, w: number, z: number, h: number) => pts(P(i, j, z), P(i + w, j, z), P(i + w, j, z + h), P(i, j, z + h));

type Look = { shirt: string; skin: string; hair: string };
const LOOKS: Look[] = [
  { shirt: v('shirt-1'), skin: v('skin-1'), hair: v('hair-1') },
  { shirt: v('shirt-2'), skin: v('skin-2'), hair: v('hair-1') },
  { shirt: v('shirt-3'), skin: v('skin-3'), hair: v('hair-1') },
  { shirt: v('shirt-4'), skin: v('skin-1'), hair: v('hair-2') },
  { shirt: v('shirt-5'), skin: v('skin-2'), hair: v('hair-2') },
];
const look = (n: number) => LOOKS[n % LOOKS.length]!;

// Someone at a desk, seen from behind: the chair, the shoulders that move as they type, the back of the head.
function Seated({ at, n = 0 }: { at: Pt; n?: number }) {
  const [x, y] = at;
  const l = look(n);
  return (
    <g>
      <ellipse cx={x} cy={y} rx={10} ry={4.5} fill={v('shadow')} />
      <line x1={x} y1={y} x2={x} y2={y - 8} stroke={v('metal')} strokeWidth={1.6} />
      <line x1={x - 6} y1={y + 1} x2={x + 6} y2={y - 1} stroke={v('metal')} strokeWidth={1.4} />
      <rect x={x - 8} y={y - 11} width={16} height={4} rx={1.5} fill={v('metal')} />
      <g className="o-type" style={{ animationDelay: `${(n % 4) * 0.13}s` }}>
        <path d={`M${x - 8.5},${y - 10} C${x - 9},${y - 25} ${x + 9},${y - 25} ${x + 8.5},${y - 10} Z`} fill={l.shirt} stroke={v('white-3')} strokeWidth={0.4} />
        <rect x={x - 2} y={y - 27} width={4} height={4} fill={l.skin} />
        <circle cx={x - 6} cy={y - 31} r={1.6} fill={l.skin} />
        <circle cx={x + 6} cy={y - 31} r={1.6} fill={l.skin} />
        <circle cx={x} cy={y - 31.5} r={6.2} fill={l.hair} />
      </g>
    </g>
  );
}

// Someone standing, seen from the front. `walk` moves the legs; `carry` puts something in their hands.
function Standing({ at, n = 0, walk = false, carry, shirt }: { at: Pt; n?: number; walk?: boolean; carry?: 'folder' | 'tablet' | 'laptop' | 'mic'; shirt?: string }) {
  const [x, y] = at;
  const l = look(n);
  const top = shirt ?? l.shirt;
  return (
    <g className={walk ? undefined : 'o-breathe'} style={walk ? undefined : { animationDelay: `${(n % 5) * 0.4}s` }}>
      <ellipse cx={x} cy={y} rx={9} ry={4} fill={v('shadow')} />
      <rect className={walk ? 'o-leg-a' : undefined} x={x - 4.6} y={y - 14} width={4} height={14} rx={1.5} fill={v('pants')} />
      <rect className={walk ? 'o-leg-b' : undefined} x={x + 0.6} y={y - 14} width={4} height={14} rx={1.5} fill={v('pants')} />
      <path d={`M${x - 7.5},${y - 12} L${x - 7.5},${y - 26} Q${x},${y - 30.5} ${x + 7.5},${y - 26} L${x + 7.5},${y - 12} Z`} fill={top} stroke={v('white-3')} strokeWidth={0.4} />
      <rect x={x - 10} y={y - 26} width={2.8} height={12} rx={1.4} fill={top} />
      <rect x={x + 7.2} y={y - 26} width={2.8} height={12} rx={1.4} fill={top} />
      <circle cx={x - 8.6} cy={y - 13.5} r={1.6} fill={l.skin} />
      <circle cx={x + 8.6} cy={y - 13.5} r={1.6} fill={l.skin} />
      <rect x={x - 2} y={y - 31} width={4} height={3} fill={l.skin} />
      <circle cx={x} cy={y - 35.5} r={6} fill={l.skin} />
      <path d={`M${x - 6.3},${y - 35} a6.3,6.3 0 0 1 12.6,0 q-6.3,-3.2 -12.6,0 z`} fill={l.hair} />
      <circle cx={x - 2.2} cy={y - 35} r={0.8} fill={v('hair-1')} />
      <circle cx={x + 2.2} cy={y - 35} r={0.8} fill={v('hair-1')} />
      {carry === 'folder' ? <rect x={x + 6} y={y - 22} width={7} height={9} rx={0.8} fill={'var(--c-accent)'} stroke={v('white')} strokeWidth={0.6} /> : null}
      {carry === 'tablet' ? <rect x={x - 6} y={y - 21} width={12} height={7} rx={1} fill={v('screen')} stroke={v('glow')} strokeWidth={0.8} /> : null}
      {carry === 'laptop' ? <rect x={x - 7} y={y - 19} width={14} height={4} rx={1} fill={v('metal-2')} /> : null}
      {carry === 'mic' ? <line x1={x + 9} y1={y - 15} x2={x + 6} y2={y - 26} stroke={v('metal')} strokeWidth={2} strokeLinecap="round" /> : null}
    </g>
  );
}

function Plant({ at, big = false }: { at: Pt; big?: boolean }) {
  const [x, y] = at;
  const s = big ? 1.4 : 1;
  return (
    <g className="o-sway">
      <ellipse cx={x} cy={y} rx={7 * s} ry={3 * s} fill={v('shadow')} />
      <path d={`M${x - 5 * s},${y - 10 * s} L${x + 5 * s},${y - 10 * s} L${x + 4 * s},${y} L${x - 4 * s},${y} Z`} fill={v('pot')} stroke={v('white-3')} strokeWidth={0.5} />
      <ellipse cx={x - 4 * s} cy={y - 17 * s} rx={4 * s} ry={7 * s} fill={v('leaf')} transform={`rotate(-25 ${x - 4 * s} ${y - 17 * s})`} />
      <ellipse cx={x + 4 * s} cy={y - 18 * s} rx={4 * s} ry={7.5 * s} fill={v('leaf-2')} transform={`rotate(25 ${x + 4 * s} ${y - 18 * s})`} />
      <ellipse cx={x} cy={y - 21 * s} rx={3.6 * s} ry={8 * s} fill={v('leaf')} />
    </g>
  );
}

// A screen on the plane j: frame, and a lit face that may flicker.
function Screen({ i, j, w, z, h, lit = v('glow'), flicker = false, children }: { i: number; j: number; w: number; z: number; h: number; lit?: string; flicker?: boolean; children?: ReactNode }) {
  return (
    <g>
      <polygon points={panel(i, j, w, z, h)} fill={v('screen')} />
      <polygon points={panel(i + 0.015, j, w - 0.03, z + 1.6, h - 3.2)} fill={lit} className={flicker ? 'o-flicker' : undefined} opacity={0.9} />
      {children}
    </g>
  );
}

// A bookshelf against the back wall with colored binders.
function Shelf({ i, j }: { i: number; j: number }) {
  const binders = [v('shirt-1'), v('glow-2'), v('shirt-3'), v('leaf-2'), 'var(--c-accent)', v('glow-3')];
  return (
    <g>
      <Box i={i} j={j} w={0.34} d={0.1} h={52} f={WHITE} />
      {[0, 1, 2].map((row) =>
        binders.map((c, k) => (
          <polygon key={`${row}-${k}`} points={panel(i + 0.02 + k * 0.05, j + 0.1, 0.04, 6 + row * 16, 12)} fill={c} opacity={0.95} />
        )),
      )}
    </g>
  );
}

// What makes each room look like its job. (c, r0): the room's column and where it starts in depth; u and w across,
// t and d in depth as a share of the room's depth.
function Furniture({ room, c, r0 }: { room: Room; c: number; r0: number }) {
  const I = (u: number) => c + u;
  const J = (t: number) => r0 + t * DEPTH;
  const Q = (u: number, t: number, z = 0) => P(I(u), J(t), z);
  const desk = (u: number, t: number, w: number, d = 0.24, f: Faces = WHITE, h = 15) => <Box i={I(u)} j={J(t)} w={w} d={d * DEPTH} h={h} f={f} />;
  switch (room) {
    case 'reception':
      return (
        <g>
          <Shelf i={I(0.58)} j={J(0.02)} />
          <Plant at={Q(0.12, 0.2)} big />
          <Standing at={Q(0.48, 0.3)} n={3} shirt={v('shirt-3')} />
          <Box i={I(0.2)} j={J(0.42)} w={0.62} d={0.2 * DEPTH} h={20} f={OLIVE} />
          <Box i={I(0.2)} j={J(0.42)} w={0.62} d={0.2 * DEPTH} h={3} z={20} f={WHITE} />
          <Screen i={I(0.42)} j={J(0.45)} w={0.16} z={23} h={11} />
          <Standing at={Q(0.62, 0.88)} n={1} carry="folder" />
        </g>
      );
    case 'script':
      return (
        <g>
          <Shelf i={I(0.06)} j={J(0.02)} />
          {desk(0.2, 0.36, 0.64)}
          <Screen i={I(0.27)} j={J(0.4)} w={0.16} z={15} h={12} flicker />
          <Screen i={I(0.58)} j={J(0.4)} w={0.16} z={15} h={12} lit={v('glow-2')} />
          <Box i={I(0.47)} j={J(0.46)} w={0.08} d={0.08} h={5} z={15} f={WHITE} />
          <Seated at={Q(0.36, 0.8)} n={0} />
          <Seated at={Q(0.68, 0.8)} n={4} />
        </g>
      );
    case 'storyboard':
      return (
        <g>
          <polygon points={panel(I(0.14), J(0.16), 0.5, 14, 40)} fill={v('white')} stroke={v('white-3')} />
          {[0, 1, 2].map((a) =>
            [0, 1].map((b) => (
              <polygon key={`${a}${b}`} points={panel(I(0.17 + a * 0.155), J(0.16), 0.13, 19 + b * 17, 13)} fill={(a + b) % 2 ? v('rug-1') : v('rug-2')} stroke={v('white-3')} strokeWidth={0.5} />
            )),
          )}
          <line x1={Q(0.2, 0.16)[0]} y1={Q(0.2, 0.16)[1]} x2={Q(0.2, 0.16, 14)[0]} y2={Q(0.2, 0.16, 14)[1]} stroke={v('metal')} strokeWidth={1.4} />
          <line x1={Q(0.6, 0.16)[0]} y1={Q(0.6, 0.16)[1]} x2={Q(0.6, 0.16, 14)[0]} y2={Q(0.6, 0.16, 14)[1]} stroke={v('metal')} strokeWidth={1.4} />
          {desk(0.3, 0.42, 0.5)}
          <Box i={I(0.42)} j={J(0.47)} w={0.2} d={0.12} h={1.5} z={15} f={{ top: v('screen'), left: v('metal'), right: v('metal') }} />
          <Plant at={Q(0.88, 0.3)} />
          <Seated at={Q(0.54, 0.84)} n={2} />
        </g>
      );
    case 'recording': {
      const [cx, cy] = Q(0.48, 0.78);
      return (
        <g>
          <polygon points={panel(I(0.14), J(0.1), 0.7, 0, 58)} fill={v('shirt-5')} />
          <polygon points={pts(P(I(0.14), J(0.1)), P(I(0.84), J(0.1)), P(I(0.84), J(0.36)), P(I(0.14), J(0.36)))} fill={v('shirt-5')} opacity={0.7} />
          <Standing at={Q(0.5, 0.26)} n={2} carry="mic" shirt={v('shirt-3')} />
          {/* Two softbox lights */}
          {[0.1, 0.9].map((u) => {
            const [x, y] = Q(u, 0.52);
            return (
              <g key={u}>
                <line x1={x} y1={y} x2={x} y2={y - 40} stroke={v('metal')} strokeWidth={1.4} />
                <rect x={x - 7} y={y - 52} width={14} height={12} rx={2} fill={v('white')} stroke={v('white-3')} className="o-flicker" />
              </g>
            );
          })}
          {/* The camera on its tripod, with REC blinking */}
          <line x1={cx} y1={cy - 24} x2={cx - 8} y2={cy} stroke={v('metal')} strokeWidth={1.5} />
          <line x1={cx} y1={cy - 24} x2={cx + 8} y2={cy} stroke={v('metal')} strokeWidth={1.5} />
          <line x1={cx} y1={cy - 24} x2={cx} y2={cy + 3} stroke={v('metal')} strokeWidth={1.5} />
          <Box i={I(0.42)} j={J(0.7)} w={0.13} d={0.07} h={9} z={24} f={METAL} />
          <circle cx={cx + 7} cy={cy - 33} r={1.8} fill={v('rec')} className="o-blink" />
          <Seated at={Q(0.66, 0.92)} n={1} />
        </g>
      );
    }
    case 'clean_cut': {
      const [sx, sy] = P(I(0.3), J(0.42), 18);
      const [ex, ey] = P(I(0.64), J(0.42), 18);
      return (
        <g>
          <Shelf i={I(0.58)} j={J(0.02)} />
          {desk(0.22, 0.38, 0.56)}
          <Screen i={I(0.28)} j={J(0.42)} w={0.38} z={15} h={20}>
            {/* The timeline: three tracks and the playhead running */}
            {[0, 1, 2].map((k) => (
              <polygon key={k} points={panel(I(0.31 + k * 0.03), J(0.42), 0.2 - k * 0.03, 18.5 + k * 3.4, 2.2)} fill={[v('glow-3'), v('glow-2'), 'var(--c-accent)'][k]} />
            ))}
            <line x1={0} y1={0} x2={0} y2={-13} stroke={v('rec')} strokeWidth={1} className="o-motion">
              <animateMotion dur="5s" repeatCount="indefinite" path={`M${sx},${sy + 1} L${ex},${ey + 1}`} />
            </line>
          </Screen>
          <Box i={I(0.72)} j={J(0.44)} w={0.05} d={0.05} h={9} z={15} f={METAL} />
          <Seated at={Q(0.5, 0.84)} n={2} />
        </g>
      );
    }
    case 'brutal_edit':
      return (
        <g>
          {desk(0.12, 0.34, 0.76, 0.26)}
          {[0, 1, 2].map((k) => (
            <Screen key={k} i={I(0.17 + k * 0.23)} j={J(0.38)} w={0.2} z={15} h={15} lit={[v('glow-2'), v('glow-3'), v('glow')][k]} flicker={k !== 1}>
              <circle cx={P(I(0.27 + k * 0.23), J(0.38), 22)[0]} cy={P(I(0.27 + k * 0.23), J(0.38), 22)[1]} r={3} fill="var(--c-accent)" className="o-spin" />
            </Screen>
          ))}
          <Box i={I(0.05)} j={J(0.55)} w={0.07} d={0.07} h={22} f={METAL} />
          <Box i={I(0.9)} j={J(0.5)} w={0.07} d={0.07} h={22} f={METAL} />
          <Seated at={Q(0.5, 0.82)} n={0} />
        </g>
      );
    case 'approval':
      return (
        <g>
          <polygon points={pts(Q(0.08, 0.08), Q(0.94, 0.08), Q(0.94, 0.96), Q(0.08, 0.96))} fill={v('rug-2')} />
          <Plant at={Q(0.1, 0.14)} big />
          <Standing at={Q(0.52, 0.22)} n={0} shirt={v('shirt-3')} />
          <Box i={I(0.24)} j={J(0.32)} w={0.6} d={0.24 * DEPTH} h={16} f={WOOD} />
          <Screen i={I(0.42)} j={J(0.36)} w={0.18} z={16} h={12} />
          <Box i={I(0.7)} j={J(0.34)} w={0.06} d={0.06} h={9} z={16} f={OLIVE} />
          {[0.2, 0.68].map((u) => (
            <g key={u}>
              <Box i={I(u)} j={J(0.74)} w={0.16} d={0.16} h={9} f={OLIVE} />
              <Box i={I(u)} j={J(0.74)} w={0.16} d={0.04} h={18} f={OLIVE} />
            </g>
          ))}
        </g>
      );
    case 'copywriting':
      return (
        <g>
          {desk(0.18, 0.34, 0.66)}
          {[0.26, 0.56].map((u, k) => (
            <g key={u}>
              <Box i={I(u)} j={J(0.4)} w={0.14} d={0.08} h={1.2} z={15} f={METAL} />
              <Screen i={I(u)} j={J(0.4)} w={0.14} z={16} h={9} lit={k ? v('glow-2') : v('glow')} flicker={k === 0} />
            </g>
          ))}
          <Seated at={Q(0.34, 0.8)} n={3} />
          <Seated at={Q(0.66, 0.8)} n={1} />
        </g>
      );
    case 'publishing':
      return (
        <g>
          <Plant at={Q(0.86, 0.18)} big />
          {desk(0.2, 0.36, 0.56)}
          {/* The phone on its stand, lit */}
          <polygon points={panel(I(0.42), J(0.42), 0.08, 15, 18)} fill={v('screen')} />
          <polygon points={panel(I(0.43), J(0.42), 0.06, 17, 14)} fill="var(--c-accent)" className="o-flicker" />
          <Screen i={I(0.26)} j={J(0.4)} w={0.13} z={15} h={10} lit={v('glow-3')} />
          <Seated at={Q(0.48, 0.82)} n={4} />
        </g>
      );
    case 'analytics':
      return (
        <g>
          {/* A big screen on its stand with the numbers growing */}
          <Box i={I(0.46)} j={J(0.16)} w={0.06} d={0.06} h={20} f={METAL} />
          <polygon points={panel(I(0.16), J(0.18), 0.68, 20, 38)} fill={v('screen')} />
          {[14, 22, 18, 30, 26].map((h, k) => (
            <polygon
              key={k}
              className="o-bar"
              style={{ animationDelay: `${k * 0.3}s` }}
              points={panel(I(0.21 + k * 0.12), J(0.18), 0.07, 24, h)}
              fill={k === 3 ? 'var(--c-accent)' : v('glow')}
            />
          ))}
          {desk(0.26, 0.48, 0.5, 0.2)}
          <Screen i={I(0.34)} j={J(0.52)} w={0.14} z={15} h={10} />
          <Seated at={Q(0.5, 0.88)} n={2} />
        </g>
      );
  }
}

// People walking the corridor, carrying the work from one room to the next and back, with a pause at each end.
const WALKERS: { from: [number, number]; to: [number, number]; n: number; carry: 'folder' | 'tablet' | 'laptop'; dur: number; begin: number }[] = [
  { from: [0.6, AISLE_BACK], to: [1.55, AISLE_BACK], n: 4, carry: 'folder', dur: 11, begin: 0 }, // the reading, to the scriptwriters
  { from: [2.5, AISLE_BACK], to: [3.5, AISLE_BACK], n: 3, carry: 'tablet', dur: 12, begin: 2 }, // the storyboard, to the recording
  { from: [4.45, AISLE_FRONT], to: [3.55, AISLE_FRONT], n: 1, carry: 'laptop', dur: 10, begin: 4 }, // the final edit, to the boss
  { from: [2.4, AISLE_FRONT], to: [1.4, AISLE_FRONT], n: 0, carry: 'folder', dur: 13, begin: 6 }, // the copies, to the publisher
];

// The belt: right in front of the back rooms, a turn at the end, and back in front of the front rooms.
const BELT_START = 0.2;
const BELT_END = 4.82;
const BELT_Z = 7;
const BELT_PATH: Pt[] = [P(BELT_START, LANE_BACK, BELT_Z + 6), P(BELT_END, LANE_BACK, BELT_Z + 6), P(BELT_END, LANE_FRONT, BELT_Z + 6), P(BELT_START, LANE_FRONT, BELT_Z + 6)];
const BOXES = 12;
const BOX_DUR = 36;

const BELT = { top: v('belt'), left: v('belt-2'), right: v('belt-2') };
function Belt({ lane, dir }: { lane: number; dir: 1 | -1 }) {
  const j = lane - 0.11;
  const [x1, y1] = P(BELT_START - 0.1, lane, BELT_Z + 6);
  const [x2, y2] = P(BELT_END + 0.1, lane, BELT_Z + 6);
  return (
    <g>
      {Array.from({ length: 10 }, (_, k) => BELT_START + k * 0.5).map((i) => (
        <g key={i}>
          <line x1={P(i, j + 0.03)[0]} y1={P(i, j + 0.03)[1]} x2={P(i, j + 0.03, BELT_Z)[0]} y2={P(i, j + 0.03, BELT_Z)[1]} stroke={v('metal')} strokeWidth={1.4} />
          <line x1={P(i, j + 0.19)[0]} y1={P(i, j + 0.19)[1]} x2={P(i, j + 0.19, BELT_Z)[0]} y2={P(i, j + 0.19, BELT_Z)[1]} stroke={v('metal')} strokeWidth={1.4} />
        </g>
      ))}
      <Box i={BELT_START - 0.1} j={j} w={BELT_END - BELT_START + 0.2} d={0.22} h={6} z={BELT_Z} f={BELT} />
      {/* The belt's surface running, and the hazard stripe on its edge */}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={v('belt-line')} strokeWidth={3} strokeDasharray="2 6" className={dir === 1 ? 'o-run' : 'o-run-back'} />
      <line x1={P(BELT_START - 0.1, j + 0.22, BELT_Z + 3)[0]} y1={P(BELT_START - 0.1, j + 0.22, BELT_Z + 3)[1]} x2={P(BELT_END + 0.1, j + 0.22, BELT_Z + 3)[0]} y2={P(BELT_END + 0.1, j + 0.22, BELT_Z + 3)[1]} stroke={v('hazard')} strokeWidth={2} strokeDasharray="5 5" />
    </g>
  );
}

// A machine over the belt in front of a room: two posts, a gold beam, a press that goes up and down and a green light.
function Machine({ i, lane, n }: { i: number; lane: number; n: number }) {
  const [lx, ly] = P(i, lane, 40);
  return (
    <g>
      <Box i={i - 0.035} j={lane - 0.2} w={0.07} d={0.07} h={32} f={METAL} />
      <Box i={i - 0.06} j={lane - 0.2} w={0.12} d={0.4} h={5} z={32} f={{ top: v('gold-2'), left: v('gold'), right: v('gold') }} />
      <g className="o-press" style={{ animationDelay: `${(n % 5) * 0.37}s` }}>
        <line x1={P(i, lane, 32)[0]} y1={P(i, lane, 32)[1]} x2={P(i, lane, 26)[0]} y2={P(i, lane, 26)[1]} stroke={v('metal-2')} strokeWidth={2.4} />
        <Box i={i - 0.05} j={lane - 0.05} w={0.1} d={0.1} h={5} z={21} f={METAL} />
      </g>
      <circle cx={lx} cy={ly} r={2.2} fill={v('go')} className="o-blink" style={{ animationDelay: `${(n % 3) * 0.4}s` }} />
      <Box i={i - 0.035} j={lane + 0.13} w={0.07} d={0.07} h={32} f={METAL} />
    </g>
  );
}

// A cardboard box with its tape, drawn around (0, 0): the belt carries it with animateMotion.
function Parcel() {
  const s = 0.075;
  const h = 11;
  const o = P(0, 0);
  const R = (i: number, j: number, z = 0): Pt => {
    const [x, y] = P(i, j, z);
    return [x - o[0], y - o[1]];
  };
  return (
    <g>
      <polygon points={pts(R(-s, s), R(s, s), R(s, s, h), R(-s, s, h))} fill={v('box')} />
      <polygon points={pts(R(s, -s), R(s, s), R(s, s, h), R(s, -s, h))} fill={v('box-2')} />
      <polygon points={pts(R(-s, -s, h), R(s, -s, h), R(s, s, h), R(-s, s, h))} fill={v('box-top')} />
      <line x1={R(-s, 0, h)[0]} y1={R(-s, 0, h)[1]} x2={R(s, 0, h)[0]} y2={R(s, 0, h)[1]} stroke={v('tape')} strokeWidth={2} />
    </g>
  );
}

// People walking an aisle (behind the belt or in front of it), carrying the work and back, with a pause at each end.
function Walkers({ which }: { which: 'back' | 'front' }) {
  const lane = which === 'back' ? AISLE_BACK : AISLE_FRONT;
  return (
    <g className="o-walkers">
      {WALKERS.filter((w) => w.from[1] === lane).map((w, k) => {
        const [x1, y1] = P(w.from[0], w.from[1]);
        const [x2, y2] = P(w.to[0], w.to[1]);
        return (
          <g key={k}>
            <animateMotion
              dur={`${w.dur}s`}
              begin={`${w.begin}s`}
              repeatCount="indefinite"
              calcMode="linear"
              keyPoints="0;1;1;0;0"
              keyTimes="0;0.42;0.5;0.92;1"
              path={`M0,0 L${(x2 - x1).toFixed(1)},${(y2 - y1).toFixed(1)}`}
            />
            <Standing at={[x1, y1]} n={w.n} walk carry={w.carry} />
          </g>
        );
      })}
    </g>
  );
}

export function OfficeMap({ counts, mine, base = '' }: { counts: Record<Room, number>; mine?: Room[]; base?: string }) {
  const back = ROOMS.filter((r) => ROOM_CELL[r][1] === 0).sort((a, b) => ROOM_CELL[a][0] - ROOM_CELL[b][0]);
  const front = ROOMS.filter((r) => ROOM_CELL[r][1] !== 0).sort((a, b) => ROOM_CELL[a][0] - ROOM_CELL[b][0]);
  const room = (r: Room) => {
    const [c, r0] = ROOM_CELL[r];
    const k = ROOMS.indexOf(r);
    const rug = [v('rug-1'), v('rug-2'), v('rug-3')][k % 3]!;
    return (
      <g key={r}>
        <polygon points={pts(P(c + 0.05, r0 + 0.05), P(c + 0.95, r0 + 0.05), P(c + 0.95, r0 + DEPTH - 0.05), P(c + 0.05, r0 + DEPTH - 0.05))} fill={rug} opacity={mine?.includes(r) ? 1 : 0.75} stroke={mine?.includes(r) ? 'var(--c-accent)' : 'none'} strokeWidth={2} />
        {/* A low glass partition on the room's left side */}
        {c > 0 ? <polygon points={pts(P(c, r0), P(c, r0 + DEPTH), P(c, r0 + DEPTH, 26), P(c, r0, 26))} fill={v('glass')} opacity={0.55} stroke={v('gold')} strokeWidth={0.9} /> : null}
        <Furniture room={r} c={c} r0={r0} />
      </g>
    );
  };
  return (
    <div className="-mx-2 overflow-x-auto sm:mx-0" role="group" aria-label="Dibujo de la oficina con sus diez salas">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[900px] select-none" aria-hidden={false}>
        <style>{`
          @keyframes o-type { from { transform: translateY(0) } to { transform: translateY(-0.9px) } }
          @keyframes o-breathe { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-0.8px) } }
          @keyframes o-step { from { transform: rotate(-16deg) } to { transform: rotate(16deg) } }
          @keyframes o-flicker { 0%,100% { opacity: .95 } 40% { opacity: .7 } 60% { opacity: .9 } }
          @keyframes o-blink { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }
          @keyframes o-bar { 0%,100% { transform: scaleY(1) } 50% { transform: scaleY(.6) } }
          @keyframes o-sway { 0%,100% { transform: skewX(0) } 50% { transform: skewX(1.5deg) } }
          @keyframes o-spin { to { transform: rotate(360deg) } }
          @keyframes o-run { to { stroke-dashoffset: -16 } }
          @keyframes o-run-back { to { stroke-dashoffset: 16 } }
          @keyframes o-press { 0%,60%,100% { transform: translateY(0) } 75% { transform: translateY(9px) } }
          .o-run { animation: o-run .6s linear infinite }
          .o-run-back { animation: o-run-back .6s linear infinite }
          .o-press { animation: o-press 3s ease-in-out infinite }
          .o-type { animation: o-type .45s ease-in-out infinite alternate }
          .o-breathe { animation: o-breathe 3s ease-in-out infinite }
          .o-leg-a, .o-leg-b { transform-box: fill-box; transform-origin: top; animation: o-step .42s ease-in-out infinite alternate }
          .o-leg-b { animation-direction: alternate-reverse }
          .o-flicker { animation: o-flicker 2.6s ease-in-out infinite }
          .o-blink { animation: o-blink 1.2s steps(1) infinite }
          .o-bar { transform-box: fill-box; transform-origin: bottom; animation: o-bar 3.2s ease-in-out infinite }
          .o-sway { transform-box: fill-box; transform-origin: bottom; animation: o-sway 5s ease-in-out infinite }
          .o-spin { transform-box: fill-box; transform-origin: center; animation: o-spin 3s linear infinite }
          @media (prefers-reduced-motion: reduce) {
            .o-type, .o-breathe, .o-leg-a, .o-leg-b, .o-flicker, .o-blink, .o-bar, .o-sway, .o-spin, .o-run, .o-run-back, .o-press { animation: none }
            .o-walkers, .o-motion { display: none }
          }
          .o-label:focus-visible rect { stroke: var(--c-focus); stroke-width: 2.5 }
          .o-label:hover rect { opacity: .85 }
        `}</style>

        {/* Floor */}
        {/* A marble floor with gold inlay */}
        <polygon points={pts(P(0, 0), P(5, 0), P(5, DMAX), P(0, DMAX))} fill={v('floor')} />
        {Array.from({ length: Math.floor(DMAX * 2) }, (_, k) => (k + 1) / 2).map((j) => <line key={j} x1={P(0, j)[0]} y1={P(0, j)[1]} x2={P(5, j)[0]} y2={P(5, j)[1]} stroke={v('floor-line')} strokeWidth={0.7} opacity={0.6} />)}
        {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5].map((i) => <line key={i} x1={P(i, 0)[0]} y1={P(i, 0)[1]} x2={P(i, DMAX)[0]} y2={P(i, DMAX)[1]} stroke={v('floor-line')} strokeWidth={0.7} opacity={0.6} />)}
        {/* The floor's edge, with a gold trim */}
        <polygon points={pts(P(0, DMAX), P(5, DMAX), P(5, DMAX, -10), P(0, DMAX, -10))} fill={v('wall')} />
        <polygon points={pts(P(5, 0), P(5, DMAX), P(5, DMAX, -10), P(5, 0, -10))} fill={v('wall-side')} />
        <line x1={P(0, DMAX)[0]} y1={P(0, DMAX)[1]} x2={P(5, DMAX)[0]} y2={P(5, DMAX)[1]} stroke={v('gold')} strokeWidth={1.4} />
        <line x1={P(5, 0)[0]} y1={P(5, 0)[1]} x2={P(5, DMAX)[0]} y2={P(5, DMAX)[1]} stroke={v('gold')} strokeWidth={1.4} />

        {/* Two tall walls of windows, with the city behind */}
        <polygon points={pts(P(0, 0), P(5, 0), P(5, 0, WALL), P(0, 0, WALL))} fill={v('wall')} />
        <polygon points={pts(P(0, 0), P(0, DMAX), P(0, DMAX, WALL), P(0, 0, WALL))} fill={v('wall-side')} />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => {
          const i = 0.1 + k * 0.49;
          return (
            <g key={`w${k}`}>
              <polygon points={panel(i - 0.012, 0, 0.444, 24, 98)} fill={v('gold')} />
              <polygon points={panel(i, 0, 0.42, 26, 94)} fill={v('sky')} />
              {[0.05, 0.16, 0.27].map((di, m) => (
                <polygon key={m} points={panel(i + di, 0, 0.09, 26, [26, 40, 18][(k + m) % 3]!)} fill={m % 2 ? v('city') : v('city-2')} />
              ))}
              <polygon points={panel(i, 0, 0.42, 26, 94)} fill={v('glass')} opacity={0.35} />
            </g>
          );
        })}
        {[0, 1, 2, 3, 4, 5].map((k) => {
          const j = 0.12 + k * 0.6;
          return (
            <g key={`s${k}`}>
              <polygon points={pts(P(0, j - 0.012, 24), P(0, j + 0.492, 24), P(0, j + 0.492, 122), P(0, j - 0.012, 122))} fill={v('gold')} />
              <polygon points={pts(P(0, j, 26), P(0, j + 0.48, 26), P(0, j + 0.48, 120), P(0, j, 120))} fill={v('sky')} />
              <polygon points={pts(P(0, j + 0.06, 26), P(0, j + 0.2, 26), P(0, j + 0.2, 26 + [30, 20, 38, 24, 34, 26][k]!), P(0, j + 0.06, 26 + [30, 20, 38, 24, 34, 26][k]!))} fill={v('city-2')} />
              <polygon points={pts(P(0, j, 26), P(0, j + 0.48, 26), P(0, j + 0.48, 120), P(0, j, 120))} fill={v('glass-2')} opacity={0.4} />
            </g>
          );
        })}
        <polygon points={pts(P(0, 0, WALL), P(5, 0, WALL), P(5, -0.08, WALL), P(0, -0.08, WALL))} fill={v('wall-top')} />
        <polygon points={pts(P(0, 0, WALL), P(0, DMAX, WALL), P(-0.08, DMAX, WALL), P(-0.08, 0, WALL))} fill={v('wall-top')} />
        <text x={24} y={44} fontSize={20} fontWeight={800} fill="var(--c-text)" letterSpacing={1.5}>LA OFICINA</text>
        <text x={24} y={62} fontSize={10} fill="var(--c-text-2)">Las cajas van de sala en sala</text>

        {back.map(room)}

        {/* The hall: people walking the aisles, the belt with its machines and the boxes riding from room to room */}
        <Walkers which="back" />
        <Belt lane={LANE_BACK} dir={1} />
        <Belt lane={LANE_FRONT} dir={-1} />
        {/* The turn at the end of the line */}
        <Box i={BELT_END - 0.02} j={LANE_BACK - 0.11} w={0.22} d={LANE_FRONT - LANE_BACK + 0.22} h={6} z={BELT_Z} f={BELT} />
        <g className="o-motion">
          {Array.from({ length: BOXES }, (_, k) => (
            <g key={k}>
              <animateMotion dur={`${BOX_DUR}s`} begin={`${(-k * BOX_DUR) / BOXES}s`} repeatCount="indefinite" path={`M${BELT_PATH.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}`} />
              <animate attributeName="opacity" dur={`${BOX_DUR}s`} begin={`${(-k * BOX_DUR) / BOXES}s`} repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.03;0.96;1" />
              <Parcel />
            </g>
          ))}
        </g>
        {ROOMS.map((r, k) => {
          const [c, r0] = ROOM_CELL[r];
          return <Machine key={r} i={c + 0.5} lane={r0 === 0 ? LANE_BACK : LANE_FRONT} n={k} />;
        })}
        <Walkers which="front" />

        {front.map(room)}

        {/* The labels, last, on top of everything: number, name and the real count; each one opens its room */}
        {ROOMS.map((r, k) => {
          const [c, r0] = ROOM_CELL[r];
          const [x, y] = P(c + 0.5, r0 + DEPTH);
          const n = counts[r] ?? 0;
          const info = ROOM[r];
          const name = `${k + 1} ${info.label}`;
          const w = name.length * 5.1 + 26;
          return (
            <a
              key={`l-${r}`}
              href={`${base}#sala-${r}`}
              className="o-label"
              aria-label={`${k + 1}. ${info.label}: ${n === 1 ? '1 actividad' : `${n} actividades`}. ${CREW_LABEL[info.crew]}.`}
            >
              <rect x={x - w / 2} y={y - 9} width={w} height={15} rx={7.5} fill="var(--c-slate)" opacity={0.92} stroke={mine?.includes(r) ? 'var(--c-accent)' : 'none'} strokeWidth={2} />
              <text x={x - 6} y={y + 2} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="var(--c-on-slate)">{name}</text>
              <circle cx={x + w / 2 - 8} cy={y - 1.5} r={6} fill={n > 0 ? 'var(--c-accent)' : 'var(--c-surface-2)'} />
              <text x={x + w / 2 - 8} y={y + 1.6} textAnchor="middle" fontSize={8} fontWeight={800} fill={n > 0 ? 'var(--c-on-accent)' : 'var(--c-text-2)'}>{n}</text>
            </a>
          );
        })}
      </svg>
    </div>
  );
}
