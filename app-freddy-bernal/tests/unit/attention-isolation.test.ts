// 360 never reads what people send from the web (WF-C, design §4(e), decision 4). In the code: no file of 360 (its
// folder, its route and its window) reaches the attention desk's code, directly or through what it imports, and none
// names the desk's tables or functions. In the database, the same wall: 20261117000100_asistente_sin_solicitudes.sql
// (tests/unit/assistant-db-caller.test.ts). What 360 knows of Atención is its guide (src/lib/guides/web), never a case.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
// 360's own code: the brain and its answers, the route the window calls and the window.
const OWN = ['src/lib/assistant', 'src/app/api/asistente', 'src/components/assistant'];
// The attention desk's code: its reads, its actions and the citizen's side.
const DESK = [/^src\/lib\/data\/attention/, /^src\/lib\/actions\/attention/, /^src\/lib\/participation\//];
// The way into the database (the connection, the session, the demo's seed): every server file goes through it, and its
// wall is the database's own (the mark, decision 4). The walk does not go inside.
const DOOR = [/^src\/lib\/db\//, /^src\/lib\/auth\//];
// Its tables and functions (and the citizen's schema), as code or SQL would name them.
const NAMES =
  /\b(?:requests|request_supports|request_events|request_messages|request_attachments|request_contacts|request_reply_templates|request_alerts|attended_publications|request_stats|request_contact|request_by_receipt|request_citizen_view|attention_staff|can_answer_requests|log_attention_export|can_read_request|can_work_request|can_steer_request)\b|\bcitizen\.\w+/;

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');
const filesIn = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(dir, f)) : [];
// The code without its comments (an English «requests» in a comment says nothing).
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

/** The file an import of `from` names, when it is the app's own code (relative or «@/»); null for a package. */
function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const f of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')])
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  return null;
}
function importsOf(file: string): string[] {
  const out: string[] = [];
  for (const m of code(fs.readFileSync(file, 'utf8')).matchAll(SPEC)) {
    const f = resolve(file, m[1]);
    if (f) out.push(f);
  }
  return out;
}

describe('360 no llega al código de Atención', () => {
  const own = OWN.flatMap((d) => filesIn(path.join(ROOT, d)));

  it('ningún archivo de 360 importa lo de Atención, ni a través de lo que importa', () => {
    expect(own.length).toBeGreaterThan(20);
    // Every file of the app reached from 360's files, with the way it was reached.
    const via = new Map<string, string>(own.map((f) => [f, rel(f)]));
    const todo = [...own];
    while (todo.length) {
      const f = todo.pop()!;
      for (const g of importsOf(f))
        if (!via.has(g)) {
          via.set(g, `${via.get(f)} → ${rel(g)}`);
          if (!DOOR.some((re) => re.test(rel(g)))) todo.push(g);
        }
    }
    expect(via.size).toBeGreaterThan(own.length);
    const bad = [...via.entries()].filter(([f]) => DESK.some((re) => re.test(rel(f)))).map(([, way]) => way);
    expect(bad).toEqual([]);
  });

  it('ningún archivo de 360 nombra las tablas ni las funciones de Atención', () => {
    const bad = own.flatMap((f) => {
      const hit = NAMES.exec(code(fs.readFileSync(f, 'utf8')));
      return hit ? [`${rel(f)}: ${hit[0]}`] : [];
    });
    expect(bad).toEqual([]);
  });

  it('la prueba ve lo que busca', () => {
    // (A file that names a table or imports the desk would be caught.)
    expect(NAMES.test(code("sql.query('select * from public.requests')"))).toBe(true);
    expect(NAMES.test(code('// the parallel requests of a turn'))).toBe(false);
    expect(NAMES.test(code("sql.query('select citizen.lookup_request($1)')"))).toBe(true);
    expect(DESK.some((re) => re.test('src/lib/data/attention-admin.ts'))).toBe(true);
    expect(DESK.some((re) => re.test('src/lib/participation/receipt.ts'))).toBe(true);
    const desk = filesIn(path.join(SRC, 'lib', 'participation'));
    expect(desk.length).toBeGreaterThan(0);
  });
});
