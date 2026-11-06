import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// The light palette of src/app/tokens.css as plain values, for what cannot read CSS variables: the generated image for
// social networks (src/app/(web)/opengraph-image.tsx). Colors live only in tokens.css (tests/unit/no-hardcoded-colors):
// this reads them from there, so a change of brand changes the image too.

const NAMES = {
  ivory: '--c-ivory',
  charcoal: '--c-charcoal',
  onCharcoal: '--c-on-charcoal',
  olive: '--c-olive',
  accentInk: '--c-accent-ink',
  accentSoft: '--c-accent-soft',
  action: '--c-action',
  text2: '--c-text-2',
} as const;

export type Palette = Record<keyof typeof NAMES, string>;

/** The values of the first `:root { … }` block (the light theme). Throws if one is missing (a renamed token). */
export function paletteFrom(css: string): Palette {
  const start = css.indexOf(':root {');
  const block = start < 0 ? '' : css.slice(start, css.indexOf('}', start));
  const out = {} as Palette;
  for (const [key, name] of Object.entries(NAMES) as [keyof Palette, string][]) {
    const m = block.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!m) throw new Error(`tokens.css: falta ${name}`);
    out[key] = m[1].trim();
  }
  return out;
}

export async function tokenPalette(): Promise<Palette> {
  return paletteFrom(await readFile(path.join(process.cwd(), 'src', 'app', 'tokens.css'), 'utf8'));
}
