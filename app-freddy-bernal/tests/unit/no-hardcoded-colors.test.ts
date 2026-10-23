import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Rule from DISENO.md: no color written by hand in a component. Colors live in
// src/app/tokens.css (and the email copy in emails/layout.tsx).
function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? files(p) : /\.(tsx|ts|css)$/.test(d.name) ? [p] : [];
  });
}

const ALLOWED = new Set([path.join('src', 'app', 'tokens.css'), path.join('src', 'app', 'manifest.ts')]);
// Tailwind's built-in palette (e.g. bg-red-500, text-white). Our tokens (bg-slate,
// text-accent…) have no numeric shade, so they don't match.
const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b(?:bg|text|border|ring|fill|stroke)-(?:(?:red|blue|green|gray|slate|zinc|neutral|stone|orange|amber|yellow|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|white|black)\b/;

describe('colores solo desde tokens', () => {
  it('ningún componente escribe colores a mano', () => {
    const bad = files('src')
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) =>
        fs.readFileSync(f, 'utf8').split('\n').map((l, i) => ({ f, i: i + 1, l })).filter(({ l }) => COLOR.test(l) && !/#\d+\b.*(issue|PR)/i.test(l)),
      )
      .filter(({ l }) => !/['"`]#[A-Za-z]/.test(l)) // hashtags like '#Táchira'
      .map(({ f, i, l }) => `${f}:${i}: ${l.trim().slice(0, 100)}`);
    expect(bad).toEqual([]);
  });
});
