import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GLASS_ATTR, GLASS_OFF, GLASS_SCRIPT, applyGlass, lowEndDevice, type GlassNavigator } from '@/components/shell/glass-core';
import { block, deltaE, fade, lum, oklab, over, ratio, saturate } from './fixtures/tokens';

// «Cara glass» (docs/DISENO.md): the glass lives in tokens.css, globals.css and the base components only.
// These checks keep it readable (AA over the worst thing that can be behind each surface), solid where it
// must be, and keep axe able to measure contrast. v2 (27/10, «súbelo, que se note más el glass»): visible
// blobs of the brand behind real frosted cards.

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

// ── globals.css ──────────────────────────────────────────────────────────────────────────────
type Rule = { selector: string; decls: Record<string, string[]>; at: string[] };

// Flat list of the style rules of a stylesheet, each with the @-rules it sits in (outermost first).
function parse(source: string): Rule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  const stack: string[] = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      const head = stack.pop()!;
      if (!head.startsWith('@')) {
        const decls: Record<string, string[]> = {};
        for (const d of buf.split(';').map((x) => x.trim()).filter(Boolean)) {
          const i = d.indexOf(':');
          (decls[d.slice(0, i).trim()] ??= []).push(d.slice(i + 1).trim().replace(/\s+/g, ' '));
        }
        rules.push({ selector: head.replace(/\s+/g, ' '), decls, at: stack.filter((s) => s.startsWith('@')) });
      }
      buf = '';
    } else if (ch === ';' && stack.length === 0) {
      buf = '';
    } else {
      buf += ch;
    }
  }
  return rules;
}

const globals = read('src/app/globals.css');
const RULES = parse(globals);
const SUPPORTS = '@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px)))';
const GATE = ":where(:root:not([data-glass='off']):not([data-contrast='high']))";
const SOLID_MEDIA = '@media (prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)';
const OPT_OUT = [`${GATE} .glass-card.glass-solid`, `${GATE} :where(ul, ol):not(nav *) > li > .glass-card`];
// The selectors of a selector list (commas inside :where(…) or :not(…) do not split).
function selectors(list: string): string[] {
  const out = [''];
  let depth = 0;
  for (const ch of list) {
    if (ch === ',' && depth === 0) out.push('');
    else {
      depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
      out[out.length - 1] += ch;
    }
  }
  return out.map((x) => x.trim());
}
const filters = (r: Rule) => [...(r.decls['backdrop-filter'] ?? []), ...(r.decls['-webkit-backdrop-filter'] ?? [])];
const blurs = (r: Rule) => filters(r).some((v) => v !== 'none');
const inComponents = (r: Rule) => r.at[0] === '@layer components';
const gated = (sel: string) => RULES.find((r) => r.selector === `${GATE} ${sel}` && r.at.includes(SUPPORTS));
// The blur radius (px) and the saturation (as a factor) of a rule's backdrop-filter.
function filterOf(r: Rule | undefined): { blur: number; sat: number } {
  const v = r?.decls['backdrop-filter']?.[0] ?? '';
  return { blur: Number(/blur\((\d+(?:\.\d+)?)px\)/.exec(v)?.[1] ?? 0), sat: Number(/saturate\((\d+(?:\.\d+)?)%\)/.exec(v)?.[1] ?? 100) / 100 };
}
const SAT = { card: filterOf(gated('.glass-card')).sat, bar: filterOf(gated('.glass-bar::before')).sat, pop: filterOf(gated('.glass-pop')).sat, sheet: filterOf(gated('.glass-sheet')).sat };

// ── Contrast ─────────────────────────────────────────────────────────────────────────────────
const THEMES = {
  light: { t: block(':root'), worst: '#000000' }, // dark text: black behind a bar is the worst case
  dark: { t: block(":root[data-theme='dark']"), worst: '#ffffff' }, // light text: white is the worst case
};
const SUN = {
  light: block(":root[data-contrast='high']"),
  darkSystem: block(":root[data-contrast='high']:not([data-theme='light'])"),
  darkForced: block(":root[data-contrast='high'][data-theme='dark']"),
};
const TINTS = ['--c-bg-tint-1', '--c-bg-tint-2', '--c-bg-tint-3'];
const GLASS_TOKENS = [...TINTS, '--c-bg-wash', '--c-glass', '--c-glass-bar', '--c-glass-sheet', '--c-glass-border', '--glass-highlight', '--glass-shadow', '--glass-shadow-pop'];
const TEXT = ['--c-text', '--c-text-2', '--c-muted', '--c-accent-ink', '--c-ok', '--c-warn', '--c-danger', '--c-info'];
// What the top bar, the phone bar and the menus print. ok and warn text never go on .glass-bar or .glass-pop.
const BAR_TEXT = ['--c-text', '--c-text-2', '--c-muted', '--c-accent-ink', '--c-danger', '--c-info'];

// A glass card's soft shadow (--glass-shadow) darkens the page right under the card, where the next line of text can
// start: 12 px below its edge, the gap the screens leave under a card (mt-3, gap-3). Each layer of the shadow is the
// card's box moved down by its y offset, grown by its spread (shrunk, when negative) and blurred with a Gaussian of
// sigma = blur / 2; under a wide card its alpha `d` px below the edge is alpha × (1 − Φ((d − y − spread) / sigma)).
const TEXT_UNDER_CARD = 12;
// Φ, the normal distribution (Abramowitz and Stegun 7.1.26 for erf: error under 1.5e-7).
function phi(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const k = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * k - 1.453152027) * k + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * Math.exp(-x * x);
  return 0.5 * (1 + Math.sign(z) * erf);
}
// Each layer of a box-shadow as the color it lays `d` px under the card ('rgba(r, g, b, a)'), from the token.
function shadowUnderCard(shadow: string, d = TEXT_UNDER_CARD): string[] {
  return selectors(shadow).map((layer) => {
    const m = /^(-?[\d.]+)(?:px)? (-?[\d.]+)(?:px)? ([\d.]+)(?:px)?(?: (-?[\d.]+)(?:px)?)? rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(layer);
    if (!m) throw new Error(`box-shadow layer not understood: ${layer}`);
    const [y, blur, spread, alpha] = [Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[8])];
    const a = alpha * (1 - phi((d - y - spread) / (blur / 2)));
    return `rgba(${m[5]}, ${m[6]}, ${m[7]}, ${a.toFixed(4)})`;
  });
}

// Every color the page background (body::before) can show: --c-bg under the wash (a linear gradient to
// --c-bg-wash), then the three blob colors, each fading to transparent and stacked in any order (the
// blobs overlap), in steps of 10 %. Stops and plateaus included. A blur only averages these colors, so
// it cannot leave this set (the steps cover every mix of the five colors). And each of them again under a
// card's shadow (shadowUnderCard), where text right below a card sits.
function pageColors(t: Record<string, string>): string[] {
  const steps = Array.from({ length: 11 }, (_, i) => i / 10);
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const out = new Set<string>();
  for (const w of steps) {
    const base = fade(t['--c-bg-wash'], w, t['--c-bg']);
    for (const [i, j, k] of orders)
      for (const a of steps) {
        const x = fade(t[TINTS[i]], a, base);
        for (const b of steps) {
          const y = fade(t[TINTS[j]], b, x);
          for (const c of steps) out.add(fade(t[TINTS[k]], c, y));
        }
      }
  }
  const shadow = shadowUnderCard(t['--glass-shadow']);
  for (const c of [...out]) out.add(shadow.reduce((bg, layer) => over(layer, bg), c));
  return [...out];
}
// What a blurred surface really has behind it: the colors, and the same colors after its saturate().
const saturated = (colors: string[], s: number) => [...new Set(colors.flatMap((c) => [c, saturate(c, s), saturate(c, s, true)]))];
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const minRatio = (fg: string, bgLums: number[]) => {
  const f = lum(fg);
  return bgLums.reduce((m, b) => Math.min(m, contrast(f, b)), Infinity);
};

describe('glass: contraste AA sobre lo peor que puede quedar detrás', () => {
  it('lee la saturación de cada vidrio en globals.css', () => {
    for (const [k, v] of Object.entries(SAT)) expect(v, k).toBeGreaterThan(1);
  });

  for (const [name, { t, worst }] of Object.entries(THEMES)) {
    describe(name, () => {
      const page = pageColors(t);
      const behindBars = [...page, worst, t['--c-text'], t['--c-accent']];
      const lums = (colors: string[]) => colors.map(lum);
      const pageL = lums(page);
      const cardL = lums(saturated(page, SAT.card).map((p) => over(t['--c-glass'], p)));
      const barL = lums(saturated(behindBars, Math.max(SAT.bar, SAT.pop)).map((p) => over(t['--c-glass-bar'], p)));
      const sheetL = lums(saturated(behindBars, SAT.sheet).map((p) => over(t['--c-glass-sheet'], p)));

      it('el fondo tiene miles de mezclas posibles (la cuenta no está vacía)', () => {
        expect(page.length).toBeGreaterThan(1000);
        expect(Math.max(...pageL) - Math.min(...pageL), 'the blobs really change the page').toBeGreaterThan(name === 'light' ? 0.1 : 0.02);
      });

      it('la sombra de una tarjeta oscurece de verdad el fondo justo debajo (la cuenta la lee de tokens.css)', () => {
        const through = shadowUnderCard(t['--glass-shadow']).reduce((left, l) => left * (1 - Number(/([\d.]+)\)$/.exec(l)![1])), 1);
        expect(1 - through).toBeGreaterThan(name === 'light' ? 0.04 : 0.1);
        expect(1 - through).toBeLessThan(0.3);
      });

      it('todo texto llega a 4.5:1 sobre el fondo de la página (manchas, lavado y sombra de una tarjeta) y sobre la tarjeta sólida', () => {
        for (const fg of TEXT) {
          expect(minRatio(t[fg], pageL), `${fg} on page`).toBeGreaterThanOrEqual(4.5);
          expect(ratio(t[fg], t['--c-surface']), `${fg} on surface`).toBeGreaterThanOrEqual(4.5);
        }
      });

      it('todo texto llega a 4.5:1 sobre una tarjeta de vidrio (desenfoque y saturación) en cualquier punto del fondo', () => {
        for (const fg of TEXT) expect(minRatio(t[fg], cardL), fg).toBeGreaterThanOrEqual(4.5);
      });

      it('barras y menús: su texto llega a 4.5:1 aunque pase algo negro (o blanco, en oscuro) por detrás', () => {
        for (const fg of BAR_TEXT) expect(minRatio(t[fg], barL), fg).toBeGreaterThanOrEqual(4.5);
      });

      it('paneles y diálogos: todo texto llega a 4.5:1 con cualquier cosa detrás', () => {
        for (const fg of TEXT) expect(minRatio(t[fg], sheetL), fg).toBeGreaterThanOrEqual(4.5);
      });

      it('el anillo de foco se ve (3:1) sobre la página y sobre cada vidrio', () => {
        for (const [where, bgs] of Object.entries({ page: pageL, card: cardL, bar: barL, sheet: sheetL })) expect(minRatio(t['--c-focus'], bgs), where).toBeGreaterThanOrEqual(3);
      });

      it('el vidrio es translúcido de verdad (que se note), más opaco cuanto más puede pasar detrás', () => {
        const alpha = (k: string) => Number(/,\s*([\d.]+)\)$/.exec(t[k])?.[1]);
        expect(alpha('--c-glass')).toBeLessThanOrEqual(0.5);
        expect(alpha('--c-glass')).toBeLessThan(alpha('--c-glass-bar'));
        expect(alpha('--c-glass-bar')).toBeLessThan(alpha('--c-glass-sheet'));
        expect(alpha('--c-glass-sheet')).toBeLessThan(1);
      });
    });
  }
});

describe('glass: tokens', () => {
  it('claro y oscuro definen todo el vidrio, y los dos bloques oscuros son iguales', () => {
    const system = block(":root:not([data-theme='light'])");
    for (const k of GLASS_TOKENS) {
      expect(THEMES.light.t[k], `light ${k}`).toBeTruthy();
      expect(THEMES.dark.t[k], `dark ${k}`).toBeTruthy();
      expect(system[k], `dark (system) ${k}`).toBe(THEMES.dark.t[k]);
    }
  });

  it('las manchas se ven (bien distintas del fondo) y son de la familia de la marca: oliva a amarillo, nada de azul', () => {
    for (const [name, { t }] of Object.entries(THEMES)) {
      for (const k of TINTS) {
        expect(deltaE(t[k], t['--c-bg']), `${name} ${k} visible`).toBeGreaterThan(0.08);
        const { hue, chroma } = oklab(t[k]);
        expect(chroma, `${name} ${k} has color`).toBeGreaterThan(0.03);
        expect(hue, `${name} ${k} hue`).toBeGreaterThanOrEqual(60);
        expect(hue, `${name} ${k} hue`).toBeLessThanOrEqual(145);
      }
      // The oliva blob has the hue of the brand oliva; the amarillo one, of the brand amarillo #FFD380.
      expect(Math.abs(oklab(t['--c-bg-tint-1']).hue - oklab(THEMES.light.t['--c-olive']).hue), `${name} oliva`).toBeLessThan(10);
      expect(Math.abs(oklab(t['--c-bg-tint-2']).hue - oklab('#ffd380').hue), `${name} amarillo`).toBeLessThan(10);
      // The wash is only a hint.
      expect(deltaE(t['--c-bg-wash'], t['--c-bg']), `${name} wash`).toBeLessThan(0.06);
    }
  });

  it('«Modo sol» es sólido: vidrio = superficie, fondo sin manchas, sin sombras', () => {
    for (const [name, b] of Object.entries(SUN)) {
      for (const k of ['--c-glass', '--c-glass-bar', '--c-glass-sheet']) expect(b[k], `${name} ${k}`).toBe(b['--c-surface']);
      for (const k of [...TINTS, '--c-bg-wash']) expect(b[k], `${name} ${k}`).toBe(b['--c-bg']);
      expect(b['--c-glass-border'], name).toBe(b['--c-border']);
      expect(b['--glass-shadow'], name).toBe('none');
      expect(b['--glass-shadow-pop'], name).toBe('none');
    }
  });
});

describe('glass: globals.css', () => {
  it('cada vidrio tiene una versión sólida por defecto, fuera del @supports', () => {
    for (const cls of ['.glass-card', '.glass-bar', '.glass-pop', '.glass-sheet']) {
      const solid = RULES.find((r) => selectors(r.selector).includes(cls) && inComponents(r) && r.at.length === 1);
      expect(solid, cls).toBeTruthy();
      expect(solid!.decls['background-color'], cls).toEqual(['var(--c-surface)']);
      expect(blurs(solid!), cls).toBe(false);
    }
  });

  it('el desenfoque solo existe dentro del @supports, con y sin prefijo -webkit-, y nunca con «Modo sol» ni data-glass=off', () => {
    const withBlur = RULES.filter(blurs);
    expect(withBlur.length).toBeGreaterThanOrEqual(5);
    for (const r of withBlur) {
      expect(r.at, r.selector).toEqual(['@layer components', SUPPORTS]);
      expect(r.decls['backdrop-filter'], r.selector).toEqual(r.decls['-webkit-backdrop-filter']);
      for (const s of selectors(r.selector)) expect(s.startsWith(GATE), s).toBe(true);
    }
    // Every translucent rule is gated the same way.
    for (const r of RULES.filter((x) => x.at.includes(SUPPORTS))) for (const s of selectors(r.selector)) expect(s.startsWith(GATE), s).toBe(true);
  });

  it('las tarjetas son vidrio esmerilado de verdad: desenfoque de 14 a 18 px y saturación de 140 a 160 %', () => {
    const card = gated('.glass-card')!;
    expect(card.decls['background-color']).toEqual(['var(--c-glass)']);
    expect(card.decls['border-color']).toEqual(['var(--c-glass-border)']);
    expect(card.decls['box-shadow']).toEqual(['var(--glass-highlight), var(--glass-shadow)']);
    const { blur, sat } = filterOf(card);
    expect(blur).toBeGreaterThanOrEqual(14);
    expect(blur).toBeLessThanOrEqual(18);
    expect(sat).toBeGreaterThanOrEqual(1.4);
    expect(sat).toBeLessThanOrEqual(1.6);
  });

  it('barras, menús, paneles y diálogos desenfocan más que las tarjetas; una barra nunca se desenfoca a sí misma', () => {
    const card = filterOf(gated('.glass-card')).blur;
    for (const sel of ['.glass-bar::before', '.glass-pop', '.glass-sheet']) expect(filterOf(gated(sel)).blur, sel).toBeGreaterThan(card);
    expect(RULES.filter(blurs).some((r) => r.selector.includes('.glass-overlay'))).toBe(true);
    // A bar never blurs itself: the menus inside it could not blur the page.
    expect(RULES.filter(blurs).some((r) => /\.glass-bar$/.test(r.selector))).toBe(false);
  });

  it('sin desenfoque detrás de listas largas: <Card solid> y las tarjetas que son ítems de una lista quedan sólidas', () => {
    for (const sel of OPT_OUT) {
      const r = RULES.find((x) => x.selector === sel);
      expect(r, sel).toBeTruthy();
      expect(r!.at, sel).toEqual(['@layer components', SUPPORTS]);
      expect(r!.decls['background-color'], sel).toEqual(['var(--c-surface)']);
      expect(r!.decls['backdrop-filter'], sel).toEqual(['none']);
      expect(r!.decls['-webkit-backdrop-filter'], sel).toEqual(['none']);
    }
    // More specific than the blurring card rule (0,1,0): (0,2,0) and (0,1,2), so they win wherever they sit.
    // And no rule that blurs a card can reach an opted-out one.
    for (const r of RULES.filter((x) => blurs(x) && x.selector.includes('.glass-card'))) {
      expect(r.selector).toBe(`${GATE} .glass-card`);
    }
  });

  it('el fondo de la marca solo va en body::before fijo, nunca como fondo de body o html (axe dejaría de medir)', () => {
    const gradients = RULES.filter((r) => Object.values(r.decls).flat().some((v) => /gradient\(|url\(/.test(v)));
    expect(gradients.map((r) => r.selector)).toEqual([`${GATE} body::before`]);
    const g = gradients[0];
    expect(g.decls.position).toEqual(['fixed']);
    expect(g.decls['z-index']).toEqual(['-1']);
    expect(g.decls['pointer-events']).toEqual(['none']);
    expect(g.decls['background-attachment']).toBeUndefined();
    // Four blobs (radial gradients) of the three blob colors over the wash, and nothing else.
    const image = g.decls['background-image'].join(' ');
    expect(image.match(/radial-gradient\(/g)?.length).toBeGreaterThanOrEqual(4);
    for (const k of [...TINTS, '--c-bg-wash']) expect(image, k).toContain(`var(${k})`);
    expect(image.match(/var\(--[a-z0-9-]+\)/g)!.every((v) => /var\(--c-bg(-tint-\d|-wash)?\)/.test(v))).toBe(true);
    for (const r of RULES.filter((x) => /^(html|body|:root)$/.test(x.selector))) {
      expect(r.decls['background-image'], r.selector).toBeUndefined();
      for (const v of r.decls.background ?? []) expect(v, r.selector).toMatch(/^var\(--c-[a-z0-9-]+\)$/);
    }
    // The bar's ::before has no background, so axe ignores it.
    const barBefore = gated('.glass-bar::before')!;
    expect(Object.keys(barBefore.decls).filter((k) => k.startsWith('background'))).toEqual([]);
    expect(barBefore.decls.position).toEqual(['absolute']);
  });

  it('«Reducir transparencia», «Más contraste» y colores forzados lo vuelven sólido, al final', () => {
    const solid = RULES.filter((r) => r.at.includes(SOLID_MEDIA));
    const sel = (s: string) => solid.find((r) => selectors(r.selector).includes(s));
    expect(sel('body::before')?.decls.content).toEqual(['none']);
    expect(sel('.glass-bar::before')?.decls.content).toEqual(['none']);
    for (const c of ['.glass-card', '.glass-pop', '.glass-sheet']) {
      expect(sel(c)?.decls['background-color'], c).toEqual(['var(--c-surface)']);
      expect(sel(c)?.decls['backdrop-filter'], c).toEqual(['none']);
      expect(sel(c)?.decls['-webkit-backdrop-filter'], c).toEqual(['none']);
    }
    expect(sel('.glass-bar')?.decls['background-color']).toEqual(['var(--c-surface)']);
    expect(sel('.glass-overlay')?.decls['backdrop-filter']).toEqual(['none']);
    // After the translucent rules, so it wins at the same specificity.
    expect(globals.indexOf(SOLID_MEDIA)).toBeGreaterThan(globals.indexOf(SUPPORTS));
  });

  it('respeta «Menos movimiento» (las ruedas de espera siguen girando)', () => {
    const motion = RULES.filter((r) => r.at.includes('@media (prefers-reduced-motion: reduce)'));
    const all = motion.find((r) => r.selector.startsWith('*'))!;
    expect(all.decls['animation-duration']).toEqual(['0.01ms !important']);
    expect(all.decls['transition-duration']).toEqual(['0.01ms !important']);
    expect(all.decls['scroll-behavior']).toEqual(['auto !important']);
    expect(motion.find((r) => r.selector === '.animate-spin')?.decls['animation-iteration-count']).toEqual(['infinite !important']);
  });

  it('esquinas más redondas, íconos lineales parejos y sin el CSS de los modelos de Stitch', () => {
    expect(globals).toMatch(/--radius-chip:\s*8px/);
    expect(globals).toMatch(/--radius-control:\s*12px/);
    expect(globals).toMatch(/--radius-card:\s*24px/);
    expect(RULES.find((r) => r.selector === '.lucide' && r.at[0] === '@layer base')?.decls['stroke-width']).toEqual(['1.75']);
    expect(globals).toContain('@source not "../../diseno";');
  });

  it('los colores del vidrio no salen como utilidades de Tailwind (una sola puerta, la de globals.css)', () => {
    expect(globals).not.toMatch(/--color-glass|--color-bg-tint|--color-bg-wash/);
  });
});

// ── Base components ──────────────────────────────────────────────────────────────────────────
describe('glass: componentes base', () => {
  const card = read('src/components/ui/card.tsx');
  const page = read('src/components/ui/page.tsx');
  const nav = read('src/components/shell/nav.tsx');
  const layout = read('src/app/(panel)/layout.tsx');
  const sheet = read('src/components/ui/sheet.tsx');
  const confirm = read('src/components/ui/confirm-dialog.tsx');
  const picker = read('src/components/media/drive-picker.tsx');
  const assistant = read('src/components/assistant/assistant-widget.tsx');
  const menu = read('src/components/ui/menu-panel.ts');

  it('tarjetas, cifras y estados vacíos usan .glass-card; <Card solid> pone .glass-solid', () => {
    expect(card).toContain("cn('glass-card rounded-[var(--radius-card)]', solid && 'glass-solid', className)");
    expect(page.match(/glass-card/g)?.length).toBe(2);
  });

  it('las tarjetas que envuelven listas o tablas largas (o vienen en una grilla larga) son sólidas', () => {
    const SOLID: Record<string, number> = {
      'src/app/(panel)/agenda/page.tsx': 3,
      'src/app/(panel)/agenda/por-fecha/page.tsx': 1,
      'src/components/agenda/calendar.tsx': 2,
      'src/app/(panel)/ajustes/registro/page.tsx': 1,
      'src/app/(panel)/ajustes/buzon/page.tsx': 1,
      'src/app/(panel)/avisos/page.tsx': 1,
      'src/app/(panel)/biblioteca/page.tsx': 2,
      'src/app/(panel)/resultados/page.tsx': 2,
      'src/app/(panel)/publicar/page.tsx': 3,
      'src/app/(panel)/publicar/[id]/page.tsx': 1,
      'src/app/(panel)/tweets/page.tsx': 1,
      'src/app/(panel)/tweets/[id]/batch-client.tsx': 1,
      'src/app/(panel)/aprobar/page.tsx': 1,
      'src/app/(panel)/aprobar/tweet-approvals.tsx': 1,
      'src/app/(panel)/municipios/page.tsx': 1,
      'src/app/(panel)/municipios/[municipio]/page.tsx': 1,
      'src/app/(panel)/obras/page.tsx': 1,
      'src/components/fichas/municipality-card.tsx': 1,
      'src/components/fichas/history-timeline.tsx': 1,
    };
    for (const [f, n] of Object.entries(SOLID)) expect(read(f).match(/<Card\b[^>]*\bsolid\b/g)?.length ?? 0, f).toBe(n);
    // Nobody writes the class by hand: the prop is the only way in.
    const files = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : []));
    expect(files('src').filter((f) => read(f).includes('glass-solid'))).toEqual([path.join('src', 'components', 'ui', 'card.tsx')]);
  });

  it('las barras usan .glass-bar con z-index y los menús usan menuPanelClass', () => {
    expect(menu).toContain("menuPanelClass = 'glass-pop rounded-[var(--radius-card)] p-1'");
    for (const [f, code, menus] of [['nav.tsx', nav, 1], ['layout.tsx', layout, 2]] as const) {
      const bar = code.split('\n').find((l) => l.includes('glass-bar'));
      expect(bar, f).toBeTruthy();
      expect(bar, f).toMatch(/\bz-\d+\b/);
      expect(code.match(/cn\(menuPanelClass, /g)?.length, f).toBe(menus);
      expect(code, f).not.toMatch(/shadow-lg/);
    }
  });

  it('nadie pone backdrop-blur en un elemento (rompería el desenfoque de los menús de la barra)', () => {
    const files = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : []));
    const bad = files('src').filter((f) => /\bbackdrop-blur\b|\[backdrop-filter:|backdropFilter/.test(fs.readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('paneles y diálogos usan .glass-sheet sobre un fondo que desenfoca', () => {
    expect(sheet).toContain('glass-sheet');
    expect(sheet).toContain('bg-slate/50 glass-overlay');
    expect(confirm).toContain("export const dialogPanelClass = 'm-auto w-[min(92vw,26rem)] rounded-[var(--radius-card)] glass-sheet p-5 text-text backdrop:bg-slate/60'");
    expect(confirm).toContain('className={dialogPanelClass}');
    expect(picker).toContain('className={dialogPanelClass}');
    expect(assistant).toContain('glass-sheet');
    expect(assistant).toContain('bg-slate/50 glass-overlay');
    expect(assistant).toContain("'glass-pop fixed right-3");
  });
});

// ── Weak phones ──────────────────────────────────────────────────────────────────────────────
describe('glass: teléfonos débiles', () => {
  it('apaga el vidrio con 2 GB o menos, o con el ahorro de datos', () => {
    const cases: [GlassNavigator, boolean][] = [
      [{}, false],
      [{ deviceMemory: 0.5 }, true],
      [{ deviceMemory: 1 }, true],
      [{ deviceMemory: 2 }, true],
      [{ deviceMemory: 4 }, false],
      [{ deviceMemory: 8 }, false],
      [{ deviceMemory: 0 }, false],
      [{ connection: { saveData: true } }, true],
      [{ connection: { saveData: false } }, false],
      [{ deviceMemory: 8, connection: { saveData: true } }, true],
      [{ connection: null }, false],
    ];
    for (const [nav, off] of cases) {
      expect(lowEndDevice(nav), JSON.stringify(nav)).toBe(off);
      const attrs: Record<string, string> = {};
      applyGlass({ setAttribute: (n, v) => void (attrs[n] = v) }, nav);
      expect(attrs, JSON.stringify(nav)).toEqual(off ? { [GLASS_ATTR]: GLASS_OFF } : {});

      // The script before the first paint decides exactly the same.
      const root: Record<string, string> = {};
      new Function('navigator', 'document', GLASS_SCRIPT)(nav, { documentElement: { setAttribute: (n: string, v: string) => void (root[n] = v) } });
      expect(root, `script ${JSON.stringify(nav)}`).toEqual(attrs);
    }
  });

  it('el script no truena si el navegador no deja leer nada, y no trae colores', () => {
    const hostile = Object.defineProperty({}, 'deviceMemory', { get: () => { throw new Error('blocked'); } });
    expect(() => new Function('navigator', 'document', GLASS_SCRIPT)(hostile, { documentElement: {} })).not.toThrow();
    expect(() => new Function('navigator', 'document', GLASS_SCRIPT)({}, {})).not.toThrow();
    expect(GLASS_SCRIPT).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('corre en el layout raíz (también en entrar y en las páginas públicas)', () => {
    expect(read('src/app/layout.tsx')).toContain('<GlassScript />');
    expect(read('src/components/shell/glass-script.tsx')).toMatch(/applyGlass\(document\.documentElement, navigator\b/);
  });
});
