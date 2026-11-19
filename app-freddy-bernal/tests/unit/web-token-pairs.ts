// The new website's colour pairs (design §2.3 of the new website, 19/11/2026): ONE table for the contrast check and the
// colour-vision check of the web's roles, the same one the design was measured with (0 failures over 53 pairs per mode,
// 5 map pairs and the three public states under three colour-vision simulations). tests/unit/web-tokens.test.ts (WP1)
// reads the roles' values from the «Web» block of src/app/tokens.css (role «ink» → --w-ink; map role «rec-fill» →
// --w-map-rec-fill) and runs checkWebTokens() over them: a role that misses a pair fails there, not in front of a person.
// Pure, no imports: the math is the design script's (WCAG 2.x contrast; Machado, Oliveira & Fernandes 2009 at severity
// 1.0, CIELAB ΔE76 and ΔL* between the simulated colours).

/** text: 4.5:1 (normal text) · large: 3:1 (≥ 24 px regular) · ui: 3:1 (marks, borders, focus) · deco: reported only. */
export type PairKind = 'text' | 'large' | 'ui' | 'deco';
export const CONTRAST_NEED: Record<PairKind, number> = { text: 4.5, large: 3, ui: 3, deco: 0 };

/** The web's roles (each mode defines every one; their CSS name is --w-<role>). */
export const WEB_ROLES = [
  'paper', 'band', 'surface', 'ink', 'ink-2', 'olive-ink', 'deep', 'deep-hover', 'deepest', 'on-deep', 'on-deep-2', 'accent', 'on-accent',
  'mark', 'accent-ink', 'accent-on-deep', 'highlight', 'rule', 'rule-strong', 'rule-on-deep', 'line-on-deep', 'marquee-on-deep', 'focus',
  'focus-on-deep', 'st-rec-fill', 'st-rec-on', 'st-way-fill', 'st-way-on', 'st-fix-fill', 'st-fix-on', 'st-edge', 'danger', 'banner',
  'on-banner',
] as const;
export type WebRole = (typeof WEB_ROLES)[number];

/** The map's roles: the markers keep these light values in both modes, because the tiles stay light (--w-map-<role>). */
export const MAP_ROLES = ['rec-fill', 'rec-on', 'way-fill', 'way-on', 'fix-fill', 'fix-on', 'edge', 'tile'] as const;
export type MapRole = (typeof MAP_ROLES)[number];

export type Pair<R extends string> = readonly [foreground: R, background: R, kind: PairKind];

/** Every foreground on every background it is used on, with its need (the design's pairs.json, in its order). */
export const WEB_TOKEN_PAIRS: readonly Pair<WebRole>[] = [
  ['ink', 'paper', 'text'], ['ink', 'band', 'text'], ['ink', 'surface', 'text'],
  ['ink-2', 'paper', 'text'], ['ink-2', 'band', 'text'], ['ink-2', 'surface', 'text'],
  ['olive-ink', 'paper', 'text'], ['olive-ink', 'band', 'text'], ['olive-ink', 'surface', 'text'],
  ['accent-ink', 'paper', 'text'], ['accent-ink', 'band', 'text'], ['accent-ink', 'surface', 'text'],
  ['danger', 'paper', 'text'], ['danger', 'band', 'text'], ['danger', 'surface', 'text'],
  ['on-accent', 'accent', 'text'],
  ['on-deep', 'deep', 'text'], ['on-deep', 'deep-hover', 'text'], ['on-deep', 'deepest', 'text'],
  ['on-deep-2', 'deep', 'text'], ['on-deep-2', 'deep-hover', 'text'], ['on-deep-2', 'deepest', 'text'],
  ['accent-on-deep', 'deep', 'text'], ['accent-on-deep', 'deep-hover', 'text'], ['accent-on-deep', 'deepest', 'text'],
  ['highlight', 'deep', 'text'], ['highlight', 'deep-hover', 'text'], ['highlight', 'deepest', 'text'],
  ['on-banner', 'banner', 'text'],
  ['marquee-on-deep', 'deep', 'large'],
  ['mark', 'paper', 'ui'], ['mark', 'band', 'ui'], ['mark', 'surface', 'ui'], ['mark', 'deep', 'ui'], ['mark', 'deepest', 'ui'],
  ['rule-strong', 'paper', 'ui'], ['rule-strong', 'band', 'ui'], ['rule-strong', 'surface', 'ui'],
  ['focus', 'paper', 'ui'], ['focus', 'band', 'ui'], ['focus', 'surface', 'ui'],
  ['focus-on-deep', 'deep', 'ui'], ['focus-on-deep', 'deep-hover', 'ui'], ['focus-on-deep', 'deepest', 'ui'],
  ['st-edge', 'paper', 'ui'], ['st-edge', 'band', 'ui'], ['st-edge', 'surface', 'ui'],
  ['st-rec-on', 'st-rec-fill', 'text'], ['st-way-on', 'st-way-fill', 'text'], ['st-fix-on', 'st-fix-fill', 'text'],
  ['line-on-deep', 'deep', 'deco'], ['rule-on-deep', 'deep', 'deco'], ['rule', 'paper', 'deco'],
];

/** The map's markers on their own fills and on the tiles. */
export const MAP_TOKEN_PAIRS: readonly Pair<MapRole>[] = [
  ['rec-on', 'rec-fill', 'text'], ['way-on', 'way-fill', 'text'], ['fix-on', 'fix-fill', 'text'], ['edge', 'tile', 'ui'], ['fix-fill', 'tile', 'ui'],
];

/** The three public states (Recibido · En camino · Arreglado) must stay apart for every person: pairwise, under no
 * simulation and the three colour-vision deficiencies, at least these distances. */
export const STATE_CVD = {
  sets: {
    light: ['st-rec-fill', 'st-way-fill', 'st-fix-fill'] as const,
    dark: ['st-rec-fill', 'st-way-fill', 'st-fix-fill'] as const,
    map: ['rec-fill', 'way-fill', 'fix-fill'] as const,
  },
  minDeltaE: 20,
  minDeltaL: 15,
} as const;

export const CVD_KINDS = ['none', 'protan', 'deutan', 'tritan'] as const;
export type CvdKind = (typeof CVD_KINDS)[number];

// --- The math (the design's check_tokens.py, line by line) -----------------------------------------------------------
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** «#RRGGBB» → [r, g, b] in 0..1. Throws on anything else (a role without a plain colour cannot be checked). */
export function rgbOf(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`«${hex}» no es un color #RRGGBB`);
  return [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255) as [number, number, number];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const MACHADO: Record<Exclude<CvdKind, 'none'>, number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

/** The colour as a person with that deficiency sees it, in linear RGB (Machado 2009, severity 1.0). */
export function simulateCvd(hex: string, kind: CvdKind): [number, number, number] {
  const l = rgbOf(hex).map(linear);
  if (kind === 'none') return l as [number, number, number];
  const m = MACHADO[kind];
  return [0, 1, 2].map((i) => Math.min(Math.max(m[i][0] * l[0] + m[i][1] * l[1] + m[i][2] * l[2], 0), 1)) as [number, number, number];
}

/** CIELAB (D65) of a linear-RGB colour. */
export function labOf([r, g, b]: [number, number, number]): [number, number, number] {
  const x = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x / 0.95047);
  const fy = f(y);
  const fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export type Separation = { set: string; kind: CvdKind; a: string; b: string; deltaE: number; deltaL: number };

/** Every pair of the colours, under every simulation: how far apart they stay (ΔE76 and ΔL*). */
export function stateSeparations(set: string, colors: Record<string, string>, keys: readonly string[]): Separation[] {
  const out: Separation[] = [];
  for (const kind of CVD_KINDS) {
    const labs = Object.fromEntries(keys.map((k) => [k, labOf(simulateCvd(colors[k], kind))]));
    for (let i = 0; i < keys.length; i++) {
      for (const b of keys.slice(i + 1)) {
        const [p, q] = [labs[keys[i]], labs[b]];
        out.push({ set, kind, a: keys[i], b, deltaE: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), deltaL: Math.abs(p[0] - q[0]) });
      }
    }
  }
  return out;
}

export type PairResult = { mode: string; fg: string; bg: string; kind: PairKind; ratio: number; ok: boolean };
export type TokenCheck = { pairs: PairResult[]; separations: Separation[]; failures: string[] };

/** The whole check over the roles' values of each mode and of the map: every pair with its ratio, every separation, and
 * the failures in words (a missing role is a failure too). */
export function checkWebTokens(t: { light: Record<string, string>; dark: Record<string, string>; map: Record<string, string> }): TokenCheck {
  const pairs: PairResult[] = [];
  const failures: string[] = [];
  const run = (mode: string, values: Record<string, string>, table: readonly Pair<string>[]) => {
    for (const [fg, bg, kind] of table) {
      if (!values[fg] || !values[bg]) {
        failures.push(`${mode}: falta ${!values[fg] ? fg : bg}`);
        continue;
      }
      const ratio = contrastRatio(values[fg], values[bg]);
      const ok = ratio >= CONTRAST_NEED[kind];
      pairs.push({ mode, fg, bg, kind, ratio, ok });
      if (!ok) failures.push(`${mode}: ${fg} sobre ${bg} da ${ratio.toFixed(2)} (necesita ${CONTRAST_NEED[kind]})`);
    }
  };
  run('light', t.light, WEB_TOKEN_PAIRS);
  run('dark', t.dark, WEB_TOKEN_PAIRS);
  run('map', t.map, MAP_TOKEN_PAIRS);
  const separations: Separation[] = [];
  for (const [set, keys] of Object.entries(STATE_CVD.sets)) {
    const values = set === 'map' ? t.map : set === 'dark' ? t.dark : t.light;
    if (keys.some((k) => !values[k])) {
      failures.push(`${set}: faltan los colores de los estados`);
      continue;
    }
    for (const s of stateSeparations(set, values, keys)) {
      separations.push(s);
      if (s.deltaE < STATE_CVD.minDeltaE || s.deltaL < STATE_CVD.minDeltaL) {
        failures.push(`${set} ${s.kind}: ${s.a} y ${s.b} quedan a ΔE ${s.deltaE.toFixed(1)}, ΔL ${s.deltaL.toFixed(1)}`);
      }
    }
  }
  return { pairs, separations, failures };
}
