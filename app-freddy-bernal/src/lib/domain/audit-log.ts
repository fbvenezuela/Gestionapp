// Ajustes → «Registro de cambios» (Administración): each line in plain words, «quién · qué hizo · sobre qué · cuándo».
// Never a table, a column or an action as the database writes them: a table or an action nobody named yet reads «otro
// dato» / «cambió», and the fields that changed are only counted. Every table that writes to audit_log (the standard
// trail of wire_standard_triggers and the tables with their own audit trigger) has its name here; a unit test reads the
// migrations and fails when a new one comes without it (tests/unit/audit-registro.test.ts). Which rows Administración
// reads does not change here (RLS on audit_log; the attention tables keep only who, when and which row: D-93).

export const AUDIT_TABLE_LABEL: Record<string, string> = {
  two_factor: 'Doble factor',
  events: 'Evento', event_schedule: 'Fecha y lugar', event_brief: 'Ficha técnica', event_assignments: 'Asignación',
  storyboards: 'Storyboard', storyboard_blocks: 'Bloque de storyboard', media_assets: 'Material', pieces: 'Pieza',
  piece_versions: 'Versión de pieza', copies: 'Copy', reviews: 'Revisión', review_comments: 'Comentario',
  voice_line_requests: 'Frase del jefe', tweets: 'Tweet', tweet_batches: 'Tanda de tweets', publications: 'Publicación',
  publication_metrics: 'Resultados', profiles: 'Persona', user_roles: 'Rol', invitations: 'Invitación',
  app_settings: 'Ajuste', categories: 'Categoría', copy_formulas: 'Fórmula', network_specs: 'Reglas de red',
  obra_fichas: 'Ficha de obra', obra_ficha_private: 'Contactos de obra', community_reports: 'Ficha comunitaria',
  community_report_private: 'Contactos del reporte', ficha_updates: 'Historia de ficha',
  recording_notes: 'Nota de grabación', drive_connection: 'Conexión con Google Drive',
  // Redes by format and the office.
  content_months: 'Mes de contenido', feed_slots: 'Espacio del feed', piece_details: 'Tarjeta de una pieza',
  piece_notices: 'Aviso de una pieza', event_office: 'Actividad en la oficina',
  // The public web.
  territories: 'Municipio o parroquia', web_items: 'Contenido de la web', web_versions: 'Versión de un contenido de la web',
  web_media: 'Archivo de la web', web_redirects: 'Redirección', web_settings: 'Ajuste del sitio',
  // Citizen attention: only that something happened, who and when (never what the person wrote).
  areas: 'Área de atención', area_members: 'Persona de un área', request_categories: 'Categoría de atención',
  request_reply_templates: 'Respuesta guardada', requests: 'Solicitud', request_supports: 'Apoyo a una solicitud',
  request_contacts: 'Contacto de una solicitud', request_events: 'Historia de una solicitud',
  request_messages: 'Mensaje de una solicitud', request_attachments: 'Archivo de una solicitud',
  attended_publications: 'Caso atendido publicado',
  // Mensajes: the audit keeps only that something happened, who and when; never a text, a name or the members (D-82).
  chat_conversations: 'Canal', chat_members: 'Miembro de un canal', chat_messages: 'Mensaje',
  // The two tables of Mensajes before the channels (dropped by 20261029090000_chat_channels.sql): their old rows stay in
  // the registry, under one neutral name, never the raw table name (R5 review 2, point 4).
  chat_notice_ack: 'Mensajes (antes de los canales)', chat_rules: 'Mensajes (antes de los canales)',
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  insert: 'creó', update: 'cambió', delete: 'quitó', soft_delete: 'borró', mfa_reset: 'reinició',
  contact_view: 'vio', export: 'exportó',
};

// The rows that say something other than «<verb> <table>»: an export is of many requests, a look is at a contact.
const OBJECT_FOR: Record<string, string> = {
  'requests:export': 'Solicitudes',
  'request_contacts:contact_view': 'Contacto de una solicitud',
};

/** Who did it, when nobody signed in did: the seed, a scheduled task or the public web. */
export const AUDIT_NO_ACTOR = 'La app';

/** «creó» + «Evento»: the verb and what it was done to, in plain words. */
export function auditWhat(table: string, action: string): { verb: string; object: string } {
  return {
    verb: AUDIT_ACTION_LABEL[action] ?? 'cambió',
    object: OBJECT_FOR[`${table}:${action}`] ?? AUDIT_TABLE_LABEL[table] ?? 'otro dato',
  };
}

/** «(2 datos)» for a change; nothing when no field is counted. */
export function auditChanged(n: number | null | undefined): string | null {
  const c = Number(n ?? 0);
  if (!Number.isFinite(c) || c <= 0) return null;
  return `(${c} ${c === 1 ? 'dato' : 'datos'})`;
}

// The fields of a change, counted in SQL from audit_log: the keys whose value changed, without the bookkeeping (when,
// who saved, the concurrency token, a piece's review round, the web's search text) and without the lists of field
// names that the private tables keep instead of their values («fields», «content_fields»), which count one by one.
export const AUDIT_CHANGED_COUNT_SQL = `case when a.action = 'update' then (
    (select count(*) from jsonb_object_keys(coalesce(a.new_data, '{}'::jsonb)) k
      where (a.new_data -> k) is distinct from (a.old_data -> k)
        and k not in ('updated_at', 'updated_by', 'rev', 'revision', 'search', 'fields', 'content_fields'))
  + (select count(*) from jsonb_array_elements_text(case when jsonb_typeof(a.new_data -> 'fields') = 'array'
        then a.new_data -> 'fields' else '[]'::jsonb end) f)
  + (select count(*) from jsonb_array_elements_text(case when jsonb_typeof(a.new_data -> 'content_fields') = 'array'
        then a.new_data -> 'content_fields' else '[]'::jsonb end) f where f <> 'search')
  )::int end`;
