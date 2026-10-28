# Arquitectura

Actualizado: 25/10/2026.

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
│   ├── app/(panel)/        # Hoy, agenda, eventos, piezas, aprobar, tweets, publicar, resultados, biblioteca, jefe, ajustes
│   ├── app/api/            # Descarga firmada (y por tramos desde Drive), miniaturas, subida demo (TUS), Drive (conexión, partes por la plataforma), cron
│   ├── components/         # UI (tokens), shell, agenda, media, tweets
│   └── lib/                # db, auth, actions (server actions), data (lecturas), domain (lógica pura), ai, publish, email
└── tests/                  # unit (Vitest), rls (Vitest), e2e (Playwright 360 px + axe)
```

## Tablas (migraciones en `supabase/migrations`)
| Grupo | Tablas | Notas |
|---|---|---|
| Personas | `profiles`, `user_roles`, `invitations` | Rol en la base, nunca en el token. Trigger en `auth.users` crea el perfil y aplica la invitación |
| Configuración | `app_settings`, `categories` | Claves: `app.timezone`, `brand`, `municipalities`, `tweets.slots`, `tweets.per_day`, `tweets.low_stock_days`, `security.mfa_roles`, `publishing.enabled`, `upload.max_mb`, `publishing.default_collaborators` |
| Agenda | `events`, `event_schedule` (privada), `event_brief`, `event_assignments`, `storyboards`, `storyboard_blocks`; vista `event_calendar` (`security_invoker`) | Ver «Regla de fecha y hora» |
| Material y piezas | `media_assets`, `pieces`, `piece_versions`, `copy_formulas`, `copies` | `copies` único por (pieza, largo) |
| Revisión | `reviews`, `review_comments` (con segundo), `voice_line_requests` | Aprobación solo por `review_piece()` |
| Tweets | `tweet_batches`, `tweets` | Trigger `guard_tweet` |
| Publicación | `publications` (con `republish_of`, `collaborators`, `validation`), `publication_metrics` (fotos en el tiempo), `network_specs` | Trigger `guard_publication` |
| Avisos | `notifications`, `outbox`, `jobs`, `ai_usage` | Escritos por el servidor |
| Auditoría | `audit_log` | Solo se agrega; trigger en todas las tablas de negocio |
| Google Drive | `drive_connection`, `drive_folders`, `media_drive`, `media_thumbs`, `drive_transfer`; función `drive_status()` | Solo el servidor (RLS activo, sin políticas, sin permisos para los roles de la API). Un archivo de Drive es una fila normal de `media_assets` con `bucket = 'drive'` |

Índices en las columnas de búsqueda y orden (estado, fechas, claves foráneas). Borrado: columna `deleted_at` y
trigger `guard_soft_delete` (solo administración).

## Roles y RLS por tabla (resumen)
Funciones: `has_role`, `has_any_role`, `is_staff`, `is_content_team` (admin, redes, supervisión, jefe), `mfa_ok`,
`can_see_event`, `can_see_schedule`, `is_assigned`.

| Tabla | Leer | Escribir |
|---|---|---|
| `events` | admin, jefe, despacho, redes, supervisión; grabación solo asignados; secretaría solo los suyos | crear: admin, despacho, secretaría; cambiar: por columnas (trigger `guard_event_update`: jefe → prioridad y decisión; redes → estado de trabajo) |
| `event_schedule` | admin, jefe, despacho (con aal2); grabación sus asignados | admin, despacho (con aal2) |
| `event_brief` | como `events` | admin, despacho |
| `storyboards`, bloques | como `events` | admin, redes |
| `media_assets` | con su evento | admin, redes; grabación solo crudo (jefe, dron, apoyo, otros) en sus eventos; el jefe solo audios |
| `pieces`, versiones, copies | equipo de contenido | admin, redes; aprobar solo supervisión (función) |
| `tweets` | equipo de contenido | admin, redes; aprobar solo supervisión |
| `publications`, métricas | equipo de contenido | admin, redes; publicada/programada solo si la pieza está aprobada |
| `audit_log`, `outbox` | admin (con aal2) | nadie (trigger / servidor) |

## Regla de fecha y hora (regla 4)
1. Fecha, hora, duración, dirección exacta, cómo llegar y contactos: **solo** en `event_schedule`.
2. Su RLS: `can_see_schedule()` = `mfa_ok()` y (admin, jefe o despacho, o grabación asignada).
3. La vista `event_calendar` es `security_invoker`: para redes devuelve cero filas.
4. Al marcar «realizado», `mark_event_done()` (security definer) copia solo el **día** a `events.done_on`. Esa columna
   está cerrada para la API: el día sale de `event_done_on()` (Redes y quien ve la fecha; política no, D-40).
5. `event_schedule` no se publica en Realtime; la auditoría solo la lee administración.
6. Correos, avisos, rutas de archivos, nombres de descarga y búsquedas no usan esas columnas.
7. Probado en `tests/rls` y en `tests/e2e/flows.spec.ts` (redes no ve horas en la lista ni en la ficha).

## Flujo de cada módulo
- **Entrar:** admin invita (`invitations` + cuenta en Auth) → correo → la persona escribe su correo → código → si su
  rol lo exige, doble factor (guía de 3 pasos) → su portada.
- **Agenda:** despacho crea el evento (datos + fecha privada + ficha + quién graba) → el jefe califica 1–10 y acepta
  → redes ve la lista sin fecha y arma el storyboard → el jefe lo lee en modo lectura.
- **Material:** quien graba sube jefe/dron/apoyo/otros por partes → aviso a redes → el evento pasa a «Material listo»
  → biblioteca por día (cuando se marca realizado) con «Descargar todo».
- **Piezas:** redes crea la pieza → sube el final (versión) y la portada → «Escribir desde la ficha» con fórmula
  (FAB/PAS/AIDA) en tres largos → «Enviar a aprobación».
- **Aprobación:** supervisión ve video y copies, comenta en un segundo, «Aprobar», «Pedir cambios» o «Pedir frase al
  jefe» → aviso a redes.
- **Tweets:** subir .docx/.txt/.md o pegar → separar (numeración, separadores o líneas en blanco) → validar (largo con
  twitter-text, repetidos, links) → sugerir categoría → repartir en la semana → supervisión aprueba → «Programar» →
  «Copiar» y «Ya lo publiqué» (o la API de X cuando se active) → aviso cuando queden 6 días.
- **Publicar:** pieza aprobada → redes elegidas → validación del video por red en palabras → hora, colaboradores,
  republicación → paquete (video, portada, copy) → «Ya lo publiqué» con link y captura.
- **Resultados:** carga manual o CSV por publicación → «¿A qué hora nos va mejor?» por red y franja (avisa si hay
  pocos datos).

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
  en la página.
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
