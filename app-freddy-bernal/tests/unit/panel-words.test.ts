// The «Web» and «Atención» screens of the panel speak plainly (APP-12, APP-13, APP-14): no format or encoding names, no
// HTTP codes, no program or command names, no decision numbers, «la app» (never «el sistema» or «la plataforma»). The
// scan reads the source of those screens and of the messages they show, without comments; the database values the code
// compares («'importador'») and the HTTP headers («charset=utf-8») are not screen text and do not match these words.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DIRS = [path.join('src', 'components', 'cms'), path.join('src', 'components', 'attention'), path.join('src', 'app', '(panel)', 'admin')];
const FILES = [
  path.join('src', 'lib', 'web', 'import-marks.ts'),
  path.join('src', 'lib', 'domain', 'attention.ts'),
  ...fs.readdirSync(path.join('src', 'lib', 'web', 'cms')).filter((f) => f.endsWith('.ts')).map((f) => path.join('src', 'lib', 'web', 'cms', f)),
  ...fs.readdirSync(path.join('src', 'lib', 'actions')).filter((f) => /^(web|attention)/.test(f)).map((f) => path.join('src', 'lib', 'actions', f)),
];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });
}

const withoutComments = (s: string) =>
  s
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\s\/\/\s.*$/gm, ' ');

const BANNED: [RegExp, string][] = [
  [/JSON-LD/, 'el formato de los datos para buscadores'],
  [/\bsameAs\b/, 'el nombre de un campo de los buscadores'],
  [/UTF-8/, 'el nombre de una codificación'],
  [/\ben producción\b/, '«producción» por «cuando la web abra al público»'],
  [/código de la app/, 'el código'],
  [/\b[Ee]l importador\b|\b[Dd]el importador\b/, 'el nombre de un programa'],
  [/\s--[a-z][a-z-]+/, 'una opción de un comando'],
  [/\(D-\d+\)|\bD-\d{2,3}\b/, 'un número de decisión'],
  [/\b30[1278] ·|\s\(30[1278]\)|redirección es 30[1278]/, 'un código de redirección'],
  [/\bEl sistema\b|\bel sistema\b/, '«el sistema» por «la app»'],
  [/\b[Ll]a plataforma\b/, '«la plataforma» por «la app»'],
  [/\bbase de datos\b/, '«base de datos»'],
];

describe('las pantallas de «Web» y «Atención» hablan claro', () => {
  const files = [...DIRS.flatMap(walk), ...FILES];

  it('encuentra las pantallas', () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files).toContain(path.join('src', 'components', 'cms', 'settings-forms.tsx'));
    expect(files).toContain(path.join('src', 'app', '(panel)', 'admin', 'atencion', 'page.tsx'));
  });

  it('sin palabras técnicas, códigos ni números de decisiones', () => {
    const bad: string[] = [];
    for (const f of files) {
      const lines = withoutComments(fs.readFileSync(f, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        for (const [re, why] of BANNED) if (re.test(line)) bad.push(`${f}:${i + 1}: ${why}: ${line.trim().slice(0, 140)}`);
      });
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });
});
