# Arquitectura

Actualizado: 29/10/2026 (seis roles, fichas, agenda compartida y entrega de Grabación: migraciones
`20261027001500` a `20261028002300`; tercera vuelta: Mensajes, Ayuda y tutoriales, migraciones `20261028002350` y
`20261028002400`; ronda 4: Redes por formato, meses y feed, `20261029000100`; ronda 5: Mensajes como canales,
`20261029090000`; 06/11: la base de la web pública y la atención ciudadana, `20261106000050` a `20261106000300`, y
después sus pantallas, su administrador, la atención, el importador y la revisión de seguridad, `20261106100100` a
`20261106400200`).

## Piezas
- **Next.js 16 (App Router), React 19, TypeScript estricto, Tailwind 4.** Server Components para leer y server
  actions para escribir. `experimental.useOffline` deja en espera las navegaciones y acciones sin señal.
- **Postgres (Supabase)** con RLS en todas las tablas. El servidor se conecta por el *pooler* y cada consulta de una
  persona corre como ella (`src/lib/db/core.ts` → `asUser`). Las tareas sin persona (correos, cron) usan `asSystem`.
- **Demostración y pruebas:** PGlite (Postgres en WASM) con las **mismas migraciones** + `supabase/shim/` (imita el
  esquema `auth` de Supabase).
- **Supabase Auth** (correo + código de 6 dígitos, TOTP), **Storage** (subida TUS por partes), **Realtime** (listo en
  la publicación; la UI se refresca al actuar). Mensajes no usa Realtime: pide lo nuevo por rutas GET (D-56).
- **Resend + React Email** (`emails/`), siempre pasando por la tabla `outbox`.
- **Google Drive del cliente** para el material, solo con `STORAGE_PROVIDER=drive` (ver «Subidas y dónde vive el
  video» y `DRIVE.md`). Sin la variable, todo como antes.
- **Vercel** (prueba por PR, producción en `main`) y **GitHub Actions**.

## Estructura de carpetas
```
app-freddy-bernal/
├── config/                 # Datos del cliente (marca, categorías, fórmulas, horarios) y reglas de video por red
├── docs/                   # Esta documentación
├── emails/                 # Plantillas de correo
├── diseno/stitch/          # Modelo visual (referencia, no se ejecuta)
├── public/                 # PWA: sw.js, offline.html, iconos; mediainfo (se copia al instalar)
├── scripts/                # Cargar la configuración del cliente, crear el primer admin (y el jefe con --jefe), importar videos a Drive (drive-import/), importar la web vieja (web-import/), generar las guías (guides-docs.mts)
├── supabase/
│   ├── migrations/         # SQL versionado (lo que va a Supabase)
│   └── shim/               # Solo demo/pruebas: esquema auth falso y tablas de login demo
├── src/
│   ├── app/(auth)/         # Entrar, doble factor, sin acceso
│   ├── app/(panel)/        # Hoy, jefe, agenda, eventos, obras, municipios, reportes, redes, piezas, aprobar, tweets, publicar, resultados, biblioteca, ajustes, mensajes, ayuda; admin/web y admin/atencion (la web y la atención, D-91)
│   ├── app/panel/          # La entrada del equipo: a su inicio o a entrar (la app instalada abre aquí)
│   ├── app/(web)/          # La web pública (D-91): portada, gobernador, gestion, actualidad (y semanario), reporte-bernal, atencion (nueva, consultar, atendido), transparencia, canales y las tres legales
│   ├── app/(vista-previa)/ # La vista previa de un borrador con el marco de la web (para el equipo de la web; nunca indexada)
│   ├── app/api/            # Descarga firmada (y por tramos desde Drive), miniaturas, subida demo (TUS), Drive (conexión, partes por la plataforma), cron, asistente, mensajes (lecturas GET del lazo), archivos de la web (pública) y de la atención (con RLS)
│   ├── components/         # UI (tokens), shell, agenda, media, tweets, assistant, chat (Mensajes), tour (motor de tutoriales), guides (Ayuda y flujogramas); web (la web pública y sus bloques), cms (el administrador de la web), attention (la atención), participation (el formulario y la consulta del ciudadano)
│   └── lib/                # db, auth, actions (server actions), data (lecturas), domain (lógica pura), ai, publish, email, assistant, guides (guías, flujos y tutoriales: una sola fuente); web (esquemas de la web, lecturas públicas y llamadas ciudadanas), participation (comprobante, llaves, cifrado, archivos, CSV, PDF)
└── tests/                  # unit (Vitest), rls (Vitest), e2e (Playwright 360 px + axe)
```

## Tablas (migraciones en `supabase/migrations`)
| Grupo | Tablas | Notas |
|---|---|---|
| Personas | `profiles`, `user_roles`, `invitations` | Rol en la base, nunca en el token. Trigger en `auth.users` crea el perfil y aplica la invitación |
| Configuración | `app_settings`, `categories` | Claves: `app.timezone`, `brand`, `municipalities`, `tweets.slots`, `tweets.per_day`, `tweets.low_stock_days`, `security.mfa_roles`, `publishing.enabled`, `upload.max_mb`, `publishing.default_collaborators`, `parishes` (vacío hasta la lista oficial) |
| Agenda | `events`, `event_schedule` (privada), `event_brief`, `event_assignments`, `storyboards`, `storyboard_blocks`; vistas `event_calendar` y `agenda_to_schedule` (`security_invoker`) | Ver «Regla de fecha y hora». Desde el 27/10 `events` tiene `origin` (despacho, jefe, política, IVT), `kind` (evento, visita de obra, actividad comunitaria), cancelar sin borrar (`cancelled_at/by`, `cancel_reason`), `rev` y `updated_by`, y la ficha de la que nació (`obra_ficha_id` o `community_report_id`, a lo sumo una). `rev` también en la fecha, la ficha técnica y el storyboard |
| Fichas (27/10) | `obra_fichas` (O-0001, IVT), `obra_ficha_private`, `community_reports` (R-0001, política), `community_report_private`, `ficha_updates` | Lo de terceros (nombres, teléfonos, dirección) solo en las `*_private`, con doble factor. `ficha_updates` es la historia: solo se agrega y de las privadas guarda solo el nombre del campo. «No aplica» / «Por confirmar» en la columna `marks` |
| Material y piezas | `media_assets`, `recording_notes`, `pieces`, `piece_versions`, `copy_formulas`, `copies` | `copies` único por (pieza, largo). Un archivo tiene un solo dueño: un evento, una ficha de obra o un reporte. Tipos nuevos: `storyboard`, `before`, `progress`, `after`, `document`. `recording_notes`: la nota para el editor y el storyboard escrito de Grabación. Desde el 29/10 `pieces` tiene `format` (reel, post, carousel, story, youtube, month_end), `content_month_id`, `pillar`, `sort_order`, `rating` y la marca de diseño (`design_status`, `design_note`, `design_by`, `design_at`); `piece_versions.slide_asset_ids` guarda las láminas en orden (léelas con `to_jsonb(...)`: una lámina vacía vuelve como el texto `NULL` en postgres.js) |
| Redes por formato (29/10) | `content_months` (los meses, con su nombre y orden; borrar es lógico), `feed_slots` (24 filas por mes que nacen con el mes: número 1–24 y pieza), `piece_details` (los campos de cada formato, con `rev`), `piece_notices` (avisos de cumplimiento; «Resuelto», no se borran) | Una pieza en un solo espacio y un número con una sola pieza (únicos diferidos `feed_slots_one_place`, `feed_slots_month_num`). Las funciones del feed bloquean mes → espacios → pieza, siempre en ese orden. Ver «Redes por formato» |
| Revisión | `reviews`, `review_comments` (con segundo), `voice_line_requests` | Aprobación solo por `review_piece()` |
| Tweets | `tweet_batches`, `tweets` | Trigger `guard_tweet` |
| Publicación | `publications` (con `republish_of`, `collaborators`, `validation`), `publication_metrics` (fotos en el tiempo), `network_specs` | Trigger `guard_publication` |
| Avisos | `notifications`, `outbox`, `jobs`, `ai_usage` | Escritos por el servidor |
| Auditoría | `audit_log` | Solo se agrega; trigger en todas las tablas de negocio |
| Mensajes (28/10; canales desde el 29/10) | `chat_conversations` (un canal con nombre, descripción y `archived_at`, o «Todo el equipo»), `chat_members` (`via` «picked» o «boss»; salir es `removed_at`/`removed_by`, volver es una fila nueva), `chat_messages` (con `agenda_clear`), `chat_reads` (leído y silencio propios) | Los mensajes solo se agregan; los miembros también (ni el sistema los borra: tampoco `TRUNCATE`). La auditoría guarda tabla, fila, quién y cuándo, nunca el texto, el nombre del canal ni los miembros. Nada en Realtime. Sin aviso ni reglas por pareja (se fueron `chat_notice_ack` y `chat_rules`). Ver «Mensajes» |
| Web pública (06/11) | `web_items` (borrador y lo publicado, con sus filtros), `web_versions` (solo se agregan), `web_media` (biblioteca pública, texto alternativo obligatorio), `web_settings`, `web_redirects`, `territories` | Ver «Web pública y atención ciudadana». anon lee columna por columna lo publicado y vivo |
| Atención ciudadana (06/11) | `areas`, `area_members`, `request_categories`, `requests`, `request_supports`, `request_contacts` (cifrado, sin permisos), `request_events` y `request_messages` (solo se agregan), `request_attachments`, `attended_publications`, `rate_limits`, `request_reply_templates` (respuestas guardadas), `request_alerts` (qué caso ya avisó hoy; sin acceso por la API) | Nadie escribe directo: funciones de la base. La auditoría guarda quién, cuándo y qué campos, nunca el contenido |
| Importador de la web vieja (06/11) | `web_import_items` (artículo viejo → borrador, con el `rev` que dejó el importador y qué revisar), `web_import_media` (foto vieja → archivo de la biblioteca) | Solo el importador (el sistema) escribe; el equipo de la web lee. Ver «Importador de la web vieja» |
| Google Drive y miniaturas | `drive_connection`, `drive_folders`, `media_drive`, `media_thumbs`, `drive_transfer`; función `drive_status()` | Solo el servidor (RLS activo, sin políticas, sin permisos para los roles de la API). Un archivo de Drive es una fila normal de `media_assets` con `bucket = 'drive'`. `media_thumbs` guarda también las miniaturas hechas en el teléfono (cualquier almacenamiento) |

Índices en las columnas de búsqueda y orden (estado, fechas, claves foráneas). Borrado: columna `deleted_at` y
trigger `guard_soft_delete` (solo administración).

## Roles y RLS por tabla (resumen, desde el 27/10/2026)
Seis roles del equipo (jefe, despacho, política, IVT, grabación, redes) y administración, el técnico (`DECISIONES.md`
D-29). Secretaría y Supervisión siguen escritas en la base para la historia, pero no se pueden dar.

Funciones que usan las reglas: `has_role`, `has_any_role`, `is_staff`, `is_content_team` (admin, redes, jefe),
`mfa_ok`, `is_assigned`, y las de esta ronda:
- `can_approve()`: el jefe con doble factor (`aal2`), sin leer la lista editable. La única puerta para aprobar,
  decidir y calificar (D-30).
- `can_manage_agenda()`: el jefe o el despacho, con doble factor. Crear eventos, la fecha, la ficha técnica y
  «Ponerle fecha» (D-32). `can_edit_event()` la llama.
- `can_see_event(e)`: admin, jefe, despacho, redes, o grabación asignada; nunca el IVT ni política (abre también la
  ficha técnica, el storyboard y el material). Un evento borrado, solo administración.
- `can_see_schedule(e)`: ver «Regla de fecha y hora».
- `obra_visit_visible(id)`: «la obra tiene una visita viva que puedo ver» (fotos para Redes y Grabación).

Funciones que llama la app: `schedule_ficha()` (la única que une un evento con una ficha), `event_history()` (quién
cambió qué), `agenda_last_writers()` (a quién avisar «cambió lo mismo que tú»), `camera_people()`, `event_done_on()`,
`visit_obra_ficha()`, `report_has_live_event()` y `review_piece()`. Reglas de texto: `text_has_phone()` y
`text_has_datetime()` (las mismas de la app); desde el 28/10 también `text_has_concrete_datetime()`, `chat_strip_refs()`,
`chat_has_map()` y `chat_strip_timecodes()` (copias exactas en `src/lib/domain/chat.ts`).

Mensajes (28/10, `20261028002400_internal_chat.sql`; canales desde el 29/10, `20261029090000_chat_channels.sql`):
`is_team_member()` (un rol del equipo y no administración), `chat_is_member(c)` (miembro actual, o «Todo el equipo»),
`chat_can_read(c)` (miembro con su doble factor; el jefe lee porque está en todos los canales; nunca administración ni
360), `chat_may_post(c)` (miembro, no archivado, «Solo el jefe escribe»), `chat_hides_agenda_for_me(c)`,
`chat_reader_knows_agenda()`, `chat_by_assistant()` (la marca `app.caller = 'assistant'` de 360), y las que llama la app:
`chat_team_channel()`, `chat_set_only_boss()`, `chat_people()` (solo el jefe), `chat_member_list()` (quién está ahora; quien
salió solo como autor), `chat_hidden_marks()`, `chat_channel_create()`, `chat_channel_update()`,
`chat_channel_set_members()`, `chat_channel_archive()` (las cuatro del jefe con doble factor). Internas, sin permiso para
la API: `chat_team_roles()`, `chat_author_knows_agenda()`, `chat_author_camera_only()`, `chat_hides_agenda()`,
`chat_channel_people()`. Disparadores: `chat_message_guard()` (teléfono y agenda al escribir, y `agenda_clear`, estricto
donde no hay Redes ni política), `chat_append_only()`, `guard_chat_conversation_update()`, `guard_chat_channel_text()`,
`guard_chat_member_change()`, `chat_channel_add_bosses()`, `chat_boss_role_change()` (disparador
`zz_chat_boss_membership`, después de los guardias de roles) y `audit_chat_row()`.

El rol de jefe (28/10, `20261028002350_boss_grant.sql`): `guard_boss_grant()` (solo el sistema da `boss`, en
`user_roles` y en `invitations`), `notify_team_role_grant()` (aviso al jefe por cada rol del equipo que da una persona) y
`team_role_label()` (los nombres de `ROLE_LABEL`).

| Tabla | Leer | Escribir |
|---|---|---|
| `events` | admin, jefe, despacho, redes; grabación sus asignados; el IVT las visitas nacidas de una ficha de obra; política las actividades nacidas de sus reportes | crear: jefe y despacho (con aal2); lo del jefe nace aceptado, lo del despacho «Por decidir». Cambiar, por columnas (`guard_event_update`): jefe y despacho los datos y cancelar; el jefe con aal2 prioridad y decisión; jefe y redes el estado de trabajo; administración solo el borrado (con aal2) |
| `event_schedule` | `can_see_schedule()` | jefe y despacho (con aal2); un evento realizado ya no cambia |
| `event_brief` | `can_see_event()` | jefe y despacho (con aal2) |
| `event_assignments` | la persona asignada; admin, jefe, despacho, redes | admin, jefe, despacho, redes |
| `storyboards`, bloques | `can_see_event()` | admin, redes, jefe |
| `obra_fichas` | admin, jefe, despacho, IVT (Redes y Grabación solo por `visit_obra_ficha()`) | admin, jefe, despacho, IVT |
| `obra_ficha_private` | admin, jefe, despacho, IVT, con aal2 | igual |
| `community_reports` (sin teléfonos) | admin, jefe, despacho, política | crear: jefe, despacho, política; cambiar: ellos y admin (que borra y restaura) |
| `community_report_private` | jefe, despacho, política, con aal2 (D-41) | igual |
| `ficha_updates` | quien ve la ficha | la escribe la base; a mano, solo notas propias; la de un reporte, sin teléfonos |
| `media_assets` | con su evento (`can_see_event`); sin dueño, el equipo de contenido; de una ficha, quien ve la ficha (Redes y Grabación solo fotos del antes y del avance de su visita, nunca documentos; de un reporte, admin solo las fotos y los documentos jefe, despacho y política) | admin, redes y jefe cualquier tipo sin ficha; grabación crudo y storyboard en sus eventos; fotos de obra: admin, jefe, despacho, IVT; evidencia de reporte: jefe, despacho, política |
| `recording_notes` | admin, jefe y redes con el evento; grabación en los suyos | la propia: el jefe, o grabación en un evento asignado |
| `pieces`, versiones, copies | equipo de contenido | admin, redes, jefe; aprobar solo `can_approve()` (función); eliminar solo `remove_piece()` (el jefe con aal2); administración solo restaura (`guard_piece_soft_delete`) |
| `content_months` | equipo de contenido | crear, renombrar: admin, redes, jefe; borrar solo con `delete_content_month()` (redes y jefe) |
| `feed_slots` | equipo de contenido | nadie inserta (nacen con el mes); poner y mover solo por `feed_place()`, `feed_swap()`, `feed_clear()`, `move_piece_to_month()` |
| `piece_details`, `piece_notices` | equipo de contenido | admin, redes, jefe (`redes_piece_rules`); textos sin teléfono, y sin fecha u hora de quien conoce la agenda |
| `tweets` | equipo de contenido | admin, redes, jefe; aprobar solo `can_approve()` |
| `publications`, métricas | equipo de contenido | admin, redes, jefe; publicada/programada solo si la pieza está aprobada |
| `user_roles`, `invitations` | admin (y cada quien sus roles) | admin con aal2; nadie se da roles a sí mismo y una cuenta no junta admin con jefe o despacho (`guard_role_mix`, D-41); el rol de jefe solo lo da el sistema (`guard_boss_grant`, D-58) |
| `chat_conversations`, `chat_members` | `chat_can_read()` (de `chat_members`, solo las filas actuales y la propia) | solo las funciones del jefe (`chat_channel_*`) y `chat_team_channel()`; «Solo el jefe escribe» con `chat_set_only_boss()`; el jefe entra solo por la base |
| `chat_messages` | `chat_can_read()` y (`agenda_clear`, o quien conoce la agenda sin Redes ni política, o el jefe) | el autor con `chat_may_post()`; `chat_message_guard()` revisa y pone `agenda_clear`; nunca se cambia ni se borra |
| `chat_reads` | las propias | las propias, de un miembro |
| `audit_log`, `outbox` | admin (con aal2) | nadie (trigger / servidor) |

## Regla de fecha y hora (regla 4)
1. Fecha, hora, duración, dirección exacta, cómo llegar y contactos: **solo** en `event_schedule`.
2. Su RLS: `can_see_schedule()` = `mfa_ok()` y (admin, jefe o despacho; grabación asignada, en un evento no borrado; o
   el IVT en las visitas nacidas de una ficha de obra). Política y redes, nunca. Escriben solo el jefe y el despacho
   (`can_manage_agenda()`).
3. Las vistas `event_calendar` y `agenda_to_schedule` son `security_invoker`: para redes devuelven cero filas.
   `agenda_to_schedule` («Por ponerle fecha») no tiene columna de fecha.
4. Al marcar «realizado», `mark_event_done()` (security definer) copia solo el **día** a `events.done_on`. Esa columna
   está cerrada para la API: el día sale de `event_done_on()` (Redes y quien ve la fecha; política no, D-40).
5. `event_schedule` no se publica en Realtime; la auditoría solo la lee administración.
6. Correos, avisos, rutas de archivos, nombres de descarga, el `LEEME.txt` de «Descargar todo», la historia de las
   fichas y las búsquedas no usan esas columnas.
7. Probado en `tests/rls` (sobre todo `por-rol.test.ts`: un bloque por cada frase de §8 del encargo del 27/10) y en
   `tests/e2e/por-rol.spec.ts` y `flows.spec.ts` (redes no ve horas en la lista ni en la ficha).

## Redes por formato (D-60 a D-78; migración `20261029000100_redes_formatos.sql`)
- **Rutas:** `/redes` (tablero; `?vista=trimestre`; `?crear=1` abre «¿Qué quieres crear?»), `/redes/<formato>` (`reels`,
  `posts`, `carruseles`, `historias`, `youtube`, `fin-de-mes`; `#pieza-<id>` abre esa tarjeta), `/redes/feed`,
  `/redes/buscar`, `/ajustes/contenido` (Cupo y pilares, administración con doble factor). `/piezas` lleva a `/redes`;
  `/piezas/[id]` es la tarjeta en grande; `/piezas/nueva?evento=` crea desde un evento con «Formato» y «Mes». La sala
  del jefe `/aprobar/[id]?volver=` vuelve a la tarjeta solo si la dirección pasa `safeReturn()`.
- **El mes abierto** viaja en la dirección (`?mes=<uuid>`, `monthParam()`); tocar una pestaña además lo guarda en la
  cookie `fb-redes-mes` (`chooseMonth`).
- **Código:** dominio `src/lib/domain/redes.ts` (formatos, numeración del feed `cellToNumber()`, estados `displayState()`,
  `OUTGOING`, `designHold()`, textos de la demo), `format-rules.ts`, `redes-dashboard.ts`; lecturas
  `src/lib/data/redes.ts`; acciones `src/lib/actions/redes.ts`;
  pantallas `src/components/redes/**` (`card/**`, `feed/**`, `dashboard/**`, `month-tabs.tsx`, `redes-nav.tsx`).
- **Funciones de la base:** `feed_place()`, `feed_swap()`, `feed_clear()`, `move_piece_to_month()`,
  `delete_content_month()`, `remove_piece()`; disparadores `redes_piece_rules` (quién cambia qué), `guard_piece_month`,
  `guard_piece_title`, `guard_content_month`, `guard_piece_details`, `guard_piece_notice`, `guard_version_slides`,
  `story_details_reopen_review` y `notices_reopen_review` (lo que vuelve al jefe), `guard_publication_design` (un diseño
  desaprobado después de aprobar no sale) y `guard_redes_settings`. Ninguna lee la agenda.
- **Claves de configuración:** `redes.quotas` (`{reel, post, carousel, story, youtube}`, 0–200) y `redes.pillars`
  (hasta 12 `{key, name, tone}`); vacías en la configuración real, cinco pilares inventados en la demo.
- **Drive:** «Organizar por orden del feed» (`src/lib/storage/drive/organize.ts`) solo con `REDES_DRIVE_ORGANIZE=true`,
  Drive como almacenamiento y conectado, y administración con doble factor; carpetas `Feed/Mes-<n>` y `NN - Post.jpg`.
- **Errores en español:** `friendlyDbError` traduce los únicos del feed y los choques (40P01/40001: «Otra persona
  cambiaba el feed a la vez: vuelve a intentarlo.»).

## Mensajes (canales, D-79 a D-88; antes D-49 a D-59)
- **Pantallas** (`src/app/(panel)/mensajes/**`): la lista (`page.tsx`: «Todo el equipo», mis canales y «Archivados»;
  el jefe tiene «Nuevo canal»), el canal (`[id]`: el nombre, la descripción y «N personas», que abre la hoja
  «Miembros»), y para el jefe con doble factor «Nuevo canal» (`canales/nuevo`) y «Editar canal» (`[id]/editar`: nombre,
  descripción y miembros con un solo «Guardar», y archivar). Sin aviso en ninguna parte. Una cuenta con administración
  vuelve a su inicio con «Esa pantalla no es de tu rol». El sobre de arriba (`ChatHeaderLink` + `ChatBadgeLive`) solo
  para el equipo.
- **Lecturas:** `src/lib/data/chat.ts` (`myChannels`, `channel`, `messagesSince`, `unreadChannels`, `channelEditor`,
  `chatPeopleForBoss`), siempre dentro de `db(session, …)`. **Rutas GET del lazo:** `/api/mensajes/[id]/nuevos` (lo
  nuevo de un canal, cada 5 s con la pantalla a la vista; 410 solo si la base dice que el jefe lo sacó, `chat_was_removed()`,
  y la pantalla deja de preguntar; cualquier otro canal que no puede leer es 404 y la pantalla sigue preguntando) y
  `/api/mensajes/sin-leer` (el número del sobre, cada 30 s); sin sesión 401, sin Mensajes 404, `no-store`.
- **Acciones:** `src/lib/actions/chat.ts`: `createChannel`, `saveChannel`, `archiveChannel` (del jefe), `openTeamChannel`,
  `sendMessage` (con `clientId` como id: un reintento no duplica; pregunta antes un tiempo del video de Grabación o una
  palabra relativa como «mañana» a quien conoce la agenda donde están Redes o política, E1; `gone` si ya no está en el
  canal; sin `revalidatePath`), `markRead`, `setMuted`, `setOnlyBoss`. Enviar va directo, en una cola en orden, sin
  refrescar la página (`chat-feed-core.ts`).
- **Dominio:** `src/lib/domain/chat.ts`: los textos fijos (rechazos, preguntas, vacíos), las copias exactas de las reglas
  de texto de la base, comparadas con `tests/unit/fixtures/chat-text-cases.ts`, y `chatChannelTextProblem()` para el
  nombre y la descripción.
- **Avisos:** `notifyChat()` (`src/lib/notify.ts`) manda push tipo `chat_message` a los miembros actuales, sin el texto
  ni el nombre del canal, nunca a la campana ni por correo; se apaga en «Qué avisos quiero» → «Mensajes nuevos del
  equipo».
- **360 fuera:** ningún archivo de `src/lib/assistant`, `src/components/assistant`, `config/assistant` o la ruta del
  asistente toca Mensajes (`tests/unit/chat-isolation.test.ts`), y en la base lo que corre 360 lleva
  `app.caller = 'assistant'` (`src/lib/assistant/db.ts`), que las funciones de chat rechazan.
- **Demo:** `src/lib/db/seed-parts/chat.ts` siembra con ids estables «Todo el equipo» y cuatro canales (uno archivado),
  con un canal sin leer para cada persona del equipo (D-88).

## Web pública y atención ciudadana (D-90 a D-96; migraciones `20261106000050` a `20261106000300`)
- **Quién entra por dónde:** el equipo por `withUser` (RLS con sus claims); el público y el ciudadano sin cuenta por
  **`withAnon`** (`src/lib/db`: el rol `anon`, sin claims, una transacción propia, nunca dentro de otra). anon tiene
  permisos por columna sobre lo publicado de `web_items`, `web_settings` (filas públicas), `web_redirects`,
  `territories` y `request_categories` activos y `attended_publications` publicadas, y ninguna función de `public`.
- **El esquema `citizen`** (`20261106000300_citizen.sql`): `similar_requests`, `submit_request`, `support_request`,
  `lookup_request`, `add_citizen_message`, `add_request_attachment`, `request_attachment`, `confirm_request` y
  `request_stats`, SECURITY DEFINER, solo para anon, con límites persistentes (`rate_limits`) por dispositivo y por red.
  **Nunca** se agrega a los esquemas expuestos de la Data API. Errores: `P0429` límite, `22023` llave o comprobante
  mal formado, `P0001` mensaje para la persona (`friendlyDbError`).
- **Contenido** (`src/lib/web/`): `schema.ts` (lo que guarda cada tipo: página, noticia, obra, episodio, documento,
  aviso, pregunta, indicador; sin cifra sin fuente), `blocks.ts` (los 15 bloques y el texto estructurado; enlaces solo
  https, http, mailto o rutas propias), `public.ts` (lecturas como anon: listas con filtros y búsqueda, por dirección,
  por ids, ajustes, redirecciones, municipios, categorías, casos atendidos). Publicar es de la base: `publish_web_item()`,
  `return_web_item()`, `cancel_web_schedule()`, `archive_web_item()`, `unarchive_web_item()`, `restore_web_version()`.
- **Participación** (`src/lib/participation/`): `receipt-code.ts` (clave de 80 bits en Crockford y código, también en el
  navegador), `keys.ts` (HMAC con `PARTICIPATION_PEPPER` de la clave, del dispositivo y de la red), `contact-crypto.ts`
  (AES-256-GCM con `PARTICIPATION_DATA_KEY`), `lookup-cookie.ts` (la galleta de 30 min de «Consultar»),
  `turnstile.ts`, `files.ts` (tipo por bytes, tamaño, cantidad, limpieza de metadatos), `csv.ts`, `pdf.ts` (el
  comprobante, escrito a mano), `input.ts` (lo que manda el formulario y los nombres de tipos, estados y prioridades),
  `notices.ts` (los dos avisos legales, emergencias y denuncia: un solo texto cada uno, el mismo en el pie de la web,
  `/canales`, los formularios, el comprobante y los correos; no son ajustes del sitio) y `emails.ts` (las palabras de
  los correos al ciudadano). Las llamadas a `citizen.*`, con argumentos por nombre: `src/lib/web/participation.ts`.
- **Archivos** (`src/lib/storage/`): dos baldes lógicos (`buckets.ts`): `web-public` (la biblioteca, se sirve por su
  dirección pública de Supabase o, en la demo, por `/api/archivos/web/<clave>` con caché de un año,
  `serve-public-file.ts`) y
  `participacion-privado` (nunca público: `/api/archivos/atencion/<id>` revisa sesión, doble factor y RLS; en
  producción redirige a un enlace firmado de 60 s). `participation-files.ts` revisa, limpia y guarda; `scanner.ts`:
  `ATTACHMENT_SCANNER=clamav` (clamd INSTREAM) o `none`; en producción solo se descarga lo «limpio».
- **Local con datos que se quedan** (D-94): `LOCAL_DATA_DIR` → PGlite en disco sembrado una vez (`local-data.ts`) y los
  archivos de la demo debajo (`local-files.ts`, `demo-store.ts`).
- **Demo:** `src/lib/db/seed-parts/web*.ts` (gente de los roles nuevos siempre; el contenido y las 60 solicitudes solo en
  el servidor de la demo: `seedDemo(…, { webContent: true })`), ids fijos.
- **Importador de la web vieja** (D-97, `docs/PLAN-MIGRACION-Y-PRODUCCION.md`): `npm run web:import`
  (`scripts/web-import/`: `wp-client.ts` lee la API de WordPress con cortesía y solo de la propia web; `html.ts` y
  `convert.ts` pasan el HTML al texto estructurado; `pii.ts` quita correos, teléfonos y cédulas; `media.ts` elige y
  revisa las fotos con `checkWebMediaFile`; `mapping.ts` arma el borrador y las direcciones; `run.ts` decide y escribe;
  `store.ts`, la base y el balde). Escribe como el sistema y solo con `--apply`; recuerda la procedencia en
  `web_import_items` y `web_import_media` (`20261106300100_web_importador.sql`), que el equipo de la web lee con RLS.
  `guard_web_item_ready` no deja publicar una foto con «[Por escribir]» ni un texto con las marcas
  (`src/lib/web/import-marks.ts`). Las redirecciones viejas se buscan una por una (`redirect-map.ts`); un archivo viejo
  que no se trajo responde 410 (`proxy.ts`).
- **La web pública** (`src/app/(web)/`, `src/components/web/`): componentes de servidor que leen como anon por
  `src/lib/web/cache.ts` (la caché de datos de Next con etiquetas, `tags.ts`: 60 s el contenido, 300 s los ajustes y
  catálogos). `revalidate.ts` refresca al momento las etiquetas al publicar, programar, quitar la programación,
  archivar, desarchivar, guardar un ajuste o una redirección; lo programado aparece solo por `publish_at` en menos de un
  minuto. Ajustes del sitio normalizados en `site-settings.ts` (en producción solo las cuentas activas y verificadas;
  en la demo también las demás, con una sola línea que dice que están en proceso de confirmación). SEO: `seo.ts` y `meta.ts` (títulos, canónicas, Open Graph), JSON-LD
  `Person`, `GovernmentOrganization` y `NewsArticle` (`components/web/json-ld.tsx`; su `sameAs` lleva siempre solo las
  cuentas activas y verificadas, también en la demo, aunque ahí el pie y `/canales` muestren las otras), `src/app/sitemap.ts`,
  `src/app/robots.ts` y `src/app/opengraph-image.tsx`; sin `SITE_INDEXABLE=true`, robots, meta y `X-Robots-Tag` dicen
  noindex. Cabeceras (`headers.ts` → `next.config.ts`): CSP de la web sin nonces (YouTube nocookie, los cuadros de
  OpenStreetMap y Turnstile si está), HSTS, `nosniff`, `Referrer-Policy` y `Permissions-Policy`. `src/proxy.ts`: las
  direcciones viejas (301 por `/api/web/redireccion`, 410 a `/wp-content` no traído) y las galletas de sesión del panel.
  Si una página no carga porque falla la base o la red, `src/app/(web)/error.tsx` dice «No se pudo cargar la página»,
  con «Intentar de nuevo» e «Ir al inicio» y sin detalle técnico (el de `atencion/` lleva a «Atención ciudadana» y
  recuerda que lo escrito en el formulario sigue guardado).
- **El administrador de la web** (`/admin/web`, `src/app/(panel)/admin/web/`, `src/components/cms/`; manual en
  `MANUAL-ADMIN-WEB.md`): lee como la persona en `src/lib/data/web-admin.ts`; escribe en `src/lib/actions/web.ts`
  (borradores, envío, publicar, programar, devolver, archivar, versiones), `web-site.ts` (biblioteca, ajustes,
  redirecciones) y `web-core.ts` (avisos al aprobador y a quien envió, revalidación). Lógica pura en `src/lib/web/cms/`:
  las etiquetas de estado (`status.ts`), la comparación campo por campo y bloque por bloque (`diff.ts`), lo que falta
  para enviar (`drafts.ts`), el formato del texto `**negrita**`, `*cursiva*`, `[texto](enlace)` (`markup.ts`), la
  hora del Táchira al programar (`schedule.ts`) y la revisión de cada archivo de la biblioteca (`media-file.ts`: fotos
  hasta 10 MB, ya achicadas por el navegador, y PDF hasta 20 MB; en Vercel, 4 MB cada uno por `maxMediaBytes`). Subida
  a la biblioteca: `POST /admin/web/biblioteca/subir`. Vista previa: `(vista-previa)/admin/web/vista-previa/[id]`. Las
  puertas son de la base: `can_read_web()`, `can_edit_web()`, `can_publish_web()` y `can_manage_site()`, todas con
  doble factor.
- **La atención** (`/admin/atencion`, `src/app/(panel)/admin/atencion/`, `src/components/attention/`; manual en
  `MANUAL-ATENCION.md`): lee en `src/lib/data/attention.ts`, `attention-export.ts` (el CSV, con `;`, BOM y celdas sin
  fórmulas) y `attention-alerts.ts` (vencidas y quietas, una vez al día por caso desde las 7:00); escribe en
  `src/lib/actions/attention.ts` (las acciones del caso), `attention-admin.ts` (áreas, miembros, categorías, plazos y
  respuestas guardadas) y `attention-email.ts` (los correos de estado, siempre por el buzón). `src/lib/domain/
  attention.ts` es la máquina de estados igual a la de la base, los filtros de la dirección, las palabras de los correos
  y avisos y la definición escrita de cada cifra. Rutas: `GET /admin/atencion/exportar` y `POST
  /admin/atencion/[id]/evidencias`. La migración `20261106100100_atencion_admin.sql` agrega las respuestas guardadas,
  `attention_staff()`, `log_attention_export()`, `request_alerts`, las medianas de las cifras y que solo cuenten las
  consultas fallidas.
- **El ciudadano** (`src/app/(web)/atencion/`, `src/components/participation/`, `src/lib/actions/participation.ts` y
  `participation-core.ts`): el formulario en cuatro pasos con su borrador en el navegador y su versión sin JavaScript;
  `POST /api/atencion/adjuntos`, `POST /atencion/consultar/adjuntos` y `GET /atencion/consultar/archivo/[id]` (la
  galleta `fb_consulta` de 30 minutos, nunca la clave). El sexto tipo sale como «Observación», pero se guarda como
  `acotacion` (la columna `type`, las funciones del ciudadano y el filtro `tipo=acotacion` de la bandeja): solo cambió
  la etiqueta (`REQUEST_TYPES` en `src/lib/participation/input.ts`; R7 en `PENDIENTES.md`).
- **La revisión de seguridad del 06/11** (`SEGURIDAD.md`): `20261106400100_seguridad_web.sql` (la auditoría de
  `web_media` y de los ajustes privados guarda quién y qué campos, no el contenido), `20261106400200_citizen_solo_app.sql`
  (las funciones del ciudadano se niegan si llegan por la Data API), `src/lib/request-body.ts` (tope al leer una
  subida) y `TRUST_PROXY_HEADERS` (de qué cabecera sale la red del visitante fuera de Vercel).
- **Copias y recuperación:** qué se copia y cómo se restaura, en `COPIAS-Y-RECUPERACION.md` (las copias de Supabase no
  traen los archivos, y las claves de la participación viven fuera del repositorio).

## Contenido real en la demo publicada (D-101)
- **Al construir** (`scripts/real-site/`, el «prebuild» de `npm run build`): `settings.ts` decide si se enciende
  (`buildDecision`: sin `DATABASE_URL`, con `web.realSite` en `fb.json`, y `REAL_SITE_CONTENT=1` o la producción de
  Vercel) y lee `web.realSite`. `sources.ts` es la red: cortés, solo GET, con el `PoliteHttp` del importador y un
  tiempo máximo (`Deadline`, `REAL_SITE_BUDGET_S`). Lee WordPress, las fotos, YouTube (la lista de videos largos, luego
  el canal con solo los títulos del programa, luego la API oficial si hay `YOUTUBE_API_KEY`, que va solo en la
  cabecera `X-Goog-Api-Key`) y Drive. `build.ts` arma la foto con las piezas puras del importador
  (`scripts/web-import/`: conversión, datos personales, fotos, direcciones) y con `news.ts`, `youtube.ts`,
  `semanario.ts` y `text.ts`. `cache.ts` guarda lo bajado por dirección y la última copia buena en
  `.next/cache/real-site/`. `prebuild.ts` junta todo sin fallar nunca la construcción y escribe
  `.real-site/snapshot.json` y `.real-site/media/<clave>` (fuera de git).
- **La forma** (`src/lib/web/real-site.ts`): el esquema zod de la foto, los ids deterministas (`realIds`: un uuid del
  sha256 de un nombre), las claves de archivo por sus bytes y `loadRealSnapshot()`, que la lee con `fs` (nunca con un
  import), la valida otra vez y la recuerda. Queda apagada con `DATABASE_URL`, con `VITEST` o con
  `REAL_SITE_CONTENT=0`.
- **Al sembrar la demo** (`createDemoBackend()`, `src/lib/db/index.ts`): con foto, `seedDemo` deja fuera lo inventado
  de la web y los «Casos atendidos» inventados (las solicitudes se quedan), y `seed-parts/web-real.ts` siembra la
  biblioteca, las notas, el Semanario y las emisiones, compone «Inicio» y «El gobernador» desde las páginas de
  `fb.json`, agrega las redirecciones, la procedencia (`web_import_items`) y siete preguntas de la atención, y publica
  todo con `publish_web_item()`. Si esa siembra falla, la demo se siembra otra vez con lo inventado.
- **Al servir:** `src/lib/storage/serve-public-file.ts`, que solo importa `src/app/api/archivos/web/[key]/route.ts`,
  lee `.real-site/media/` cuando la carpeta de la demo no tiene el archivo. `next.config.ts`
  (`outputFileTracingIncludes`) lleva `.real-site/snapshot.json` a cada función y `.real-site/media/` solo a esa
  (comprobado en los `.nft.json` de una construcción real el 07/11). Las claves de la caché de datos llevan
  `real:<fecha de la foto>` o `invented` (`src/lib/web/cache.ts`): una lista inventada nunca se sirve en una demo con
  contenido real.
- **Pruebas:** `tests/unit/real-site-*.test.ts`, contra un sitio oficial, un canal de YouTube (sus listas y su API) y
  un Drive inventados (`tests/fixtures/real-site/`): nada sale a la red.

## Guías, tutoriales y Ayuda (D-42 a D-48)
- **Una sola fuente:** `src/lib/guides/` (un archivo por rol, `shared.ts`, `admin.ts`, `flows.ts`, `sections.ts`,
  `tours.ts`; las anclas `data-tour` en la lista cerrada de `anchors.ts`). De ahí salen `/ayuda`, `/ayuda/[rol]` (tres
  pestañas), `/ayuda/flujos`, `/ayuda/administracion`, las fichas de sección de 360 y los documentos
  `docs/GUIA-POR-ROL.md`, `docs/FLUJOS.md` y `docs/GUIA-ADMINISTRACION.md`, que genera `npm run docs:guides`
  (`scripts/guides-docs.mts`; `tests/unit/guides-docs.test.ts` falla si no están al día).
- **Motor de tutoriales** (`src/components/tour/`): `TourHost` en el layout, con los tutoriales de los roles del menú
  (`toursForRoles`, sigue «Ver como»; sin los de Mensajes para una cuenta con administración). Arranca con
  `?tutorial=<id>` o con el evento `fb:tour:start`; el avance va al teléfono (`device-store`), nunca a la base.
- **«Mi cuenta»** suma «Ayuda y guías» y «Ver el tutorial de esta pantalla» (`HelpMenuItems`). 360 los ofrece con la
  franja de `offer-core.ts` (ver `ASISTENTE.md`).
- **Las guías de la web** (`docs/GUIA-WEB.md`, `MANUAL-ADMIN-WEB.md`, `MANUAL-ATENCION.md` y `FLUJOS-WEB.md`) son para
  el equipo del cliente, que solo ve la app: van escritas a mano y sin nada interno (archivos, comandos, alojamiento,
  versiones, decisiones ni quién programa); cada pantalla, por su nombre. Los diagramas de `FLUJOS-WEB.md` salen de los
  estados y sus motivos (`src/lib/domain/attention.ts` y `20261106000200_participacion.sql`), de lo que hace la persona
  (`20261106000300_citizen.sql` y `src/components/participation/`), de los permisos de la web
  (`20261106000110_web_publica.sql` y `src/lib/actions/web*.ts`) y de lo que trae la versión de prueba
  (`scripts/real-site/` y `src/lib/db/seed-parts/web-real.ts`). Si eso cambia, se cambia el diagrama y se revisa que
  quepa en una hoja A4 vertical con la letra a 7 pt o más.

## Flujo de cada módulo
- **Entrar:** admin invita (`invitations` + cuenta en Auth) → correo → la persona escribe su correo → código → si su
  rol lo exige, doble factor (guía de 3 pasos) → su portada.
- **Agenda (compartida):** el jefe o el despacho crean el evento (datos + fecha privada + ficha técnica + quién graba)
  → lo del jefe queda aceptado; lo del despacho, el jefe lo califica 1–10 y lo acepta o rechaza → redes ve la lista sin
  fecha y arma el storyboard → el jefe lo lee en modo lectura. Mover, cancelar (sin borrar) e historial. Si los dos
  guardan a la vez, se juntan los campos y gana el último, con aviso al otro (`src/lib/domain/agenda-merge.ts`).
- **Fichas:** el IVT (obra) o política (comunitaria) llenan la ficha → «Guardar y avisar al jefe» → aviso «Por ponerle
  fecha» al jefe y al despacho (sin fecha) → `agenda_to_schedule` → «Ponerle fecha» llama a `schedule_ficha()` → evento
  de tipo visita de obra o actividad comunitaria, con la ficha adentro. Cancelar o rechazar devuelve la ficha a la
  lista (`events_source_sync`). Diálogo FAB de la obra con plantilla (`src/lib/domain/obra-dialog.ts`).
- **Municipios:** las fichas comunitarias por municipio y parroquia, con contadores y vencidas
  (`src/lib/domain/report-status.ts`, `territory.ts`).
- **Material:** quien graba sube jefe/dron/apoyo/otros por partes, su storyboard (foto, PDF o escrito) y la nota para
  el editor → aviso a redes (solo el título) → el evento pasa a «Material listo» → biblioteca por día (cuando se marca
  realizado). «Descargar todo» baja uno por uno, a una carpeta o a descargas, con un `LEEME.txt` sin fechas
  (`src/lib/media/download-plan.ts`, `folder-sink.ts`, `one-by-one.ts`).
- **Redes por formato (D-60 a D-78):** redes crea la pieza en su sección (`/redes/<formato>`, «+ Nuevo …» o «¿Qué
  quieres crear?») en el mes abierto → llena su tarjeta (los campos del formato) y sube el final (versión), la portada
  o las láminas → «Generar copies» (`/piezas/[id]#copies`): «Escribir desde la ficha» con fórmula (FAB/PAS/AIDA) en
  tres largos → «Enviar a aprobación» (dice qué falta) → el jefe «Revisar» y vuelve a la tarjeta → la pone en el feed
  del mes → Publicar o «Ya lo publiqué» con link y captura. Tablero (`/redes`): `src/lib/domain/redes-dashboard.ts`.
- **Aprobación:** el jefe (con doble factor) ve video y copies, comenta en un segundo, «Aprobar», «Pedir cambios» o
  «Pedir frase al jefe» → aviso a redes. «Aprobar todas las verdes» de un toque.
- **Tweets:** subir .docx/.txt/.md o pegar → separar (numeración, separadores o líneas en blanco) → validar (largo con
  twitter-text, repetidos, links) → sugerir categoría → repartir en la semana → el jefe aprueba → «Programar» →
  «Copiar» y «Ya lo publiqué» (o la API de X cuando se active) → aviso cuando queden 6 días.
- **Publicar:** pieza aprobada → redes elegidas → validación del video por red en palabras → hora, colaboradores,
  republicación → paquete (video, portada, copy) → «Ya lo publiqué» con link y captura.
- **Resultados:** carga manual o CSV por publicación → «¿A qué hora nos va mejor?» por red y franja (avisa si hay
  pocos datos). Cada publicación con su miniatura: portada → archivo final → captura → ícono
  (`src/lib/domain/thumb-source.ts`).

## Subidas y dónde vive el video
- El navegador lee el archivo con MediaInfo (WASM) — duración, medidas, fps, códecs, peso — y comprime las fotos.
- Crea primero la fila en `media_assets` (RLS decide si puede) y luego sube con **tus-js-client** en partes de 6 MB a
  Supabase Storage (`/storage/v1/upload/resumable`) con su token. Se reintenta solo y se reanuda al volver la señal.
- Buckets: `material` (privado), `covers` (privado), `public-media`, `wardrobe`, `citizen-private`. Políticas de
  Storage enlazadas a `media_assets` (la regla de asignación vale también para los archivos).
- Descarga: `/api/media/[id]` comprueba el permiso con RLS y redirige a una URL firmada de 5 minutos.

### Con Google Drive (`STORAGE_PROVIDER=drive`, `DRIVE.md`, D-28)
- **Conexión:** Administración (con doble factor) conecta una vez en Ajustes → Google Drive (OAuth web con PKCE, solo
  `drive.file`). El permiso de renovación se guarda **cifrado** (AES-256-GCM) en `drive_connection`; el token de acceso
  vive solo en la memoria del servidor (`src/lib/storage/drive/connection.ts`). Cliente REST propio sobre `fetch`, sin
  librerías de Google.
- **Subir:** `createUpload` crea la fila con RLS (`bucket = 'drive'`) y, **después** de esa transacción, el servidor abre
  una subida reanudable en `<carpeta raíz>/<Tipo>/<código del evento>` con el `Origin` de la página. El navegador recibe
  **solo** la URL de esa subida (nunca un token) y manda partes de 4 MiB directo a Google (`src/lib/media/drive-upload.ts`:
  pausa, sigue al volver la señal, retoma tras recargar). «Ya terminé» comprueba en Google tamaño, tipo y marca privada.
  Con `DRIVE_UPLOAD_MODE=proxy`, las partes (1 MiB) pasan por `/api/drive/upload/[id]`.
- **Ver y descargar:** `/api/media/[id]` hace primero la misma consulta con RLS; solo si la fila es visible lee el id de
  Drive (sistema) y trae el archivo con `Range`, **4 MiB por respuesta**, para que el video se pueda adelantar sin pasar el
  límite de 300 s de Vercel. «Descargar» de un archivo de Drive pide tramos seguidos y los guarda en el teléfono (OPFS si
  hay; si no, en memoria) hasta tener el archivo (`src/lib/media/chunk-download.ts`): un video de 180 MB baja aunque la
  línea sea lenta o se corte. Todos los botones de descarga de un archivo de Drive van así (`DownloadLink`), y sin
  `Range` el servidor solo da entero un archivo de hasta 32 MiB. Tope mensual de lo servido
  (`DRIVE_TRANSFER_CAP_GB`): cada respuesta aparta sus bytes antes de mandar (una actualización condicional en
  `drive_transfer`) y devuelve lo no enviado al terminar; además, una parte diaria por persona
  (`drive_transfer_person`, un cuarto del tope; Administración aparte). Si un reproductor no carga un archivo de
  Drive, la página pide el primer byte para mostrar el motivo.
- **Miniaturas:** `/api/media/[id]/thumb` (mismo permiso), copiadas de Drive a `media_thumbs`; nunca un enlace de Google
  en la página. Desde el 27/10 el teléfono hace la miniatura al subir (JPEG de hasta 320 px, `src/lib/media/thumbnail.ts`)
  y la misma ruta la sirve para cualquier almacenamiento.
- **Elegir de Drive** (solo Administración): el Google Picker corre en su navegador con un token de una hora de
  `drive.file`; devuelve solo ids y el servidor lee lo demás de Drive. Las fotos elegidas se guardan limpias (copia sin
  EXIF/GPS). Después, el navegador de Administración lee el formato de los videos (MediaInfo por tramos de
  `/api/media/[id]`) y la plataforma llena solo lo que faltaba (`saveDriveProbe`).
- **Importar lo del Mac:** `npm run drive:import` (`scripts/drive-import/`) sube una carpeta a `<carpeta raíz>/Importado`
  con el mismo cliente OAuth y la misma cuenta; Biblioteca → «Traer lo nuevo de Drive» las registra como «Archivo 001».
- **Nombres** (regla 4): carpeta = tipo + código del evento; archivo = código + nombre de la plataforma. Nunca fecha, hora,
  lugar ni el nombre original.
- **Fallas:** permiso vencido, Drive lleno, archivo borrado o Drive lento → mensaje corto para quien usa la app y un aviso
  a Administración (`drive_down`, `drive_quota`, `drive_missing`). Las filas que ya estaban en Supabase siguen abriendo:
  cada fila se sirve según su `bucket`.

## Migraciones de la ronda del 27–28/10 (en orden)
| Archivo | Qué hace |
|---|---|
| `20261027001500_roles_enum.sql` | Solo agrega `politics` e `ivt` a los roles (va sola: un valor nuevo no se puede usar en el mismo archivo) |
| `20261027001600_six_roles.sql` | Retira Secretaría y Supervisión sin perder historia; solo se dan los seis y admin; `can_approve()`; el jefe en lo de Redes |
| `20261027001650_approval_gate_fixes.sql` | `can_approve()` sin leer la lista del doble factor; esa lista solo cambia con aal2 |
| `20261027001700_fichas.sql` | Las cinco tablas de fichas, historia, territorio, `bump_rev()`, enlaces en `events` y `media_assets` |
| `20261027001900_media_handoff.sql` | Tipos de material nuevos, reglas de material por rol, `recording_notes` |
| `20261027001950_fichas_media_fixes.sql` | Nadie une a mano un evento con una ficha; códigos de ficha por la base; `report_has_live_event()` |
| `20261027002000_shared_agenda.sql` | Agenda compartida: `can_manage_agenda()`, `schedule_ficha()`, `agenda_to_schedule`, cancelar, `rev`, `event_history()` |
| `20261027002050_agenda_fixes.sql` | «Marcar realizado» solo quien ve la fecha; decidir con `can_approve()`; `agenda_last_writers()` |
| `20261027002100_obra_documents.sql` | Los documentos de una obra, solo para sus roles |
| `20261028002100_privacy_hardening.sql` | `visit_obra_ficha()`, `text_has_phone()`, `text_has_datetime()`, `done_on` cerrado por columna (D-40) |
| `20261028002200_round_review_fixes.sql` | Admin nunca con jefe o despacho; lista del doble factor fija; contactos comunitarios sin admin; más teléfonos rechazados; código del evento por la base (D-41) |
| `20261028002300_report_files_notes.sql` | Los documentos de un reporte, solo para política, despacho y jefe (admin ve las fotos y no sube); la historia de un reporte sin teléfonos (D-41) |
| `20261028002350_boss_grant.sql` | Tercera vuelta: el rol de jefe solo lo da el sistema; aviso al jefe por cada rol del equipo que da una persona (D-58). En `fb-dev` desde el 29/10 |
| `20261028002400_internal_chat.sql` | Tercera vuelta: Mensajes (seis tablas, sus funciones y RLS), `text_has_concrete_datetime()` (E1), nada para anon ni en Realtime (D-49 a D-57, D-59). En `fb-dev` desde el 29/10 |
| `20261029000100_redes_formatos.sql` | Ronda 4: Redes por formato, meses y feed: `pieces.format` y lo de la tarjeta, `content_months`, `feed_slots`, `piece_details`, `piece_notices`; las funciones del feed y de los meses; lo que vuelve al jefe; retención por diseño desaprobado; eliminar solo el jefe (D-60 a D-78). En `fb-dev` desde el 30/10 |
| `20261029090000_chat_channels.sql` | Ronda 5: Mensajes como canales que arma el jefe, el jefe en todos por la base, sin aviso ni «Quién habla con quién»; lo que había queda en canales archivados (D-79 a D-88). En `fb-dev` desde el 30/10 |
| `20261106000050_web_roles_enum.sql` | Web pública: los roles `web_publisher`, `attention_coordinator` y `auditor` (D-93). No está en `fb-dev` |
| `20261106000110_web_publica.sql` | Los seis roles de la web y la atención se dan; puertas con doble factor del token; territorios, contenido, versiones, biblioteca, ajustes, redirecciones; funciones de publicar; lo que lee anon; baldes de Storage (D-90, D-93, D-96). No está en `fb-dev` |
| `20261106000200_participacion.sql` | Áreas, categorías, solicitudes y todo alrededor, la máquina de estados y las funciones del equipo, auditoría sin contenido (D-92). No está en `fb-dev` |
| `20261106000300_citizen.sql` | El esquema `citizen`: lo que hace el ciudadano sin cuenta, solo para anon (D-96). No está en `fb-dev` |
| `20261106100100_atencion_admin.sql` | La atención: respuestas guardadas (`request_reply_templates`, `can_answer_requests()`), a quién se le puede dar un caso (`attention_staff()`), el registro de cada exportación (`log_attention_export()`), la memoria de los avisos (`request_alerts`), medianas en las cifras y solo las consultas fallidas cuentan para el límite. No está en `fb-dev` |
| `20261106300100_web_importador.sql` | De dónde vino cada borrador y foto importados de la web vieja (`web_import_items`, `web_import_media`, lectura con RLS para el equipo de la web, sin escritura por la API) y `guard_web_item_ready`: no se publica «[Por escribir]» ni las marcas de datos quitados (D-97). No está en `fb-dev` |
| `20261106400100_seguridad_web.sql` | Revisión del 06/11: la auditoría de `web_media` y de los ajustes privados del sitio guarda quién, cuándo y qué campos, nunca el contenido (`SEGURIDAD.md`). No está en `fb-dev` |
| `20261106400200_citizen_solo_app.sql` | Revisión del 06/11: las funciones del ciudadano con límite se niegan si las llaman por la Data API de Supabase (`SEGURIDAD.md`). No está en `fb-dev` |

## Tareas programadas
- `/api/cron/tick` (con `CRON_SECRET`): aviso de tweets por acabarse (una vez al día) y publicaciones vencidas
  (recordatorio en modo manual; en modo API, publica con el adaptador). Con Drive, además, marca como fallidas las
  subidas abandonadas hace más de 8 días (Google cierra la subida a la semana). La web: marca «Publicado» lo programado
  cuya hora llegó (`web_items_flip_scheduled()`; el público ya lo ve por `publish_at`), borra las ventanas viejas de los
  límites (`prune_rate_limits()`) y vuelve a revisar los archivos que quedaron en cuarentena (con `ATTACHMENT_SCANNER`).
  La atención: desde las 7:00 del Táchira, los avisos de casos vencidos o sin movimiento (a la coordinación y a su
  responsable, por `notify()`, nunca por correo), una vez al día por caso (`request_alerts`).
- Vercel Cron diario (`vercel.json`). Para cada 5 minutos: `pg_cron` + `pg_net` en Supabase:
  ```sql
  select cron.schedule('fb-tick', '*/5 * * * *', $$
    select net.http_get(url := 'https://<dominio>/api/cron/tick',
                        headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'))
  $$);
  ```

## Integraciones (todas detrás de una interfaz, con modo manual o simulado)
| Integración | Dónde | Estado |
|---|---|---|
| IA (Claude) | `src/lib/ai` | Lista; apagada sin clave (`AI_ENABLED`, `AI_MODEL`, tope mensual) |
| Publicar | `src/lib/publish` | `manual` y `simulated`; Meta/X/TikTok/YouTube cuando aprueben |
| Correo | `src/lib/email` | Resend; modo buzón por defecto |
| Métricas | `src/lib/actions/results.ts` | Manual y CSV; APIs en fase 2 |
| Drive del cliente | `src/lib/storage/drive`, `scripts/drive-import` | Lista detrás de `STORAGE_PROVIDER=drive` (OAuth con la cuenta del cliente, `drive.file`); `DRIVE_FAKE=1` para probar sin Google |
