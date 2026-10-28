import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SUN_ATTR, SUN_KEY, SUN_SCRIPT, SUN_VALUE, applySun, readSun, watchSun, writeSun } from '@/components/shell/sun-mode-core';
import type { KV } from '@/components/ui/device-store';
import { block, ratio, tokensCss as css } from './fixtures/tokens';

const BASE = block(':root');
const SUN = {
  light: block(":root[data-contrast='high']"),
  darkSystem: block(":root[data-contrast='high']:not([data-theme='light'])"),
  darkForced: block(":root[data-contrast='high'][data-theme='dark']"),
};

describe('modo sol: tokens', () => {
  it('redefine todos los colores en claro y en oscuro', () => {
    const names = Object.keys(BASE).filter((k) => k.startsWith('--c-'));
    expect(names.length).toBeGreaterThan(20);
    for (const b of Object.values(SUN)) for (const n of names) expect(b[n], n).toMatch(/^#[0-9a-f]{6}$/i);
    expect(SUN.darkSystem).toEqual(SUN.darkForced);
  });

  it('sin vidrio: superficies sólidas, sin degradado y sin sombras (docs/DISENO.md «Cara glass»)', () => {
    for (const [name, b] of Object.entries(SUN)) {
      for (const k of ['--c-glass', '--c-glass-bar', '--c-glass-sheet']) expect(b[k], `${name} ${k}`).toBe(b['--c-surface']);
      for (const k of ['--c-bg-tint-1', '--c-bg-tint-2', '--c-bg-tint-3', '--c-bg-wash']) expect(b[k], `${name} ${k}`).toBe(b['--c-bg']);
      expect(b['--c-glass-border'], name).toBe(b['--c-border']);
      expect(b['--glass-shadow'], name).toBe('none');
      expect(b['--glass-shadow-pop'], name).toBe('none');
    }
  });

  it('agranda un poco la letra', () => {
    expect(parseFloat(SUN.light['font-size'])).toBeGreaterThan(100);
    expect(parseFloat(SUN.light['font-size'])).toBeLessThanOrEqual(125);
  });

  it('el bloque oscuro va dentro de prefers-color-scheme y después del claro', () => {
    const light = css.indexOf(":root[data-contrast='high'] {");
    const dark = css.indexOf(":root[data-contrast='high']:not([data-theme='light'])");
    expect(light).toBeGreaterThan(-1);
    expect(dark).toBeGreaterThan(light);
    expect(css.lastIndexOf('@media (prefers-color-scheme: dark)', dark)).toBeGreaterThan(light);
  });

  for (const [name, t] of Object.entries({ light: SUN.light, dark: SUN.darkSystem })) {
    describe(name, () => {
      const pages = ['--c-bg', '--c-surface', '--c-surface-2'];
      it('todo texto llega a 7:1 sobre los fondos', () => {
        for (const fg of ['--c-text', '--c-text-2', '--c-muted', '--c-accent-ink', '--c-ok', '--c-warn', '--c-danger', '--c-info'])
          for (const bg of pages) expect(ratio(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(7);
      });
      it('cada estado se lee sobre su fondo suave, y el texto sobre los rellenos', () => {
        for (const k of ['ok', 'warn', 'danger', 'info', 'accent']) {
          const fg = k === 'accent' ? t['--c-accent-ink'] : t[`--c-${k}`];
          expect(ratio(fg, t[`--c-${k}-soft`]), k).toBeGreaterThanOrEqual(7);
          for (const txt of ['--c-text', '--c-text-2']) expect(ratio(t[txt], t[`--c-${k}-soft`]), `${txt} on ${k}-soft`).toBeGreaterThanOrEqual(7);
        }
        expect(ratio(t['--c-on-accent'], t['--c-accent'])).toBeGreaterThanOrEqual(7);
        expect(ratio(t['--c-on-accent'], t['--c-accent-hover'])).toBeGreaterThanOrEqual(7);
        expect(ratio(t['--c-on-accent'], t['--c-danger'])).toBeGreaterThanOrEqual(7); // badges, danger hover
        expect(ratio(t['--c-on-slate'], t['--c-slate'])).toBeGreaterThanOrEqual(7);
      });
      it('la pestaña o filtro elegido (relleno slate) se distingue del fondo', () => {
        for (const bg of pages) expect(ratio(t['--c-slate'], t[bg]), `--c-slate on ${bg}`).toBeGreaterThanOrEqual(3);
        // The selected label and the unselected ones must not look alike either.
        expect(ratio(t['--c-on-slate'], t['--c-text-2'])).toBeGreaterThanOrEqual(3);
      });
      it('bordes fuertes y anillo de foco visible', () => {
        for (const bg of pages) expect(ratio(t['--c-border'], t[bg]), bg).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t['--c-focus'], t['--c-bg'])).toBeGreaterThanOrEqual(7);
        // Stronger than the normal border.
        const normal = name === 'light' ? BASE['--c-border'] : block(":root[data-theme='dark']")['--c-border'];
        expect(ratio(t['--c-border'], t['--c-bg'])).toBeGreaterThan(ratio(normal, name === 'light' ? BASE['--c-bg'] : block(":root[data-theme='dark']")['--c-bg']));
      });
    });
  }
});

function fakeStore(init: Record<string, string> = {}, broken = false): KV & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => {
      if (broken) throw new Error('blocked');
      return data[k] ?? null;
    },
    setItem: (k, v) => {
      if (broken) throw new Error('blocked');
      data[k] = v;
    },
  };
}

function fakeRoot() {
  const attrs: Record<string, string> = {};
  return { attrs, setAttribute: (n: string, v: string) => void (attrs[n] = v), removeAttribute: (n: string) => void delete attrs[n] };
}

describe('modo sol: se recuerda por teléfono', () => {
  it('guarda, lee y aplica el atributo', () => {
    const s = fakeStore();
    expect(readSun(s)).toBe(false);
    writeSun(s, true);
    expect(s.data[SUN_KEY]).toBe('1');
    expect(readSun(s)).toBe(true);
    const root = fakeRoot();
    applySun(root, true);
    expect(root.attrs[SUN_ATTR]).toBe(SUN_VALUE);
    applySun(root, false);
    expect(root.attrs[SUN_ATTR]).toBeUndefined();
    writeSun(s, false);
    expect(readSun(s)).toBe(false);
  });

  it('si el almacenamiento falla, no rompe y se recuerda en memoria', () => {
    const s = fakeStore({}, true);
    expect(() => writeSun(s, true)).not.toThrow();
    expect(readSun(s)).toBe(true);
    writeSun(s, false);
    expect(readSun(s)).toBe(false);
  });

  it('el script antes de pintar usa la misma llave y no truena sin almacenamiento', () => {
    const run = (getItem: (k: string) => string | null) => {
      const root = fakeRoot();
      new Function('localStorage', 'document', SUN_SCRIPT)({ getItem }, { documentElement: root });
      return root.attrs;
    };
    expect(run((k) => (k === SUN_KEY ? '1' : null))).toEqual({ [SUN_ATTR]: SUN_VALUE });
    expect(run(() => '0')).toEqual({});
    expect(run(() => null)).toEqual({});
    expect(() => run(() => { throw new Error('blocked'); })).not.toThrow();
    expect(SUN_SCRIPT).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('si otra pestaña lo cambia, los colores siguen al interruptor', () => {
    const s = fakeStore({ [SUN_KEY]: '0' });
    const root = fakeRoot();
    const listeners = new Set<() => void>();
    const fire = () => listeners.forEach((cb) => cb());
    const stop = watchSun(root, () => s, (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    });
    expect(root.attrs[SUN_ATTR]).toBeUndefined();
    s.data[SUN_KEY] = '1'; // another tab turned it on ('storage' event)
    fire();
    expect(root.attrs[SUN_ATTR]).toBe(SUN_VALUE);
    s.data[SUN_KEY] = '0';
    fire();
    expect(root.attrs[SUN_ATTR]).toBeUndefined();
    stop();
    expect(listeners.size).toBe(0);
    s.data[SUN_KEY] = '1';
    fire();
    expect(root.attrs[SUN_ATTR]).toBeUndefined();
  });

  it('el panel escucha los cambios de otras pestañas', () => {
    const code = fs.readFileSync(path.join(process.cwd(), 'src/components/shell/sun-mode.tsx'), 'utf8');
    expect(code).toMatch(/watchSun\(document\.documentElement, deviceStore, subscribeDevice\)/);
  });

  it('el interruptor está en el menú de la cuenta y el script en el panel', () => {
    const layout = fs.readFileSync(path.join(process.cwd(), 'src/app/(panel)/layout.tsx'), 'utf8');
    expect(layout).toContain('<SunModeToggle />');
    expect(layout).toContain('<SunModeScript />');
    expect(fs.readFileSync(path.join(process.cwd(), 'src/components/shell/sun-mode.tsx'), 'utf8')).toContain('Modo sol');
  });
});
