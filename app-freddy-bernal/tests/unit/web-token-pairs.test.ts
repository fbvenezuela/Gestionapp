// The pair table of the new website's colours (tests/unit/web-token-pairs.ts) and its math, checked on the values the
// design proposed on 19/11/2026 (its tokens.json): the same 53 pairs per mode, 5 map pairs and 0 failures the design
// measured, and the numbers it quotes. WP1 puts the values into src/app/tokens.css; its tests/unit/web-tokens.test.ts
// reads them from there and runs the same checkWebTokens().
import { describe, expect, it } from 'vitest';
import {
  CONTRAST_NEED, MAP_ROLES, MAP_TOKEN_PAIRS, STATE_CVD, WEB_ROLES, WEB_TOKEN_PAIRS, checkWebTokens, contrastRatio, labOf, simulateCvd,
} from './web-token-pairs';

// The design's proposal (design-tools2/tokens.json), test data only: the colours themselves live in src/app/tokens.css.
const DESIGN = {
  light: {
    paper: '#FAF7EF', band: '#F1EFE4', surface: '#FFFFFF', ink: '#111111', 'ink-2': '#5C5C56', 'olive-ink': '#5C6123',
    deep: '#33371A', 'deep-hover': '#3D4220', deepest: '#1F2210', 'on-deep': '#FFFFFF', 'on-deep-2': '#DADBC8',
    accent: '#FE5A03', 'on-accent': '#111111', mark: '#E85002', 'accent-ink': '#A63A00', 'accent-on-deep': '#FD943C',
    highlight: '#FFD380', rule: '#D9D6CA', 'rule-strong': '#8A8878', 'rule-on-deep': '#565A3A',
    'line-on-deep': '#5E632D', 'marquee-on-deep': '#A3A866',
    focus: '#5F6524', 'focus-on-deep': '#FFD380',
    'st-rec-fill': '#FFFFFF', 'st-rec-on': '#111111', 'st-way-fill': '#C79A2E', 'st-way-on': '#111111',
    'st-fix-fill': '#3F4F14', 'st-fix-on': '#FFFFFF', 'st-edge': '#111111',
    danger: '#B91C1C', banner: '#22231F', 'on-banner': '#F4F2EA',
  },
  dark: {
    paper: '#121410', band: '#1A1D15', surface: '#20241A', ink: '#F1F1EC', 'ink-2': '#B9B8AF', 'olive-ink': '#C5CC6E',
    deep: '#262A14', 'deep-hover': '#2E3318', deepest: '#0E100A', 'on-deep': '#FFFFFF', 'on-deep-2': '#D6D7C4',
    accent: '#FF7A33', 'on-accent': '#111111', mark: '#FF7A33', 'accent-ink': '#FF9A5C', 'accent-on-deep': '#FD943C',
    highlight: '#FFD380', rule: '#33372C', 'rule-strong': '#7C7B70', 'rule-on-deep': '#45492C',
    'line-on-deep': '#4A4F24', 'marquee-on-deep': '#8F9452',
    focus: '#D4DA7F', 'focus-on-deep': '#FFD380',
    'st-rec-fill': '#20241A', 'st-rec-on': '#F1F1EC', 'st-way-fill': '#A87A1E', 'st-way-on': '#111111',
    'st-fix-fill': '#B7CC78', 'st-fix-on': '#111111', 'st-edge': '#D6D7C4',
    danger: '#F98080', banner: '#0E0F0C', 'on-banner': '#F1F1EF',
  },
  map: { 'rec-fill': '#FFFFFF', 'rec-on': '#111111', 'way-fill': '#C79A2E', 'way-on': '#111111', 'fix-fill': '#3F4F14', 'fix-on': '#FFFFFF', edge: '#111111', tile: '#F2EFE9' },
};

const ratio = (r: ReturnType<typeof checkWebTokens>, mode: string, fg: string, bg: string) => r.pairs.find((p) => p.mode === mode && p.fg === fg && p.bg === bg)!.ratio;

describe('la tabla de pares de colores de la web nueva', () => {
  it('53 pares por modo y 5 del mapa, sin repetir, solo con roles que existen', () => {
    expect(WEB_TOKEN_PAIRS).toHaveLength(53);
    expect(MAP_TOKEN_PAIRS).toHaveLength(5);
    expect(new Set(WEB_TOKEN_PAIRS.map(([a, b]) => `${a}|${b}`)).size).toBe(53);
    const roles = new Set<string>(WEB_ROLES);
    for (const [fg, bg] of WEB_TOKEN_PAIRS) expect(roles.has(fg) && roles.has(bg), `${fg} / ${bg}`).toBe(true);
    for (const [fg, bg] of MAP_TOKEN_PAIRS) expect((MAP_ROLES as readonly string[]).includes(fg) && (MAP_ROLES as readonly string[]).includes(bg)).toBe(true);
    // Every role of the web is in some pair (one that is in none is never checked).
    for (const role of WEB_ROLES) expect(WEB_TOKEN_PAIRS.some(([a, b]) => a === role || b === role), role).toBe(true);
    expect(Object.keys(DESIGN.light).sort()).toEqual([...WEB_ROLES].sort());
    expect(Object.keys(DESIGN.dark).sort()).toEqual([...WEB_ROLES].sort());
    expect(CONTRAST_NEED).toEqual({ text: 4.5, large: 3, ui: 3, deco: 0 });
  });

  it('la cuenta de contraste es la de WCAG (blanco sobre negro, 21; un color consigo mismo, 1)', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#7F8630', '#7F8630')).toBe(1);
    expect(contrastRatio('#111111', '#FE5A03')).toBeCloseTo(contrastRatio('#FE5A03', '#111111'), 10);
    expect(() => contrastRatio('rojo', '#FFFFFF')).toThrow(/#RRGGBB/);
    // Lab of white is L* 100; a grey sees the same under every simulation.
    expect(labOf(simulateCvd('#FFFFFF', 'none'))[0]).toBeCloseTo(100, 1);
    for (const k of ['protan', 'deutan', 'tritan'] as const) expect(labOf(simulateCvd('#777777', k))[0]).toBeCloseTo(labOf(simulateCvd('#777777', 'none'))[0], 0);
  });

  it('los valores del diseño pasan todo: 0 fallas, y los números que el diseño cita', () => {
    const r = checkWebTokens(DESIGN);
    expect(r.failures).toEqual([]);
    expect(r.pairs).toHaveLength(53 * 2 + 5);
    // The hover pairs that failed before the review (§2.3).
    expect(ratio(r, 'light', 'accent-on-deep', 'deep-hover')).toBeCloseTo(4.74, 2);
    expect(ratio(r, 'dark', 'accent-on-deep', 'deep-hover')).toBeCloseTo(5.91, 2);
    expect(ratio(r, 'light', 'on-deep-2', 'deep-hover')).toBeCloseTo(7.48, 2);
    expect(ratio(r, 'light', 'focus-on-deep', 'deep-hover')).toBeCloseTo(7.45, 2);
    // The states' counts on the map's markers.
    expect([ratio(r, 'map', 'rec-on', 'rec-fill'), ratio(r, 'map', 'way-on', 'way-fill'), ratio(r, 'map', 'fix-on', 'fix-fill')].map((x) => x.toFixed(2))).toEqual(['18.88', '7.27', '8.97']);
    // The states stay apart for everyone: the closest pair is dark mode's «en camino» and «arreglado» seen with deuteranopia.
    expect(r.separations).toHaveLength(3 * 4 * 3);
    const closest = r.separations.reduce((a, b) => (b.deltaE < a.deltaE ? b : a));
    expect([closest.set, closest.kind, closest.a, closest.b]).toEqual(['dark', 'deutan', 'st-way-fill', 'st-fix-fill']);
    expect(closest.deltaE).toBeCloseTo(27.1, 1);
    expect(Math.min(...r.separations.map((s) => s.deltaL))).toBeCloseTo(22.7, 1);
    expect(STATE_CVD.minDeltaE).toBe(20);
  });

  it('una falla se dice con su par y su número; un rol que falta también falla', () => {
    const lowered = { ...DESIGN, light: { ...DESIGN.light, 'ink-2': '#9A9A94' } };
    expect(checkWebTokens(lowered).failures).toEqual(expect.arrayContaining([expect.stringMatching(/^light: ink-2 sobre paper da \d\.\d\d \(necesita 4\.5\)$/)]));
    const withoutHighlight: Record<string, string> = { ...DESIGN.dark };
    delete withoutHighlight.highlight;
    expect(checkWebTokens({ ...DESIGN, dark: withoutHighlight }).failures).toContain('dark: falta highlight');
    const sameStates = { ...DESIGN, map: { ...DESIGN.map, 'way-fill': '#3F4F14' } };
    expect(checkWebTokens(sameStates).failures.some((f) => f.startsWith('map none: way-fill y fix-fill'))).toBe(true);
  });
});
