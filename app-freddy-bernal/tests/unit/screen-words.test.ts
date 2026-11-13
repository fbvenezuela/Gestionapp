import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// What the team reads on its screens, and in the messages the app sends it, says «la app»: never «la plataforma», nor
// the names of the services the app runs on, nor «el comando de instalación» or «el servidor» (RV-09, 13/11). Who
// gives the boss's role or turns something on is «quien instala la app». The code's comments are not read here.
// Left out on purpose: the public pages of the internal app (src/app/(publico): the privacy page names its providers),
// 360's ways of asking (people say «la plataforma»; 360's answers have their own test, assistant-stale-words), and the
// screens of Redes' tweets and of the web, whose texts change in their own round (see the list below).
const ROOT = process.cwd();
const DIRS = ['src/app/(auth)', 'src/app/(panel)', 'src/components', 'src/lib/actions', 'src/lib/domain', 'src/lib/media', 'src/lib/storage', 'src/lib/db/core.ts', 'src/lib/roles.ts'];
const OTHER_ROUND = ['src/app/(panel)/tweets/nueva/page.tsx', 'src/components/cms/', 'src/app/(panel)/admin/'];
const WORDS: [string, RegExp][] = [
  ['la plataforma', /\b(la|de la|en la) plataforma\b/i],
  ['un servicio de afuera', /\b(Vercel|Supabase)\b/],
  ['el servidor', /\bservidor(es)?\b/i],
  ['el comando', /\bcomando de instalaci[oó]n\b/i],
];

function files(p: string): string[] {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [p];
  return fs.readdirSync(abs).flatMap((f) => files(path.join(p, f)));
}

// The code without its comments (// to the end of a line unless inside a URL, /* … */ and {/* … */}).
const withoutComments = (src: string) =>
  src
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`\w])\/\/.*$/, '$1'));

describe('las pantallas del equipo dicen «la app», sin palabras de adentro', () => {
  const sources = DIRS.flatMap(files)
    .filter((f) => /\.(tsx?|mts)$/.test(f))
    .filter((f) => !OTHER_ROUND.some((o) => f.startsWith(o)));

  it('lee las pantallas que tiene que leer', () => {
    expect(sources.length).toBeGreaterThan(100);
    for (const f of ['src/app/(auth)/sin-acceso/page.tsx', 'src/app/(panel)/ajustes/drive/drive-settings.tsx', 'src/lib/media/one-by-one.ts', 'src/lib/domain/chat.ts']) {
      expect(sources).toContain(f);
    }
  });

  for (const [what, re] of WORDS) {
    it(`nunca ${what}`, () => {
      const hits = sources.flatMap((f) =>
        withoutComments(fs.readFileSync(path.join(ROOT, f), 'utf8')).flatMap((line, i) => (re.test(line) ? [`${f}:${i + 1}: ${line.trim()}`] : [])),
      );
      expect(hits).toEqual([]);
    });
  }

  it('el rol de jefe y lo que se enciende al instalar: «quien instala la app»', () => {
    const roles = fs.readFileSync(path.join(ROOT, 'src/lib/roles.ts'), 'utf8');
    expect(roles).toContain("BOSS_GRANT_MESSAGE = 'El rol de jefe lo da quien instala la app.'");
    expect(roles).toContain("BOSS_OPTION_LABEL = 'Jefe (lo da quien instala la app)'");
  });
});
