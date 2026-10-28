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

// OKLab of an opaque color, for «how different do these two colors look» (Euclidean distance) and hue.
export function oklab(color: string): { L: number; a: number; b: number; hue: number; chroma: number } {
  const c = parseColor(color);
  const [r, g, b] = [c.r, c.g, c.b].map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, a: A, b: B, chroma: Math.hypot(A, B), hue: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

export function deltaE(x: string, y: string): number {
  const [p, q] = [oklab(x), oklab(y)];
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

// What the CSS filter saturate(s) does to an opaque color: the Filter Effects matrix, applied to the
// gamma-encoded values (`linear` false) or to linear light (`linear` true), each channel clamped.
export function saturate(color: string, s: number, linear = false): string {
  const c = parseColor(color);
  const dec = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  const encode = (x: number) => (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055);
  let v = [c.r, c.g, c.b].map((x) => x / 255);
  if (linear) v = v.map(dec);
  const m = [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
  let out = m.map((row) => Math.min(1, Math.max(0, row[0] * v[0] + row[1] * v[1] + row[2] * v[2])));
  if (linear) out = out.map(encode);
  return toHex({ r: out[0] * 255, g: out[1] * 255, b: out[2] * 255, a: 1 });
}
