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
  // 20261028002300_report_files_notes.sql
  ['ficha_updates_report_note_no_phone', 'No se guardó: la nota tiene algo que parece un teléfono, y la historia del reporte se lee sin doble factor. Los teléfonos van en «Teléfono» de la persona que reporta; si es una cifra, escríbela con puntos: 1.500.000.'],
  // 20261028002400_internal_chat.sql (Mensajes). The text never comes back in the error.
  ['chat_messages_no_phone', 'Los teléfonos no van en los mensajes: los contactos van en la ficha, con doble factor. Si es un número largo dentro de un enlace, pega la dirección de la plataforma o quita el número.'],
  ['chat_messages_no_agenda_when', 'Aquí está Redes o política: el mensaje no puede llevar una hora, una fecha ni un mapa. Escribe «lo antes posible» o «el día del evento».'],
  // 20261029090000_chat_channels.sql (Mensajes as channels): CHAT_TEXT_REFUSED and the boss's channel rules.
  ['chat_title_private', 'El nombre y la descripción no llevan teléfonos, fechas, horas ni mapas: todos los del canal los leen siempre.'],
  ['chat_desc_private', 'El nombre y la descripción no llevan teléfonos, fechas, horas ni mapas: todos los del canal los leen siempre.'],
  ['chat_conv_title_no_phone', 'El nombre y la descripción no llevan teléfonos, fechas, horas ni mapas: todos los del canal los leen siempre.'],
  ['chat_conv_desc_no_phone', 'El nombre y la descripción no llevan teléfonos, fechas, horas ni mapas: todos los del canal los leen siempre.'],
  ['chat_messages_len', 'El mensaje tiene que tener entre 1 y 2000 letras.'],
  ['chat_conv_title_len', 'El nombre del canal va de 1 a 60 letras.'],
  ['chat_conv_desc_len', 'La descripción va hasta 140 letras.'],
  ['chat_channel_needs_member', 'Elige al menos a una persona además de ti.'],
  ['chat_channel_archived', 'Este canal está archivado: sácalo del archivo para cambiar quién está.'],
  ['chat_boss_stays', 'El jefe está en todos los canales: no se puede quitar.'],
];

// Mensajes: a message the policies refuse (not in the channel any more, archived, «Solo el jefe escribe»).
export const CHAT_POST_REFUSED = 'Ya no puedes escribir en este canal.';
// Mensajes: one of the boss's channel functions refused (not the boss, or the boss without the second factor).
export const CHAT_BOSS_ONLY = 'Para esto necesitas entrar con el doble factor.';

// Turn a Postgres error into a short Spanish message for people.
export function friendlyDbError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const msg = err?.message ?? '';
  if (err?.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    // Our own guards raise with a readable Spanish message; keep it (the boss's role, 20261028002350_boss_grant.sql,
    // and a message of Mensajes, chat_message_guard()).
    if (/^[A-ZÁÉÍÓÚ¿¡]/.test(msg) && !/row-level security|permission denied/i.test(msg)) return msg;
    if (/^chat: boss only/.test(msg)) return CHAT_BOSS_ONLY;
    if (/row-level security/i.test(msg) && /"chat_messages"/.test(msg)) return CHAT_POST_REFUSED;
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
