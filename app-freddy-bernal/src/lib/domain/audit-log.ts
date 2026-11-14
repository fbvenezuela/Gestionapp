// The two registries in plain words: Ajustes → «Registro de cambios» (Administración) and Atención → «Registro de
// atención» (auditoría and Administración). Each line reads as a sentence, «quién · qué hizo · sobre qué · cuándo»
// («Ana cambió una pieza (2 datos)», «La web creó una solicitud»), with the same words on both screens. Never a table,
// a column or an action as the database writes them: a table or an action nobody named yet reads «otro dato» /
// «cambió», and the fields that changed are only counted. Every table that writes to audit_log (the standard trail of
// wire_standard_triggers and the tables with their own audit trigger) has its name here; a unit test reads the
// migrations and fails when a new one comes without it (tests/unit/audit-registro.test.ts). Which rows each role reads
// does not change here (RLS on audit_log; the attention tables keep only who, when and which row: D-93).

/** What a row was done to, said so that it follows the verb: «creó un evento», «cambió la tarjeta de una pieza». */
export const AUDIT_TABLE_LABEL: Record<string, string> = {
  two_factor: 'el doble factor de una persona',
  // The parts of an event in the words of its «Historial» (src/components/agenda/history-card.tsx).
  events: 'un evento', event_schedule: 'la fecha, la hora y el lugar de un evento', event_brief: 'la ficha técnica de un evento',
  event_assignments: 'quién graba un evento', storyboards: 'un storyboard', storyboard_blocks: 'un bloque del storyboard',
  media_assets: 'un archivo del material', pieces: 'una pieza', piece_versions: 'una versión de una pieza', copies: 'un copy',
  reviews: 'una revisión', review_comments: 'un comentario de una revisión', voice_line_requests: 'un pedido de frase del jefe',
  tweets: 'un tweet', tweet_batches: 'una tanda de tweets', publications: 'una publicación',
  publication_metrics: 'los resultados de una publicación', profiles: 'los datos de una persona', user_roles: 'el rol de una persona',
  invitations: 'una invitación', app_settings: 'un ajuste', categories: 'una categoría', copy_formulas: 'una fórmula de copies',
  network_specs: 'las reglas de una red', obra_fichas: 'una ficha de obra', obra_ficha_private: 'los contactos de una ficha de obra',
  community_reports: 'una ficha comunitaria', community_report_private: 'los contactos de una ficha comunitaria',
  ficha_updates: 'la historia de una ficha', recording_notes: 'una nota de grabación', drive_connection: 'la conexión con Google Drive',
  // Redes by format and the office.
  content_months: 'un mes de contenido', feed_slots: 'un espacio del feed', piece_details: 'la tarjeta de una pieza',
  piece_notices: 'un aviso de una pieza', event_office: 'una actividad en la oficina',
  // The public web.
  territories: 'un municipio o una parroquia', web_items: 'un contenido de la web', web_versions: 'una versión de un contenido de la web',
  web_media: 'un archivo de la web', web_redirects: 'una redirección', web_settings: 'un ajuste del sitio',
  // Citizen attention: only that something happened, who and when (never what the person wrote).
  areas: 'un área de atención', area_members: 'quién está en un área', request_categories: 'una categoría de atención',
  request_reply_templates: 'una respuesta guardada', requests: 'una solicitud', request_supports: 'un apoyo a una solicitud',
  request_contacts: 'el contacto de una solicitud', request_events: 'la historia de una solicitud',
  request_messages: 'un mensaje de una solicitud', request_attachments: 'un archivo de una solicitud',
  attended_publications: 'un caso atendido',
  // Mensajes: the audit keeps only that something happened, who and when; never a text, a name or the members (D-82).
  chat_conversations: 'un canal', chat_members: 'quién está en un canal', chat_messages: 'un mensaje',
  // The two tables of Mensajes before the channels (dropped by 20261029090000_chat_channels.sql): their old rows stay in
  // the registry, under one neutral name, never the raw table name (R5 review 2, point 4).
  chat_notice_ack: 'algo de Mensajes (antes de los canales)', chat_rules: 'algo de Mensajes (antes de los canales)',
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  insert: 'creó', update: 'cambió', delete: 'quitó', soft_delete: 'borró', mfa_reset: 'reinició',
  contact_view: 'vio', export: 'exportó',
};

// Where «creó …» / «quitó …» would not read as Spanish, the verb or the words after it for that table and action.
const PHRASE_FOR: Record<string, { verb?: string; object?: string }> = {
  'requests:export': { object: 'solicitudes' },
  'event_assignments:insert': { verb: 'eligió' },
  'event_assignments:delete': { object: 'a quien grababa un evento' },
  'media_assets:insert': { verb: 'subió' },
  'piece_versions:insert': { verb: 'subió' },
  'web_media:insert': { verb: 'subió' },
  'profiles:insert': { object: 'la cuenta de una persona' },
  'profiles:soft_delete': { object: 'la cuenta de una persona' },
  'user_roles:insert': { verb: 'le dio', object: 'un rol a una persona' },
  'user_roles:delete': { verb: 'le quitó', object: 'un rol a una persona' },
  'invitations:insert': { verb: 'mandó' },
  'ficha_updates:insert': { verb: 'anotó algo en' },
  'area_members:insert': { verb: 'agregó', object: 'a una persona a un área' },
  'area_members:delete': { verb: 'sacó', object: 'a una persona de un área' },
  'chat_members:insert': { verb: 'agregó', object: 'a una persona a un canal' },
  'chat_members:delete': { verb: 'sacó', object: 'a una persona de un canal' },
  'chat_messages:insert': { verb: 'escribió' },
  'request_supports:insert': { verb: 'sumó' },
  'request_contacts:insert': { verb: 'guardó' },
  'request_events:insert': { verb: 'anotó algo en' },
  'request_messages:insert': { verb: 'escribió', object: 'un mensaje en una solicitud' },
  'request_attachments:insert': { verb: 'subió', object: 'un archivo a una solicitud' },
  'attended_publications:insert': { verb: 'publicó' },
};

/** Who did it, when nobody signed in did: the seed, a migration, a scheduled task or the file scanner. */
export const AUDIT_NO_ACTOR = 'La app';
/** Who did it, when it was a person on the public web (attention: a request, a support, a message or a file). */
export const AUDIT_FROM_WEB = 'La web';

// SQL over «audit_log a»: true for a row that nobody signed in wrote and that is what a person did on the public web.
// Only these: a new request, its support and its contact (only the public web makes them), a file or a message that the
// person sent (the ones without a member of the team) and a step of the case that the person took. Everything else
// without a person is the app's: the client's setup, the saved replies a migration brings, the file scanner, a
// scheduled task, and the state a request takes after what the person did (the step itself says «La web»).
export const AUDIT_FROM_WEB_SQL = `(a.actor_id is null and (
    (a.action = 'insert' and a.table_name in ('requests', 'request_supports', 'request_contacts'))
    or (a.action = 'insert' and a.table_name = 'request_attachments' and (a.new_data ->> 'uploaded_by') is null)
    or (a.action = 'insert' and a.table_name = 'request_messages' and (a.new_data ->> 'kind') = 'citizen_message')
    or (a.action = 'insert' and a.table_name = 'request_events' and (a.new_data ->> 'actor_kind') = 'citizen')))`;

/** The person's name; «La web» for what a person did on the public web; «La app» for the rest. */
export function auditWho(actor: string | null | undefined, fromWeb?: boolean | null): string {
  return actor ?? (fromWeb ? AUDIT_FROM_WEB : AUDIT_NO_ACTOR);
}

/** «creó» + «un evento»: the verb and what it was done to, in plain words. */
export function auditWhat(table: string, action: string): { verb: string; object: string } {
  const phrase = PHRASE_FOR[`${table}:${action}`] ?? (action === 'soft_delete' ? PHRASE_FOR[`${table}:delete`] : undefined);
  return {
    verb: phrase?.verb ?? AUDIT_ACTION_LABEL[action] ?? 'cambió',
    object: phrase?.object ?? AUDIT_TABLE_LABEL[table] ?? 'otro dato',
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
