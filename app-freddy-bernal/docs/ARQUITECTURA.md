# Arquitectura

Actualizado: 28/10/2026 (seis roles, fichas, agenda compartida y entrega de Grabación: migraciones
`20261027001500` a `20261028002200`).

## Piezas
- **Next.js 16 (App Router), React 19, TypeScript estricto, Tailwind 4.** Server Components para leer y server
  actions para escribir. `experimental.useOffline` deja en espera las navegaciones y acciones sin señal.
- **Postgres (Supabase)** con RLS en todas las tablas. El servidor se conecta por el *pooler* y cada consulta de una
  persona corre como ella (`src/lib/db/core.ts` → `asUser`). Las tareas sin persona (correos, cron) usan `asSystem`.
- **Demostración y pruebas:** PGlite (Postgres en WASM) con las **mismas migraciones** + `supabase/shim/` (imita el
  esquema `auth` de Supabase).
- **Supabase Auth** (correo + código de 6 dígitos, TOTP), **Storage** (subida TUS por partes), **Realtime** (listo en
  la publicación; la UI se refresca al actuar).
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
├── scripts/                # Cargar la configuración del cliente, crear el primer admin, importar videos a Drive (drive-import/)
├── supabase/
│   ├── migrations/         # SQL versionado (lo que va a Supabase)
│   └── shim/               # Solo demo/pruebas: esquema auth falso y tablas de login demo
├── src/
│   ├── app/(auth)/         # Entrar, doble factor, sin acceso
│   ├── app/(panel)/        # Hoy, jefe, agenda, eventos, obras, municipios, reportes, redes, piezas, aprobar, tweets, publicar, resultados, biblioteca, ajustes
│   ├── app/api/            # Descarga firmada (y por tramos desde Drive), miniaturas, subida demo (TUS), Drive (conexión, partes por la plataforma), cron
│   ├── components/         # UI (tokens), shell, agenda, media, tweets
│   └── lib/                # db, auth, actions (server actions), data (lecturas), domain (lógica pura), ai, publish, email
└── tests/                  # unit (Vitest), rls (Vitest), e2e (Playwright 360 px + axe)
```

## Tablas (migraciones en `supabase/migrations`)
| Grupo | Tablas | Notas |
|---|---|---|
| Personas | `profiles`, `user_roles`, `invitations` | Rol en la base, nunca en el token. Trigger en `auth.users` crea el perfil y aplica la invitación |
| Configuración | `app_settings`, `categories` | Claves: `app.timezone`, `brand`, `municipalities`, `tweets.slots`, `tweets.per_day`, `tweets.low_stock_days`, `security.mfa_roles`, `publishing.enabled`, `upload.max_mb`, `publishing.default_collaborators`, `parishes` (vacío hasta la lista oficial) |
| Agenda | `events`, `event_schedule` (privada), `event_brief`, `event_assignments`, `storyboards`, `storyboard_blocks`; vistas `event_calendar` y `agenda_to_schedule` (`security_invoker`) | Ver «Regla de fecha y hora». Desde el 27/10 `events` tiene `origin` (despacho, jefe, política, IVT), `kind` (evento, visita de obra, actividad comunitaria), cancelar sin borrar (`cancelled_at/by`, `cancel_reason`), `rev` y `updated_by`, y la ficha de la que nació (`obra_ficha_id` o `community_report_id`, a lo sumo una). `rev` también en la fecha, la ficha técnica y el storyboard |
| Fichas (27/10) | `obra_fichas` (O-0001, IVT), `obra_ficha_private`, `community_reports` (R-0001, política), `community_report_private`, `ficha_updates` | Lo de terceros (nombres, teléfonos, dirección) solo en las `*_private`, con doble factor. `ficha_updates` es la historia: solo se agrega y de las privadas guarda solo el nombre del campo. «No aplica» / «Por confirmar» en la columna `marks` |
| Material y piezas | `media_assets`, `recording_notes`, `pieces`, `piece_versions`, `copy_formulas`, `copies` | `copies` único por (pieza, largo). Un archivo tiene un solo dueño: un evento, una ficha de obra o un reporte. Tipos nuevos: `storyboard`, `before`, `progress`, `after`, `document`. `recording_notes`: la nota para el editor y el storyboard escrito de Grabación |
| Revisión | `reviews`, `review_comments` (con segundo), `voice_line_requests` | Aprobación solo por `review_piece()` |
| Tweets | `tweet_batches`, `tweets` | Trigger `guard_tweet` |
| Publicación | `publications` (con `republish_of`, `collaborators`, `validation`), `publication_metrics` (fotos en el tiempo), `network_specs` | Trigger `guard_publication` |
| Avisos | `notifications`, `outbox`, `jobs`, `ai_usage` | Escritos por el servidor |
| Auditoría | `audit_log` | Solo se agrega; trigger en todas las tablas de negocio |
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
`text_has_datetime()` (las mismas de la app).

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
| `ficha_updates` | quien ve la ficha | la escribe la base; a mano, solo notas propias |
| `media_assets` | con su evento (`can_see_event`); sin dueño, el equipo de contenido; de una ficha, quien ve la ficha (Redes y Grabación solo fotos del antes y del avance de su visita, nunca documentos) | admin, redes y jefe cualquier tipo sin ficha; grabación crudo y storyboard en sus eventos; fotos de obra: admin, jefe, despacho, IVT; evidencia de reporte: admin, jefe, despacho, política |
| `recording_notes` | admin, jefe y redes con el evento; grabación en los suyos | la propia: el jefe, o grabación en un evento asignado |
| `pieces`, versiones, copies | equipo de contenido | admin, redes, jefe; aprobar solo `can_approve()` (función) |
| `tweets` | equipo de contenido | admin, redes, jefe; aprobar solo `can_approve()` |
| `publications`, métricas | equipo de contenido | admin, redes, jefe; publicada/programada solo si la pieza está aprobada |
| `user_roles`, `invitations` | admin (y cada quien sus roles) | admin con aal2; nadie se da roles a sí mismo y una cuenta no junta admin con jefe o despacho (`guard_role_mix`, D-41) |
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
- **Piezas:** redes crea la pieza → sube el final (versión) y la portada → «Escribir desde la ficha» con fórmula
  (FAB/PAS/AIDA) en tres largos → «Enviar a aprobación».
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

## Tareas programadas
- `/api/cron/tick` (con `CRON_SECRET`): aviso de tweets por acabarse (una vez al día) y publicaciones vencidas
  (recordatorio en modo manual; en modo API, publica con el adaptador). Con Drive, además, marca como fallidas las
  subidas abandonadas hace más de 8 días (Google cierra la subida a la semana).
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
