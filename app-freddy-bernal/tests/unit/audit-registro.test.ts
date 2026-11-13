// Ajustes → «Registro de cambios» in plain words (APP-05): every table that writes to audit_log has a name for
// Administración, an action or a table nobody named yet reads «cambió» / «otro dato», what nobody signed in did reads
// «La app», and the fields that changed are counted, never listed by their column names. The list of tables comes from
// the migrations and the app code themselves, so a new audited table without a name fails here. The session and the
// database are mocked for the page; all data here is invented.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { readMigrations } from '@/lib/db/migrations';
import { AUDIT_ACTION_LABEL, AUDIT_TABLE_LABEL, auditChanged, auditWhat } from '@/lib/domain/audit-log';

// The arguments of a call, split at the top-level commas: «(a, f(b, c), 'd')» -> ['a', 'f(b, c)', "'d'"].
function topLevelArgs(s: string, open: number): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let quoted = false;
  for (let i = open + 1; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'") quoted = !quoted;
    if (!quoted && ch === '(') depth++;
    if (!quoted && ch === ')') {
      if (depth === 0) break;
      depth--;
    }
    if (!quoted && depth === 0 && ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const literal = (arg: string | undefined) => /^'([a-z_]+)'$/.exec(arg ?? '')?.[1] ?? null;

function srcFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? srcFiles(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });
}

// Every table and action that a migration or the app code writes to audit_log.
function audited(): { tables: Set<string>; actions: Set<string> } {
  const tables = new Set<string>();
  const actions = new Set<string>(['insert', 'update', 'delete', 'soft_delete']);
  const texts = [...readMigrations().map((m) => m.sql), ...srcFiles('src').map((f) => fs.readFileSync(f, 'utf8'))];
  for (const sql of texts) {
    for (const m of sql.matchAll(/wire_standard_triggers\('public\.([a-z_]+)'/g)) tables.add(m[1]);
    for (const m of sql.matchAll(/create trigger audit_[a-z_]+ after [a-z ]+ on public\.([a-z_]+)/g)) tables.add(m[1]);
    // An insert with the table written by hand: «insert into public.audit_log (actor_id, table_name, row_id, action, …)
    // values (…, 'requests', 'export', 'export', …)» or «select null, 'user_roles', 'retire', 'roles_retired', …».
    for (const m of sql.matchAll(/insert into public\.audit_log \(actor_id, table_name, row_id, action[a-z_, ]*\)\s*(values\s*\(|select\s)/g)) {
      const at = m.index! + m[0].length - 1;
      const args = m[1].startsWith('values') ? topLevelArgs(sql, at) : topLevelArgs(`(${sql.slice(at + 1)}`, 0);
      const table = literal(args[1]);
      const action = literal(args[3]);
      if (table) tables.add(table);
      if (action) actions.add(action);
    }
  }
  return { tables, actions };
}

describe('«Registro de cambios»: los nombres', () => {
  const { tables, actions } = audited();

  it('encuentra las tablas que escriben el registro (también las de la web y la atención)', () => {
    for (const t of ['events', 'pieces', 'web_items', 'web_settings', 'requests', 'request_messages', 'attended_publications', 'two_factor', 'drive_connection', 'event_office'])
      expect(tables, t).toContain(t);
    for (const a of ['mfa_reset', 'contact_view', 'export', 'roles_retired']) expect(actions, a).toContain(a);
  });

  it('cada tabla que escribe el registro tiene su nombre, y ninguno es un nombre de tabla', () => {
    const missing = [...tables].filter((t) => !AUDIT_TABLE_LABEL[t]);
    expect(missing, `sin nombre en src/lib/domain/audit-log.ts: ${missing.join(', ')}`).toEqual([]);
    for (const [t, label] of Object.entries(AUDIT_TABLE_LABEL)) {
      expect(label, t).not.toMatch(/_|^[a-z]+$/);
      expect(label, t).not.toBe(t);
    }
  });

  it('cada acción tiene su verbo (la de los roles retirados tiene su propia línea)', () => {
    const missing = [...actions].filter((a) => a !== 'roles_retired' && !AUDIT_ACTION_LABEL[a]);
    expect(missing).toEqual([]);
  });

  it('lo que no tiene nombre todavía dice «cambió» y «otro dato», nunca el nombre crudo', () => {
    expect(auditWhat('tabla_nueva_x', 'accion_nueva')).toEqual({ verb: 'cambió', object: 'otro dato' });
    expect(auditWhat('events', 'insert')).toEqual({ verb: 'creó', object: 'Evento' });
    expect(auditWhat('requests', 'export')).toEqual({ verb: 'exportó', object: 'Solicitudes' });
    expect(auditWhat('request_contacts', 'contact_view')).toEqual({ verb: 'vio', object: 'Contacto de una solicitud' });
  });

  it('los campos que cambiaron se cuentan', () => {
    expect(auditChanged(null)).toBeNull();
    expect(auditChanged(0)).toBeNull();
    expect(auditChanged(1)).toBe('(1 dato)');
    expect(auditChanged(3)).toBe('(3 datos)');
  });
});

const rows = [
  { id: 6, at: '2026-11-10T15:00:00.000Z', actor: null, table_name: 'attended_publications', action: 'insert', row_id: 'x', changed: null },
  { id: 5, at: '2026-11-10T14:00:00.000Z', actor: null, table_name: 'request_messages', action: 'insert', row_id: 'x', changed: null },
  { id: 4, at: '2026-11-10T13:00:00.000Z', actor: 'Ana Prueba', table_name: 'events', action: 'update', row_id: 'x', changed: 2 },
  { id: 3, at: '2026-11-10T12:00:00.000Z', actor: 'Ana Prueba', table_name: 'web_items', action: 'update', row_id: 'x', changed: 1 },
  { id: 2, at: '2026-11-10T11:00:00.000Z', actor: 'Ana Prueba', table_name: 'requests', action: 'export', row_id: 'export', changed: null },
  { id: 1, at: '2026-11-10T10:00:00.000Z', actor: 'Ana Prueba', table_name: 'una_tabla_nueva', action: 'algo_nuevo', row_id: 'x', changed: null },
];
vi.mock('@/lib/auth/session', () => ({
  requireRole: vi.fn(async () => ({ userId: 'admin-prueba', roles: ['admin'] })),
  db: vi.fn(async () => rows),
}));

describe('«Registro de cambios»: la pantalla', () => {
  it('dice «La app», nombra cada cosa en palabras y cuenta los datos; ningún nombre de tabla ni de columna', async () => {
    const { default: AuditPage } = await import('@/app/(panel)/ajustes/registro/page');
    const html = renderToStaticMarkup(await AuditPage({ searchParams: Promise.resolve({ antes: 'no-es-un-numero' }) }));
    const text = html.replace(/<[^>]+>/g, '');
    expect(text).toContain('La app creó Caso atendido publicado');
    expect(text).toContain('La app creó Mensaje de una solicitud');
    expect(text).toContain('Ana Prueba cambió Evento (2 datos)');
    expect(text).toContain('Ana Prueba cambió Contenido de la web (1 dato)');
    expect(text).toContain('Ana Prueba exportó Solicitudes');
    expect(text).toContain('Ana Prueba cambió otro dato');
    expect(text).not.toMatch(/El sistema|[a-z]+_[a-z_]+|algo_nuevo/);
  });
});
