import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GLASS_ATTR, GLASS_OFF, GLASS_SCRIPT, applyGlass, lowEndDevice, type GlassNavigator } from '@/components/shell/glass-core';
import { block, fade, over, ratio } from './fixtures/tokens';

// «Cara glass» (docs/DISENO.md): the glass lives in tokens.css, globals.css and the base components only.
// These checks keep it readable (AA over the worst thing that can be behind each surface), solid where it
// must be, and keep axe able to measure contrast.

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

const THEMES = {
  light: { t: block(':root'), worst: '#000000' }, // dark text: black behind a bar is the worst case
  dark: { t: block(":root[data-theme='dark']"), worst: '#ffffff' }, // light text: white is the worst case
};
const SUN = {
  light: block(":root[data-contrast='high']"),
  darkSystem: block(":root[data-contrast='high']:not([data-theme='light'])"),
  darkForced: block(":root[data-contrast='high'][data-theme='dark']"),
};
const GLASS_TOKENS = ['--c-bg-tint-1', '--c-bg-tint-2', '--c-glass', '--c-glass-bar', '--c-glass-sheet', '--c-glass-border', '--glass-highlight', '--glass-shadow', '--glass-shadow-pop'];
const TEXT = ['--c-text', '--c-text-2', '--c-muted', '--c-accent-ink', '--c-ok', '--c-warn', '--c-danger', '--c-info'];
// What the top bar, the phone bar and the menus print. ok and warn text never go on .glass-bar or .glass-pop.
const BAR_TEXT = ['--c-text', '--c-text-2', '--c-muted', '--c-accent-ink', '--c-danger', '--c-info'];

// Every color the page gradient can show: --c-bg under three layers (olive glow, amarillo glow, a white
// or dark glow at the top) that each fade to transparent, sampled in steps of 10 %. Includes the stops.
function pageColors(t: Record<string, string>): string[] {
  const steps = Array.from({ length: 11 }, (_, i) => i / 10);
  const out: string[] = [];
  for (const a of steps) for (const b of steps) for (const c of steps) out.push(fade(t['--c-surface'], c, fade(t['--c-bg-tint-2'], b, fade(t['--c-bg-tint-1'], a, t['--c-bg']))));
  return out;
}
const minRatio = (fg: string, bgs: string[]) => Math.min(...bgs.map((bg) => ratio(fg, bg)));

describe('glass: contraste AA sobre lo peor que puede quedar detrás', () => {
  for (const [name, { t, worst }] of Object.entries(THEMES)) {
    describe(name, () => {
      const page = pageColors(t);
      const behindBars = [...page, worst, t['--c-text'], t['--c-accent']];
      const card = page.map((p) => over(t['--c-glass'], p));
      const bar = behindBars.map((p) => over(t['--c-glass-bar'], p));
      const sheet = behindBars.map((p) => over(t['--c-glass-sheet'], p));

      it('todo texto llega a 4.5:1 sobre el degradado de la página y sobre la tarjeta blanca', () => {
        for (const fg of TEXT) {
          expect(minRatio(t[fg], page), `${fg} on page`).toBeGreaterThanOrEqual(4.5);
          expect(ratio(t[fg], t['--c-surface']), `${fg} on surface`).toBeGreaterThanOrEqual(4.5);
        }
      });

      it('todo texto llega a 4.5:1 sobre una tarjeta de vidrio en cualquier punto del degradado', () => {
        for (const fg of TEXT) expect(minRatio(t[fg], card), fg).toBeGreaterThanOrEqual(4.5);
      });

      it('barras y menús: su texto llega a 4.5:1 aunque pase algo negro (o blanco, en oscuro) por detrás', () => {
        for (const fg of BAR_TEXT) expect(minRatio(t[fg], bar), fg).toBeGreaterThanOrEqual(4.5);
      });

      it('paneles y diálogos: todo texto llega a 4.5:1 con cualquier cosa detrás', () => {
        for (const fg of TEXT) expect(minRatio(t[fg], sheet), fg).toBeGreaterThanOrEqual(4.5);
      });

      it('el anillo de foco se ve (3:1) sobre la página y sobre cada vidrio', () => {
        for (const [where, bgs] of Object.entries({ page, card, bar, sheet })) expect(minRatio(t['--c-focus'], bgs), where).toBeGreaterThanOrEqual(3);
      });

      it('el vidrio es translúcido de verdad, más opaco cuanto más puede pasar detrás', () => {
        const alpha = (k: string) => Number(/,\s*([\d.]+)\)$/.exec(t[k])?.[1]);
        expect(alpha('--c-glass')).toBeLessThan(1);
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

  it('el degradado usa solo tonos de la marca muy claros (o muy oscuros en oscuro)', () => {
    // Pale glows: luminance close to the page so the gradient never darkens the light page (warn stays AA).
    for (const k of ['--c-bg-tint-1', '--c-bg-tint-2']) {
      expect(ratio(THEMES.light.t[k], THEMES.light.t['--c-bg']), k).toBeLessThan(1.1);
      expect(ratio(THEMES.dark.t[k], THEMES.dark.t['--c-bg']), k).toBeLessThan(1.2);
    }
  });

  it('«Modo sol» es sólido: vidrio = superficie, degradado = fondo, sin sombras', () => {
    for (const [name, b] of Object.entries(SUN)) {
      for (const k of ['--c-glass', '--c-glass-bar', '--c-glass-sheet']) expect(b[k], `${name} ${k}`).toBe(b['--c-surface']);
      for (const k of ['--c-bg-tint-1', '--c-bg-tint-2']) expect(b[k], `${name} ${k}`).toBe(b['--c-bg']);
      expect(b['--c-glass-border'], name).toBe(b['--c-border']);
      expect(b['--glass-shadow'], name).toBe('none');
      expect(b['--glass-shadow-pop'], name).toBe('none');
    }
  });
});

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
const blurs = (r: Rule) => [...(r.decls['backdrop-filter'] ?? []), ...(r.decls['-webkit-backdrop-filter'] ?? [])].some((v) => v !== 'none');
const inComponents = (r: Rule) => r.at[0] === '@layer components';

describe('glass: globals.css', () => {
  it('cada vidrio tiene una versión sólida por defecto, fuera del @supports', () => {
    for (const cls of ['.glass-card', '.glass-bar', '.glass-pop', '.glass-sheet']) {
      const solid = RULES.find((r) => r.selector.split(',').map((s) => s.trim()).includes(cls) && inComponents(r) && r.at.length === 1);
      expect(solid, cls).toBeTruthy();
      expect(solid!.decls['background-color'], cls).toEqual(['var(--c-surface)']);
      expect(blurs(solid!), cls).toBe(false);
    }
  });

  it('el desenfoque solo existe dentro del @supports, con y sin prefijo -webkit-, y nunca con «Modo sol» ni data-glass=off', () => {
    const withBlur = RULES.filter(blurs);
    expect(withBlur.length).toBeGreaterThanOrEqual(3);
    for (const r of withBlur) {
      expect(r.at, r.selector).toEqual(['@layer components', SUPPORTS]);
      expect(r.decls['backdrop-filter'], r.selector).toEqual(r.decls['-webkit-backdrop-filter']);
      for (const s of r.selector.split(',')) expect(s.trim().startsWith(GATE), s).toBe(true);
    }
    // Every translucent rule is gated the same way.
    for (const r of RULES.filter((x) => x.at.includes(SUPPORTS))) for (const s of r.selector.split(',')) expect(s.trim().startsWith(GATE), s).toBe(true);
  });

  it('.glass-card nunca declara backdrop-filter (nada de desenfoque detrás de las tablas largas)', () => {
    const cards = RULES.filter((r) => r.selector.includes('.glass-card'));
    expect(cards.length).toBeGreaterThanOrEqual(3);
    for (const r of cards) expect(blurs(r), r.selector).toBe(false);
    // The blur lives on the bars (through ::before), the menus and the overlays.
    const blurred = RULES.filter(blurs).map((r) => r.selector);
    expect(blurred.some((s) => s.endsWith('.glass-bar::before'))).toBe(true);
    expect(blurred.some((s) => s.endsWith('.glass-pop'))).toBe(true);
    expect(blurred.some((s) => s.includes('.glass-overlay'))).toBe(true);
    // A bar never blurs itself: the menus inside it could not blur the page.
    expect(blurred.some((s) => /\.glass-bar$/.test(s))).toBe(false);
  });

  it('el degradado solo va en body::before fijo, nunca como fondo de body o html (axe dejaría de medir)', () => {
    const gradients = RULES.filter((r) => Object.values(r.decls).flat().some((v) => /gradient\(|url\(/.test(v)));
    expect(gradients.map((r) => r.selector)).toEqual([`${GATE} body::before`]);
    const g = gradients[0];
    expect(g.decls.position).toEqual(['fixed']);
    expect(g.decls['z-index']).toEqual(['-1']);
    expect(g.decls['pointer-events']).toEqual(['none']);
    expect(g.decls['background-attachment']).toBeUndefined();
    for (const r of RULES.filter((x) => /^(html|body|:root)$/.test(x.selector))) {
      expect(r.decls['background-image'], r.selector).toBeUndefined();
      for (const v of r.decls.background ?? []) expect(v, r.selector).toMatch(/^var\(--c-[a-z0-9-]+\)$/);
    }
    // The bar's ::before has no background, so axe ignores it.
    const barBefore = RULES.find((r) => r.selector.endsWith('.glass-bar::before') && r.at.includes(SUPPORTS))!;
    expect(Object.keys(barBefore.decls).filter((k) => k.startsWith('background'))).toEqual([]);
    expect(barBefore.decls.position).toEqual(['absolute']);
  });

  it('«Reducir transparencia», «Más contraste» y colores forzados lo vuelven sólido, al final', () => {
    const solid = RULES.filter((r) => r.at.includes(SOLID_MEDIA));
    const sel = (s: string) => solid.find((r) => r.selector.split(',').map((x) => x.trim()).includes(s));
    expect(sel('body::before')?.decls.content).toEqual(['none']);
    expect(sel('.glass-bar::before')?.decls.content).toEqual(['none']);
    for (const c of ['.glass-card', '.glass-pop', '.glass-sheet']) {
      expect(sel(c)?.decls['background-color'], c).toEqual(['var(--c-surface)']);
      expect(sel(c)?.decls['backdrop-filter'], c).toEqual(['none']);
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
    expect(globals).toMatch(/--radius-card:\s*20px/);
    expect(RULES.find((r) => r.selector === '.lucide' && r.at[0] === '@layer base')?.decls['stroke-width']).toEqual(['1.75']);
    expect(globals).toContain('@source not "../../diseno";');
  });

  it('los colores del vidrio no salen como utilidades de Tailwind (una sola puerta, la de globals.css)', () => {
    expect(globals).not.toMatch(/--color-glass|--color-bg-tint/);
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

  it('tarjetas, cifras y estados vacíos usan .glass-card', () => {
    expect(card).toContain("cn('glass-card rounded-[var(--radius-card)]', className)");
    expect(page.match(/glass-card/g)?.length).toBe(2);
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
