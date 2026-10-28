// Database access with RLS always on for user requests.
//
// Every user query runs inside a transaction that switches to the `authenticated`
// role and sets `request.jwt.claims`, exactly like Supabase's API does. So the
// same policies protect the app, the PostgREST API and the tests.
//
// Backends:
//  - demo / tests: PGlite (Postgres compiled to WASM, in memory) + the same migrations.
//  - supabase: postgres.js against the project's pooler (DATABASE_URL).

export type Claims = {
  sub: string;
  email?: string;
  role?: 'authenticated';
  aal?: 'aal1' | 'aal2';
  session_id?: string;
};

export type Row = Record<string, unknown>;

export interface Sql {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Row>(text: string, params?: unknown[]): Promise<T | null>;
}

export interface Backend {
  transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  exec(text: string): Promise<void>;
}

export async function asUser<T>(backend: Backend, claims: Claims, fn: (sql: Sql) => Promise<T>): Promise<T> {
  return backend.transaction(async (sql) => {
    await sql.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role: 'authenticated', aal: 'aal1', ...claims }),
    ]);
    await sql.query('set local role authenticated');
    return fn(sql);
  });
}

export async function asSystem<T>(backend: Backend, fn: (sql: Sql) => Promise<T>): Promise<T> {
  return backend.transaction(async (sql) => {
    await sql.query(`select set_config('request.jwt.claims', '', true)`);
    return fn(sql);
  });
}

export class DbError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

const PRIVACY_CHECKS: [string, string][] = [
  ['obra_fichas_main_no_phone', 'No se guardó: la ficha de obra tiene algo que parece un teléfono, y Redes y Grabación leen esa parte. Los teléfonos van en los contactos; si es una cifra, escríbela con puntos: 1.500.000.'],
  ['events_cancel_reason_private', 'El motivo lo leen todos (Redes también): escríbelo sin fecha, hora ni teléfono.'],
  // 20261028002200_round_review_fixes.sql
  ['recording_notes_no_phone', 'No se guardó: la nota tiene algo que parece un teléfono, y Redes la lee. Quítalo; los tiempos del video (2:15) sí van.'],
  ['community_reports_main_no_phone', 'No se guardó: el reporte tiene algo que parece un teléfono fuera de los contactos. Los teléfonos van en «Teléfono» de la persona que reporta; si es una cifra, escríbela con puntos: 1.500.000.'],
  ['events_main_no_phone', 'No se guardó: el título, el lugar o el resumen tienen algo que parece un teléfono, y Redes los lee. Los teléfonos van en «Contactos del sitio».'],
];

// Turn a Postgres error into a short Spanish message for people.
export function friendlyDbError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const msg = err?.message ?? '';
  if (err?.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    // Our own guards raise with a readable Spanish message; keep it.
    if (/^[A-ZÁÉÍÓÚ¿¡]/.test(msg) && !/row-level security|permission denied/i.test(msg)) return msg;
    return 'No tienes permiso para hacer esto.';
  }
  if (err?.code === '23505') return 'Eso ya existe.';
  if (err?.code === '23514') {
    // The database's own privacy checks (20261028002100_privacy_hardening.sql): the app refuses the same before
    // saving; this is what the person reads if a text gets past it anyway.
    for (const [constraint, text] of PRIVACY_CHECKS) if (msg.includes(constraint)) return text;
  }
  if (err?.code === '23514' || err?.code === '22001') return 'Algún dato no es válido o es muy largo.';
  if (err?.code === 'P0001' && msg) return msg;
  return 'No se pudo guardar. Revisa la señal y vuelve a intentar.';
}
