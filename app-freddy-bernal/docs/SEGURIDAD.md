# Seguridad (primera versión)

Actualizado: 25/10/2026. Qué se hizo para blindar la plataforma y qué falta.

## Lo que ya está
1. **RLS en todas las tablas.** Cada consulta de una persona corre con su rol y su sesión (`set local role
   authenticated`). Ningún permiso se decide en el navegador. El rol `anon` no lee ninguna tabla.
2. **Pruebas que intentan lo prohibido** (`tests/rls/rls.test.ts`, 31 casos), en Postgres en memoria y en Postgres 16
   real en la CI. Entre otras:
   - redes no ve fecha, hora ni lugar exacto: ni consulta directa, ni joins, ni la vista, ni subconsultas, ni el
     registro de cambios;
   - sin doble factor, el jefe no ve la agenda; supervisión no aprueba;
   - nadie publica sin aprobación (la base lo exige); nadie crea una pieza ya aprobada;
   - solo administración borra (borrado lógico) y da roles; nadie se da roles a sí mismo;
   - quien graba solo sube material crudo a sus eventos asignados;
   - secretaría solo ve lo que propuso; un usuario sin rol no ve nada;
   - el registro de cambios no se puede editar ni borrar.
3. **La regla de fecha y hora en la base** (`event_schedule` aparte), también en:
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
     fecha (Secretaría) no puede agregar al título una fecha nueva: comprobarla contra la del evento le diría cuál es;
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
      falso queda vacío para grabación sin asignar, secretaría y sin doble factor).
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
- Drive: probar con la cuenta real (paso C de `DRIVE.md`) que Google acepta las partes directas del teléfono y los
  tramos (`Range`); la plataforma tiene respuesta para ambos casos, pero eso no se puede probar sin la cuenta.
- Si algún día se agrega una política de contenido (CSP): permitir `apis.google.com` (script), `docs.google.com`
  (marco del Picker) y `www.googleapis.com` (subidas).
