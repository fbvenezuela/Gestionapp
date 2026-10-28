// «360 nunca lee mensajes» (R3, D-50, S8; design §8.7), in the code: no file of 360 (its server, its window, its
// factory material, its API route) names the tables or functions of Mensajes, imports their code or calls their
// routes; Mensajes' own reads, actions and routes know nothing of 360; and no file that imports 360 imports, itself or
// one step further, the reads of Mensajes. The database says no too (app.caller: tests/rls/chat.test.ts, row 49).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const files = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]))
    : [];
const read = (f: string) => fs.readFileSync(f, 'utf8');

// What would let 360 reach Mensajes.
const CHAT_TABLES = /\bchat_(conversations|members|messages|reads|rules|notice_ack)\b/;
const CHAT_FUNCTIONS = /\bchat_(start|people|member_list|hidden_marks|team_channel|can_read|may_post|set_only_boss)\b/;
const CHAT_CODE = /from\s+['"](?:@\/lib\/(?:data|actions|domain)\/chat|(?:\.\.\/)+(?:lib\/)?(?:data|actions|domain)\/chat|@\/components\/chat\/[^'"]*)['"]/;
const CHAT_ROUTES = /\/api\/mensajes/;

const ASSISTANT = [...files('src/lib/assistant'), ...files('src/components/assistant'), ...files('config/assistant'), ...files('src/app/api/asistente')];

describe('360 no toca Mensajes', () => {
  it('ningún archivo de 360 nombra sus tablas o funciones, importa su código ni llama a sus rutas', () => {
    expect(ASSISTANT.length).toBeGreaterThan(20);
    const bad = ASSISTANT.flatMap((f) => {
      const src = read(f);
      return [CHAT_TABLES, CHAT_FUNCTIONS, CHAT_CODE, CHAT_ROUTES].filter((re) => re.test(src)).map((re) => `${f}: ${re}`);
    });
    expect(bad).toEqual([]);
  });

  it('ninguna herramienta lee ni manda mensajes', () => {
    const tools = read('src/lib/assistant/tools.ts');
    const names = [...tools.matchAll(/^\s{4}name: '([a-z_]+)'/gm)].map((m) => m[1]);
    expect(names).toContain('ver_tutorial');
    for (const n of names) expect(n, n).not.toMatch(/mensaje|chat|conversacion/);
  });

  it('Mensajes no sabe de 360: sus lecturas, acciones y rutas no tocan el asistente', () => {
    const own = ['src/lib/data/chat.ts', 'src/lib/actions/chat.ts', ...files('src/app/api/mensajes')];
    expect(own.filter((f) => fs.existsSync(f)).length).toBeGreaterThanOrEqual(3);
    for (const f of own.filter((x) => fs.existsSync(x))) {
      const src = read(f);
      expect(src, f).not.toMatch(/assistant_/);
      expect(src, f).not.toMatch(/@\/lib\/assistant|\.\.\/assistant\//);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The import graph, two steps: whoever imports 360 never imports the reads of Mensajes, nor something that does.
// ---------------------------------------------------------------------------------------------------------------------
const SRC = files('src').filter((f) => /\.(ts|tsx)$/.test(f));
const EXT = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join('src', spec.slice(2)) : spec.startsWith('.') ? path.join(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const e of EXT) {
    const f = path.normalize(base + e);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}
const importsOf = new Map<string, string[]>(
  SRC.map((f) => [
    f,
    [...read(f).matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)]
      .map((m) => resolve(f, m[1] ?? m[2]))
      .filter((x): x is string => !!x),
  ]),
);
const CHAT_READS = path.normalize('src/lib/data/chat.ts');
const isAssistant = (f: string) => f.startsWith(path.normalize('src/lib/assistant/'));

describe('el grafo de imports', () => {
  it('lee los imports de verdad (sanity)', () => {
    expect(importsOf.get(path.normalize('src/lib/assistant/index.ts'))).toContain(path.normalize('src/lib/assistant/local.ts'));
    expect(fs.existsSync(CHAT_READS)).toBe(true);
    expect([...importsOf.values()].some((list) => list.includes(CHAT_READS))).toBe(true);
  });

  it('ningún archivo que importa 360 importa las lecturas de Mensajes, ni algo que las importe', () => {
    const importers = SRC.filter((f) => (importsOf.get(f) ?? []).some(isAssistant));
    expect(importers.length).toBeGreaterThan(5);
    const bad: string[] = [];
    for (const f of importers) {
      for (const m of importsOf.get(f) ?? []) {
        if (m === CHAT_READS) bad.push(`${f} → ${m}`);
        else if ((importsOf.get(m) ?? []).includes(CHAT_READS)) bad.push(`${f} → ${m} → ${CHAT_READS}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
