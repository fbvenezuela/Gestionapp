# Seguridad (primera versión)

Actualizado: 29/10/2026 (seis roles, fichas, agenda compartida; en la tercera vuelta, Mensajes y el rol de jefe solo
por el sistema). Qué se hizo para blindar la plataforma y qué falta.

## Lo que ya está
1. **RLS en todas las tablas.** Cada consulta de una persona corre con su rol y su sesión (`set local role
   authenticated`). Ningún permiso se decide en el navegador. El rol `anon` no lee ninguna tabla.
2. **Pruebas que intentan lo prohibido** (`tests/rls/rls.test.ts` y, desde el 27/10, `por-rol.test.ts`, `roles.test.ts`,
   `retire-roles.test.ts`, `fichas.test.ts`, `agenda-shared.test.ts`, `recording.test.ts`, `privacy-hardening.test.ts` y
   `round-review.test.ts`), en Postgres en memoria y en Postgres 16 real en la CI. Entre otras:
   - redes no ve fecha, hora ni lugar exacto: ni consulta directa, ni joins, ni la vista, ni subconsultas, ni el
     registro de cambios;
   - sin doble factor, el jefe no ve la agenda ni aprueba; solo el jefe aprueba (Supervisión salió el 27/10);
   - nadie publica sin aprobación (la base lo exige); nadie crea una pieza ya aprobada;
   - solo administración borra (borrado lógico) y da roles; nadie se da roles a sí mismo;
   - quien graba solo sube material crudo y su storyboard a sus eventos asignados;
   - un usuario sin rol no ve nada (tampoco quien quedó sin rol al retirar Secretaría y Supervisión);
   - las cinco frases de §8 del encargo del 27/10, una por bloque en `por-rol.test.ts`: Redes no ve fecha ni hora; el
     IVT y política no ponen fecha; solo el jefe y el despacho la ponen; el jefe ve todo (cuenta lo mismo que la base en
     cada tabla del negocio); Grabación solo ve lo suyo. Y otra prueba revisa que ninguna regla de la base nombre a
     Secretaría o Supervisión y que toda lista de roles del equipo incluya al jefe;
   - el registro de cambios no se puede editar ni borrar;
   - desde el 28/10 (D-41, `tests/rls/por-rol.test.ts` y `tests/rls/round-review.test.ts`): administración no se da
     roles a sí misma ni una cuenta junta administración con el jefe o el despacho (solo el jefe aprueba; solo el jefe y
     el despacho ponen fecha); la lista del doble factor siempre nombra a administración, el jefe, el despacho, política
     y el IVT; los contactos de las fichas comunitarias son solo de política, el despacho y el jefe; el registro de
     cambios guarda de los contactos solo qué campo cambió; un teléfono no entra en la nota de Grabación, en el texto
     principal de un reporte ni en el título, el lugar o el resumen de un evento; un evento borrado ya no lo ve quien
     lo graba (tampoco su fecha), y Redes, el jefe y el despacho ya no ven su ficha técnica (el jefe y el despacho
     todavía leen su fecha y su lugar directo en la base, con doble factor; la app no los muestra); el código del
     evento lo pone la base; un evento realizado no se mueve.
3. **La regla de fecha y hora en la base** (`event_schedule` aparte).
   **Quién la ve, por rol (27–28/10):** el jefe y el despacho, con doble factor; quien graba, solo sus eventos
   asignados (y no si el evento está borrado); **el IVT**, con doble factor, solo las visitas nacidas de una ficha de
   obra (la fila entera: día, hora, dirección y contactos del sitio; nunca la ficha técnica, el storyboard ni el
   material); administración la lee. **Política nunca:** ve solo las actividades nacidas de sus reportes, con «Ya tiene
   fecha» y sin el día. **Redes nunca.** La escriben solo el jefe y el despacho (`can_manage_agenda()`). «Por ponerle
   fecha» es una vista sin columna de fecha, y la historia de las fichas nunca guarda la fecha de la visita.
   También en:
   - tiempo real: `event_schedule` no está en la publicación de Realtime;
   - búsquedas: corren con los permisos de la persona y no buscan en fechas ni direcciones;
   - correos y avisos: nunca llevan fecha ni hora de un evento;
   - títulos de eventos (`src/lib/domain/event-title.ts`): no se guardan con una hora («a las 9», «3 pm», «12m»,
     «a las 10 antes del acto», «de 8 a 12», «8-12», «entre 9 y 10»), un día de la semana, «hoy», una fecha en
     números con año («28/10/2027») ni una escrita con el año pasado, este o uno de los dos siguientes («28 de
     octubre de 2027»); la fecha del propio evento tampoco, ni una lista o un tramo de días que la incluya («28 de octubre»,
     «octubre 28», «28/10», «28-oct», «el 28», «1.º de mayo», «mañana», «del 26 al 30 de octubre», «los días 27 y
     28»). Una cantidad («a las 3 escuelas», «de 8 a 12 años», «23 de Enero, 1500 bolsas») sí pasa, y un nombre o una
     conmemoración con fecha («Barrio 23 de Enero», «Escuela Domingo Savio», «Mañana Deportiva», «19 de abril de
     1810») también, salvo si el evento es ese mismo día; el evento tampoco se puede mover a ese día. Quien no ve la
     fecha no puede agregar al título una fecha nueva: comprobarla contra la del evento le diría cuál es;
   - archivos: rutas con uuid, sin fecha ni nombre original;
   - registros: el servidor no imprime datos de la agenda;
   - el día realizado (`events.done_on`): cerrado como columna para la API; `event_done_on()` lo da a Redes y a quien
     ve la fecha, nunca a política (D-40);
   - la ficha de obra: Redes y Grabación no leen la tabla; `visit_obra_ficha()` les da solo las columnas de la pestaña
     «Ficha de obra», mientras la visita está viva, sin los días de la obra ni nombres (D-40);
   - teléfonos y fechas en texto libre: la base rechaza un teléfono en lo que Redes y Grabación leen de la ficha de obra
     y un teléfono, una fecha o una hora en el motivo de una cancelación, con la misma regla que la app (D-40).
4. **Auditoría** por trigger en cada cambio (quién, qué, cuándo, antes y después), en una tabla en la que solo se
   agrega. Solo administración la lee.
5. **Entrar:** solo por invitación, con código de 6 dígitos por correo (sin contraseñas), **doble factor TOTP**
   exigido en la base para los roles sensibles, sesiones que caducan (12 h en demo; Supabase en producción) y
   administración puede cerrar las sesiones de alguien o desactivarlo.
6. **Claves:** solo en variables de entorno. La de servicio de Supabase nunca va al navegador. `.env*` está en
   `.gitignore`; la CI corre gitleaks en cada cambio.
7. **Archivos privados:** se descargan con URLs firmadas de 5 minutos, después de comprobar el permiso de la persona.
   Toda foto se limpia en el teléfono antes de subir, aunque sea pequeña o venga sin tipo (se reconoce por sus
   bytes): sale sin EXIF (ubicación GPS, cámara, fecha), XMP ni textos. JPEG, PNG y WebP se limpian sin
   recomprimir (mismos píxeles, nunca más pesada; solo queda el giro de la foto); solo se recomprime la que pasa de
   2560 px, y se queda la versión limpia más liviana. HEIC se recomprime a JPG; si el teléfono no puede abrirla
   (por ejemplo HEIC en Android), no se sube y se pide pasarla a JPG. Las fotos se preparan de una en una. Los
   videos no se tocan: la ubicación de la cámara se apaga en los teléfonos del equipo.
8. **Cabeceras:** HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. El sitio no se
   indexa (`robots: noindex`).
9. **Nada sale sin permiso:** correos en modo buzón (`EMAIL_MODE=outbox`), nunca a direcciones `.test`, y en las
   versiones de prueba solo a `@resend.dev`. Publicación real apagada (`PUBLISHING_ENABLED=false`).
10. **IA:** solo en el servidor, con tope de gasto y registro de uso. El texto de la ficha se le pasa como
    información, no como instrucciones. Nunca recibe datos de ciudadanos.
11. **Google Drive** (solo con `STORAGE_PROVIDER=drive`; `DRIVE.md`, D-28):
    - **El permiso de la plataforma manda.** `/api/media/[id]`, las miniaturas y la subida por la plataforma hacen
      primero la consulta de la persona con RLS; si no ve la fila, Google ni se llama (probado: el registro del Drive
      falso queda vacío para grabación sin asignar, política, el IVT y sin doble factor).
    - **Nada público:** ningún archivo queda como «cualquiera con el enlace»; todo pasa por la plataforma. Ninguna
      página lleva un enlace de Google.
    - **El permiso de Google** (token de renovación) se guarda cifrado con AES-256-GCM, atado a su fila; la clave está
      fuera de la base (`DRIVE_TOKEN_KEY`, o derivada de `SESSION_SECRET`). Las tablas de Drive tienen RLS sin
      políticas y ningún rol de la API las lee; `drive_status()` solo responde a administración con doble factor y
      nunca devuelve el token ni ids de Drive. Ni el token ni los ids de Drive llegan al navegador, a Realtime ni a los
      registros (una prueba revisa que no salgan en los logs). La conexión y sus cambios quedan en el registro, sin el
      token.
    - **Solo `drive.file`:** la plataforma solo ve lo que ella creó y lo que Administración eligió.
    - **«Elegir de Drive» es solo para Administración con doble factor:** su navegador recibe un token de Google de una
      hora (solo `drive.file`) y la **clave del Picker**. Esa clave no es secreta (está restringida a la API del Picker
      y a los dominios de la plataforma), pero rompe la letra de «ninguna clave en el navegador»: es la excepción.
      Nadie más recibe nunca un permiso de Google.
    - **Subidas:** el navegador solo recibe la URL de su propia subida (sirve para ese archivo y ese tamaño, una semana),
      guardada en ese teléfono como el boleto de las subidas de siempre. Al terminar, el servidor comprueba en Google
      tamaño, tipo y marca, y borra la URL guardada. Nunca se guarda en Drive una página, un SVG ni un script; se sirven
      en línea solo videos, fotos y audios comunes, aislados (`sandbox`, `nosniff`).
    - **Abuso del tope de transferencia:** cada respuesta aparta sus bytes antes de mandar (varias a la vez no pasan el
      tope del mes) y cada persona tiene una parte diaria (un cuarto del tope), así que quien ve un solo archivo no puede
      dejar a todo el equipo sin videos repitiendo pedidos. Administración recibe un aviso cuando alguien llega a su
      parte. Las cuentas por persona viven en `drive_transfer_person`, cerrada como las demás tablas de Drive.
    - **Fotos elegidas de Drive:** se limpian en el servidor (sin GPS ni cámara) y se guarda la copia limpia; HEIC no
      se acepta. Nunca se le piden a Drive el nombre del archivo ni la fecha o el lugar de una foto.
    - **Nombres:** carpetas y archivos llevan tipo, código del evento y nombre de la plataforma; nunca fecha, hora,
      lugar ni el nombre original (probado).
    - **Script de importación:** se niega a usar una carpeta dentro del repositorio; su estado y la lista de originales
      quedan en la carpeta del Mac (`.drive-import/`, también en `.gitignore`); nunca escribe ni imprime el permiso.
    - **Nada sale sin permiso:** conectar, desconectar y quitar el permiso los hace solo Administración; «Desconectar»
      no le escribe a Google.
12. **Entradas validadas** con zod en cada acción del servidor, siempre después de comprobar la sesión: quien no entró
    no hace correr ninguna revisión. Los links de los tweets se revisan solo si son públicos (sin IPs ni nombres
    internos). Los patrones que leen texto libre (títulos, preguntas a 360, avisos, fichas) tienen un largo máximo y
    una prueba que los corre con textos largos armados para trabarlos (`tests/unit/text-speed.test.ts`).

13. **Datos de terceros en las fichas** (27–28/10; `DECISIONES.md` D-34, D-35, D-40 y D-41):
    - nombres, teléfonos y direcciones de la comunidad, del ingeniero y del enlace van solo en `obra_ficha_private` y
      `community_report_private`, que se leen con doble factor. Los de una ficha comunitaria, solo política, el despacho
      y el jefe (administración no); los de una obra, administración, el jefe, el despacho y el IVT;
    - Redes y Grabación nunca leen un reporte comunitario; de una obra ven solo la pestaña de su visita viva, sin
      contactos, sin documentos (denuncias, actas) y sin los días de la obra;
    - los documentos de un reporte (denuncias, actas) los leen y los suben solo política, el despacho y el jefe;
      administración ve sus fotos del antes y del después y no le sube archivos; un documento borrado tampoco le llega
      por la papelera (desde el 28/10, `tests/rls/report-files.test.ts`);
    - la historia de las fichas y, desde el 28/10, el registro de cambios guardan de los contactos solo **qué campo**
      cambió, nunca el valor (lo escrito antes en el registro no se reescribe: solo crece);
    - los contactos no se guardan en el teléfono como borrador; «Lo que voy a decir» y la ficha técnica que nace de una
      obra nunca llevan teléfonos ni nombres de quien reportó o del enlace.
14. **Teléfonos y fechas en texto que lee Redes** (la base, con la misma regla que la app, `text_has_phone()` y
    `text_has_datetime()`): no entra un teléfono en el texto principal de la obra y de un reporte, en «Lo que voy a
    decir», en la nota de Grabación para el editor (los tiempos del video, «2:15», sí), ni en el título, el lugar o el
    resumen de un evento; en el motivo de una cancelación tampoco una fecha ni una hora. Tampoco un teléfono en la
    historia de un reporte (notas y motivos), que se lee sin doble factor.
15. **El día realizado por columna:** `events.done_on` está cerrado para la API como columna (también en Realtime); el
    día sale de `event_done_on()`, que se lo da a Redes y a quien ve la fecha, nunca a política (D-40).
16. **Doble factor que no se puede bajar:** aprobar (`can_approve()`) pide el doble factor del jefe sin leer la lista
    editable; la lista `security.mfa_roles` solo cambia con doble factor y siempre nombra a administración, el jefe, el
    despacho, política y el IVT.
17. **Administración no se vuelve jefe ni despacho** (D-41): nadie se da roles a sí mismo y una cuenta nunca junta
    administración con el jefe o el despacho, ni por invitación (`guard_role_mix` y `guard_invitation_roles`). Solo se
    pueden dar los seis roles del equipo y administración. **Desde el 28/10 (D-58,
    `20261028002350_boss_grant.sql`, `tests/rls/boss-grant.test.ts`):** el rol de jefe solo lo da el sistema (la
    semilla, una migración, `npm run db:first-admin -- <correo> "<nombre>" --jefe` o el alta de Supabase de una
    invitación que hizo el sistema). Administración no lo da a otra cuenta, ni en Equipo ni en una invitación, y una
    invitación que nombra al jefe solo se puede anular (cambiarle el correo le daría el rol a otro). Cada rol del equipo
    que da una persona le llega al jefe como aviso en la campana (el nombre y el rol, nunca el correo). Quitar el rol de
    jefe sigue siendo de administración.
18. **Mensajes: canales del equipo** (28/10, canales desde el 29/10; `DECISIONES.md` D-52 a D-56, D-58 y D-79 a D-88;
    `20261028002400_internal_chat.sql` y `20261029090000_chat_channels.sql`; pruebas en `tests/rls/chat.test.ts`,
    `tests/rls/chat-channels-upgrade.test.ts`, `tests/unit/chat-text-rules.test.ts` y `tests/unit/chat-isolation.test.ts`):
    - **Sin aviso:** no hay ningún aviso sobre quién lee (lo pidió Juan el 29/10: «se siente como si estuviéramos
      espiando a las personas»). Lo que lo reemplaza es la lista de miembros que cada canal muestra arriba.
    - **Quién lee:** los **miembros actuales** de cada canal, con doble factor si su rol lo pide (jefe, despacho, política,
      IVT), y «Todo el equipo» (todos los del equipo activos). **El jefe está en todos los canales por la base**
      (`chat_channel_add_bosses`, `zz_chat_boss_membership`) y no se le puede sacar (`chat_boss_stays`): lee porque es
      miembro, **no hay rama de «leer todas»**. **Administración no lee ninguno:** sin rama de administración ni
      `is_staff()`, «Ver como» solo cambia menús, y una cuenta con administración no es del equipo para Mensajes aunque
      tenga otro rol (no lee, no escribe, el jefe no la puede meter en un canal). Tampoco puede armar otra cuenta de jefe
      (D-58). **360 no lee ninguno:** ningún archivo suyo toca Mensajes (prueba estática) y lo que corre en la base lleva
      `app.caller = 'assistant'`, que todas las funciones de chat rechazan. Una pregunta a 360 sobre un mensaje se guarda
      como «[pregunta sobre Mensajes]», sin el texto.
    - **Quién arma los canales:** solo el jefe con doble factor (`can_approve()`) crea, renombra, describe, elige
      miembros y archiva (`chat_channel_create`, `chat_channel_update`, `chat_channel_set_members`, `chat_channel_archive`);
      nadie inserta ni cambia canales o miembros por la tabla. Quien sale deja de leer el canal entero (también lo
      anterior) y de recibir avisos; quien entra lee lo anterior salvo lo guardado de la agenda. Un miembro ve quién está
      ahora, nunca quién salió, cuándo ni quién lo sacó (`chat_member_list`, política `chat_members_select`).
    - **La agenda (regla 4) al escribir:** donde hay alguien de Redes o política (miembro actual, activo o no, con
      cualquiera de sus roles) o en «Todo el equipo», la base rechaza el mensaje de quien conoce la agenda (jefe,
      despacho, IVT, Grabación o administración) si tiene una fecha o una hora **concreta** o un mapa
      (`text_has_concrete_datetime()`, `chat_has_map()`, copias exactas en la app). Las palabras relativas pasan, pero la
      app pregunta antes (E1). **Donde no hay Redes ni política**, el mensaje se guarda pero queda marcado
      (`agenda_clear` falso) también por una palabra relativa: el que entre después, o gane Redes o política, ve «Mensaje
      oculto» y no un «mañana» que la hora del mensaje vuelve fecha. El nombre y la descripción de un canal siguen con la
      regla completa (`guard_chat_channel_text`), en todo canal.
    - **La agenda al leer:** un mensaje sin `agenda_clear` solo lo lee quien tiene jefe, despacho, IVT o Grabación **sin**
      Redes ni política (el jefe incluido); los demás ven «Mensaje oculto», nunca el texto. Cubre cambios de rol y de
      miembros.
    - **Teléfonos:** nunca en un mensaje, ni en el nombre o la descripción de un canal, de nadie y en ningún canal
      (`text_has_phone()`), también dentro de un enlace.
    - **Lo escrito queda:** los mensajes solo se agregan; los miembros también (salir es una marca con la hora y quién);
      nadie cambia ni borra, ni el sistema (`TRUNCATE` también bloqueado). El registro de cambios guarda tabla, fila,
      quién y cuándo, **nunca** el texto, el nombre del canal ni los miembros.
    - **Avisos al teléfono sin el texto:** «Mensaje nuevo · De <nombre> (<rol>)» a los miembros actuales que no lo
      silenciaron, nunca el texto ni el nombre del canal; no van a la campana ni por correo.
    - **Lecturas por rutas GET** como la persona (`db(session)`), con `Cache-Control: no-store` y sin guardarse en el
      service worker; sin sesión 401, sin Mensajes o fuera del canal 404 (la pantalla abierta deja de preguntar). El
      texto de un mensaje nunca se escribe en los registros del servidor ni se repite en un error. `<title>` nunca lleva
      un nombre ni un texto.
    - **Nada para anon:** cada función nueva tiene `revoke all … from public, anon`; las que hablan de otras personas
      (sus roles, quién es jefe) tampoco son de `authenticated`. Nada nuevo en Realtime. Se fueron `chat_notice_ack`
      (el aviso aceptado) y `chat_rules` («Quién habla con quién») con sus reglas y permisos.
19. **Códigos por la base:** el código de un evento (E-0001), de una obra (O-0001) y de un reporte (R-0001) lo pone la
    base: nadie mete una fecha en un código (empieza el nombre de cada archivo descargado) ni le quita el número al
    siguiente. Un evento ya realizado no cambia de fecha ni de lugar; un archivo nunca se pasa a otro evento o ficha.

## Lo que falta (antes de producción)
- Configurar en Supabase: SMTP de Resend, plantilla del correo con `{{ .Token }}`, expiración de sesión,
  «inactivity timeout», MFA TOTP activado y registro abierto **apagado** (ver `README.md`).
- Activar **Deployment Protection** en Vercel para las versiones de prueba.
- Política de Storage verificada contra un proyecto real (las pruebas de RLS cubren las tablas; las de Storage se
  prueban en `fb-dev`).
- Dominio verificado con SPF, DKIM y DMARC.
- Fase 3: cifrado de datos de denuncias y ayudas, Turnstile, límites por IP, aviso de privacidad y tiempo de
  retención. PITR y revisión externa (ver `COSTOS.md`).
- Doble factor también para redes y grabación antes de abrir la web.
- Cuánto tiempo se guardan los datos de terceros de las fichas (y lo que quedó en el registro de cambios antes del
  28/10): por decidir (`PENDIENTES.md`).
- Repetir en `fb-dev` las pruebas por rol con cuentas de prueba (las migraciones de la ronda del 27–28/10 ya están
  aplicadas allí desde el 28/10; las dos de la tercera vuelta, Mensajes y el rol de jefe, todavía no).
- Mensajes: aplicar en `fb-dev` la migración de canales (`20261029090000_chat_channels.sql`) y probar ahí dos personas
  en un canal desde dos teléfonos (en la demo cada servidor tiene su base, D-88), y en un Android real que el aviso de mensaje en la pantalla de bloqueo no lleve el texto.
- Drive: probar con la cuenta real (paso C de `DRIVE.md`) que Google acepta las partes directas del teléfono y los
  tramos (`Range`); la plataforma tiene respuesta para ambos casos, pero eso no se puede probar sin la cuenta.
- Si algún día se agrega una política de contenido (CSP): permitir `apis.google.com` (script), `docs.google.com`
  (marco del Picker) y `www.googleapis.com` (subidas).
