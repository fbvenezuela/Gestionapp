import fs from 'node:fs';
import path from 'node:path';

// Reads src/app/tokens.css and does the WCAG math the design tests need (ui-sun-mode, ui-glass).

export const tokensCss = fs.readFileSync(path.join(process.cwd(), 'src/app/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Declarations of the first rule whose selector is exactly `selector`.
export function block(selector: string, css = tokensCss): Record<string, string> {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  if (!m) throw new Error(`no block for ${selector}`);
  return Object.fromEntries(
    m[1].split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
      const i = d.indexOf(':');
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
    }),
  );
}

export type Rgba = { r: number; g: number; b: number; a: number };

// '#rrggbb' or 'rgba(r, g, b, a)' (the only two forms tokens.css uses for colors).
export function parseColor(value: string): Rgba {
  const v = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const fn = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  if (fn) return { r: +fn[1], g: +fn[2], b: +fn[3], a: fn[4] === undefined ? 1 : +fn[4] };
  throw new Error(`not a color: ${value}`);
}

const toHex = ({ r, g, b }: Rgba) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

// `fg` painted over the opaque `bg` (sRGB alpha compositing, as browsers do). Returns '#rrggbb'.
export function over(fg: string, bg: string): string {
  const f = parseColor(fg);
  const b = parseColor(bg);
  if (b.a !== 1) throw new Error(`backdrop must be opaque: ${bg}`);
  const mixC = (x: number, y: number) => x * f.a + y * (1 - f.a);
  return toHex({ r: mixC(f.r, b.r), g: mixC(f.g, b.g), b: mixC(f.b, b.b), a: 1 });
}

// `color` at opacity `alpha` over `bg`: one point of a gradient layer that fades to transparent.
export function fade(color: string, alpha: number, bg: string): string {
  const c = parseColor(color);
  return over(`rgba(${c.r}, ${c.g}, ${c.b}, ${alpha * c.a})`, bg);
}

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export function lum(color: string): number {
  const c = parseColor(color);
  if (c.a !== 1) throw new Error(`luminance of a translucent color: ${color}`);
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

export function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
