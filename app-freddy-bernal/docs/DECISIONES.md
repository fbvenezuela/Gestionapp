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
- **Quién puede:** el jefe y el despacho (con doble factor) y quien grabó, solo después de que empezó. Administración
  ya no (27/10, D-32).
- **Quién lo ve (28/10/2026, D-40):** Redes (la biblioteca por día) y quien ve la fecha; política nunca. La columna
  está cerrada para la API y el día sale de `event_done_on()`.

## D-07. Aprueba supervisión; lo rojo, el jefe (ni administración) — ver D-23
> **Reemplazada el 27/10/2026 por D-29 y D-30:** Supervisión ya no existe y todo lo aprueba el jefe. Lo de abajo queda
> como historia; sigue valiendo que administración nunca aprueba y que una versión nueva vuelve a revisión.
- **Qué:** aprobar piezas verdes y amarillas y los tweets es de `supervisor`; las piezas en **rojo** las aprueba el
  **jefe**. Siempre con doble factor y por `review_piece`. Administración nunca aprueba. Una versión nueva o un copy
  cambiado vuelve a revisión; editar un tweet aprobado lo devuelve a borrador.
- **Por qué:** «Nada se publica sin aprobación» y así queda claro quién aprobó. Si Fernando no está, administración le
  da el rol a otra persona (queda en el registro).

## D-08. Doble factor obligatorio para administración, jefe, despacho y supervisión
> **Cambiada el 27/10/2026 (D-29) y el 28/10 (D-41):** sale supervisión y entran política y el IVT. La lista siempre
> nombra a administración, jefe, despacho, política e IVT, y aprobar pide el doble factor del jefe sin leer la lista
> (D-30).
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
> **Cambiada el 27/10/2026 (D-30):** donde dice «supervisión», ahora es **el jefe**: aprueba verde, amarillo, rojo y
> tweets, con doble factor; el nivel lo cambian el jefe o administración. El semáforo, los plazos, la lista de chequeo
> y «lo que sale es exactamente lo aprobado» siguen igual.
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
- Secretaría corrige su propuesta mientras el jefe no decide (Secretaría salió el 27/10, D-29); avisos al jefe y a
  despacho de cada evento nuevo, y a quien lo propuso cuando el jefe decide (sin fecha ni lugar en el texto). Solo el
  jefe decide (también en el servidor).
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

## D-29. Seis roles; Secretaría y Supervisión se van sin perder historia (27/10/2026)
- **Qué:** el equipo son seis roles: **jefe, director de despacho, director de política, director del IVT, grabación y
  redes** (Hillary: «más nada»). **Administración** queda como rol técnico (invitar, ajustes, registro): no sale en la
  lista del equipo, en «Ver como…» ni en las guías. Migraciones `20261027001500_roles_enum.sql` (solo agrega los dos
  roles nuevos) y `20261027001600_six_roles.sql`.
- **Sin perder historia:**
  - no se borra a nadie. Lo que aprobó Supervisión sigue con su autor (revisiones, piezas y tweets aprobados), y cada
    rol quitado queda en el registro de cambios, con una fila de resumen;
  - lo que propuso Secretaría se lee «propuesto por Despacho» (`events.origin`, D-32); quién lo escribió sigue en
    `created_by`;
  - las invitaciones pendientes pierden los roles que salen; la que queda vacía se anula;
  - quien quedó sin rol: se le cierran las sesiones y ve «Sin acceso» hasta que administración le dé uno de los seis.
- **Solo se dan los seis y administración.** La base rechaza los demás al dar un rol y al invitar; al crear la cuenta,
  una invitación vieja solo copia los roles que se pueden dar. Secretaría, Supervisión y los roles de la fase 3 siguen
  escritos en la base (borrar un valor de esa lista es riesgoso), pero nadie los recibe.
- **Grabación, «un solo perfil»:** un solo rol, con un usuario por persona (para saber quién subió qué y para el doble
  factor de cada uno, como Redes en D-09). Todos ven la misma pantalla; cada uno, los eventos que le asignaron.
- **Doble factor (cambia D-08):** administración, jefe, despacho, política e IVT.
- **Demo:** salen los botones de Secretaría y Supervisión y entran «Director de política» y «Director del IVT» (nombres
  inventados, `docs/DEMO.md`).
- **Por qué:** encargo del 27/10, §2. Manda sobre `IDEA.md` §4 y la tabla de permisos del 24/10.
- **Cómo se cambia:** un rol nuevo pide una migración que solo lo agregue (en su propio archivo) y otra que lo deje dar;
  en la app, `TEAM_ROLES` de `src/lib/roles.ts`. La prueba `tests/rls/retire-roles.test.ts` arma datos viejos con los
  roles retirados y revisa que la historia quede.

## D-30. Solo el jefe aprueba (27/10/2026) — **Confirmar con Hillary**
- **Qué:** lo que aprobaba Supervisión pasa al jefe: piezas verdes, amarillas y rojas, y los tweets. En la base hay una
  sola puerta, `public.can_approve()`: el jefe **con doble factor**. Desde `20261027001650_approval_gate_fixes.sql` no
  lee la lista editable del doble factor, así que nadie le baja la guardia desde Ajustes.
  - «Aprobar todas las verdes (n)» de un toque, en su Inicio y en Por aprobar. Se salta la que cambió mientras tanto.
  - Tweets: aprueba el texto que vio; si Redes lo cambió en ese rato, se salta y se avisa.
  - Decidir y calificar eventos también pasan por `can_approve()` (D-32).
  - El nivel (verde, amarillo, rojo) lo cambian el jefe o administración. Administración nunca aprueba y no puede ser
    también el jefe en la misma cuenta (D-41).
  - Avisos de revisión, plazos vencidos, tweets por aprobar y el resumen diario van al jefe.
- **Por qué:** encargo §2: «las aprobaciones que hacía Supervisión pasan al jefe».
- **Lo que se pierde:** ya no hay dos personas: el jefe puede aprobar algo que hizo él, y todo espera por él. Lo
  alivian las verdes de un toque (lo rutinario va en verde).
- **Pregunta para Hillary:** ¿alguien aprueba en su nombre (por ejemplo, el despacho las verdes)? ¿Fernando Alvarado
  sigue revisando? Mientras tanto, solo el jefe. Si Fernando tiene cuenta, guarda su historia y no aprueba; si tiene que
  comentar, se le da Redes.
- **Cómo se cambia:** que otra persona apruebe en su nombre es cambiar **una sola función**, `can_approve()`, en una
  migración nueva. Si fuera solo para las verdes, se toca también `review_piece`. Las pruebas `tests/rls/roles.test.ts`
  y `tests/rls/por-rol.test.ts` dicen lo que debe seguir valiendo.

## D-31. El jefe tiene todo, hasta lo de Redes (27–28/10/2026)
- **Qué:**
  - **En la base:** el jefe hace lo de Redes (piezas, versiones, copies, comentarios, frases, tweets, publicaciones,
    resultados y subir material), lo de la agenda (D-32) y lo de las fichas. Una prueba compara, tabla por tabla, lo que
    ve el jefe con todo lo que hay (`tests/rls/por-rol.test.ts`). Lo técnico (registro de cambios, buzón, ajustes)
    sigue siendo de administración.
  - **Su Inicio** (`/jefe`, ya no Hoy): arriba, «Vencidas en los municipios» (las 5 primeras) y «Te toca aprobar»
    (rojo, amarillo y verde, «Aprobar todas las verdes (n)» y los tweets). Debajo, cuatro botones grandes con sus
    números en vivo: **Política** (hoy, por decidir, por ponerle fecha, la agenda), **Obras** (las fichas del IVT por
    estado y municipio), **Redes** (piezas en curso, listas para publicar, días de tweets y «Notas de Grabación
    nuevas») y **Digital** (lo publicado, lo que viene, cómo nos va). Dos por fila en el iPad, uno debajo del otro en el
    teléfono, botones de 56 px o más.
  - **`/redes`:** su puerta a las mismas pantallas de Redes (Piezas, Tweets, Publicar, Resultados, Biblioteca), con lo
    que espera en cada una y sin fechas de la agenda. Redes y administración también la abren.
  - **Menú:** Inicio, Agenda, Por aprobar, Redes, Obras, Municipios y Digital. En el teléfono: Inicio, Agenda, Por
    aprobar, Redes y «Más».
  - Los números se cuentan como el jefe (RLS, `src/lib/data/home-counts.ts`): los mismos de la pantalla que abren, sin
    eventos cancelados.
- **Por qué:** encargo §3: «tiene todo, hasta lo de redes». Con once opciones el menú no cabía en el teléfono; por eso
  Redes es una puerta.
- **Cómo se cambia:** menú en `NAV` de `src/lib/roles.ts`; los botones en `src/app/(panel)/jefe/page.tsx`; la puerta en
  `src/app/(panel)/redes/page.tsx`.

## D-32. La agenda es del jefe y del despacho, juntos (27/10/2026)
- **Qué:** migraciones `20261027002000_shared_agenda.sql` y `20261027002050_agenda_fixes.sql`.
  - Solo **el jefe y el despacho**, con doble factor, crean eventos, ponen y cambian fecha y hora, llenan la ficha
    técnica, mueven, cancelan y le ponen fecha a una ficha (`can_manage_agenda()`).
  - Lo que crea o fecha **el jefe** queda aceptado de una vez. Lo del **despacho** llega «Por decidir», aunque diga
    otra cosa. Solo el jefe decide y califica.
  - **Administración ya no edita la agenda:** la lee, borra y restaura un evento (con doble factor) y no lo marca
    realizado. Antes creaba eventos y ponía fecha.
  - Cancelar no es borrar: el evento queda tachado, con quién, cuándo y el motivo (sin teléfono, fecha ni hora: la base
    lo revisa). «Volver a la agenda» lo trae.
  - Cada evento dice de dónde salió (despacho, jefe, política o IVT) y qué es (evento, visita de obra o actividad
    comunitaria).
  - Botones grandes para el iPad y el teléfono: Nuevo evento, Visita de obra, Por ponerle fecha y Por decidir. En el
    evento: Mover, Cambiar fecha o lugar, Cancelar, Volver a la agenda e Historial.
  - «Marcar realizado» solo después de que empezó, y solo quien ve la fecha. Un evento realizado ya no cambia de fecha
    ni de lugar (D-41).
- **Si los dos editan a la vez:** gana el último, pero se guarda solo lo que cada uno cambió. A quien cambió ese mismo
  campo le llega «cambió lo mismo que tú», con los nombres de los campos y nunca el valor; lo de antes queda en el
  Historial. Lo que alguien escribe queda en su teléfono hasta guardarlo, con «Usar lo de él / Dejar lo mío»; «Salir»
  borra esos borradores.
- **Avisos**, siempre con el título y nunca con la fecha: «Ya tiene fecha», «Cambió la fecha u hora» y «Se canceló»
  (importantes: no se apagan), «cambió lo mismo que tú» y «cambió» (este último, apagado si nadie lo prende).
- **Por qué:** encargo §3: «el director de despacho o el jefe pueden agregar cosas en conjunto», y §8: «solo jefe y
  despacho la ponen». Que lo del despacho espere al jefe mantiene la idea de siempre: el jefe decide su agenda.
- **Cómo se cambia:** quién escribe la agenda, en `can_manage_agenda()` (devolvérsela a administración es cambiar esa
  función); qué toca cada rol en un evento, en `guard_event_update()`; los avisos, en
  `src/lib/domain/agenda-notices.ts`.

## D-33. «Por ponerle fecha»: de la ficha a la agenda (27/10/2026)
- **Qué:**
  - El IVT y política no ponen fecha. En la ficha de obra, **«Guardar y avisar al jefe»** (pide cada campo respondido
    o marcado «No aplica» o «Por confirmar») le manda al jefe y al despacho **«Por ponerle fecha»** con el nombre y el
    municipio, nunca una fecha; «Guardar borrador» no avisa. La ficha comunitaria no tiene borrador: decide el
    interruptor «¿Va a la agenda del jefe?» (prendido por defecto solo si el tipo es «Evento»). Prendido, el botón es
    «Guardar y avisar al jefe»; apagado, «Guardar», y queda en el registro del municipio.
  - La lista sale de la vista `agenda_to_schedule`, que no tiene columna de fecha: obras listas y reportes que van a la
    agenda, sin un evento vivo. Está en `/agenda/por-fecha`, primero en Hoy del despacho y en Política del jefe, con
    «Ponerle fecha» y «No va» (su motivo queda en la historia de la ficha).
  - **«Ponerle fecha»** usa `schedule_ficha()`, la única forma de unir un evento con una ficha. Crea el evento (visita
    de obra o actividad comunitaria), su fecha y su ficha técnica, y anota «ya tiene fecha» en la historia, sin la
    fecha. La ficha técnica que nace de una obra lleva el nombre del ingeniero, nunca teléfonos ni nombres de quien
    reportó o del enlace.
  - Si la pone el jefe, queda aceptada; si la pone el despacho, llega «Por decidir» (D-32).
  - Una sola visita viva por ficha. Si se cancela o se rechaza (o administración la borra en la base), la ficha vuelve
    sola a «Por ponerle fecha». La obra guarda el motivo en su historia; el reporte, solo «La actividad salió de la
    agenda del jefe». Al cancelar o rechazar les llega un aviso nuevo al jefe y al despacho; el IVT o política reciben
    el aviso sin la fecha. Al marcarla realizada, la obra queda realizada.
- **Por qué:** encargo §4 («Por ponerle fecha» es texto de Hillary). «Al guardarla» se leyó como el botón principal: un
  borrador a medias no le llena la lista al jefe.
- **No se hizo:** cosas «sin fecha todavía» hechas a mano, sin ficha. Solo las fichas entran a la lista.
- **Cómo se cambia:** qué entra, en la vista `agenda_to_schedule`; qué crea, en `schedule_ficha()`; el aviso, en
  `src/lib/domain/agenda-notices.ts`.

## D-34. Ficha de obra del IVT y el diálogo FAB (27–28/10/2026) — **Confirmar con Hillary** (el IVT y la fecha)
- **Qué:** migración `20261027001700_fichas.sql` (y sus arreglos `…001950`, `…002100` y `20261028002100`). Pantallas
  Obras, Nueva ficha de obra, la ficha y su modo lectura.
  - Los campos de §4.1 en cinco grupos. Cada uno admite **«No aplica» o «Por confirmar»**: se guarda vacío y marcado.
    El código (O-0001) y la fecha de creación los pone la base.
  - Lo de terceros (teléfono del ingeniero, quién reportó, el enlace comunitario y lo que el jefe debe saber) va aparte
    y se ve solo con doble factor. La parte principal no se guarda con un teléfono: la app y la base lo rechazan; la
    app dice en qué campo está.
  - Fotos en Antes, Avance y Documentos, con la subida que aguanta mala señal y sin la ubicación. Los Documentos
    (denuncias, actas) solo los ve quien ve los contactos.
  - Redes y Grabación ven la obra solo dentro de su visita viva, en la pestaña «Ficha de obra» (D-40): sin contactos,
    sin teléfonos y sin documentos.
- **«Generame un diálogo FAB con esto»:** el botón **«Generar diálogo FAB»** arma «Lo que voy a decir» (qué es la obra,
  qué mejora, qué gana la gente) con la voz del jefe. Con la IA apagada sale de una plantilla con los campos y **nunca
  inventa cifras**: solo las de la ficha (probado con 200 fichas inventadas). Lo «Por confirmar» no se dice y nunca lee
  los contactos. Se puede cambiar antes de guardar. Llega al modo lectura del jefe (si el storyboard no tiene discurso)
  y al storyboard de Redes («Usar como discurso»).
- **El IVT ve la fecha de sus visitas:** cuando el jefe o el despacho ya la pusieron, el IVT la ve (con doble factor)
  en «Mis visitas de obra», solo de las visitas nacidas de una ficha de obra. Ve la fecha, la hora y el sitio (también
  los contactos del sitio), nunca la ficha técnica, el storyboard ni el material. Es como Grabación con sus eventos
  (D-05): tiene que estar allí.
- **Por qué:** encargo §4.1.
- **Preguntas para Hillary:** ¿está bien que el IVT vea la fecha de sus visitas? Y, de D-41: ¿administración también
  deja de ver los contactos de las fichas de obra?
- **Cómo se cambia:** los campos, en `src/lib/domain/ficha-fields.ts` y una migración; la plantilla, en
  `src/lib/domain/obra-dialog.ts`; que el IVT no vea la fecha, en su rama de `can_see_schedule()` (migración nueva).

## D-35. Ficha comunitaria de política, por municipio (27–28/10/2026)
- **Qué:** misma migración de fichas. Pantallas Municipios, cada municipio, Nueva ficha comunitaria y el reporte.
  - Los diez grupos de §4.2, «una ficha por actividad o situación». El código (R-0001) lo pone la base. Si no es un
    evento (un avance, una incidencia), queda en el registro sin ir a la agenda (D-33).
  - **Municipios:** los 29, cada uno con sus contadores (abiertas, en ejecución, finalizadas y vencidas por su fecha
    de seguimiento) y filtros por municipio, parroquia, tipo, estado y prioridad. Cada municipio muestra sus parroquias
    y todo en orden de fecha. **Lo vencido sale arriba** en el inicio de política y en el del jefe.
  - **La historia nunca se pisa:** quién la creó, cada cambio de estado (con su motivo, si lo escriben), cada
    actualización y cada nota se agregan. Nadie la cambia ni la borra, tampoco el sistema. De los contactos guarda solo
    el nombre del campo.
  - **Parroquias en texto libre** hasta que llegue la lista oficial (`PENDIENTES.md` #8): el municipio sale de la
    lista; la parroquia acepta cualquier texto corto, y el filtro junta las formas de escribir la misma (mayúsculas y
    espacios).
  - **Contactos** (quién reporta, su cargo y teléfono, la dirección, la referencia y la fecha de la actividad): solo
    los ven **política, el despacho y el jefe**, con doble factor (D-41: administración ya no; ve la parte principal,
    sin teléfonos, para borrar y restaurar). Redes y Grabación nunca ven un reporte.
  - Política ve solo los eventos nacidos de sus reportes y nunca su fecha: le sale «Ya tiene fecha» (D-40).
- **Por qué:** encargo §4.2: «Todo filtrado por municipio y que quede un registro. A eso hay que meterle lógica».
- **Cómo se cambia:** la lista de parroquias va en el ajuste `parishes` (`config/clients/fb.json`); con ella, la base
  acepta solo esas. Quién ve los contactos, en las políticas `community_report_private_*`.

## D-36. Entrega de Grabación al editor (28/10/2026)
- **Qué:** en cada evento asignado, en la pestaña Material, Grabación:
  - sube **el storyboard con el que grabó** (foto o PDF, en su propio grupo) o lo escribe;
  - sube el material crudo por casillas, como siempre;
  - deja **una nota para el editor** (guardar otra vez la reemplaza). Avisa, sin bloquear, si parece llevar una hora o
    una fecha, y no se guarda con un teléfono (los tiempos del video, «2:15», sí).
- **Quién la ve:** Redes, el jefe y administración ven la nota y el storyboard arriba del material, con el primer
  nombre de quien los dejó y sin horas. El despacho ve solo el archivo. A Redes le llega un aviso con el título del
  evento y nada más (uno por hora, se puede apagar en Mi perfil); en Hoy y en el Inicio del jefe sale «Notas de
  Grabación nuevas».
- **«Descargar todo»** (en el evento y en la Biblioteca): un diálogo para elegir qué tipos bajar. Antes de empezar dice
  si lo que viene de Drive no cabe en el cupo de hoy, y baja uno por uno, en orden:
  - en Chrome o Edge de computadora, a una **carpeta** elegida, con una subcarpeta por tipo; otra vez en la misma
    carpeta, salta lo que ya está entero (así sigue al día siguiente);
  - en los demás navegadores, uno tras otro a descargas; en el iPhone, un toque por archivo;
  - primero un `LEEME.txt` con el título, las notas de Grabación y la lista de archivos; **nunca** la fecha, la hora ni
    la dirección, ni siquiera para el jefe. Los nombres de los archivos no llevan fecha (D-13);
  - se detiene si se acaba el cupo o vence la sesión, y nunca dice «Listo» a secas si algo no bajó. Uno por uno,
    antes de pasarle un archivo al navegador pregunta si está guardado (`HEAD /api/media/<id>`, con el mismo permiso
    que la descarga): el que no está (los videos de ejemplo de la demo, o uno que se perdió) no sale como «Enviado» y
    el aviso dice cuántos no se bajaron (auditoría del 28/10). En el iPhone y el iPad la lista pregunta lo mismo al
    abrirse: el que no está dice «No hay un archivo detrás.» en vez de «Bajar», y arriba dice cuántos son.
- **Por qué:** encargo §5. Carpeta y no zip: un evento pesa de 1 a 3 GB y el zip habría que armarlo entero en el
  teléfono o en el servidor. El cupo diario de Drive (D-28: 1,75 GB por persona con el tope de 7 GB) puede cortar un
  evento grande; por eso la carpeta sigue donde quedó.
- **Cómo se cambia:** el plan de descarga, en `src/lib/media/download-plan.ts`; quién lee las notas, en las políticas
  de `recording_notes` (migración `20261027001900_media_handoff.sql`).

## D-37. Resultados con miniaturas (27/10/2026)
- **Qué:** cada publicación de Resultados (la tarjeta del teléfono y la tabla) y de «Digital» del jefe lleva su
  miniatura. El orden: la portada de la pieza → el archivo final (la imagen o un cuadro del video) → la captura de la
  publicación → el ícono del formato. Lo que el jefe publica por su cuenta usa su captura; si no tiene, «Agregar
  captura» (una sola vez).
  - La miniatura (JPEG de hasta 320 px) se hace en el teléfono mientras sube; el servidor revisa sus bytes y la guarda
    solo para el archivo propio, sin reemplazar otra. Se sirve por la plataforma después de revisar el permiso, para
    cualquier almacenamiento, nunca con un enlace público de Drive. Sin miniatura sale el ícono, nunca una imagen rota.
  - Demo: miniaturas inventadas y abstractas (sin personas, lugares ni texto).
- **Por qué:** encargo §6. La plataforma de Mila no tiene pantalla de resultados: se hizo con su estilo de miniaturas.
- **Lo demás de «Redes igual a Mila» espera:** el código de Mila apareció (`PENDIENTES.md` #11). Mila organiza Redes por
  formato (Reels, Carruseles, Historias, Feed); la nuestra, por paso. Rehacerla es grande y el encargo dice «no rehagas
  Redes a ciegas»: falta que Hillary confirme la tabla de diferencias.
  **Cerrado el 29/10/2026:** Redes ya va por formato, meses y feed (D-60 a D-78).
- **Cómo se cambia:** el orden, en `src/lib/domain/thumb-source.ts`.

## D-38. Glass más visible, sin perder lectura (27–28/10/2026)
- **Qué:** solo en los tokens y los componentes base (`docs/DISENO.md`, «Cara glass»):
  - fondo con manchas suaves de la marca (oliva y amarillo) detrás de todo;
  - tarjetas de **vidrio esmerilado** (45 % de blanco, 50 % en oscuro, desenfoque de 16 px), borde claro, sombra suave
    y esquinas de 24 px;
  - **las listas largas, sólidas:** agenda, registro, biblioteca, resultados, piezas, tweets, por aprobar, municipios,
    obras, publicar, avisos, buzón, historia, y cualquier tarjeta con 9 filas o más. Nada se desenfoca detrás de una
    tabla;
  - barras, menús, paneles y diálogos con más desenfoque, pero casi opacos;
  - **sólido de respaldo** cuando el navegador no sabe desenfocar, con «Modo sol», en teléfonos de 2 GB o menos o con
    ahorro de datos, y si el sistema pide reducir transparencia, más contraste o colores forzados. «Menos movimiento»
    se respeta;
  - los grises y los colores de estado quedaron **un pelo más oscuros** en claro (y el apagado y el rojo un pelo más
    claros en oscuro) para seguir en contraste AA sobre las manchas, también justo debajo de la sombra de una tarjeta
    (28/10: el gris, el apagado, el oliva de texto, el verde y el naranja otro pelo). Los colores de la marca no
    cambian.
- **Por qué:** Hillary: «más bonita, más glass, más UI design»; el dueño, al ver la primera vuelta: «súbelo, que se
  note más el glass». El encargo pide desenfoque en tarjetas y a la vez «sin desenfoque detrás de tablas largas»: por eso
  las listas largas van sólidas.
- **Cómo se cambia:** colores en `src/app/tokens.css`, reglas en `src/app/globals.css`; `tests/unit/ui-glass.test.ts`
  falla si un color baja de AA. «Modo sol» quita el vidrio a mano.

## D-39. Demo con los mismos datos en cada servidor; qué se puede probar ahí (27–28/10/2026)
- **Qué:** el error de §1 («la ficha completa del evento da error») era de la demo: cada servidor de Vercel tenía otros
  ids y la ficha decía «no encontrado» (D-02). Desde el 27/10 la siembra da los mismos ids en todos los servidores
  (`tests/unit/demo-stable-ids.test.ts`). `tests/e2e/demo-instances.spec.ts` abre en el otro servidor un evento y su
  modo lectura (despacho), la visita y la ficha de obra del IVT, la actividad y el reporte de política, y, con el jefe,
  Redes, Grabación y administración, los eventos de sus pantallas con cada pestaña que ven (también «Ficha de obra» y
  «Reporte» para el jefe y administración) y el modo lectura; `tests/e2e/pages.spec.ts` abre las cuatro pestañas de un evento con administración, Redes y el jefe.
  - Todo lo que Hillary tiene que ver ya viene sembrado: una obra y un reporte esperando fecha, una visita de obra con
    fecha y fotos, un reporte vencido, la nota y el storyboard de Grabación, dos verdes, una amarilla y una roja por
    aprobar, y miniaturas en Resultados. Sin eventos nuevos.
- **Qué sí se prueba en la demo:** entrar con cada rol de un toque, recorrer sus pantallas, ver qué ve cada uno y qué
  no (Redes sin fecha ni hora, el IVT y política sin «Ponerle fecha»), abrir eventos y fichas, y tocar los botones para
  ver cómo funcionan (aprobar, ponerle fecha, subir).
- **Qué no:** crear algo con un rol y verlo con otro. Lo creado vive en un solo servidor y se pierde cuando se reinicia;
  la pantalla siguiente puede salir de otro y no mostrarlo. Tampoco correos reales, el doble factor de verdad, Drive ni
  dos personas editando a la vez.
- **Para eso:** la base real `fb-dev` (ya tiene las migraciones de esta ronda desde el 28/10), cuando Juan termine
  `docs/PROMPT-SUPABASE.md`. Ahí no hay entrar de un toque: invitación, código y doble factor.
- **Por qué:** encargo §1 y §8 («el enlace de la versión de prueba para que ella entre con cada rol»).
- **Cómo se cambia:** los ids fijos, en `src/lib/db/stable-ids.ts`; lo sembrado, en `src/lib/db/seed-parts/`.

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

## D-41. Administración es técnica de verdad: ni jefe, ni despacho, ni contactos comunitarios (28/10/2026)
- **Qué:** migración `20261028002200_round_review_fixes.sql` (revisión de toda la ronda), con pruebas en
  `tests/rls/por-rol.test.ts` y `tests/rls/round-review.test.ts`.
  - **Roles:** nadie se da roles a sí mismo, y una cuenta nunca tiene administración junto con el jefe o el despacho
    (la base lo rechaza también al sistema; las invitaciones que los mezclan, también, y las pendientes que los
    mezclaban quedaron anuladas). Antes, administración con doble factor podía darse el rol del jefe (y aprobar una
    roja) o el del despacho (y mover la agenda). En Equipo, esas casillas salen desactivadas con el porqué.
  - **Doble factor:** la lista `security.mfa_roles` siempre nombra a administración, el jefe, el despacho, política y
    el IVT: la fecha, la agenda y los contactos se cierran con ella, y sacar a uno los abría con un solo factor.
  - **Contactos comunitarios (encargo §4.2: «solo las ven el director de política, el despacho y el jefe»):**
    administración ya no lee, agrega ni cambia los contactos de un reporte (nombre, teléfono, dirección, referencia,
    fecha de la actividad) y ya no crea reportes; sigue viendo la parte principal (sin teléfonos) para borrar y
    restaurar. Los contactos de la ficha de obra siguen como estaban (el encargo no los limita; administración los ve
    con doble factor): **pregunta para Hillary**.
  - **Registro de cambios de los contactos (obra y reporte):** guarda qué campos cambiaron, quién y cuándo, nunca el
    valor (como la historia de la ficha). Lo escrito antes de esta migración no se reescribe (el registro solo crece);
    en la demo no hay nada antes y en fb-dev no hay datos reales.
  - **Documentos y notas de un reporte** (auditoría del 28/10, `20261028002300_report_files_notes.sql`, pruebas en
    `tests/rls/report-files.test.ts`): una denuncia o un acta subida como documento de un reporte lleva los mismos
    datos de terceros que sus contactos, así que la ven y la suben solo política, el despacho y el jefe;
    administración ve las fotos del antes y del después (también borradas), nunca un documento, ni siquiera uno
    borrado en la base, y ya no sube archivos a un reporte. La historia del reporte
    (notas, motivo de un cambio de estado o de «No va a la agenda») no acepta un teléfono: la leen los cuatro roles sin
    doble factor. Administración la sigue leyendo (sin teléfonos, es lo que necesita para borrar y restaurar).
- **Además, en la misma migración:** un teléfono no entra en la nota de Grabación para el editor ni en su storyboard
  escrito (los tiempos del video, «2:15», sí), en el texto principal de un reporte ni en el título, el lugar o el
  resumen de un evento (Redes los lee); de un evento borrado, quien lo graba ya no ve el evento ni su fecha, y Redes, el
  jefe y el despacho ya no ven el evento, su ficha técnica, su storyboard ni su material. El jefe y el despacho todavía
  leen su fecha y su lugar si los piden directo a la base, con doble factor (la app no los muestra: el evento ya no
  sale); administración lo ve todo. El código del evento lo pone la base (sin fechas, sin quitarle el número al siguiente); y
  un evento realizado ya no cambia de fecha ni de lugar.
- **Por qué:** «Solo el jefe aprueba» y «administración no pone fecha ni edita la agenda» tenían que cumplirse en la
  base también contra administración, que es quien da los roles.
- **Lo que queda:** administración todavía puede invitar a otra persona (otra cuenta) como jefe o despacho: es su
  trabajo dar roles, y queda en el registro de cambios con su autor.
- **Cómo se cambia:** quién lee los contactos comunitarios, en las políticas `community_report_private_*`; quién lee y
  sube los archivos de un reporte, en `media_select` y `media_insert` (en una migración nueva); qué roles no van juntos,
  en `guard_role_mix()` y `guard_invitation_roles()` (y `roleGrantProblem()` en `src/lib/roles.ts`).


---------------------------------------------------------------------------------------------------------------------

**Tercera vuelta (28/10/2026): guías y flujos por rol, tutoriales que ofrece 360 y la red interna «Mensajes».** Lo
pidió Juan el 28/10. D-42 a D-59. Migraciones nuevas: `20261028002350_boss_grant.sql` y
`20261028002400_internal_chat.sql` (aplicadas y verificadas en `fb-dev` el 29/10). Las preguntas que quedan están al final de
`PENDIENTES.md`; mientras, se siguen los valores de abajo (todas las parejas abiertas, el rol de jefe solo por el
comando, los mensajes no se borran).

## D-42. Una sola fuente para guías, descripciones de cargo, flujos y tutoriales (28/10/2026)
- **Qué:** todo el contenido de ayuda vive en `src/lib/guides/*.ts` (un archivo por rol, uno «para todos»
  (`shared.ts`), uno de flujos, uno de tutoriales y las secciones de cada pantalla). De ahí salen: las páginas
  `/ayuda…` de la app, las fichas de sección que usa 360, los pasos de los tutoriales y los documentos del repo
  (`docs/GUIA-POR-ROL.md`, `docs/FLUJOS.md`, `docs/GUIA-ADMINISTRACION.md`), que se generan con `npm run docs:guides`.
  Una prueba falla si un documento del repo no es igual a lo que genera la fuente, y otra si una «etiqueta» de la guía
  o de un tutorial no existe como texto en `src/`. «» va solo para etiquetas de pantalla; las citas van con “ ”. Los
  documentos llevan arriba «No se manda todavía: Hillary pidió probar cada rol antes (25/10)».
- **Por qué:** la guía anterior quedó desfasada del código en una semana (etiquetas mal, pasos que faltaban). Con una
  fuente y pruebas que la comparan con las pantallas (`SCREENS`, los `data-tour`, los textos de los botones), no se
  desfasa.
- **Lo que queda:** las 127 fichas de sección de 360 se arman del código en cada pregunta y no se siembran en la tabla
  del asistente: así siempre dicen lo mismo que `/ayuda`, y Ajustes → Asistente no las lista (18 nombran etiquetas que
  la revisión del material rechazaría al guardarlas).
- **Cómo se cambia:** se edita `src/lib/guides/<rol>.ts` (o `sections.ts`, `flows.ts`, `tours.ts`) y se corre
  `npm run docs:guides`. Nunca se edita a mano el `.md` generado.

## D-43. La guía de administración va aparte (28/10/2026)
- **Qué:** las guías del equipo hablan de seis roles. Administración tiene su propia guía (`src/lib/guides/admin.ts` →
  `/ayuda/administracion`, solo administración, y `docs/GUIA-ADMINISTRACION.md`). Ninguna guía del equipo nombra a
  administración salvo en el aviso de Mensajes («Administración no lee las conversaciones») y en la línea de 360
  («Administración ve lo que le preguntas a 360»).
- **12/11/2026 (guía del equipo en la app, decisión de Juan):** las guías del equipo también nombran a administración
  donde la persona lo necesita: quién lee lo que le preguntas a 360 («Administración (las personas que manejan la parte
  técnica de la app) puede leer lo que le preguntas a 360…»), quién recupera una pieza que eliminó el jefe
  («administración la puede recuperar») y su palabra en «Palabras de la app». Solo esas frases (`ADMIN_MENTIONS` en
  `src/lib/guides/shared.ts`, que la prueba de las guías revisa); la guía de administración sigue aparte.
- **Por qué:** lo pidió Hillary (administración no entra en las guías del equipo).
- **Cómo se cambia:** `src/lib/guides/admin.ts`; las frases que nombran a administración, `ADMIN_MENTIONS`.

## D-44. Flujogramas: lista accesible en la app, Mermaid en el repo (28/10/2026)
- **Qué:** en la app, cada flujo es una lista ordenada de tarjetas («Paso 3 · Redes · tú») con flechas decorativas en
  SVG (`aria-hidden`) y las ramas como sublista («Sí → …», «No, pide cambios → …»). Los pasos de tu rol llevan borde
  de acento y «tú». Una columna en todos los anchos. `/ayuda/flujos` es un índice de los 8 flujos y abre uno a la vez
  (`?f=<id>`). En el repo, bloques Mermaid generados de los mismos datos. Mermaid no entra en la app.
- **Por qué:** un lector de pantalla oye «lista de 8 pasos»; a 360 px es una columna sin scroll de lado; colores solo
  por tokens. Mermaid pesa demasiado para un Android barato.
- **Cómo se cambia:** `src/lib/guides/flows.ts`; el componente `src/components/guides/flowchart.tsx`.

## D-45. Tutoriales: motor propio, solo «mira aquí», sin dependencias (28/10/2026)
- **Qué:** un motor pequeño propio (`src/components/tour/*`): un diálogo nativo `<dialog>` (encima de todo, Escape
  sale, el foco vuelve a «Mi cuenta») que es un contenedor **transparente** de pantalla completa, sin vidrio ni
  difuminado; adentro, el anillo alrededor de lo que se señala y la tarjeta con «Paso 2 de 5», el texto (≤ 140
  letras), «Atrás» · «Siguiente»/«Terminar» y una X «Salir del tutorial». La tarjeta va arriba o abajo; «al lado» solo
  cuando hay lugar. Cada tutorial tiene de 2 a 6 pasos, todos en la pantalla actual (puede incluir la pestaña:
  `/eventos/[id]?tab=storyboard`). Los pasos que se pueden mostrar se cuentan **al empezar**: «Paso n de N» nunca
  salta, y uno con menos de 2 pasos visibles no se ofrece. Ningún paso dice «toca X»: dice «Aquí está «X»: lo tocas
  cuando cierres el tutorial». Hay 44 tutoriales; `bienvenida` termina con «Seguir», que abre el del inicio del rol.
- **Por qué:** shepherd.js e intro.js son AGPL (producto de un cliente); joyride es pesado y pelea con la barra de abajo
  y el botón de 360 a 360 px; driver.js trae sus colores. Ya teníamos diálogo nativo, vidrio con respaldo sólido,
  guardado en el teléfono y medición de barras. El diálogo no lleva vidrio porque `backdrop-filter` corría el anillo y
  su fondo difuminaba justo lo que se señala.
- **Cómo se cambia:** los pasos en `src/lib/guides/tours.ts` (las anclas, `data-tour`, en la lista cerrada de
  `src/lib/guides/anchors.ts`); el motor en `src/components/tour/`.

## D-46. Dónde empieza un tutorial (28/10/2026)
- **Qué:** (1) 360 lo ofrece con una franja de una línea junto a su botón (D-47); (2) en «Mi cuenta», arriba a la
  derecha: «Ayuda y guías» (`/ayuda`) y «Ver el tutorial de esta pantalla» (solo si hay uno; en el inicio, uno por
  tutorial: «Bienvenida» y el del inicio); (3) en `/ayuda`, la lista «Tutoriales de mis pantallas»; (4) una respuesta
  de 360 («muéstrame cómo se usa Publicar») trae el botón «Ver el tutorial de Publicar». Las entradas 2 a 4 usan la
  dirección `<pantalla>?tutorial=<id>`; la franja lo arranca en la misma pantalla, sin recargar (evento
  `fb:tour:start`). Nunca empieza solo.
- **Por qué:** el equipo «es muy poco didáctico con la tecnología»: la ayuda tiene que estar a un toque, pero sin
  interrumpir el trabajo.
- **Cómo se cambia:** `src/components/tour/help-menu-items.tsx`, `src/app/(panel)/ayuda/page.tsx`, la herramienta
  `ver_tutorial` de 360.

## D-47. 360 ofrece ayuda (cambia el «No se hace» P10 de `ASISTENTE.md`) (28/10/2026)
- **Qué:** 360 pregunta con una franja de una línea junto a su botón: «¿Te muestro esta pantalla?» con «Sí, muéstrame»
  y una X («Ahora no», 44 px). La primera vez en el inicio: «Hola, soy 360. ¿Te muestro cómo empezar?» (abre
  `bienvenida`). Reglas para no fastidiar (puras, en `offer-core.ts`, con pruebas):
  - solo en pantallas que tienen un tutorial para tu rol con 2 pasos o más, y **nunca** en pantallas de formulario
    (`/agenda/nuevo`, `/publicar/nueva`, `/tweets/nueva`, `/obras/nueva`, `/reportes/nuevo`, `/mensajes/nueva`,
    `/mensajes/[id]`, `/aprobar/[id]`);
  - cada tutorial se ofrece **una vez** por persona; como mucho una franja por pestaña y **una por día**;
  - **tras la segunda X** se apaga para siempre en ese teléfono para esa persona, y lo dice una vez: «Listo. La ayuda
    está en Mi cuenta → Ayuda y guías.»; se vuelve a prender en `/ayuda` («Volver a ofrecerme ayuda»);
  - aparece a los 4 s, nunca mientras escribes, con un diálogo abierto, con 360 abierto, con el aviso «Esa pantalla no
    es de tu rol», con un tutorial corriendo o con un consejo a la vista; si no se toca, se va sola a los 12 s (no
    cuenta como X);
  - nunca abre 360 solo, nunca roba el foco, nunca llama a `/api/asistente` (no gasta el tope por hora ni sale en «Lo
    que preguntan»).
  360 además **sabe la pantalla** en la que estás cuando le preguntas: la ventana manda solo el patrón
  (`/eventos/[id]`, nunca el id ni la dirección completa), para contestar «¿qué hago aquí?».
- **Por qué:** Juan: «que 360 los ofrezca, que le diga a cada usuario que si necesita un tutorial o ayuda». Una franja
  de una línea no tapa formularios a 360 px; «Ahora no» no puede significar «nunca» a escondidas, y dos «no» bastan.
- **Cómo se cambia:** reglas y textos en `src/components/assistant/offer-core.ts`.

## D-48. El avance de los tutoriales se guarda en el teléfono, por persona (28/10/2026)
- **Qué:** «visto», «terminado», «ya se ofreció», la cuenta de X y el apagado se guardan en el teléfono
  (`device-store`) con claves por persona: `fb:tour:<persona>:<tutorial>`, `fb:360:oferta:<persona>:<tutorial>`,
  `fb:360:oferta:<persona>` y, en la pestaña, `fb:360:oferta-sesion`. Una llave del teléfono, `fb:360:oferta:off=1`,
  lo apaga para todos en ese teléfono (la usan las pruebas e2e). No hay tabla en la base. «Salir» no las borra (no son
  datos sensibles).
- **Por qué:** es una comodidad de cada persona; en la demo cada servidor tiene su base y el «ya lo vi» aparecería y
  desaparecería. En un teléfono compartido cada persona tiene su clave.
- **Lo que queda:** en otro teléfono o en la PC se ofrece otra vez (una vez por tutorial).
- **Cómo se cambia:** si hace falta seguirlo entre equipos o que el jefe vea quién terminó, una tabla
  `tutorial_progress(user_id, tour_id, done_at)` con RLS de filas propias.

## D-49. La red interna se llama «Mensajes»: directos, grupos y «Todo el equipo» (28/10/2026) — **Reemplazada por D-79 a D-88 (29/10/2026)**: Mensajes son canales, sin aviso.
- **Qué:** tres tipos de conversación: **directa** (dos personas; una sola por pareja), **grupo** (de 3 a 12
  personas, con nombre, lo arma cualquiera del equipo) y **«Todo el equipo»** (una sola; todos los del equipo activos
  son parte). Los miembros de una directa o un grupo quedan fijos al crearla (para sumar a alguien se arma otro grupo).
  Se puede **silenciar** una conversación. Se entra desde un ícono de sobre arriba, junto a la campana, con el número
  de conversaciones sin leer. Solo los seis roles del equipo, y **una cuenta que tiene administración no entra a
  Mensajes aunque tenga además un rol del equipo**: no sale en «Escribirle a alguien», no lee ni escribe.
- **Por qué:** «que todos puedan comunicarse». Miembros fijos evitan que alguien que entra después lea lo escrito
  antes. Sin canales por rol (regla 1). Si una cuenta de administración fuera miembro, el aviso «Administración no las
  lee» sería falso.
- **Cómo se cambia:** `chat_start()`, `chat_team_channel()` e `is_team_member()` en una migración nueva; los tamaños
  en `src/lib/domain/chat.ts`.

## D-50. Quién lee los mensajes (28/10/2026) — **Reemplazada por D-79 a D-88 (29/10/2026)**: Mensajes son canales, sin aviso.
- **Qué:**
  - cada miembro lee sus conversaciones (con doble factor si su rol lo pide: jefe, despacho, política, IVT), salvo los
    mensajes que tenían una fecha de la agenda si no la conoce (D-52: «Mensaje oculto»);
  - **el jefe lee todas**, con doble factor (`can_approve()`), en «Mensajes → Todas». En las que no es miembro solo
    lee: no escribe y su lectura no las marca como leídas para nadie;
  - **administración no lee ninguna**: ni con «Ver como jefe», ni en el registro de cambios (guarda solo que hubo un
    mensaje, quién y cuándo, nunca el texto, el nombre del grupo ni los miembros), ni en Ajustes → Asistente, ni
    teniendo además un rol del equipo (D-49), ni armando otra cuenta con el rol de jefe (D-58);
  - **360 no lee ninguna**: ninguna herramienta, ficha ni guion toca las tablas de mensajes (prueba estática
    `chat-isolation.test.ts`), y en la base todo lo que corre 360 lleva `app.caller = 'assistant'`, con lo que las
    funciones de chat dicen que no. Una pregunta a 360 sobre lo que dice un mensaje, o «dile a X que…», se guarda como
    «[pregunta sobre Mensajes]» (no el texto) y contesta con el botón a Mensajes. El panel de 360 dice «Administración
    ve lo que le preguntas a 360; no pegues aquí mensajes del equipo.»;
  - **todos ven siempre**: arriba de `/mensajes`, «El jefe puede leer todas las conversaciones. Administración no las
    lee, y 360 tampoco. Lo que se escribe queda guardado y no se borra.»; en cada conversación, bajo el título, «El
    jefe puede leer esta conversación. Administración y 360 no.» y, junto a la caja, «Lo lee el jefe · queda guardado,
    no se borra». La primera vez, un aviso que se acepta (D-59).
- **Por qué:** decisión anunciada. Se cumple en la base (RLS sin rama de administración y sin `is_staff()`), porque
  «Ver como» solo cambia menús.
- **Lo que queda:** los nombres y roles del equipo los ve todo el equipo en «Escribirle a alguien». Administración
  puede crear cuentas del equipo (es su trabajo); cada rol que da le llega al jefe como aviso (D-58), y una cuenta
  nueva lee «Todo el equipo» desde el principio.
- **Cómo se cambia:** `chat_can_read()` en una migración nueva.

## D-51. Quién habla con quién lo decide el jefe (28/10/2026) — **Confirmar con Juan** (parejas cerradas de entrada) — **Reemplazada por D-79 a D-88 (29/10/2026)**: Mensajes son canales, sin aviso.
- **Qué:**
  - solo el jefe, con doble factor, cambia las reglas, en «Mensajes → Quién habla con quién» (administración no);
  - **por defecto todos hablan con todos**; las reglas son por pareja de roles distintos: las 10 parejas entre los
    cinco roles que no son el jefe. Cada fila muestra a quiénes afecta («Redes (nombres) ↔ Política (nombres)»);
  - **a todos siempre se les permite escribirle al jefe** y el jefe le escribe a todos;
  - con dos roles **gana la regla más restrictiva**;
  - un grupo solo se arma si **todas** las parejas del grupo pueden hablar;
  - si el jefe cierra una pareja, lo escrito antes se sigue leyendo pero ya no se escribe ahí («El jefe cerró los
    mensajes entre Redes y Política. Puedes leer lo anterior.»); en un grupo, solo deja de escribir quien tiene la
    pareja cerrada con alguien del grupo;
  - **«Todo el equipo» no sigue estas reglas**: lo dice la pantalla, donde está también «Solo el jefe escribe en Todo
    el equipo», y lo repite la confirmación al cerrar una pareja. Las reglas tampoco tocan las notas de trabajo (la
    nota de Grabación al editor, los comentarios de piezas).
- **Por qué:** «permitir o restringir quién habla con quién». Por pareja de roles porque son pocos, se entiende en una
  lista a 360 px y el jefe puede predecir el resultado. Excepciones por persona y «Redes con Redes» quedan como
  pregunta.
- **Cómo se cambia:** tabla `chat_rules`; la regla efectiva en `chat_pair_allowed()` y su espejo `pairAllowed()` de
  `src/lib/domain/chat.ts`.

## D-52. La agenda en los mensajes: la base la cuida al escribir y al leer (28/10/2026) — **Confirmar con Juan** (modo estricto o no)
- **Qué:**
  1. **Al escribir**, la base rechaza un mensaje cuando: (a) en la conversación hay alguien de **Redes o política**
     (todas las filas de miembros, activos o no, y todos sus roles) o es «Todo el equipo»; (b) quien escribe **conoce
     la agenda**: tiene jefe, despacho, IVT, Grabación o administración; y (c) el texto tiene una fecha o una hora
     **concreta** (`public.text_has_concrete_datetime`: horas de reloj como «10:30», «3 pm», «a las 3», «3 de la
     tarde», «15h», «mediodía»; fechas de calendario como «12 de noviembre», «12/11», «12-11-2026», una fecha ISO o un
     día de la semana con su número, «el sábado 24») o
     lleva un enlace de mapas o unas coordenadas (`chat_has_map`). Antes de revisar solo se quitan la ruta interna
     exacta `/<sección>/<uuid>` y el número de un post de X (`/status/<cifras>`); lo demás, enlaces de afuera
     incluidos, se revisa como texto. Para **Grabación** (sin jefe, despacho ni IVT) se quitan antes los tiempos del
     video sueltos («2:15», no «a las 2:15» ni «2:15 pm»), y la app le pregunta «¿2:15 es un tiempo del video? Si es
     una hora, no va aquí.» con «Sí, es del video» / «Corregir». Si el mismo mensaje tiene además un día relativo
     («mañana 7:00 salimos», «el sábado 9:30»), el tiempo no se quita: cuenta como hora y se rechaza (revisión del
     29/10: dos «sí» seguidos dejaban pasar la hora de salida).
  2. **Las palabras relativas no se rechazan** («hoy», «mañana», «pasado mañana», «esta tarde», «esta noche», los días
     de la semana, «el lunes», «el fin de semana»). A quien conoce la agenda, en una conversación con Redes o política,
     la app le pregunta antes de enviar: «“mañana”: ¿dice cuándo va el jefe? Si es de la agenda, no va aquí.» con
     «Enviar igual» y «Corregir» (**enmienda E1 del 28/10**: para que el jefe pueda decir «hoy» en el chat).
  3. **Cada mensaje guarda `agenda_clear`** (lo pone la base, con el mismo detector concreto): falso cuando su autor
     conoce la agenda y el texto tenía fecha u hora concreta o un mapa (pasa en conversaciones sin Redes ni política,
     como jefe ↔ despacho).
  4. **Al leer**, un mensaje con `agenda_clear` falso solo lo ve el jefe con doble factor o quien tiene jefe, despacho,
     IVT o Grabación **y no tiene Redes ni política**. Los demás ven «Mensaje oculto: tenía una fecha o una hora de la
     agenda.». Así, si alguien de Grabación pasa a Redes, o la única persona de Redes de un grupo se desactiva y vuelve,
     no lee lo que se escribió con fechas mientras no estaba.
  - **Redes y política** escriben libre: no conocen la agenda, así que no pueden filtrarla.
  - **Falsos positivos** que se rechazan: «Barrio 23 de Enero» (es una fecha de calendario), «a las 3 escuelas», un
    enlace con una fecha. Se aceptan: el rechazo explica cómo decirlo sin fecha («lo antes posible», «el día del
    evento»), y la app avisa **mientras escribes**, nombrando la palabra («“10:30” no puede ir aquí»). El texto queda en
    la caja; nunca se repite el texto en el error ni en los registros.
  - La nota «Aquí está Redes o política: sin fechas, horas, ni cuándo sales o llegas.» la ve solo quien conoce la
    agenda, y solo en esas conversaciones. «Cuándo sales o llegas» no lo detecta la base: es guía.
  - **Nombres de grupo:** siempre con el detector completo (`text_has_datetime`, también «hoy» o «mañana») y sin
    mapas, estén o no Redes o política: nadie pregunta antes de guardar un nombre, todos lo leen cada vez, y un nombre
    no tiene `agenda_clear` (alguien que pase a Redes después lo seguiría leyendo; revisión del 29/10).
- **Por qué:** regla 4: «la agenda del jefe se cumple en la base de datos, no solo en la pantalla». La fuga real es
  alguien que conoce la agenda escribiéndole a Redes o política; ahí la base cierra, y la marca por mensaje cubre los
  cambios de rol y de miembros. «Hoy» o «mañana» solos no dan la hora ni el lugar; rechazarlos frustraba al jefe en
  cada mensaje. Con la pregunta, quien escribe decide sabiendo la regla, y lo concreto (la hora, la fecha, el mapa)
  sigue cerrado en la base. `text_has_concrete_datetime` tiene su copia exacta en la app (`firstConcreteDateTime` en
  `src/lib/domain/chat.ts`), comparada con los casos de `tests/unit/fixtures/chat-text-cases.ts` y con textos
  generados en `tests/rls/chat.test.ts`.
- **Lo que queda:** una palabra relativa enviada con «Enviar igual» llega tal cual (Redes la lee). El número de un post
  de X no se revisa (no lleva fecha ni teléfono).
- **Cómo se cambia:** `chat_message_guard()`, `text_has_concrete_datetime()`, `chat_strip_refs()`, `chat_has_map()`,
  `chat_reader_knows_agenda()` en una migración nueva, junto con su copia en `src/lib/domain/chat.ts` y los casos de
  `tests/unit/fixtures/chat-text-cases.ts`. **Para volver al modo estricto** (que «hoy», «mañana» y los días de la
  semana también se rechacen): cambiar `text_has_concrete_datetime` por `text_has_datetime` en `chat_message_guard()`
  (migración nueva) y quitar la pregunta del compositor (el caso `relative` de `chatTextProblem()` y su `relativeOk`
  en `sendMessage`).
- **Ajuste del 29/10 (R5):** dice «canal» donde decía «conversación» y cuenta solo a los miembros **actuales**. En un canal **sin** Redes ni política, el mensaje de quien conoce la agenda queda con `agenda_clear` falso también por una palabra relativa («mañana», «el lunes»): quien entre después (D-85) o gane Redes o política ve «Mensaje oculto», nunca un «mañana» que la hora del mensaje vuelve fecha. Donde ya están Redes o política, E1 sigue igual.

## D-53. Teléfonos: nunca en un mensaje (28/10/2026)
- **Qué:** la base rechaza un mensaje o un nombre de grupo que parezca tener un teléfono (`text_has_phone`), en
  cualquier conversación y venga de quien venga, revisando el texto completo salvo la ruta interna exacta y el número
  de un post de X (un enlace como `https://x.com/0414-555-1234` o uno de `wa.me` se rechaza). Mensaje: «Los teléfonos no
  van en los mensajes: los contactos van en la ficha, con doble factor.»; si el número largo es parte de un enlace:
  «Ese enlace tiene un número largo que parece un teléfono. Si es de la plataforma, pega su dirección; si no, quita el
  número.»
- **Por qué:** los contactos de terceros se guardan aparte y con doble factor (D-34, D-41); Grabación y Redes no usan
  doble factor, y el jefe lee todo. Una sola regla fácil de explicar.
- **Cómo se cambia:** `chat_message_guard()` y `chat_start()`.

## D-54. Lo escrito queda: sin editar, sin borrar, sin adjuntos; enlaces a la plataforma (28/10/2026) — **Confirmar con Juan** (cuánto se guardan)
- **Qué:** un mensaje no se edita ni se borra (la base lo impide, también al sistema por `TRUNCATE`). Se guardan como
  el resto de la plataforma, sin fecha de vencimiento. La gente lo sabe antes de escribir (D-50, D-59). Sin adjuntos.
  Para hablar de un evento, una pieza, una obra, un reporte, una publicación o una tanda de tweets, se pega su dirección
  de la plataforma (`/eventos/<id>`…) y la conversación la muestra como una tarjetita con el título **que ve quien
  lee** (si no lo puede abrir: «Algo que no puedes abrir»). Las direcciones no llevan fecha (regla 4).
- **Por qué:** regla 3 (auditoría y borrado lógico; nadie podría borrar con `guard_soft_delete` porque administración
  no ve los mensajes). Los enlaces reutilizan el RLS de cada pantalla sin columnas nuevas.
- **Cómo se cambia:** el permiso de borrar exigiría otra columna y otra regla (pregunta en `PENDIENTES.md`).
- **Ajuste del 29/10 (R5):** igual, sin la frase «la gente lo sabe antes de escribir»: ya no hay aviso (D-79).

## D-55. Avisos de mensajes: al teléfono, sin el texto (28/10/2026)
- **Qué:** un mensaje nuevo avisa por push (tipo `chat_message`) a los miembros que no lo silenciaron, con título
  «Mensaje nuevo» y cuerpo «De <nombre> (<rol>)», enlace `/mensajes/<id>`. Nunca el texto ni el nombre del grupo. No va
  a la campana (no hay dos números para lo mismo, y 360 no los cuenta) y nunca por correo. Se agrupan como los demás
  avisos («Tienes 3 mensajes nuevos»), respetan las horas de silencio y se apagan en «Qué avisos quiero» → «Mensajes
  nuevos del equipo».
- **Por qué:** la pantalla de bloqueo muestra título y cuerpo, y el teléfono puede ser compartido; regla 8.
- **Cómo se cambia:** `notifyChat()` en `src/lib/notify.ts`; `summaryPayload()` en `src/lib/push/deliver.ts`.
- **Ajuste del 29/10 (R5):** el aviso va a los miembros **actuales** del canal que no lo silenciaron (quien salió no recibe nada), nunca en un canal archivado; dice «Mensaje nuevo · De Daniela (Redes)» o «Del jefe», nunca el texto ni el nombre del canal.

## D-56. Cómo llegan los mensajes: revisión periódica por rutas GET (28/10/2026)
- **Qué:** la conversación abierta pide lo nuevo cada 5 s mientras la pantalla está a la vista y hay señal; el número
  del sobre, cada 30 s. Las dos lecturas van por **rutas GET** (`/api/mensajes/[id]/nuevos`, `/api/mensajes/sin-leer`)
  con un tope de 8 s, como la persona (`db(session)`), sin guardarse en el teléfono. **Enviar** llama a la acción
  directo y sin refrescar la página: la burbuja sale al instante con «Enviando…», la caja queda libre y los envíos van
  en orden por `clientId` (un reintento nunca duplica). Sin Realtime en esta versión.
- **Por qué:** Next 16 manda las acciones del servidor de a una, y una que quedó colgada sin señal dejaría esperando a
  «Enviar»; refrescar la página en la demo puede traerla de otro servidor sin el mensaje recién enviado. Realtime no
  tiene cómo probarse en la base en memoria ni en CI. Son 9 personas.
- **Cómo se cambia:** `src/components/chat/chat-feed-core.ts` (`CHAT_POLL_MS`, `CHAT_BADGE_MS`,
  `CHAT_FETCH_TIMEOUT_MS`). Realtime (`postgres_changes`, que respeta RLS) cuando se pueda probar en `fb-dev`.
- **Ajuste del 29/10 (R5):** igual (5 s el canal abierto, 30 s el sobre); el sobre cuenta canales no archivados con algo nuevo. Si el jefe saca a alguien mientras tiene el canal abierto, la revisión recibe 410 y la pantalla cambia a «Ya no estás en este canal.» y deja de preguntar. Solo cuando la base lo confirma (`chat_was_removed()`: una fila suya con `removed_at` y ninguna actual); un 404 (en la demo, un canal creado en otro servidor, D-88) es «nada nuevo esta vez» y la pantalla sigue preguntando; al enviar, el texto vuelve a la caja (revisión 2 de R5).

## D-57. Mensajes en la demo: cada servidor tiene los suyos (28/10/2026) — **Reemplazada por D-79 a D-88 (29/10/2026)**: Mensajes son canales, sin aviso.
- **Qué:** la demo trae conversaciones sembradas (inventadas, mismos ids en cada servidor): **todas las directas entre
  las 8 personas del equipo** (28; las que no tienen mensajes no salen en la lista hasta el primero, así «Escribirle a
  alguien» abre el mismo id en cualquier servidor), un grupo, «Todo el equipo» y **un mensaje sin leer para cada una de
  las 8**. Nadie tiene el aviso aceptado: cada persona lo ve la primera vez. Arriba de Mensajes, solo en la demo: «En la
  demostración, lo nuevo (mensajes, grupos y los cambios de «Quién habla con quién») puede no verse con otra cuenta o en
  otro teléfono. No escribas nada real: en la demostración cualquiera que entre como jefe lo lee.» Si una conversación
  no existe en ese servidor (un grupo creado en otro), se ve «Esta conversación se creó en otro servidor de la
  demostración. Prueba con las que ya están.».
- **Por qué:** D-02/D-39: cada servidor de Vercel tiene su base en memoria; un id nuevo creado en uno da 404 en otro.
  En la demo toda sesión cuenta como doble factor, así que «Todas» se abre con solo entrar como jefe.
- **Lo que queda:** en la demo una conversación que existe pero que esa persona no puede leer muestra el mismo texto
  de «otro servidor» (no se filtra nada, pero puede confundir). Dos personas conversando desde dos teléfonos se prueba
  en `fb-dev`.
- **Cómo se cambia:** `src/lib/db/seed-parts/chat.ts`; el texto en `CHAT_DEMO_NOTICE` (`src/lib/domain/chat.ts`).

## D-58. El rol de jefe solo lo da el sistema; cada rol del equipo que se da le llega al jefe (28/10/2026) — **Confirmar con Juan**
- **Qué:** migración `20261028002350_boss_grant.sql`: dar el rol `boss` (en `user_roles` y en `invitations.roles`)
  solo lo puede hacer el sistema (sin persona: la semilla, una migración, el comando de instalación o el alta de
  Supabase que copia los roles de una invitación que hizo el sistema). Administración ya no lo da, ni en «Equipo» ni en
  «Invitar»; la casilla «Jefe» se ve apagada con «El rol de jefe lo da el comando de instalación.». Una invitación que
  nombra al jefe solo se puede anular. El comando: `npm run db:first-admin -- <correo> "<nombre>" --jefe` (el mismo
  script del primer administrador; no manda nada). Además, cada rol del equipo que da **una persona** crea un aviso en
  la campana del jefe («Administración le dio el rol Grabación a <nombre>.» o «Administración invitó a … como Redes.»),
  con enlace a «Quién habla con quién».
- **Por qué:** el jefe lee todas las conversaciones (D-50) y aprueba todo (`can_approve()`). Antes administración podía
  invitar otra cuenta con el rol de jefe, ponerle doble factor y leer «Todas» o aprobar. Esto cierra el «Lo que queda»
  de D-41 para el jefe. Con el aviso, una cuenta nueva que entra a «Todo el equipo» no pasa sin que el jefe lo sepa.
- **Lo que queda:** quitar el rol de jefe sigue siendo de administración (cerrar no abre nada). Administración todavía
  puede invitar a alguien como despacho (D-41); el jefe recibe el aviso. Las invitaciones pendientes con el rol de jefe
  que hizo una persona antes de esta migración las anula la misma migración (`invited_by` no nulo; las del sistema
  quedan): si no, el alta las copiaría sin preguntar (revisión del 29/10, `tests/rls/boss-grant-pending.test.ts`).
- **Cómo se cambia:** `guard_boss_grant()` y `notify_team_role_grant()` en una migración nueva; `roleGrantProblem()`
  en `src/lib/roles.ts`; `scripts/first-admin.ts` y `scripts/create-first-admin.mts`.
- **Ajuste del 29/10 (R5):** el aviso al jefe abre `/mensajes` (antes «Quién habla con quién»); dar el rol de jefe también lo mete en todos los canales (D-81). El rol importa porque el jefe aprueba todo y está en todos los canales.

## D-59. El aviso de Mensajes se acepta una vez antes de escribir (28/10/2026) — **Reemplazada por D-79 a D-88 (29/10/2026)**: Mensajes son canales, sin aviso.
- **Qué:** la primera vez que alguien entra a Mensajes ve un diálogo: «El jefe puede leer todas las conversaciones. Lo
  que escribes queda guardado y no se borra. Administración y 360 no las leen.» (en la demo, más la línea de D-57) con
  «Entendido». Se guarda en `chat_notice_ack`, donde cada persona ve solo su fila (sin rama de administración). Sin
  aceptarlo no hay caja para escribir («Para escribir, acepta el aviso.» con «Ver el aviso»), y la base no deja
  escribir (`chat_may_post`). Escape lo cierra sin aceptar: se puede leer.
- **Por qué:** «todos ven un aviso» se anunció; aceptarlo una vez es la forma de saber que lo vieron, sin volver a
  molestar.
- **Cómo se cambia:** la tabla `chat_notice_ack` (se inserta la fila propia; no se borra); el texto en `CHAT_ACK_TEXT`.



---------------------------------------------------------------------------------------------------------------------

**Ronda 4 (29/10/2026): Redes por formato, meses y feed, como la referencia que pidió Hillary.** El encargo del 29/10
(«Redes igual a la de Mila»): Redes por formato (Reels, Posts, Carruseles, Historias, YouTube, Fin de mes y Tweets), meses
con cupo, un feed de 24 espacios por mes, revisión por pieza y un tablero. Se copió la lógica y las pantallas, nunca el
código, el contenido, la marca ni las reglas de copy de la referencia. Migración nueva:
`20261029000100_redes_formatos.sql` (cuatro tablas con RLS: `content_months`, `feed_slots`, `piece_details`,
`piece_notices`; no edita ninguna aplicada; en `fb-dev` desde el 30/10). Nada cambia la aprobación del jefe, la regla de
la agenda, Tweets ni la publicación manual. Las preguntas para Hillary siguen los valores por defecto de abajo
(`PENDIENTES.md`, al final). Cierra lo que D-37 dejó esperando.

## D-60. Redes por formato: dónde está cada cosa (29/10/2026)
- **Qué:** `/redes` es el **Tablero de Redes** para Redes, el jefe y administración. Debajo, una barra de secciones
  (`nav[aria-label="Secciones de Redes"]`): Tablero · Reels · Posts · Carruseles · Historias · YouTube · Fin de mes ·
  Feed · Tweets, y un botón «Buscar en Redes». Cada ítem de formato lleva lo del mes abierto: «Posts 3/8» (revisadas de
  su cupo), «⚠ 2» (sin copy) y la imagen faltante con su número (con texto para lectores de pantalla: «2 sin copy, 1 sin
  imagen»), como la barra de la referencia. Todos sus enlaces llevan el mes abierto (`?mes=`). Cada sección es
  `/redes/<sección>` (`reels`, `posts`, `carruseles`, `historias`, `youtube`, `fin-de-mes`); el feed es `/redes/feed`;
  la búsqueda `/redes/buscar`. En el menú, «Piezas» se cambia por **«Redes»**
  (Redes: Hoy, Agenda, Redes, Tweets, Publicar, Resultados, Biblioteca; en el teléfono Hoy, Agenda, Redes, Tweets y
  «Más»). El jefe ya tenía «Redes»: ahora abre el tablero, que trae abajo «Lo demás de Redes» (Tweets, Publicar,
  Resultados, Biblioteca con sus números, las mismas tarjetas de hoy). `/piezas` lleva a `/redes`. `/piezas/[id]` sigue
  siendo la dirección de cada pieza (notificaciones, Mensajes, 360, Buscar, Publicar y Hoy la usan). «Crear» → «Nueva
  pieza» abre «¿Qué quieres crear?» en el tablero (D-70); `/piezas/nueva` sigue para crear desde un evento, ahora con
  «Formato» y «Mes». «Por aprobar» y el Inicio del jefe no se
  mueven; el Inicio cuenta por formato.
- **Por qué:** el encargo del 29/10 (§2.1) reparte «Piezas» en secciones; el resto de Redes (Publicar, Resultados, Tweets,
  Biblioteca) ya funciona y Hillary lo quiere igual (§0). Cambiar la dirección de la pieza rompería los enlaces de
  Mensajes, que la base reconoce por patrón (`internal_chat.sql:121`).
- **Cómo se cambia:** `NAV` en `src/lib/roles.ts`; la barra en `src/components/redes/redes-nav.tsx`; las rutas en
  `P/redes/**`.

## D-61. Una pieza, un formato; qué sale queda congelado y qué es guion queda libre (29/10/2026)
- **Qué:** columna nueva `pieces.format` (`reel`, `post`, `carousel`, `story`, `youtube`, `month_end`). Cada sección
  muestra solo su formato. El formato se elige al crear y **no cambia cuando la pieza ya tiene archivo**. Por formato:
  - **Reel:** título (sale como título del Short), copy, video 9:16, portada 9:16, «Referencia» (foto de cómo tiene que
    verse: locación, encuadre, pose; solo planificación, no sale), **tomas** una por una («Lo que dice», «La acción»,
    «Texto en pantalla»; «Traer del storyboard» las copia del evento), aprobado, publicado, receptividad.
  - **Post:** texto del arte con su jerarquía (Antetítulo, Titular, Sellos, Letra pequeña), Concepto visual, Caption
    (= copy largo), CTA, Hashtags, Notas de publicación, «Enlaces / referencias», imagen con «Proporción» 4:5 o 1:1.
  - **Carrusel:** láminas en orden con su papel sugerido (Portada → Desarrollo → Resumen → CTA), cada una con su texto
    y su imagen de 1080×1350; Hook, CTA, Caption (= copy largo) y Hashtags.
  - **Historia:** «Idea original» (el campo principal, como en la referencia), Formato del sticker (Encuesta, Quiz,
    Pregunta, Deslizador, Repost, Tip, Cuenta regresiva, Enlace, Detrás de cámaras, Otro), «Texto del sticker»
    (pregunta u opciones), «Enlace del sticker» (solo `https://`), Texto en pantalla, Seguimiento, media 9:16 (foto o
    clip). Nivel verde por defecto. El título queda chico en la cabecera (lo usan el selector, la búsqueda y la campana).
  - **YouTube:** título (sale con el video), guion por tomas, descripción con capítulos (= copy largo), video 16:9 y
    miniatura 16:9.
  - **Fin de mes:** imágenes en orden con su título y su nota, y el copy. Sin cupo.
  
  **Lo que sale** queda congelado o vuelve al jefe: el archivo y la portada (versión, como hoy), **las imágenes del
  carrusel y de Fin de mes** (lista ordenada dentro de la versión: cambiar una imagen o el orden crea una versión
  nueva), los **copies** (como hoy), **el título del reel y del video de YouTube** (YouTube y Shorts lo publican) y, en
  la historia, **el texto en pantalla y el sticker** (tipo, texto y enlace: se escriben en la app al publicar, así que
  son lo que sale). **Lo que es guion o planificación** se edita libre y no devuelve la pieza: tomas, texto del arte,
  concepto, hook, CTA, hashtags, notas, enlaces, idea original, referencia, proporción, seguimiento, textos de las
  láminas, mes, espacio del feed, orden, pilar, receptividad y marcas de diseño. En el post, el carrusel, el reel y
  YouTube, el copy es lo único que sale como texto: CTA y hashtags son ayudas que se pasan al copy con «Poner en el
  copy» (eso sí lo devuelve si estaba aprobada, porque cambia el copy). En una pieza aprobada, lo que sale se ve en
  lectura con el botón «Editar (vuelve al jefe)»: confirma una vez y después se guarda solo, sin diálogos mientras se
  escribe.
- **Por qué:** «lo que sale es exactamente lo aprobado» (§0) ya lo cuida la base con versiones, copies y
  `guard_publication`; si el texto del arte cambia pero la imagen aprobada no, lo que sale es igual. Una segunda fuente
  de caption rompería la comparación de `guard_publication`. Las historias son muchas y cortas: el verde las agrupa.
- **Cómo se cambia:** la lista de formatos en `pieces_format_check` (migración nueva) y `FORMATS` en
  `src/lib/domain/redes.ts`; qué devuelve al jefe, en `redes_piece_rules()`, `story_details_reopen_review()` y
  `notices_reopen_review()`.

## D-62. Estados: se calculan, nunca se ponen a mano (29/10/2026)
- **Qué:** el chip de estado de cada tarjeta es: **Borrador** (borrador o con cambios pedidos, con la línea «Pidieron
  cambios»), **En revisión** (esperando al jefe), **En revisión · ✓ Lista** en tono `ok` (aprobada sin publicación; la
  fila de revisión dice ✓ «Revisado y listo para publicar»), **Programado** (aprobada con una publicación programada),
  **Publicado** (con al menos una publicación hecha; la tarjeta se pone verde). Son los cuatro estados del pedido; el
  «✓ Lista» evita que Redes espere al jefe por una pieza que ya aprobó (el tablero la cuenta en «Revisados»). `pieces.status` sigue con sus cinco valores. «Sin
  programar» es solo del feed (pieza sin espacio).
- **Por qué:** la referencia tiene un selector libre que se salta la revisión; aquí nada puede saltarse la aprobación
  (§0), y `guard_publication` exige `status = 'approved'` para cada red.
- **Cómo se cambia:** `displayState()` en `src/lib/domain/redes.ts`.

## D-63. «Revisado y listo para publicar» es la aprobación del jefe; «Publicado» es «Ya lo publiqué» (29/10/2026)
- **Qué:** en la tarjeta, la casilla «Revisado y listo para publicar» **muestra** la aprobación (✓ con «Aprobó el jefe»).
  Al jefe, en una pieza en revisión, le sale «Revisar» → `/aprobar/[id]?volver=<la sección, el mes y #pieza-<id>>` (la
  sala de revisión con su lista); al decidir vuelve a la tarjeta, que se abre y muestra ✓. No hay otra aprobación. En
  un borrador o con cambios pedidos, la fila dice **«Enviar a aprobación»** con lo que falta en lista («Sube la imagen
  4:5.», «Falta el copy largo.») y el enlace «Generar copies» (`/piezas/[id]#copies`). «Publicado» muestra las
  publicaciones hechas; si no hay, el botón **«Ya lo publiqué»** abre un
  diálogo: redes (cada una con su link), «Subir captura» y «Guardar». Crea publicaciones manuales ya publicadas con el
  copy y la portada aprobados (la misma regla de hoy); sin aprobación, el botón está apagado con «Falta la aprobación
  del jefe»; con el diseño desaprobado después de aprobar, apagado con «El diseño quedó desaprobado: el jefe tiene que
  volver a verla» (y la base tampoco deja, D-64).
- **Por qué:** §2.4 del pedido lo dice así; la base ya obliga link y copy aprobado.
- **Cómo se cambia:** `markPublishedNow` en `src/lib/actions/publications.ts`; el diálogo en
  `src/components/redes/card/published-dialog.tsx`.

## D-64. Diseño aprobado / desaprobado, con nota (29/10/2026)
- **Qué:** dos botones que se excluyen («Diseño aprobado», «Diseño desaprobado»; tocar el activo lo quita) y la nota
  «¿Qué no le gustó del diseño?» (se ve al desaprobar o si hay nota). En todas las secciones. Los marcan **Redes y el
  jefe**; queda quién y cuándo («Desaprobó: Yorman, hace 2 h»). Desaprobar avisa a Redes en la campana (no a quien lo
  marcó). **No es la aprobación**: no cambia el estado ni deja publicar. Pero un diseño **desaprobado después de la
  aprobación no sale**: la base no deja programar ni «Ya lo publiqué» hasta que el jefe vuelva a aprobar
  (`approved_at` más nuevo que la marca). Cuando el jefe desaprueba una pieza aprobada, la pantalla le pregunta
  «¿Pedir cambios también?» («Sí, pedir cambios» manda la nota como pedido de cambios). La desaprobación que puso el jefe
  solo la quita o cambia el jefe.
- **Por qué:** §2.4; es la opinión de diseño, como en la referencia, pero en la base y con nombre. Sin la retención, el
  jefe desaprueba «la foto está oscura» y Redes ve «listo para publicar» igual.
- **Cómo se cambia:** `redes_piece_rules()` (quién), `guard_publication_design()` (la retención), `setDesign` en
  `src/lib/actions/redes.ts`.

## D-65. Receptividad del 1 al 10 (29/10/2026)
- **Qué:** estrellas «Receptividad del público (1 a 10)» solo en posts, reels y carruseles, con la etiqueta «Alta / Media
  / Baja receptividad» o «Sin evaluar». La ponen Redes y el jefe. El promedio va al tablero y cuenta solo las piezas
  puntuadas. Ayuda corta: «Cómo la recibió la gente en redes (comentarios, reacciones). No mide apoyo político.»
- **Por qué:** §2.4; la referencia cuenta las no puntuadas como 0 en el feed (error que no copiamos).
- **Cómo se cambia:** `pieces_rating_formats` y `redes_piece_rules()`; `receptivityLabel()` en el dominio.

## D-66. Avisos de cumplimiento (29/10/2026)
- **Qué:** cada pieza puede tener avisos («Antes de publicar»): tipo (Necesita autorización escrita · Verificar la fuente
  y la fecha del dato · Remitir a un profesional · Tono de testimonio · Otro) y texto. Los ponen **Redes y el jefe**; se
  ven como banda ámbar en la tarjeta, en la sala de revisión del jefe (arriba de «Aprobar», con una casilla más «Leí
  los avisos de cumplimiento» que la pantalla exige) y en el paquete de Publicar. Se marcan «Resuelto» (no se borran);
  no se puede cambiar el texto y resolverlo en el mismo paso.
  Un aviso **nuevo o cambiado en una pieza aprobada la devuelve a revisión**. «Aprobar todas las verdes» se salta las
  piezas con avisos abiertos («tiene avisos: ábrela»). Avisar al jefe en la campana.
- **Por qué:** «Para un gobierno esto importa» (§2.4): el jefe no puede aprobar sin haberlos visto. Bloquear en la base
  quitaría la decisión al jefe.
- **Cómo se cambia:** tabla `piece_notices`; `notices_reopen_review()`; la casilla en `P/aprobar/[id]/review-room.tsx`.

## D-67. Meses de contenido: una sola lista para secciones y feed (29/10/2026)
- **Qué:** tabla `content_months`. Pestañas «Mes 1 · 3 de 8» (piezas de ese formato en el mes, de su cupo) en cada
  sección y «Mes 1 · 21 de 24» en el feed, con el botón **«+ Nuevo mes»** visible después de las pestañas. Cambiar de
  mes en una sección lo cambia en todas y en el feed: la dirección `?mes=` manda y **todo enlace de Redes la lleva**
  (barra de secciones, acciones rápidas, saltos del tablero, chip «En Feed»); además, tocar una pestaña guarda el mes en
  una cookie por persona con `chooseMonth` (una página no puede escribir cookies al abrirse, Next 16). Menú ⋯ de las
  pestañas: «Cambiar nombre», «Borrar este mes». Una pieza viva siempre está en un mes vivo (la base lo cuida: sin mes
  va al primero; a un mes borrado no se puede mover ni crear). Cada tarjeta trae «Mover a otro mes». Borrar un mes pregunta «¿Borrar «Mes 2»? Tiene 5 piezas (3 en el
  feed). No se borra ninguna: pasan a «Mes 1» y las del feed quedan «Sin programar».»; la base comprueba que el número
  no cambió y no deja borrar el último mes. Al mover de mes una pieza que está en el feed, su espacio se va con ella al
  primer número libre del otro mes, o queda «Sin programar» si está lleno. Crean, renombran y mueven Redes, el jefe y
  administración; borran un mes Redes y el jefe.
- **Por qué:** §2.2–2.3. La referencia tiene dos listas unidas por posición, y eso mueve piezas al mes equivocado.
- **Cómo se cambia:** `delete_content_month()`, `move_piece_to_month()`; el texto en `src/lib/domain/redes.ts`.

## D-68. Cupo y pilares en Ajustes (29/10/2026)
- **Qué:** página **Ajustes → Cupo y pilares** (`/ajustes/contenido`, administración con doble factor). Claves
  `redes.quotas` (`{reel, post, carousel, story, youtube}`, enteros 0–200) y `redes.pillars` (lista de hasta 12
  `{key, name, tone}`). Por defecto el cupo de la referencia; pilares vacíos en `config/clients/fb.json`; la demo trae
  cinco inventados. El pilar de la pieza guarda la clave: renombrar un pilar no lo pierde; quitarlo deja la pieza «Sin
  pilar». Las secciones muestran el cupo y, a administración, «Cambiar en Ajustes».
- **Por qué:** «lo pone Hillary en Ajustes» (§2.1–2.2); Ajustes es de administración con doble factor. Pregunta 6 para Hillary.
- **Cómo se cambia:** `guard_redes_settings()`; `KEYS`/`valueSchemas` de `src/lib/actions/settings.ts`. Para abrirlo a
  Redes y al jefe: una política nueva en `app_settings` solo para esas dos claves.

## D-69. Feed: 24 espacios por mes, una sola numeración, una pieza en un solo lugar (29/10/2026)
- **Qué:** tabla `feed_slots` (mes, número 1–24, pieza). **El número es el orden real de publicación**: #1 abajo a la
  derecha, #24 arriba a la izquierda, en una rejilla de 3 columnas × 8 filas; una sola función lo calcula para la celda,
  el selector, el chip de la tarjeta, los avisos y Drive. Van posts, reels y carruseles (el 8/12/4 es el cupo, no un
  molde). Celda vacía: «Elegir publicación · Espacio #NN» → selector (formato → título, con miniatura o «Sin media»;
  «Ya en Mes X · #N» si está puesta; «De Mes 2» si es de otro mes). Celda llena: portada actual (cambia sola al subir
  otra), número, receptividad y, si se publicó, **marco verde y «✓ Publicado»**; al tocarla, menú «Abrir la tarjeta»,
  «Publicar antes (#N−1)», «Publicar después (#N+1)», «Cambiar de espacio», «Mover a otro mes», «Quitar del feed». Con
  ratón también se arrastra para intercambiar. «Vaciar este mes» con confirmación. Nada de eso borra piezas. La tarjeta
  dice «En Feed · Mes 1 #7» (lleva a su celda) o «Sin programar». Una línea en vivo anuncia los cambios («Movida al
  #6»). La base no deja una pieza en dos espacios ni un número con dos piezas, en ningún mes; si dos personas llenan el
  mismo espacio a la vez, las dos reciben la verdad («el #7 anterior quedó sin programar»). En escritorio, el clic en
  una celda llena abre su tarjeta (como la referencia) y un «⋯» visible en la celda abre el menú; en el teléfono, tocar
  abre el menú. Después de mover, el foco queda en la celda nueva y la hoja sigue abierta para seguir moviendo. Arriba,
  una **cabecera de perfil de solo lectura** con lo que ya está en la configuración: círculo «FB» en el color de la
  marca, «Freddy Bernal», «Gobernador del Táchira» y «21 publicaciones en Mes 1» (sin usuario, seguidores ni bio).
- **Por qué:** §2.3; en la referencia los botones solo aparecen con el ratón encima y el arrastre no sirve con el dedo;
  la numeración del código está al revés del pedido.
- **Cómo se cambia:** `cellToNumber()` en `src/lib/domain/redes.ts`; `feed_place()`, `feed_swap()`, `feed_clear()`;
  la cabecera en `src/components/redes/feed/feed-profile.tsx`.

## D-70. Crear, duplicar, plegar, reordenar; eliminar solo el jefe (29/10/2026)
- **Qué:** «+ Nuevo reel/post/…» en cada sección crea un borrador en el mes abierto, arriba, con la tarjeta abierta y el
  título listo para escribir («Reel nuevo»): la tarjeta sale de la respuesta de la acción, sin ir a otra dirección.
  «Crear» → «Nueva pieza», y «Crear» del tablero, abren **«¿Qué quieres crear?»** (Reel, Post, Carrusel, Historia,
  Video de YouTube, Pieza de fin de mes, cada uno con su ayuda corta, y «Se creará en Mes 1»): un toque crea el borrador
  y lleva a su sección con la tarjeta abierta. **Duplicar** (todas las secciones): copia
  título « (copia)», mes, pilar, campos, copies, archivo actual y avisos abiertos; no copia espacio, marcas, receptividad
  ni aprobación. **Plegar**: la cabecera queda con su miniatura; se recuerda por persona en el teléfono; en el teléfono
  las tarjetas empiezan plegadas **menos la primera** de la sección; la tarjeta a la que se salta (`#pieza-<id>`: desde
  el tablero, el chip «En Feed», la celda o al volver de «Revisar») se abre, se desplaza, toma el foco y destella. **Reordenar**: orden «A mano» con «Subir» y «Bajar» en el menú de la tarjeta (además
  «Orden del feed», «Más recientes», «Más antiguas»). **Eliminar**: solo el jefe, con doble factor, confirmación
  («¿Eliminar esta pieza? «…» sale de su sección y del feed. Administración puede recuperarla.»), borrado lógico; lo
  programado vuelve a borrador (ya lo hace `withdraw_publications`). Administración **no** elimina (ni con un update
  directo); solo **recupera**, en Ajustes → Cupo y pilares → «Piezas eliminadas» → «Recuperar» (vuelve a su mes, o al
  primero si su mes ya no está; sin espacio en el feed).
- **Por qué:** §2.1; regla «borrado solo lógico». Hoy solo administración borra (`guard_soft_delete`), por eso hace falta
  una excepción propia y probada.
- **Cómo se cambia:** `remove_piece()` y `guard_piece_soft_delete()`; si Hillary dice que Redes también elimina,
  `can_approve()` pasa a `has_any_role(array['social','boss'])` en `remove_piece()` y en `guard_piece_soft_delete()`.

## D-71. Tablero de Redes (29/10/2026)
- **Qué:** tabla formatos (filas: Reels, Posts, Carruseles, Historias, YouTube, Fin de mes) × siete columnas, para el mes
  o el trimestre elegido («Por mes» / «Por trimestre», con «Anterior» y «Siguiente»; trimestre = tres meses seguidos de
  la lista):
  | Columna | Cuenta |
  |---|---|
  | Revisados | aprobadas por el jefe (`status = 'approved'`) |
  | Por revisar | todavía no aprobadas (borrador, cambios pedidos, en revisión) |
  | Diseño aprobado / Diseño desaprobado | la marca de diseño |
  | Publicado | con al menos una publicación hecha |
  | Copy faltante | sin copy largo (Historias: sin «Texto en pantalla») |
  | Imagen faltante | Post sin imagen; Reel y YouTube sin portada; Historia sin media; Carrusel y Fin de mes sin láminas o con alguna sin imagen |
  
  Cada número es un botón: la primera vez lleva a la primera pieza de esa casilla y **cada vez siguiente a la que sigue**
  (vuelve al principio al terminar; se recuerda por persona en la pestaña). El salto va a
  `/redes/<sección>?mes=<mes de esa pieza>#pieza-<id>` (en «Por trimestre» la pieza puede ser de otro mes) y abre esa
  tarjeta. Cero: «Nada pendiente en esta categoría: ¡al
  día!». Arriba: «Receptividad media N de 10 · N piezas puntuadas», «Listas para publicar», «Programadas». Debajo:
  **Observaciones** (diseños desaprobados y avisos abiertos), **Actividad reciente** (12 últimas: creó, subió versión,
  aprobó, pidió cambios, publicó, marcó diseño, puso un aviso; con «hace 5 min»), **Acciones rápidas** (Nuevo reel, post,
  carrusel, historia, video de YouTube, pieza de fin de mes, Feed, Tweets de la semana) y la **búsqueda** «Buscar en
  Redes» (títulos, campos, copies, avisos y tweets, agrupado por formato). La actividad sale de las tablas que cada uno
  ya puede leer, nunca del registro de cambios (solo administración lo lee).
- **Por qué:** §2.5; en la referencia el número vuelve siempre a la misma pieza, la búsqueda solo filtra la sección
  abierta y «Copy faltante» cuenta todas las historias.
- **Cómo se cambia:** `src/lib/domain/redes-dashboard.ts` (reglas), `src/lib/data/redes.ts` (lecturas).

## D-72. Fin de mes y el resumen del mes (29/10/2026)
- **Qué:** sección propia, sin cupo, con piezas de imágenes ordenadas (título y nota por imagen) y copy; pasa por la
  aprobación como un carrusel. Arriba de la sección, **Resumen del mes** (se ve para todos, pensado para el jefe): por
  formato, hechas de su cupo, aprobadas y publicadas; receptividad media; diseños desaprobados; avisos abiertos; y la
  lista de lo publicado con miniatura. Es la rendición de cuentas del mes; se puede abrir también desde el Inicio del
  jefe («Resumen del mes»).
- **Por qué:** §2.1 «Para el jefe: el resumen del mes».
- **Cómo se cambia:** `monthSummary()` en `src/lib/data/redes.ts`; `src/components/redes/month-summary.tsx`.

## D-73. Historias y carruseles en Publicar (29/10/2026)
- **Qué:** las reglas por red suman los formatos `story` (Instagram y Facebook, 9:16, foto o clip de hasta 60 s) y
  `carousel` (Instagram hasta 20 imágenes, Facebook hasta 10, 4:5 o 1:1). La validación elige el formato de la red por
  el formato de la pieza (Reel → reel/video/short; Post → photo; Carrusel y Fin de mes → carousel con cada lámina;
  Historia → story; YouTube → video). Una red que no recibe ese formato sale con ✖ «Esta red no recibe historias».
- **Por qué:** «Publicar con validación propia por red» (§0); hoy no hay `story` ni `carousel` en las reglas.
- **Cómo se cambia:** `config/network-specs.json` (+ `npm run db:seed-client` en `fb-dev`), `validateFor` en
  `src/lib/data/publish.ts`.

## D-74. Drive: «Organizar por orden del feed», apagado (29/10/2026)
- **Qué:** botón en Ajustes → Google Drive, solo si están las cuatro llaves: variable `REDES_DRIVE_ORGANIZE=true`, Drive
  como almacenamiento (`storageProvider() === 'drive'`), Drive conectado y administración con doble factor. Hoy está
  apagado y no se ve. Al usarlo: carpeta `Feed/Mes-<n>` por mes con algo puesto (`n` = posición del mes, no su nombre),
  y la portada de cada pieza puesta se renombra `NN - Post.jpg` (número con dos cifras, formato en español). Sin el
  título: los títulos traen lugares y la regla 4 de Drive no deja lugares en nombres de archivo. Solo archivos que creó
  la app (permiso `drive.file`); nunca enlaces públicos.
- **Por qué:** §2.6 «déjalo detrás de un interruptor apagado».
- **Cómo se cambia:** `src/lib/storage/drive/organize.ts`; el nombre en `feedFileName()`.

## D-75. La regla de la agenda en Redes por formato (29/10/2026)
- **Qué:** nada nuevo lee `event_schedule`, `event_calendar` ni `done_on`; ninguna lectura nueva hace `select e.*`. Una
  pieza que nace de un evento muestra solo el título del evento («Ver evento»). El mes y el espacio los pone una
  persona: **nunca** se calculan con la fecha de un evento. La fecha de la tarjeta es la **fecha de creación de la
  pieza**, solo el día («26 oct 2026»), sin hora; la actividad usa tiempos relativos («hace 2 h»). Textos que lee Redes
  (título de la pieza, nombre del mes, nota de diseño, avisos, todos los campos de la tarjeta, hashtags incluidos): nunca
  un teléfono (base); y si quien escribe conoce la agenda (jefe, despacho, IVT, Grabación, administración), nunca una
  fecha u hora concreta (la misma regla de Mensajes, E1), comprobado en la base para cada uno. En la demo, las piezas sembradas tienen fecha de creación en días sin eventos.
- **Por qué:** regla 4 de `PROMPT-APP-FREDDY-BERNAL.md` y §0 del pedido; la prueba e2e de Redes falla si aparece el día
  de un evento o una hora.
- **Cómo se cambia:** los CHECK `*_no_phone` y los disparadores que llaman `text_has_concrete_datetime()`
  (`guard_piece_title`, `guard_content_month`, `guard_piece_details`, `guard_piece_notice`, `redes_piece_rules`).

## D-76. Las piezas que ya existían y el Mes 1 de la demo (29/10/2026)
- **Qué:** la migración pone el formato a las piezas que hay según su tipo (video y video corto → reel; foto y portada →
  post; carrusel → carrusel). Sin mes, una pieza se ve en el primer mes. En `fb-dev`, `npm run db:seed-client` crea
  «Mes 1» si no hay ninguno. La demo crea Mes 1, Mes 2 y Mes 3; las seis piezas de siempre (mismos ids y títulos) son
  reels de Mes 1; y Mes 1 se llena con piezas inventadas para FB (8 posts, 12 reels, 4 carruseles, 12 historias, 2 de
  YouTube, 1 de fin de mes), con 21 de los 24 espacios del feed ocupados (la fila de arriba libre, lo que viene), y con
  un post y un carrusel **en revisión** para que el jefe pruebe «Revisar» fuera de Reels. Copies con las reglas de FB
  (FAB, PAS y AIDA, «¡Saludos, Táchira!», «Por amor al Táchira»); nada de la referencia; sin nombres, teléfonos, fechas
  ni horas. En la demo (cada servidor tiene su base, D-39): un aviso una vez por persona, con «Entendido» («En la
  demostración, cada servidor guarda lo suyo: lo que creas o mueves puede no verse al recargar, con otra cuenta o en
  otro teléfono. Lo sembrado siempre está.»); lo recién creado se abre en la misma pantalla; una pieza o miniatura
  de otro servidor lo dice así en vez de «no encontrado» o una imagen rota (como Mensajes, D-57).
- **Por qué:** §2.1 «lo que ya hay se conecta, no se tira» y §3 «llena el Mes 1». Lo primero que Hillary va a probar
  (crear un reel, subir una imagen, armar el feed) es justo lo que la demo por servidor puede perder.
- **Cómo se cambia:** `src/lib/db/seed-parts/redes.ts`; el aviso en `REDES_DEMO_NOTICE`.

## D-77. Guías, tutoriales, 360 y documentos con las pantallas nuevas (29/10/2026)
- **Qué:** la guía de Redes, la del jefe y la de administración, los flujos, los tutoriales, las pantallas de 360 y sus
  fichas se rehacen con las etiquetas reales de las pantallas nuevas en el mismo cambio. Tutoriales nuevos: «Tablero de
  Redes», «Una sección de Redes», «El feed del mes»; el de la pieza se queda. Flujo nuevo «El mes de Redes». Los
  documentos se generan con `npm run docs:guides`.
- **Por qué:** D-42 (una sola fuente); las pruebas exigen que cada etiqueta exista en `src/` y cada pantalla tenga guía.
- **Cómo se cambia:** `src/lib/guides/**`, `config/assistant/**`, `src/lib/assistant/screens.ts`.

## D-78. Capturas lado a lado y lo que quedó distinto (29/10/2026)
- **Qué:** `docs/capturas/mila-vs-fb/` con pares de la plantilla limpia de la referencia (nunca su `index.html`, con
  textos neutros inventados y tapando lo que quedó de su marca en la plantilla) y de la nuestra con datos inventados,
  a 1366 y 360 px, y `README.md` con la tabla «igual / distinto / por qué». Lo distinto, a propósito: menú y textos en
  español; estados calculados; aprobación y publicación de verdad; una sola lista de meses; numeración del pedido
  (con las dos rejillas lado a lado); acciones del feed sin ratón; barra de secciones arriba y no a la izquierda (con
  los mismos contadores); cabecera igual en todas las tarjetas; campos que la referencia no deja editar; cabecera de
  perfil sin usuario, seguidores ni bio; post sin 9:16; sin «Ciudad», sin Metricool; borrar solo el jefe; nombres de
  Drive sin título.
- **Por qué:** §3 del pedido.
- **Cómo quedó:** 22 escenas a 1366×900 y 360×780, del tamaño de la ventana salvo el feed (88 JPEG, menos de 5 MB). En
  las de la referencia se taparon en gris su logotipo, su pie con el lema, el lema que la plantilla trae bajo «Reels» y
  «YouTube», una línea del tablero escrita para su negocio y la foto de perfil del feed; ninguna se quedó fuera.
- **Cómo se cambia:** `npm run capturas` (`scripts/capturas-fb.mts`) rehace las nuestras sobre la demo; las de la
  referencia se tomaron una vez de su plantilla limpia, fuera del repositorio (es código de otro proyecto), y solo se
  copiaron las imágenes ya limpias.

---------------------------------------------------------------------------------------------------------------------

---------------------------------------------------------------------------------------------------------------------

**Ronda 5 (29/10/2026): Mensajes como canales, sin aviso.** Lo pidió Juan el 29/10 sobre el aviso «El jefe puede leer
todas las conversaciones…»: «este aviso quítalo de todo donde salga, no tiene sentido que lo tengamos así, se siente
como si estuviéramos espiando a las personas», y después: «no pongas aviso, simplemente deja el canal de comunicación
ahí y ya, es más, podríamos algo tipo Slack o Discord, que sean canales de comunicación y el jefe pueda verlos todos, y
luego él es el que decide quién va en cada canal y en base a eso cada quien ve lo que tiene permiso, pero el jefe está
en todos». D-79 a D-88 (R4 usa D-60 a D-78). Migración nueva: `20261029090000_chat_channels.sql` (no edita ninguna
aplicada). Reemplaza D-49, D-50, D-51, D-57 y D-59; ajusta D-52, D-54, D-55, D-56 y D-58. La enmienda E1 sigue igual.

## D-79. Mensajes son canales, sin aviso (29/10/2026)
- **Qué:** dos tipos: **canales** (nombre, descripción corta y miembros) y **«Todo el equipo»** (uno; están todos los del
  equipo activos sin que nadie los agregue). No hay directos ni grupos que arme cualquiera. **No hay aviso en ninguna
  parte**: ni arriba de Mensajes, ni bajo el título, ni junto a la caja, ni diálogo para aceptar, ni línea de la
  demostración. Cada canal muestra arriba **quiénes están** («N personas» y los primeros nombres; al tocarlo, la lista
  «Miembros» con el jefe primero). Se entra por el sobre con el número de canales con algo nuevo; cada canal tiene su
  número de no leídos y cada persona puede **silenciarlo**.
- **Por qué:** el aviso «se siente como si estuviéramos espiando a las personas». Con canales, lo que decía el aviso lo
  dice la lista de miembros, como en Slack y Discord.
- **Cómo se cambia:** `chat_conversations.kind` y `chat_members` en la migración; los textos en `src/lib/domain/chat.ts`.

## D-80. El jefe arma los canales y decide quién va (con doble factor) (29/10/2026)
- **Qué:** solo el jefe con doble factor **crea** un canal (nombre de 1 a 60 letras, descripción opcional de hasta 140,
  al menos una persona además de él), le **cambia** el nombre y la descripción, **elige y cambia** quién está (en
  «Editar canal», con un solo «Guardar»; si quita a alguien la pantalla pregunta antes: «Kevin deja de ver este canal,
  también lo anterior.»), lo **archiva** o lo saca del archivo, y prende «Solo el jefe escribe» (en un canal o en «Todo
  el equipo»). Nadie más. Un canal de dos (el jefe y una persona) solo lo arma el jefe y siempre lo incluye. El nombre y
  la descripción nunca llevan teléfono, fecha, hora ni mapa (los leen todos los del canal, siempre). Las personas en
  «Nuevo canal» y «Editar canal» salen agrupadas por rol. Sin doble factor la pantalla lo dice («Para esto necesitas
  entrar con el doble factor.») en lugar del formulario.
- **Por qué:** «él es el que decide quién va en cada canal». Doble factor, como todo lo que hace el jefe.
- **Cómo se cambia:** `chat_channel_create`, `chat_channel_update`, `chat_channel_set_members`, `chat_channel_archive`,
  `chat_set_only_boss`; `src/lib/actions/chat.ts` (`createChannel`, `saveChannel`, `archiveChannel`).

## D-81. El jefe está en todos los canales, siempre, y se ve (29/10/2026)
- **Qué:** la base mete a cada persona con el rol de jefe en **cada canal** que se crea y en **todos los que existen**
  (archivados también) cuando el sistema le da el rol (D-58). Al jefe no se le saca de un canal (ni la pantalla, ni la
  tabla, ni el sistema). Si le quitan el rol, sale de los canales donde estaba solo por ser jefe. Una cuenta de
  administración nunca entra (el disparador va después de `guard_role_mix`, por eso se llama `zz_chat_boss_membership`).
  Un jefe con el perfil desactivado sigue siendo miembro para la base, pero no sale en las listas ni en «N personas».
- **Por qué:** «el jefe está en todos». Que lo haga la base evita un canal sin él; verlo en la lista reemplaza al aviso.
- **Cómo se cambia:** `chat_channel_add_bosses()`, `chat_boss_role_change()` y `guard_chat_member_change()`.

## D-82. Quién lee: los miembros de cada canal, nadie más (29/10/2026)
- **Qué:** cada persona ve y lee **solo los canales donde está** (con doble factor si su rol lo pide) y «Todo el equipo».
  Los demás no le salen ni por nombre (un enlace pegado a un canal ajeno dice «Algo que no puedes abrir»). El jefe lee
  porque es miembro de todos: **no hay rama de «leer todas»**. **Administración:** ninguno (una cuenta con
  administración no entra a Mensajes aunque tenga otro rol ni puede ser miembro). **360:** ninguno (`app.caller`). El
  registro guarda que hubo un mensaje, un canal o un cambio de miembros, quién y cuándo; nunca el texto, el nombre ni
  quiénes. Un miembro ve quién está **ahora**: nunca quién salió, cuándo ni quién lo sacó (alguien que salió solo se
  nombra como autor de un mensaje viejo).
- **Por qué:** «cada quien ve lo que tiene permiso». Se cumple en la base (RLS), no en la pantalla.
- **Cómo se cambia:** `chat_is_member()`, `chat_can_read()`, `chat_member_list()` y la política `chat_members_select`.

## D-83. «Todo el equipo» se queda (29/10/2026)
- **Qué:** un canal fijo con todos los del equipo activos, automático; no se renombra, no lleva descripción y no se
  archiva. El jefe puede prender «Solo el jefe escribe». Lo crea la base la primera vez que alguien lo abre; la demo lo
  trae sembrado.
- **Por qué:** es el canal de avisos generales del equipo; automático para que nunca falte nadie.
- **Cómo se cambia:** `chat_team_channel()` y la rama `kind = 'team'` de `chat_is_member()`.

## D-84. Sin directos, sin grupos, sin «Quién habla con quién» (29/10/2026)
- **Qué:** nadie le escribe aparte a otra persona ni arma grupos: se habla en los canales que arma el jefe. Se fueron la
  pantalla de parejas de roles, la tabla `chat_rules`, «Escribirle a alguien» y «Todas».
- **Por qué:** «que sean canales»; el jefe decide con nombres, no con reglas por rol.
- **Cómo se cambia:** volver a tener directos exigiría otro tipo en `chat_conversations.kind` y su regla de lectura.

## D-85. Entrar y salir de un canal (29/10/2026) — **Confirmar con Juan** (si el que entra lee lo anterior)
- **Qué:** quien el jefe **agrega** lee lo que ya se escribió en el canal (como en Slack; «Editar canal» se lo dice al
  jefe), salvo los mensajes guardados de la agenda (D-52, también los de palabras relativas escritos sin Redes ni
  política). Quien el jefe **saca** deja de ver el canal entero y de recibir sus avisos; si lo tenía abierto, la pantalla
  dice «Ya no estás en este canal.» (solo cuando la base confirma que lo sacaron, D-56). Guardar el canal no saca a
  quien está desactivado (el editor no lo muestra): sigue en el canal, sin leer nada, hasta que administración lo
  reactive (revisión 2 de R5). Nadie se sale solo (para no oírlo, «Silenciar»). Nada se borra: salir es una marca
  con la hora y quién lo sacó; volver es una fila nueva, con «Silenciar» apagado otra vez (su ajuste viejo no vuelve).
- **Por qué:** es lo que se espera de un canal; guardar la historia de miembros cumple la regla de auditoría.
- **Cómo se cambia:** `chat_channel_set_members()` y `removed_at` / `removed_by` de `chat_members`. Para que el que
  entra lea solo desde que entró, la regla de lectura miraría `created_at` de su fila.

## D-86. Archivar un canal (29/10/2026)
- **Qué:** el jefe archiva un canal que ya no se usa (pregunta antes: «¿Archivar «…»? Nadie podrá escribir en él…»):
  pasa a «Archivados», plegado al final; sus miembros lo siguen leyendo, nadie escribe (el jefe tampoco), no suma al
  sobre y sus miembros no cambian. «Sacar del archivo» lo devuelve tal cual. No se borra.
- **Por qué:** limpiar la lista sin perder lo escrito (D-54).
- **Cómo se cambia:** `archived_at` y `chat_channel_archive()`; `chat_may_post()` mira `archived_at`.

## D-87. Lo que ya existía: canales archivados; se van el aviso y las reglas (29/10/2026)
- **Qué:** la migración convierte cada directa y cada grupo en un **canal archivado** con los mismos miembros más el
  jefe; las directas se llaman «Conversación de <nombre> y <nombre>». Nada se borra. En `fb-dev` no hay mensajes reales,
  así que en la práctica no convierte nada. Se eliminan `chat_notice_ack`, `chat_rules`, `chat_start()`,
  `chat_pair_allowed()` y `chat_stamp_rule()` con sus reglas, disparadores y permisos (las filas del registro quedan, y
  Ajustes → Registro las nombra «Mensajes (antes de los canales)»). A los mensajes de las directas y grupos sin Redes ni
  política se les aplica una vez la regla estricta de la agenda (D-52, ajuste del 29/10): un «mañana» de quien conoce la
  agenda queda oculto, para que sacar del archivo y agregar a Redes o política no lo deje leer (revisión 2 de R5). El
  aviso al jefe por un rol nuevo abre `/mensajes` y los avisos viejos se corrigen.
- **Por qué:** convertir y no borrar cumple «lo escrito queda»; archivados, nadie escribe donde antes no estaba el jefe.
- **Cómo se cambia:** la sección 1 de la migración.

## D-88. Mensajes en la demo: canales sembrados, sin línea de demostración (29/10/2026)
- **Qué:** la demo trae canales inventados con ids fijos: «Todo el equipo», «Grabación y Redes», «Obras y comunidad»,
  «Jefe y despacho» (de dos) y uno archivado, «Jornada de salud». Cada una de las 8 personas tiene **un canal sin leer**.
  No hay línea de demostración en Mensajes. Un canal que esa persona no puede abrir (no está en él, o se creó en otro
  servidor de la demostración) dice una sola cosa: «Este canal no está en tu lista: o no estás en él, o se creó en otro
  servidor de la demostración.». Lo que la demo no puede mostrar (dos teléfonos, un canal nuevo visto desde otro
  servidor) está en `docs/DEMO.md`, no en la pantalla.
- **Por qué:** D-02/D-39: cada servidor de Vercel tiene su base en memoria.
- **Cómo se cambia:** `src/lib/db/seed-parts/chat.ts`; el texto en `CHAT_NOT_IN_LIST`.

## D-89. 360 contesta con sus respuestas: las guías, «Para todos», los flujos y las respuestas curadas (30/10/2026)
- **Qué:** 360 tiene un índice de respuestas (`src/lib/assistant/answers/engine.ts`) hecho con lo que la plataforma ya
  explica: las guías por rol (el trabajo, lo que se hace y lo que no, el día, las tareas con sus pasos, cada pantalla y
  sus preguntas), «Para todos», los flujos y la guía de administración. Encima van las respuestas curadas
  (`answers/*.ts`), con varias formas de preguntar y una respuesta por rol. La demo contesta con la mejor entrada cuando
  es segura. Con IA, las mejores entradas entran como fichas. Además se ordenó el camino de la demo:
  - la negativa de la agenda, solo para una trampa de verdad, aunque tenga etiquetas alrededor;
  - las herramientas, solo en su pregunta;
  - «¿puedo…?» con el «no puedes» del rol;
  - lo que se sube, por rol;
  - administración sin la oferta de avisarse a sí misma;
  - la charla y 360 mismo;
  - los conteos en `mis_pendientes`.
  Los detalles están en `docs/ASISTENTE.md`, «Respuestas de 360».
- **Por qué:** «que 360 sepa y pueda responder toda posible pregunta de cada usuario». Con 2694 preguntas calificadas,
  la base contestaba bien el 32 %. Casi todo lo que faltaba ya estaba escrito en las guías, pero 360 no lo leía.
- **Reglas que no cambian:** 360 nunca da la fecha, la hora, la dirección, el camino ni los contactos de un evento, a
  nadie. Las respuestas son textos fijos sin fechas, y una prueba lo revisa. 360 nunca lee ni manda Mensajes, y nunca
  pide ni muestra códigos. La red de salida sigue revisando fechas, lugares y contactos concretos en esos textos fijos.
  Una respuesta débil nunca le gana a «No estoy seguro…».
- **Cómo se cambia:** una respuesta que falta va en `answers/<rol>.ts`; su prueba de contenido revisa etiquetas, fechas y
  nombres. Los umbrales están en `engine.ts`: `STRONG` 0,62 y `WEAK` 0,45. La débil sola, `WEAK_ALONE` 0,52, está en
  `local.ts`. Si se sube `STRONG`, contestan más las fichas; si se baja, más el índice.

## D-90. La web pública va dentro de la misma app, sin Payload CMS (06/11/2026)
- **Qué:** la web nueva del gobernador, su administrador y la participación ciudadana se construyen en esta misma app
  (Next.js + Postgres con RLS), no con un CMS aparte. El CMS es propio: contenido por bloques, borrador y lo publicado,
  versiones, aprobación, programación y biblioteca de fotos, todo en la base (`20261106000110_web_publica.sql`):
  - Cada contenido (`web_items`) guarda el **borrador** (lo que se edita) y lo **publicado** (exactamente lo que se
    aprobó, lo único que lee el público). Publicar, programar, archivar y desarchivar solo con las funciones de la base
    y solo quien aprueba la web o el jefe; el editor toca el borrador y lo manda a aprobación.
  - No hay estado «aprobado»: publicar **es** aprobar (nada lo pondría nunca).
  - Lo que ya está en vivo se publica de nuevo ahora; no se programa (hay una sola foto por contenido: programarlo
    bajaría lo que está en vivo hasta esa hora). Lo nuevo sí se programa.
  - El SEO (título, descripción, imagen, canónica) vive dentro del borrador: también pasa por la aprobación.
  - Las fotos y archivos que nombra un contenido quedan **congelados** al publicar (clave, texto alternativo, pie,
    crédito, punto de interés): cambiar la biblioteca nunca cambia una página en vivo, y el público nunca lee la
    biblioteca. El texto alternativo es obligatorio en la base.
  - Cada borrador guardado es una versión (solo se agregan); «Volver a esta versión» la copia al borrador, nunca a lo
    publicado, y lo puede hacer quien edita.
  - Las formas de cada tipo y de cada bloque, en zod: `src/lib/web/schema.ts` y `src/lib/web/blocks.ts` (texto
    estructurado, sin HTML; enlaces solo a https, http, mailto o una dirección de esta web).
- **Por qué:** las reglas del repositorio (RLS en la base, `db(session)`, una sola entrada del equipo con invitación,
  código y doble factor) y el encargo del 6/11 («dentro de la misma app»). Payload traería otra autenticación, otro
  administrador y otra capa de datos que salta la RLS, y su compatibilidad con Next 16.4 / React 19.3 no está probada.
- **Cómo se cambia:** una migración nueva; los esquemas en `src/lib/web/`.

## D-91. Las direcciones: la web en `/`, el panel en `/panel` (06/11/2026)
- **Qué:** `/` pasa a ser la portada pública (en la siguiente etapa; hoy sigue mandando al equipo a su inicio). El panel
  conserva sus direcciones y su entrada es **`/panel`** (con sesión, al inicio del rol; sin sesión, a entrar). La app
  instalada abre `/panel` (el `id` del manifiesto sigue siendo `/`: es la misma app instalada). Los redirects internos
  del panel (entrar, doble factor, el logo, «Ir al inicio») ya van a `/panel`. El administrador de la web vive en
  **`/admin/web`** (contenido) y **`/admin/atencion`** (solicitudes), dentro del panel (misma sesión, menú y doble
  factor); por ahora son pantallas de espera con los conteos que la persona puede leer. `/acerca`, `/privacidad` y
  `/condiciones` son de la plataforma interna (las registró Google para Drive): no se tocan. Las legales de la web:
  `/aviso-de-privacidad`, `/condiciones-de-participacion`, `/accesibilidad`.
- **Por qué:** una sola app con dos caras; el teléfono del equipo sigue abriendo su panel.
- **Cómo se cambia:** `src/app/panel/page.tsx`, `src/app/manifest.ts`, `NAV` y `homeFor()` en `src/lib/roles.ts`.
- **Después (06/11):** `/` ya es la portada pública (`src/app/(web)/page.tsx`) y `/admin/web` y `/admin/atencion` ya
  tienen sus pantallas (D-98, D-99). La vista previa de un borrador vive en `src/app/(vista-previa)/`.

## D-92. Seis tipos de solicitud; la denuncia, privada de punta a punta (06/11/2026)
- **Qué:** reporte (un problema en la ciudad), petición, acotación, sugerencia, reconocimiento y **denuncia**. Ninguno es
  un servicio de emergencias (lo dice cada formulario). No hay muro público: lo enviado es privado; en público solo hay
  cifras y «lo atendido», que publica la coordinación sin datos de la persona (el nombre solo con su permiso, si no
  iniciales; una denuncia, solo «Denuncia atendida en el municipio X»).
  - Una denuncia la leen **solo** el operador de denuncias y la coordinación de atención: ni el jefe ni auditoría (para
    ellos cuenta solo en los totales por tipo y estado). Nunca lleva punto en el mapa ni referencia exacta, solo
    municipio y sector.
  - «¿Te sumas?»: antes de enviar, `citizen.similar_requests` dice cuántos reportes abiertos del mismo problema hay a
    100 m (o en el mismo municipio y sector) y sumarse da un comprobante propio. El mismo problema en el mismo sitio no
    se abre más de tres veces: el cuarto se suma solo al primero. Lo que escribe quien se suma lo lee solo el equipo, y
    su consulta nunca muestra el título ni el texto de la otra persona.
  - La máquina de estados está en la base (`set_request_state`): motivo obligatorio para requiere información,
    derivado, no procede, cerrado, resuelto (es la justificación de la resolución) y cualquier reapertura.
  - El código (`AC-2026-K7QM2H`) lo hace la base, al azar y sin orden.
  - Las áreas, quién está en cada una y las categorías las lleva administración; la coordinación las lee.
- **Por qué:** la unión de los dos encargos del 6/11; «nada de una denuncia es público».
- **Cómo se cambia:** `20261106000200_participacion.sql` y `20261106000300_citizen.sql` (con una migración nueva).

## D-93. Los roles de la web y de la atención (06/11/2026)
- **Qué:**

  | Rol (enum) | Nombre | Puede |
  |---|---|---|
  | `admin` | Administración | Ajustes, personas, áreas, catálogos y ajustes del sitio; nunca lee casos ni publica |
  | `writer` | Editor de la web | Crear y editar contenido y fotos, mandarlo a aprobación; nunca publica ni ve casos |
  | `web_publisher` | Aprobador de la web | Revisar, publicar, programar, archivar y volver a versiones (el jefe también) |
  | `attention_coordinator` | Coordinador de atención | Todas las solicitudes, denuncias también; asignar, unir, prioridad, fecha comprometida, cifras, exportar, «lo atendido» |
  | `reports_operator` | Responsable de área | Lo de su área o lo asignado a él (nunca denuncias): responder, notas, estados, evidencias |
  | `complaints_operator` | Operador de denuncias | Solo denuncias |
  | `auditor` | Consulta y auditoría | Leer solicitudes (sin el contacto de nadie) y su registro de cambios |

  El jefe publica la web y ve las cifras. `aid_operator` sigue sin usarse.
  - Siempre con **doble factor**: cada puerta de la base lo pide al token (`is_aal2()`), no a la lista editable, y la
    app lo exige para estos seis aunque alguien los saque de `security.mfa_roles` (`MFA_ALWAYS`).
  - Administración no comparte cuenta con el aprobador ni con los roles de la atención (como con el jefe y el despacho,
    D-41); el editor sí.
  - No son roles del equipo: no tienen 360, guías, tutoriales ni Mensajes. Su menú es «Web» o «Atención» y su inicio,
    esa pantalla (si además tienen un rol del equipo, conservan el inicio del equipo; con los dos de la web, primero
    «Atención»: tiene plazos).
  - Todavía no se dan desde Ajustes → Equipo (`INVITABLE_ROLES`): llega con las pantallas del administrador. En la demo
    hay una persona por rol y un responsable en cada una de dos áreas (`docs/DEMO.md`). **Después (06/11):** ya se dan
    desde Ajustes → Equipo, en «Web y atención ciudadana (siempre con doble factor)»; un responsable de área se invita
    con al menos un área («Cambiar» las edita después). El «Web» de Administración abre «Ajustes del sitio» y el del jefe,
    la web; los dos tienen también «Atención».
  - El rol `admin` sigue llamándose «Administración» (el diseño lo llamaba «Superadministrador»): el equipo ya lo
    conoce así y sus permisos son los de la tabla.
- **Por qué:** cada quien ve lo suyo y lo hace cumplir la base.
- **Cómo se cambia:** `src/lib/roles.ts` (nombres, menús, inicio); los permisos, con una migración nueva.

## D-94. En local con datos que se quedan, sin Docker (06/11/2026)
- **Qué:** `LOCAL_DATA_DIR=./.data` guarda la base de la demostración como un PGlite en disco, sembrado **una sola
  vez** (la marca `pglite.json` se escribe al terminar: un arranque que murió a medias empieza de cero), y los
  archivos de la demo debajo (`files/`, `uploads/`). Al arrancar con una migración nueva, se aplica sola. Un servidor por
  carpeta (`pglite.lock`). Sin la variable, todo como siempre (la demo de Vercel y las pruebas en memoria). Se entra con
  los atajos y códigos de la demo. Producción sigue siendo Supabase (Postgres, Auth y Storage). `docker-compose.yml`
  trae lo opcional (Postgres para las pruebas de RLS, ClamAV), sin probar aquí.
- **Por qué:** poder trabajar varios días con la web y la atención sin perder lo hecho, sin instalar nada.
- **Cómo se cambia:** `src/lib/db/local-data.ts`, `src/lib/storage/local-files.ts`.

## D-95. El contenido de prueba se marca y nunca va a producción (06/11/2026)
- **Qué:** noticias, obras, episodios, documentos, avisos, preguntas, indicadores y solicitudes de prueba salen solo de
  la semilla de la demo (`src/lib/db/seed-parts/web*.ts`) y todos sus títulos terminan en «(demo)». La web pública
  muestra en la demo una franja fija («Versión de prueba: el contenido es inventado.») y no se indexa (robots, meta y
  `X-Robots-Tag`) salvo con `SITE_INDEXABLE=true` (producción y decisión de Juan). Nada de biografía, fotos, teléfonos,
  correos, horarios, cuentas o parroquias inventadas: espacios «por completar» que se llenan desde el administrador.
  Los episodios no nombran ningún video real (sin código de YouTube); los documentos son PDF pequeños hechos al sembrar;
  las fuentes dicen que la cifra es inventada; los contactos de prueba van cifrados con la clave de la demo, en el
  dominio reservado `.test`. Tres comprobantes de prueba (`docs/DEMO.md`) abren su caso en «Consultar mi solicitud».
- **Por qué:** el repositorio es público y la web se enseña antes de la consulta legal.
- **Cómo se cambia:** `src/lib/db/seed-parts/web-content.ts` y `web-requests.ts`; la franja en `site.demo_banner`.

## D-96. El público lee con RLS también: el rol anon y el esquema citizen (06/11/2026)
- **Qué:** `withAnon(fn)` (`src/lib/db`) corre como el rol `anon`, sin claims y con RLS, en su propia transacción
  (como `withUser`; nunca dentro de otra). anon lee, columna por columna, solo lo publicado y vivo, los ajustes
  públicos, las redirecciones, los municipios y categorías activos y «lo atendido» (`src/lib/web/public.ts`); nunca
  una solicitud. Lo que hace un ciudadano sin cuenta va por las funciones del esquema **`citizen`**
  (`src/lib/web/participation.ts`), que revisan todo y contestan lo mínimo; un código o clave equivocados dicen siempre
  `not_found`. El esquema `citizen` **nunca** se expone en la Data API de Supabase: solo lo llama la app.
  - La clave del comprobante (80 bits, cuatro grupos de Crockford) la hace el navegador; a la base llega solo su HMAC
    con `PARTICIPATION_PEPPER` (también las llaves del límite: la galleta del dispositivo y la red, nunca la IP). En
    producción, sin pimienta no hay comprobantes.
  - El contacto se cifra en la app (AES-256-GCM con `PARTICIPATION_DATA_KEY`, el campo en los datos autenticados) y
    nadie lo lee de la tabla: solo `request_contact()`, que deja constancia de quién lo miró. En producción, sin clave
    no se guarda un contacto; en la demo hay una clave fija.
  - Límites persistentes por dispositivo y por red (`participation.rate_limits`); un intento fallido de consulta también
    cuenta.
  - Los archivos: dos baldes (`web-public`, público y en caché; `participacion-privado`, nunca público, solo por las
    rutas que revisan quién es con RLS), revisados por tipo real, tamaño y metadatos; el revisor (`ATTACHMENT_SCANNER`)
    decide qué se descarga: en producción solo «limpio».
- **Por qué:** «lo hace cumplir la base, no la pantalla», también para quien no tiene cuenta.
- **Cómo se cambia:** `20261106000300_citizen.sql` (con una migración nueva), `src/lib/participation/`,
  `src/lib/storage/`.

## D-97. La web vieja entra como borradores, con lo que falta marcado y la base de guardia (06/11/2026)
- **Qué:** `npm run web:import` (`scripts/web-import/`) trae los artículos de freddybernaloficial.com desde su API
  pública como **noticias en borrador**: nunca publica. Plan completo en `docs/PLAN-MIGRACION-Y-PRODUCCION.md`.
  - **Prueba por omisión:** sin `--apply` no escribe nada (ni filas, ni archivos); con `--apply` escribe en
    `DATABASE_URL` (Supabase) o en `LOCAL_DATA_DIR`, como el sistema, igual que la semilla del cliente.
  - **De dónde vino** cada borrador y cada foto (`web_import_items`, `web_import_media`, migración
    `20261106300100_web_importador.sql`): otra corrida actualiza solo lo que **nadie tocó** (el `rev` del contenido es
    el que dejó el importador) y nunca lo publicado, archivado, en revisión o editado. El equipo de la web lo lee con
    RLS (el editor dice «Traído de la web vieja» y qué revisar); nadie lo escribe por la API.
  - **El texto se convierte, no se pega:** el texto estructurado de la web (sin HTML); YouTube pasa a ser el video de
    la nota (campo nuevo `youtubeId` de la noticia); redes, tablas e inserciones se vuelven enlaces o listas.
  - **Datos personales:** correos, teléfonos y cédulas salen con una marca («[correo retirado]»…). **Fotos sin texto
    alternativo:** entran con «[Por escribir] …» (la base exige el texto; el importador no lo inventa). La base no
    publica ni lo uno ni lo otro (`guard_web_item_ready`), y el editor lo dice antes.
  - **Redirecciones 301** de cada dirección vieja importada (artículo, `?p=`, categoría, etiqueta, mes, foto); una
    hecha a mano nunca se pisa; un archivo viejo que no se trajo responde **410**; los tamaños de WordPress de una
    foto, las páginas de una lista y el feed de un artículo encuentran la suya. La web busca cada dirección vieja por
    el índice (unas 25.000 filas con todo importado), no la tabla entera.
  - El feed va a `/actualidad`, no a la portada: así lo siembra ya la configuración del cliente
    (`config/clients/fb.json`, `web.redirects`, según `docs/diagnostico.md` §5), y una redirección sembrada no se pisa.
- **Por qué:** «trae lo que se pueda como borradores, sin el correo personal, con las redirecciones 301» (encargo del
  6/11, §8), en un repositorio público (nada de la web vieja va a git) y sin publicar nada que nadie revisó.
- **Cómo se cambia:** `scripts/web-import/` (lo que trae y cómo), `src/lib/web/import-marks.ts` (las marcas, con la
  misma migración: una migración nueva si cambian), `src/lib/web/redirects.ts` y `redirect-map.ts` (las búsquedas).

## D-98. El administrador de la web: lo que se decidió al construirlo (06/11/2026)
- **Qué** (`/admin/web`; uso en `docs/MANUAL-ADMIN-WEB.md`):
  - **Los ajustes del sitio salen al momento, sin aprobación** (navegación, pie, contactos, cuentas, WhatsApp, portal,
    YouTube, identidad, datos estructurados y los avisos). Los cambian Administración, quien aprueba la web y el jefe.
    A cambio, cada contacto, cuenta o canal lleva su marca «Verificado»/«Verificada» y «Activa»: en producción solo
    sale lo activo y verificado; en la demo también lo «por confirmar», marcado. Las notas de cada cuenta van en
    `site.internal_notes`, que no es público.
  - **La dirección de algo ya publicado** solo la cambia quien aprueba o el jefe; la vieja queda llevando a la nueva con
    un 301 y las redirecciones anteriores se reescriben para que no haya cadenas.
  - **El texto es estructurado**, nunca HTML: una caja por parte (párrafo, título, subtítulo, lista, cita, «por
    completar») y, adentro, solo `**negrita**`, `*cursiva*` y `[texto](enlace)`, que los botones escriben.
  - **Dos personas a la vez:** cada guardado sube el `rev` del contenido; quien guarda sobre un cambio ajeno recibe un
    aviso de conflicto, y publicar exige el mismo `rev` que se revisó. Lo que no se guardó queda solo en ese equipo.
  - **La biblioteca vive en el balde público desde que se sube** (lo decidió la revisión de seguridad, `SEGURIDAD.md`):
    nombres al azar que no se pueden listar; nunca archivos de la gente que escribe a Atención; un archivo subido por
    error se archiva y se borra a mano en Supabase Storage.
  - **Avisos** (campana y teléfono, nunca correo): al enviar, a quien aprueba la web; al decidir, a quien lo envió. El
    jefe no recibe el aviso de «Por aprobar» (lo ve en la lista) — **Confirmar con Juan** si lo quiere.
  - **Redirecciones:** solo hacia direcciones de esta web; nunca desde una dirección que la web ya responde; una hecha a
    mano nunca la pisa el importador.
- **Por qué:** «nada se publica sin aprobación» para el contenido; los ajustes son datos de operación que cambian poco y
  ya llevan su verificación, y esperar una aprobación para corregir un teléfono equivocado sería peor.
- **Cómo se cambia:** `src/lib/actions/web.ts`, `web-site.ts`, `web-core.ts` y `src/lib/web/cms/`.

## D-99. La atención: lo que se decidió al construirla (06/11/2026)
- **Qué** (`/admin/atencion`; uso en `docs/MANUAL-ATENCION.md`):
  - **La fecha comprometida es interna:** la persona nunca la ve. Sale sola como el menor entre los días de la
    categoría y los de la prioridad (hoy, 15 por categoría; urgente 2 y alta 5), y la coordinación la cambia a mano.
    Administración ajusta los días en «Áreas y plazos».
  - **El motivo de un estado es interno;** lo que lee la persona es el «Mensaje para la persona» (obligatorio solo al
    pedir información). El tablero mueve de un toque solo los pasos que no piden motivo.
  - **Los correos de estado** (después de una respuesta, un pedido de información, un cambio de estado o una unión)
    dicen qué pasó y que entre a «Consultar mi solicitud»: nunca el texto del equipo, el tipo de solicitud ni la clave.
    Salen por el buzón; con datos reales, solo si el correo de verdad se puede entregar, y el buzón guarda la dirección
    enmascarada (la revisión de seguridad del 06/11).
  - **Los avisos internos** de un caso vencido o sin movimiento (5 días por omisión) llegan una vez al día por caso,
    desde las 7:00, a la coordinación y a su responsable, por la campana y el teléfono (nunca por correo), con solo el
    código.
  - **El CSV** usa «;» entre columnas y UTF-8 con BOM (para Excel en español), ninguna celda ejecuta fórmulas, no lleva
    descripciones, mensajes ni archivos, llega hasta 5.000 filas y cada exportación queda registrada. El contacto, solo
    para la coordinación y caso por caso en el registro; auditoría nunca.
  - **El mapa** muestra solo los puntos que la persona marcó con su permiso, y nunca una denuncia.
  - **La moderación nunca descarta una crítica:** spam es «No procede» sin escribirle a quien la envió; retirar un dato,
    un mensaje o un archivo deja en la historia qué y por qué, nunca lo que decía.
  - Auditoría y el jefe leen las notas internas de lo que pueden ver — **Confirmar con Juan** (`docs/PENDIENTES.md`
    W11).
- **Por qué:** no prometer lo que no depende del equipo; que nada que diga el tipo o el contenido de una solicitud
  quede en un buzón o en la pantalla de un teléfono; y que cada mirada a un dato personal deje rastro.
- **Cómo se cambia:** `src/lib/domain/attention.ts` (la máquina de estados, los textos y las definiciones de las
  cifras), `src/lib/actions/attention*.ts`, `src/lib/data/attention*.ts`; lo de la base, con una migración nueva.

## D-100. La oficina: la línea de contenido dibujada como una oficina isométrica (06/11/2026)
- **Número:** se escribió como D-90 en `main`; al juntarlo con la web pública (que ya usaba D-90 a D-99) pasó a D-100.
- **Pedido de Juan:** una sala isométrica donde se hace todo el trabajo para el jefe: Recepción → Guionistas →
  Storyboard → Grabación → Editor en línea (líder humano) → Editor brutal → aprobación del jefe → Copywriting →
  Publicador → Analizador. Respuestas del 06/11: **pantalla nueva en la app**, **mezcla** (la IA propone y una persona
  revisa) y **todo el equipo la ve**.
- `/oficina`: la oficina dibujada a mano en SVG, **gigante, de lujo y estilo fábrica**, con los nombres de las salas
  por fuera, como una lámina de anatomía (Juan, 06/11): paredes oscuras con
  dorado, piso de mármol, y por el medio una cinta transportadora que pasa por todas las salas en orden, con una máquina
  en cada sala y cajas que van de Recepción al Analizador. Antes: (Juan, 06/11: «que tengan movimiento… que caminen por su oficina, que
  trabajen»): diez salas con su mobiliario, gente que trabaja en su puesto (teclea, presenta a cámara) y gente que camina
  por el pasillo llevando el trabajo de una sala a la otra; pantallas, luz de grabación y gráficos que se mueven. Colores
  de `--c-office-*` en `tokens.css`; sin imagen que bajar; con «reducir movimiento» todo queda quieto. Las etiquetas
  tienen el número real y llevan a la lista de su sala. En el teléfono el dibujo se desliza de lado. Debajo las diez salas con qué hace cada una,
  quién trabaja, un ejemplo inventado y sus actividades (solo título y código: nunca cuándo ni dónde). `/oficina/[id]`:
  el recorrido de una actividad y el trabajo de su sala.
- Lo nuevo vive en `event_office` (migración `20261106000100_office.sql`): el guion (borrador → lo aprueba solo el jefe,
  con doble factor; si se cambia después, vuelve al jefe), «Ya está limpio» y «Edición lista» (la brutal espera la
  limpia). Escriben el jefe y Redes; **«Ya está limpio» solo el jefe** (Juan, 06/11: el líder humano es él). Sin
  nombres en las salas, solo el puesto; política y el IVT sin oficina; IA apagada (respuestas de Juan del 06/11). Las demás salas leen lo que ya existe (storyboard, material, piezas, copies,
  publicaciones). `office_facts()` da solo cuentas y sí/no, igual para todos los que ven el evento.
- **Recepción (06/11, dictado de Juan, `docs/AGENTES-OFICINA.md`):** la lectura de la actividad (la ficha; sin ficha,
  tres preguntas obligatorias; lo encontrado afuera con su fuente, solo en el Táchira) y **el jefe la aprueba** antes del
  guion. En `event_office` (`rx_*`, `reception_status`), con las mismas reglas que el guion.
- La sala sale de `officeRoom()` (`src/lib/domain/office.ts`); una actividad de antes de la oficina no vuelve a
  Recepción por lo que ya se hizo afuera.
- **IA:** apagada hasta el OK legal (D-26). El borrador del guion sale de una plantilla con las palabras de la ficha
  (sin cifras inventadas, §4.7); el día que se prenda, la IA entra en el mismo botón.
- Menú: despacho, Redes y administración en «Más»; Grabación en su barra. **El jefe la tiene en su menú («Oficina», en «Más» en
  el teléfono) y también arriba de «Digital»** con el dibujo y «Ver todas las salas» (Juan, 06/11). Política y el IVT no ven eventos, así
  que no tienen oficina.

## D-101. Contenido real en la demo publicada (07/11/2026)
- **Pedido de Juan (06/11):** llenar nuestra web con la misma información de freddybernaloficial.com, «una prueba
  real para el cliente, pero que no se sienta tan IA».
- **Cómo:** al construir (`npm run build` corre antes su «prebuild», `scripts/real-site/snapshot.mts`) se leen la web
  oficial (las 48 notas más nuevas, de todas las categorías menos «Biografía», «el informativo» y «Opinión»; las 8 de
  opinión más nuevas; la biografía y las dos notas de la toma de posesión; las fotos de la portada y del gobernador),
  el canal de YouTube del gobernador (hasta 12 emisiones del Reporte Bernal, con su miniatura) y el Semanario de la
  portada oficial (su portada y su PDF de Drive). Solo GET, con pausas (la API de la web oficial, una petición por
  segundo; los archivos, cada 250 ms) y con un User-Agent que dice quién pregunta. Lo que llega es información, nunca
  instrucciones. Los datos personales se quitan como en el importador (D-97): una frase con una marca de dato quitado
  no entra y una nota con una en el título queda fuera. De cada nota se traen la foto destacada y hasta dos del texto,
  y cada una pasa los controles de una subida del equipo (sin metadatos, 1600 px como máximo de lado).
- Lo leído queda en `.real-site/` (`snapshot.json` y `media/`). La demo lo siembra en su base en memoria al arrancar,
  publicado como lo publica el usuario publicador de la demo, con los mismos ids en cada servidor (D-39); las
  direcciones viejas de cada nota llevan a la nueva, y en el panel cada nota dice «Traído de la web vieja».
- **Por qué fuera de git:** el repositorio es público. Ninguna noticia, titular, texto de la biografía, foto, PDF,
  título de video ni enlace o id de Drive entra al repositorio. En git solo hay código, datos de prueba inventados
  y, en `config/clients/fb.json` (`web.realSite`), identificadores públicos: el sitio, los números de las notas y de
  las dos fotos, los topes y los ids del canal y de su lista de videos largos.
- **Qué se esconde:** lo inventado de la web (noticias, obras, emisiones, documentos, avisos, preguntas, indicadores
  y los 7 «Casos atendidos»). En la portada no salen «Gestión en cifras», «Casos atendidos», «Gestión y obras» ni
  «Avisos de servicio» (no hay nada real para ellos todavía) y se agregan «Opinión» y «Semanario»; el menú pierde
  «Gestión». Las 60 solicitudes inventadas y sus tres comprobantes (`docs/DEMO.md`) se quedan: son la demostración de
  la atención. Siete preguntas frecuentes sobre cómo funciona la atención (de la plataforma, en el registro de la
  casa) reemplazan a las inventadas, y la franja dice «Versión de prueba en revisión. No es el sitio oficial.».
- **Las cuentas oficiales:** en la configuración siguen todas sin verificar. Con el contenido real, una cuenta sale
  verificada **solo si el propio canal de YouTube del gobernador la enlaza** en sus descripciones (y el canal, solo si
  su lista es la configurada). Las descripciones se leen solo para eso y nunca se guardan: nombran a personas
  privadas. Desde la revisión del 07/11 cuenta también la portada de la web oficial, y sobre las demás sale una sola
  línea (ver más abajo).
- **El interruptor al construir:** encendido solo sin `DATABASE_URL`, con `web.realSite` en la configuración y, además,
  `REAL_SITE_CONTENT=1` o el despliegue de producción de Vercel (`VERCEL=1` y `VERCEL_ENV=production`) sin
  `REAL_SITE_CONTENT=0`. Así la producción de la demo se enciende sola (Juan no tiene que poner variables) y CI y las
  versiones de prueba de cada rama quedan con lo inventado. Apagado, borra una `.real-site/` vieja y termina en menos
  de un segundo. `vercel.json` fija `"buildCommand": "npm run build"` para que Vercel siempre corra el prebuild.
- **Al abrir la app** se usa la foto solo si `.real-site/snapshot.json` existe en la carpeta de la app, no hay
  `DATABASE_URL`, no corren las pruebas (`VITEST`) y `REAL_SITE_CONTENT` no es `0`. Playwright pone
  `REAL_SITE_CONTENT=0`: las pruebas de punta a punta ven siempre lo inventado. Con `LOCAL_DATA_DIR`, la base local se
  queda con lo de su primera siembra (para cambiar, se borra la carpeta).
- **Si algo falla, la construcción no falla:** `REAL_SITE_BUDGET_S` (480 si no se pone) es el tiempo máximo. Si la web
  oficial no responde o se acaba el tiempo, se usa la última copia buena, guardada en `.next/cache/real-site/` (Vercel
  conserva esa carpeta entre construcciones); sin copia no se escribe nada, la demo sale con el contenido inventado y el
  registro lo avisa en grande. Lo bajado se guarda por dirección en la misma caché: otra construcción no baja todo de
  nuevo. Si solo fallan YouTube o el Semanario, esa parte sale de la copia anterior.
- **El Reporte Bernal:** se piden, en orden, la lista pública de videos largos del canal y el canal mismo (ahí solo
  cuentan los títulos que nombran el programa, `brand.programName`), cada una dos veces con una pausa corta. Solo si
  la construcción tiene `YOUTUBE_API_KEY` (opcional), después la API oficial de YouTube (Data API v3: la misma lista,
  y lo que dura cada video). La clave va solo en una cabecera de la petición: nunca en una dirección, en el registro,
  en un error ni en `.real-site/`. Si nada responde, las emisiones salen de la copia anterior, o no salen
  (`/reporte-bernal` muestra su mensaje). El 07/11, desde el contenedor donde se construyó, las listas de YouTube
  respondían 404.
- **Las fotos y los PDF** se sirven por la ruta de la biblioteca (`/api/archivos/web/<clave>`), que lee `.real-site/media/`
  cuando la carpeta de la demo no los tiene. Esa carpeta viaja solo con esa función (`src/lib/storage/serve-public-file.ts`
  y `next.config.ts`); nada va a `public/`.
- **Lo que no se pudo (07/11, primera vuelta):** 3 fotos en AVIF quedaban fuera; desde la revisión salen en WebP.
- **Medido el 07/11, en el contenedor:** la primera lectura, sin caché, 68 s y 109 peticiones; con la caché, 26 s y
  13. 48 noticias, 8 de opinión, 1 Semanario y 95 fotos (17,2 MB); `snapshot.json` pesa 275 KB. La app arranca en
  una décima de segundo y la primera página que usa la base tarda unos 4 s.
- **Junto con esto (06–07/11):** los textos de la web y de la atención pasaron al registro de la casa: tercera persona
  institucional en el contenido y «usted» al ciudadano; nada de andamio para el público («Por completar», «Foto por
  subir…»: solo en la vista previa); un solo texto por aviso legal (`src/lib/participation/notices.ts`, que ya no es un
  ajuste del sitio); y los nombres «Noticias», «Gestión en cifras», «Casos atendidos», «Emisiones», «Memoria y Cuenta»
  y «Material para la prensa».
- **Cómo se cambia:** `config/clients/fb.json` → `web.realSite` (topes y números), `scripts/real-site/` (la lectura),
  `src/lib/db/seed-parts/web-real.ts` (cómo se siembra y compone) y `src/lib/web/real-site.ts` (la forma de la foto y
  el interruptor al abrir).
- **Lo que cambió con la revisión del 07/11:**
  - El encendido automático vale solo para el repositorio de la demo (`web.realSite.vercelRepo`, comparado con
    `VERCEL_GIT_REPO_OWNER`/`VERCEL_GIT_REPO_SLUG`): una copia del repositorio público no republica la web oficial sola.
    Apagado, el registro dice qué vio de `VERCEL` y `VERCEL_ENV` (Vercel las da si el proyecto tiene encendido
    «Automatically expose System Environment Variables»).
  - Una cuenta sale verificada si la enlaza el canal de YouTube del gobernador **o la portada de la web oficial**; si
    YouTube no responde, se conservan las que verificó antes. Las que nadie confirmó no llevan «sin verificar» una por
    una: una sola línea dice que están en proceso de confirmación.
  - Nada de más de una semana vuelve de una construcción anterior: ni la copia entera ni una parte (cada parte traída
    guarda el día en que se leyó, `report.partsSince`). Las subidas de WordPress valen una semana en la caché de
    descargas, y una foto que llega como página (o no pasa los controles) se olvida y se pide otra vez.
  - Las fotos AVIF salen en WebP (con sharp, que Next ya instala; sin él, quedan fuera como antes). Los archivos de la
    demo van hasta 4 MB (una función de Vercel no responde más de 4,5 MB) y el JSON de WordPress y de la API de YouTube
    tiene tope.
  - El feed del propio canal de YouTube escribe su canal sin «UC» en la cabecera: se reconoce. Las partes de una
    emisión cuentan una vez y la dirección simple es de la primera que se subió (o de la más larga, con la API).
  - Al abrir: la franja dice siempre «Versión de prueba en revisión. No es el sitio oficial.», en Ajustes no se cambian
    el nombre, el cargo, las cuentas, los contactos ni la franja, cada servidor guarda su propia caché de las páginas, y
    solo se sirven los archivos que nombra la foto mientras el servidor muestra el contenido real. Cada contenido lleva
    el momento de la web oficial, no el del arranque. La demo nunca se indexa, aunque `SITE_INDEXABLE` diga que sí.
  - El Semanario sin nombre propio se llama por el día de su edición; un PDF guardado lleva el nombre de su contenido.
    `/transparencia` dice antes de la primera cifra que son de ejemplo. `/reporte-bernal` sin emisiones lleva al canal.
