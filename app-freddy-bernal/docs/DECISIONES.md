# Decisiones

Cada decisión: qué, por qué y cómo se cambia. Las que hay que confirmar con Hillary o Juan dicen **Confirmar**.

## D-01. Una sola capa de datos en SQL, con RLS siempre activo
- **Qué:** el servidor consulta Postgres directamente; cada consulta de una persona corre dentro de una transacción
  con `set local role authenticated` y sus datos de sesión (`request.jwt.claims`), igual que hace la API de Supabase.
- **Por qué:** las mismas políticas RLS protegen la app, la API de Supabase y las pruebas. Y permite una
  **demostración sin cuentas**: la base en memoria (PGlite) corre las mismas migraciones.
- **Cómo se cambia:** `src/lib/db/index.ts`. Con `DATABASE_URL` usa Supabase; sin ella, la demostración.

## D-02. Modo demostración en memoria
- **Qué:** sin `DATABASE_URL`, la app arranca con datos inventados en una base en memoria. En Vercel, cada servidor
  tiene su copia y se reinicia sola: lo que se escribe puede perderse. Los archivos subidos van al disco temporal.
- **27/10 («la ficha completa del evento da error»):** la lista y la ficha podían salir de servidores distintos, y cada
  copia tenía otros ids, así que la ficha decía «no encontrado». Ahora la siembra da los mismos ids en todos los
  servidores (`src/lib/db/stable-ids.ts`) y «no encontrado» sale en español. Lo que alguien crea en la demo sigue
  viviendo solo en el servidor donde lo creó: para que Hillary pruebe creando cosas hace falta la base real.
- **Por qué:** para probar el viernes sin esperar las cuentas.
- **Cómo se cambia:** poner `DATABASE_URL` (Supabase) en Vercel.

## D-03. Sin «Cache Components» de Next 16
- **Qué:** `cacheComponents: false`. Todo el panel es por persona y se genera en cada pedido.
- **Por qué:** con datos privados por rol, el caché agrega riesgo y complejidad sin beneficio.
- **Cómo se cambia:** `next.config.ts`.

## D-04. Fecha, hora y lugar exacto en una tabla aparte
- **Qué:** `event_schedule` guarda fecha, hora, duración, **dirección exacta, cómo se llega y contactos del sitio**.
  Redes ve en `events` el nombre del sitio y el municipio («a dónde se va»), sin fecha.
- **Por qué:** «cómo se llega» y los contactos pueden revelar el lugar exacto. La regla 4 se cumple en la base.
- **Cómo se cambia:** mover columnas entre `events` y `event_schedule` (migración nueva) y ajustar las pruebas.

## D-05. Quien graba ve fecha y hora de SUS eventos asignados — **Confirmar con Hillary**
- **Por qué:** tiene que saber cuándo y dónde estar (PENDIENTES #25).
- **Cómo se cambia:** función `can_see_schedule` en `20261023000200_agenda.sql`.

## D-06. Al marcar «realizado» se revela solo el día
- **Qué:** `mark_event_done` copia el día (sin hora) a `events.done_on`. Así el material entra al registro por día.
- **Quién puede:** administración, despacho, el jefe y quien grabó.
- **Quién lo ve (28/10/2026, D-40):** Redes (la biblioteca por día) y quien ve la fecha; política nunca. La columna
  está cerrada para la API y el día sale de `event_done_on()`.

## D-07. Aprueba supervisión; lo rojo, el jefe (ni administración) — ver D-23
- **Qué:** aprobar piezas verdes y amarillas y los tweets es de `supervisor`; las piezas en **rojo** las aprueba el
  **jefe**. Siempre con doble factor y por `review_piece`. Administración nunca aprueba. Una versión nueva o un copy
  cambiado vuelve a revisión; editar un tweet aprobado lo devuelve a borrador.
- **Por qué:** «Nada se publica sin aprobación» y así queda claro quién aprobó. Si Fernando no está, administración le
  da el rol a otra persona (queda en el registro).

## D-08. Doble factor obligatorio para administración, jefe, despacho y supervisión
- **Qué:** lista en el ajuste `security.mfa_roles` (también operadores de denuncias y ayudas, fase 3). Sin `aal2`, la
  base les niega la agenda, la aprobación y los roles. Redes y grabación, antes de abrir la web (PENDIENTES #22).
- **Cómo se cambia:** `config/clients/fb.json` (`mfaRoles`) o el ajuste en la base.

## D-09. Un rol «redes», un usuario por persona
- **Por qué:** saber quién hizo qué y el doble factor de cada una (PENDIENTES #19). — **Confirmar**.

## D-10. Texto oscuro sobre el color de la marca
- **Qué:** sobre el color principal (antes naranja, ahora oliva, ver D-21) el texto va casi negro (#111111), y para
  textos en ese color se usa un tono más oscuro (`--c-accent-ink`).
- **Por qué:** blanco sobre naranja da 3,1:1 y sobre oliva 3,9:1: no pasan AA y al sol se leen mal.
- **Cómo se cambia:** `src/app/tokens.css`.

## D-11. Publicación manual en la fase 1
- **Qué:** se valida el video por red, se descarga el paquete y se marca «Ya lo publiqué» con link y captura.
  `PUBLISHING_ENABLED=false`. Los adaptadores reales esperan los permisos de cada red.
- **Por qué:** regla 8 y los tiempos de aprobación de Meta, TikTok y X.

## D-12. Video en Supabase Storage, por partes (TUS)
- **Qué:** subida por partes de 6 MB, que sigue sola al volver la señal y se reanuda si se elige el mismo archivo.
  Tope configurable (`upload.max_mb`, 10 GB por defecto).
- **Por qué:** PENDIENTES #18 recomienda la plataforma para el video y el Drive solo para leer. Si las descargas
  cuestan mucho, se cambia a Cloudflare R2 detrás de la misma ruta de descarga.
- **Actualizado (25/10):** con `STORAGE_PROVIDER=drive` los archivos nuevos van al Google Drive del cliente (D-28). Sin
  la variable, esto sigue igual.

## D-13. Nombres de archivo sin fecha
- **Qué:** las rutas son `<evento>/<uuid>.<ext>` y la descarga se llama `<código>-<tipo>-<n>.<ext>`. No se guarda el
  nombre original del archivo (podría traer la fecha).

## D-14. Tareas programadas con Vercel Cron (diario) + pg_cron
- **Qué:** `/api/cron/tick` hace el aviso de tweets y los recordatorios de publicación. En Vercel Pro se puede correr
  cada hora; en Hobby, una vez al día. Para publicar a la hora exacta (fase 2), `pg_cron` + `pg_net` llaman al mismo
  endpoint cada 5 minutos con `CRON_SECRET`.

## D-15. Región de Supabase y Vercel: EE. UU. Este — **Juan decide**
- **Por qué:** es la más cercana a Venezuela entre las comunes (`us-east-1` / `iad1`). Las funciones de Vercel van en la
  misma región que la base (`preferredRegion` o ajuste del proyecto).

## D-16. Tweets: 2 o 3 por día, en 3 franjas (del diagnóstico)
- **Qué:** franjas 8–10, 12–14 y 19–21 (hora del Táchira); alterna 3 y 2 por día y, con 2, usa la primera y la última
  franja (mañana y noche); nunca dos en la misma hora ni minutos en :00. Aviso con 6 días o menos. Aprobado por Juan
  (24/10) con los horarios del Diagnóstico 360; antes eran 4 o 5 en 5 franjas.
- **Mejores horas por red** (`publishingWindows` → ajuste `publishing.windows`): se muestran al programar y avisan si la
  hora o el día rinden mal (TikTok: 22–24 y 7–12; evitar 12–17 y el sábado). Solo avisan, no bloquean.
- **Cómo se cambia:** Ajustes > Horarios de tweets (las franjas); las mejores horas, en `config/clients/fb.json`.

## D-17. Copies sin IA por defecto
- **Qué:** con `AI_ENABLED=false` los copies salen de la ficha con una plantilla por fórmula, sin inventar cifras, y
  dicen qué dato falta. Con la clave, la IA escribe siguiendo las mismas reglas; el modelo va en `AI_MODEL`.

## D-18. Next 16 «proxy» solo refresca la sesión
- **Qué:** `src/proxy.ts` no decide permisos. Las páginas llaman a `requireSession()` y la base aplica RLS.

## D-21. Paleta desde la estrategia de marca, con el **oliva como color principal**
- **Qué:** se quitó el azul del panel (`--c-slate` #182a32 → #111111, el Negro de la marca) y el anillo de foco pasa a
  #c94700 (4,5:1 sobre el fondo; el Naranja claro #FD943C daba 2,07:1 y no cumplía AA). Naranja #FE5A03, oliva #7F8630
  y negro #111111 ya coincidían con los tokens. Montserrat ya era la letra.
- **Por qué:** llegó la paleta en el Diagnóstico Digital 360 (24/10); la lámina 33 excluye el azul.
- **Color principal: oliva** (Juan, 24/10/2026), la variante nueva de la marca. Botones y lo activo en #7F8630 con
  texto #111111 (4,8:1); textos en oliva #5F6524 (5,8:1); foco #5F6524. En modo oscuro, oliva claro #B4BB5C. El naranja
  ya no se usa en la interfaz. Íconos de la app: «FB» en blanco sobre oliva (como el logo «blanco sobre oliva»).
- **Falta:** el logo en vector (ver `docs/DIAGNOSTICO-360.md`).
- **Cómo se cambia:** `src/app/tokens.css` y `emails/layout.tsx`.

## D-22. Reglas de redacción medidas, aplicadas sin esperar
- **Qué:** la IA nunca abre con «En el marco de», «Siguiendo el legado de», «Bajo la orientación de», «Seguimos
  trabajando» ni «Seguimos brindando»; las pistas de AIDA (atención) y FAB (beneficio) piden gancho en 100 caracteres y
  una cifra a la vez con su fuente.
- **Por qué:** es la corrección de mayor impacto medido en el diagnóstico (m10) y solo quita opciones.
- **Ojo:** las fórmulas se siembran con «no sobrescribir»: si ya se sembró `fb-dev`, el cambio se hace en Ajustes.

## D-20. Atajos de prueba en la demostración (entrar con un toque, sin doble factor)
- **Qué:** con la base de demostración, los usuarios de prueba (`@demo.test`) entran con un toque y su sesión cuenta
  como verificada con doble factor. Se apaga con `DEMO_SHORTCUTS=false`.
- **Por qué:** Juan pidió (24/10) poder entrar y revisar todo mientras se prueba.
- **Límite:** `demoShortcuts()` exige que **no** haya `DATABASE_URL`; con datos reales el doble factor sigue obligatorio
  y el atajo no responde. Las pruebas de punta a punta corren el flujo completo en un servidor y los atajos en otro.

## D-19. El repositorio es `fbvenezuela/Gestionapp` y la app vive en `app-freddy-bernal/`
- **Qué:** el prompt proponía `fb-operaciones-360`; Juan creó este repositorio y subió aquí la carpeta. En Vercel, el
  «Root Directory» del proyecto es `app-freddy-bernal`.
- **Cómo se cambia:** se puede renombrar el repositorio en GitHub sin tocar el código.

## D-23. Semáforo de aprobación y lo que publica el jefe por su cuenta
- **Qué:** quien manda una pieza a aprobar elige el nivel:
  - **Verde** (rutina): la aprueba supervisión, en el día; puede aprobar todas las verdes de una vez.
  - **Amarillo** (normal, por defecto): la aprueba supervisión; plazo 60 minutos.
  - **Rojo** (sensible: política, crisis, aclaratorias): **solo el jefe** la aprueba; plazo 30 minutos. Le aparece en
    su inicio («Te toca aprobar») y le llega un correo. Supervisión puede pedir cambios, no aprobarla.
- **La falta de respuesta no es aprobación:** al vencer el plazo la pieza sigue sin aprobar, sale en «Trancado» y se
  avisa otra vez (supervisión y administración; en rojo, también el jefe). Nunca se publica sola.
- **Lista de chequeo** antes de aprobar (cifras con fuente, sin fecha ni hora, se ve y se oye bien, copies revisados).
- **Quién cambia el nivel:** supervisión, el jefe o administración. Una pieza en rojo solo baja con el jefe o
  administración. Todo en la base (`guard_piece_status`, `review_piece`, `set_review_level`) y en el registro.
- **Lo espontáneo del jefe** (un video que subió él): no pasa por aprobación porque ya salió. Redes lo **registra
  después** con su link en Publicar → «Registrar lo que publicó el jefe», para que cuente en resultados. La base solo
  acepta esos registros ya publicados, con link, sin pieza y nunca por API.
- **Por qué:** Juan dijo «lo que consideres mejor» (24/10). El semáforo viene del Plan del diagnóstico; se mantiene
  «nada se publica sin aprobación» (regla del prompt).
- **Plazos:** `reviewDeadlinesMin` en `config/clients/fb.json` (ajuste `review.deadlines_min`).
- **Lo que sale es exactamente lo aprobado** (revisión del 24/10, todo en la base):
  - Cada pieza tiene un número de **revisión** que sube con cada versión nueva o copy cambiado; quien aprueba firma la
    revisión que vio y, si la pieza cambió mientras tanto, la base rechaza la aprobación (también al aprobar verdes en
    grupo: las que cambiaron se saltan).
  - Un copy no se pasa a otra pieza ni a otro largo; cambiar uno aprobado devuelve la pieza a revisión. Una versión no
    se vuelve atrás. Subir a rojo una pieza aprobada por supervisión la devuelve a revisión (la aprueba el jefe).
  - Una publicación se programa o se marca publicada solo con el copy aprobado de esa red y la portada de la versión
    aprobada; después no cambia de pieza, red, formato, copy, portada ni origen. Si la pieza deja de estar aprobada, lo
    programado vuelve a borrador con el motivo. El paquete usa la versión aprobada.
  - Un archivo terminado no se reemplaza (ni en la tabla ni en Storage): un archivo distinto es una versión nueva.
  - Redes puede subir el nivel, nunca bajarlo, después de la primera revisión.

## D-24. Voz y cierre se eligen por pieza
- **Qué:** en el editor de copies, además de la fórmula, se elige la **voz** (el jefe en primera persona, que abre con su
  saludo, o institucional, que abre con el hecho) y el **cierre** («Seguimos trabajando», «Por amor al Táchira»,
  pregunta a la comunidad, acción con destino o sin cierre). Se guarda en la pieza y lo respeta la plantilla y la IA.
- **Por qué:** Juan: primera persona «no todos, depende de lo que hagamos»; «Por amor al Táchira» «no siempre».
- **Fórmulas nuevas:** GBA y DATO piden un destino en el cierre; CITA usa una frase textual del storyboard (sin cifras:
  las cifras van en «Datos y cifras» con su fuente) y nunca la inventa.

## D-25. Avisos al teléfono gratis (Web Push), con horas de silencio
- **Qué:** quien quiere, toca «Activar avisos» en Mi perfil y su teléfono recibe los avisos aunque la app esté cerrada.
  En iPhone solo con la app agregada a la pantalla de inicio (iOS 16.4+); la app explica los pasos. Sin costo: no hace
  falta cuenta de Apple ni Firebase. Las claves se derivan de `SESSION_SECRET` si no se ponen `VAPID_*`.
- **Reglas:** el texto nunca lleva fecha, hora ni lugar (se limpia antes de enviar); horas de silencio por persona (por
  defecto 21:00–07:00) salvo los críticos; como mucho uno por tipo cada 10 minutos; al salir de la app, ese teléfono
  deja de recibir; a quien se desactiva se le borran sus teléfonos. `PUSH_ENABLED=false` los apaga.
- **Resumen diario por correo** para quien lo marque en Mi perfil (solo conteos y títulos, sin fechas).
- **Tarea cada 5 minutos sin pagar:** `pg_cron` + `pg_net` en Supabase llaman `/api/cron/tick`; la dirección y la clave
  salen de Vault (`app_url`, `cron_secret`), nunca de la migración. En Vercel Hobby sigue el aviso diario.
  Cada paso de la tarea va por su cuenta: si uno falla, los demás corren igual y el próximo turno lo vuelve a intentar.
  Un aviso que se reintenta nunca repite el correo (lo impide la clave del buzón de salida) ni vuelve a sonar en el
  teléfono, pero sí manda los correos que faltaron por una falla antes de guardarlos en el buzón. Un correo guardado
  que Resend rechazó queda «failed» en el buzón y por ahora nadie lo reenvía (`PENDIENTES.md`). «Venció el plazo» se
  marca después de avisar y solo en esa ronda de revisión.
- **Cerrar sesiones:** «Cerrar sus sesiones», «Reiniciar doble factor» y desactivar a alguien también borran sus sesiones
  de Supabase (`auth.sessions`: el token de renovación deja de servir) y sus teléfonos suscritos (disparador en la base,
  migración `20261025001000_revoke_push.sql`). Cada pedido mira cuándo empezó su sesión con una función de la base
  (`public.auth_session_started`, migración `20261025001100_session_started.sql`, corre con los permisos de quien
  aplica las migraciones). Si esa consulta falla, decide la hora del token y lo anota en el registro del servidor:
  nunca se cae el sitio. Borrar las sesiones necesita DELETE sobre `auth.sessions` (por confirmar en `fb-dev`; `npm run
  db:first-admin` avisa si falta); si falla, el cambio queda hecho, el doble factor se quita igual y la app lo dice.

## D-26. El asistente del equipo «360»
- **Qué:** un chat en todas las pantallas, adaptado del manual del asistente Cemi (ver `docs/ASISTENTE.md`). Solo para el
  equipo; contesta con lo que cada quien puede ver (la base decide), nunca con la agenda del jefe, y quita fechas, horas,
  correos y teléfonos de lo que se le escribe. Herramientas por rol en tres niveles: consulta, prepara (lo confirma
  administración) y hace (con deshacer). «Hablar con alguien» avisa de verdad a administración.
- **Sin IA por ahora:** con `ASISTENTE_MODELOS` vacío contesta el cerebro de demostración (guiones y fichas). Para usar
  un modelo: OK legal (sanciones), cadena de proveedores distintos con API compatible con OpenAI (Gemini, Groq, OpenAI,
  OpenRouter, Mistral). Anthropic no (no da servicio en Venezuela).
- **Panel:** Ajustes → Asistente (solo administración): lo que sabe, cómo contesta (con probador), conversaciones, cómo
  va, lo que preguntan, por confirmar, lo que hizo y ajustes (nombre, cara y presentación).
- **Nombre:** «360» (Juan, 24/10/2026).

## D-27. Mejoras de uso sin costo (24/10/2026)
- Barra del teléfono con «Más»; «Modo sol» (alto contraste) en el menú de la cuenta; un consejo corto la primera vez en
  cada pantalla; pantallas que se actualizan solas (Realtime con Supabase, cada 60 s en la demo, nunca mientras alguien
  escribe); motivos rápidos al pedir cambios y vista de cómo saldrá cada copy; resultados en tarjetas en el teléfono; aviso
  «Esa pantalla no es de tu rol» en vez de un salto sin explicación; tweets: «toca para cambiar el día o la hora».
- Secretaría corrige su propuesta mientras el jefe no decide; avisos al jefe y a despacho de cada evento nuevo, y a quien
  lo propuso cuando el jefe decide (sin fecha ni lugar en el texto). Solo el jefe decide (también en el servidor).
- Administración puede quitar material subido por error (no si está en una pieza aprobada, en revisión o publicada) y,
  en Equipo, ve quién tiene doble factor y lo reinicia si alguien pierde el teléfono (queda en el registro).
- Las confirmaciones usan el diálogo de la app, no las ventanitas del navegador.

## D-28. El material en el Google Drive del cliente (25/10/2026)
- **Qué:** con `STORAGE_PROVIDER=drive`, los videos, fotos y archivos nuevos se guardan en una carpeta del Google Drive
  del cliente («FB Operaciones 360», con `Videos`, `Fotos`, `Portadas`, `Audios`, `Documentos` y una carpeta por código
  de evento). Lo que ya estaba en Supabase sigue sirviéndose desde ahí: cada fila dice dónde vive (`bucket`).
- **Cómo se conecta:** OAuth con la cuenta del cliente y **solo** el permiso `drive.file` (no sensible: sin revisión de
  Google); la app de Google se publica «En producción» para que el permiso no se venza a los 7 días. Administración
  conecta una vez en Ajustes → Google Drive; el permiso se guarda cifrado y nunca va al navegador. Cliente REST propio
  sobre `fetch` (sin librerías nuevas).
- **Permisos:** manda el de la plataforma (RLS sobre `media_assets`, igual que antes). El navegador de quien no es
  Administración nunca recibe un permiso de Google: sube y descarga por la plataforma. «Elegir de Drive» (Google
  Picker) es solo para Administración, con un token de una hora de `drive.file`.
- **Subir:** el servidor abre la subida reanudable y el navegador manda las partes directo a Google (nunca por Vercel,
  que limita el tamaño de lo que recibe). Si con la cuenta real Google no lo dejara, `DRIVE_UPLOAD_MODE=proxy` las pasa
  por la plataforma (gasta transferencia: necesita el OK de Juan).
- **Ver y descargar:** `/api/media/[id]` revisa el permiso y trae el archivo por tramos de 4 MiB (el video se adelanta);
  «Descargar» junta los tramos en el teléfono y sigue sola si se corta, porque Vercel corta cada respuesta a los 300 s y
  un video de 180 MB en una línea lenta tarda más (también «Video» y «Portada» en Publicar, la portada y el audio de la
  pieza y la imagen de un tweet; sin tramos, el servidor no da entero un archivo de más de 32 MiB). Tope mensual de
  transferencia (`DRIVE_TRANSFER_CAP_GB`, 7 GB) para que Vercel Hobby no pause el proyecto: se aparta antes de mandar
  (varios pedidos a la vez no lo pasan) y cada persona tiene una parte diaria (un cuarto del tope; Administración
  aparte), para que una sola cuenta no apague los videos de todos. No hay botón para «subir el tope este mes»: eso
  quitaría justo la protección contra la pausa de Vercel; con Vercel Pro se cambia la variable.
- **El material del Mac:** script `npm run drive:import` (mismo cliente OAuth y misma cuenta, para que la plataforma vea
  los archivos), que se reanuda, no repite y deja fuera lo que diga la lista (`drive.importExclude`: el video de Sábados
  Felices que el equipo mandó bajar el 24/10; `NO-SUBIR-…`; `.no-subir`). Biblioteca → «Traer lo nuevo de Drive» los
  registra.
- **Por qué:** es gratis (15 GB), el equipo ya usa Drive y el material de hoy (2,3 GB, archivos de hasta 180 MB) no cabe
  en el repositorio ni en el plan gratis de Supabase. Se descartó una cuenta de servicio (no tiene espacio propio en un
  Drive personal) y compartir carpetas «con el enlace» (saltaría los permisos por evento).
- **Lo que no se pudo como pedía el encargo:** Drive no da códecs ni cuadros por segundo (los lee el navegador de
  Administración después de elegir o importar); elegir una carpeta entera en el Picker no da acceso a sus archivos (se
  eligen uno por uno, o se usa el script); `DRIVE_ROOT_FOLDER_ID` no sirve con `drive.file` (la plataforma crea su
  carpeta y guarda el id en la base).
- **Cómo se cambia:** vaciar `STORAGE_PROVIDER` vuelve a Supabase para lo nuevo (lo de Drive sigue abriendo mientras
  Drive esté conectado). Pasos y variables: `DRIVE.md`.

## D-40. La base cierra lo que la pantalla escondía (28/10/2026)
- **Qué:** migración `20261028002100_privacy_hardening.sql`, con pruebas por rol en
  `tests/rls/privacy-hardening.test.ts` (por SQL directo, saltándose la app).
  - **La ficha de obra para Redes y Grabación:** ya no leen la tabla `obra_fichas`. Mientras la visita está viva (sin
    cancelar, sin rechazar, sin borrar), `visit_obra_ficha()` les da solo las columnas de la pestaña «Ficha de obra»:
    sin etapa, autor, horas de creación o cambio, responsable del seguimiento ni los días de la obra (inicio, entrega,
    seguimiento). Sus fotos del antes y del avance siguen saliendo; los documentos, nunca.
  - **Teléfonos:** la base rechaza algo que parezca un teléfono en el texto de la ficha de obra que leen Redes y
    Grabación (también en «Lo que voy a decir») y en el motivo de una cancelación; en el motivo, además, una fecha o una
    hora. Es la misma regla de la app (`phones.ts` y `looksLikeDateTime`), copiada en SQL y probada con los mismos
    casos y con miles de textos generados. En «Lo que voy a decir» ya no pasan dos cifras de la ficha pegadas como un
    teléfono («1200 300»): se escriben con puntos.
  - **El día realizado (`events.done_on`):** es la fecha del evento, después. Redes lo sigue viendo (D-06 y el encargo
    §8.3: el material queda en el registro por día, la biblioteca de Hillary); también quien ve la fecha
    (administración, el jefe y el despacho, quien graba ese evento, el IVT en las visitas de sus obras). **Política
    no:** nunca ve fechas, y leía el día de las actividades nacidas de sus reportes. La columna se cerró para todos los
    roles de la API (permiso por columna: también en Realtime) y el día sale de `event_done_on()`, que a política le da
    vacío.
- **Por qué:** la regla de la agenda la cumple la base, no la pantalla (encargo del 27/10, §0).
- **Lo que queda:** política aún lee `updated_at` y `work_status` de esas actividades; cambian cuando alguien las toca
  (también al marcar realizado), sin decir el día. Una columna nueva en `events` hay que darla a `authenticated` a
  propósito (la prueba lo recuerda).
- **Cómo se cambia:** quién recibe el día, en `event_done_on()`; qué columnas de la obra ven Redes y Grabación, en
  `visit_obra_ficha()` (y en `HIDDEN_WITHOUT_CONTACTS` de `ficha-tab.ts`); las dos reglas de texto, en una migración
  nueva junto con su copia en la app y los casos de `tests/unit/fixtures/privacy-text-cases.ts`.
