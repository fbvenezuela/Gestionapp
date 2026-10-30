# Lo que falta decidir o conseguir (antes o durante la construcción)

Actualizado: 23/10/2026; 28/10/2026: #8 (parroquias), #11 (código de Mila) y las preguntas de la segunda vuelta, al final; 30/10/2026: #11 hecho (Redes por formato) y las preguntas de Redes para Hillary, al final. La plataforma interna ya está construida en modo demostración; lo de abajo es lo que falta para pasar a datos reales y lo que hay que decidir. Mientras no esté, la sesión de Claude Code avanza con lo que está entre paréntesis («por ahora») y lo deja marcado.

## Lo tiene que mandar alguien
1. **Branding:** manual de identidad visual «F BERNAL», logos (incluido el de «Reporte Bernal 2.0»), colores y tipografías. Hillary preguntó el 22/10 si lo necesitas; le dijiste que sí. (Por ahora: paleta y logo provisionales, fáciles de cambiar en un solo archivo.)
2. **El prompt maestro de imagen de Hillary** para mejorar las fotos de la trazabilidad. (Por ahora: el módulo existe pero desactivado.)
3. **Accesos a la web actual** (dominio, DNS, hosting y repositorio): los tiene el Ing. Pedro Poller y no los ha pasado. (Por ahora: se trabaja en un dominio de prueba de Vercel.)
4. **Correo del cliente** para abrir las cuentas (Vercel, Supabase, Google y Metricool). El acceso lo tiene Nesmaury en el iPhone y te llega un código de verificación. Pedir solo el código, nunca la clave. Juan ya está abriendo cuentas (22/10): cada una va a `CUENTAS.md`.
5. **Metricool:** ya no para publicar (Hillary, 22/10). Solo si se quiere para leer métricas: confirmar que el plan incluye la API.
6. **Clave de API de IA** (copies, análisis de métricas, fotos). La suscripción de Claude o de ChatGPT no sirve para eso: hace falta una clave de API con su forma de pago.
7. **La lista de personas que van a usar el panel**, por rol: operadores, redactores, despacho y supervisión.
   **27/10:** ahora son los seis roles (jefe, despacho, política, IVT, grabación, redes); operadores y redactores, en la
   fase 3.
8. **Mapas de municipios y parroquias del Táchira** (límites geográficos), si se quiere ubicar cada reporte solo. (Por ahora: lista para elegir.)
   **27/10: hace falta la lista oficial de parroquias por municipio** (las 66 parroquias de los 29 municipios). Las
   fichas de obra y comunitarias la piden. Por ahora la parroquia es texto libre (hasta 100 letras) y el filtro junta las
   formas de escribir la misma (mayúsculas y espacios), pero un error de escritura parte los contadores. Cuando llegue,
   va en el ajuste `parishes` (`config/clients/fb.json`) y la base solo acepta esas (D-35).

## Lo tienen que decidir Hillary, Leo o el cliente
1. **¿Se muestran los nombres de las personas ayudadas** en el feed público? Recomendado: solo con su permiso; si no, iniciales.
2. **Denuncias:** ¿quién las atiende y a qué entidad se derivan las graves? Nada de una denuncia sería público.
3. **Fotos mejoradas con IA:** recomendado que solo corrijan luz y nitidez, con la etiqueta «foto mejorada» y la original guardada. Una foto de obra que cambia lo que muestra se vuelve en contra.
4. **¿Quién aprueba lo que se publica?** ¿Fernando Alvarado para todo, o solo para lo político?
   **27/10:** Hillary: lo aprueba el jefe (D-30). Queda preguntar si alguien aprueba en su nombre y si Fernando sigue
   revisando (ver al final).
5. **Cuenta del ciudadano:** ¿se reporta sin cuenta (más fácil) o con verificación por teléfono (menos spam)?
6. **Notificaciones a la gente:** ¿solo correo y aviso en la web, o también WhatsApp o SMS (tienen costo)?
7. **Cuántos tweets al día y en qué horas** (Hillary dijo 4 o 5).
8. **Dónde se aloja la base de datos** (región de Supabase) y cuánto tiempo se guardan los datos personales.
9. **Prioridad:** recomendado empezar por el estudio de contenido (es lo que Hillary pide ya) y luego la muestra pública (trazabilidad y mapa de reportes). Confirmar.

## Nuevo (22/10 tarde, lo que agregó Hillary)
10. **Cómo se publica:** ¿API directa de cada red (Meta, TikTok, X, YouTube) o seguir con Metricool validando y
    convirtiendo antes? Hillary no confía en Metricool por lo que pasó con Mila. Recomendado: validación propia siempre
    y, para publicar, empezar por las APIs directas de Meta y X; TikTok cuando aprueben la app (su API pide revisión).
11. **¿Dónde está el código de la plataforma de Mila?** Hay que copiarla y agregarle X. Si se hizo en Claude, ¿hay
    repositorio o hay que rehacerla a partir de capturas?
    **28/10: apareció.** El código está en `escueladigitalusa-a11y/mila-proyecto` (una sola página, «Content Studio»),
    y la versión en vivo se leyó sin entrar con ningún usuario. Mila organiza Redes **por formato** (Reels, YouTube,
    Carruseles, Posts, Historias, Fin de mes y Vista del feed, con meses editoriales y cupos); la nuestra, **por paso**
    (Piezas, Por aprobar, Publicar, Tweets, Resultados, Biblioteca). Mila no tiene resultados ni tweets. Ya se hizo lo
    pedido para ahora: Resultados con miniaturas (D-37). La tabla de diferencias (qué falta, cuánto cuesta y lo que **no**
    se copia por seguridad: el rol elegido en el navegador, entrar anónimo, archivos de Drive abiertos con el enlace,
    borrar sin vuelta y «Programar» sin aprobación) está lista, y **falta que Hillary la confirme** antes de rehacer
    Redes: el encargo dice «no rehagas Redes a ciegas». Capturas: ninguna obligatoria; sirve sobre todo la pantalla donde
    hoy ve los resultados.
    **29–30/10: hecho.** El encargo del 29/10 pidió Redes igual a esa plataforma: Redes ya va por formato, con meses,
    cupo, feed de 24 espacios, revisión por pieza y tablero (`DECISIONES.md` D-60 a D-78), sin copiar su contenido, su
    marca ni sus reglas de copy. La comparación pantalla por pantalla está en `docs/capturas/mila-vs-fb/README.md`; las
    preguntas que quedaron, al final.
12. **El Drive del cliente:** permiso para leer la carpeta de los días y eventos (cuenta del cliente).
13. **Fórmulas de copies:** que Hillary mande sus fórmulas y ejemplos buenos de cada red.
14. **La ropa:** fotos de las prendas del jefe y ejemplos de lo que se pone en cada tipo de evento.

## Nuevo (22/10 noche): para arrancar con GitHub, Supabase, Vercel y Resend
15. **¿A nombre de quién va cada cuenta?** GitHub (organización o usuario), Supabase (organización) y Vercel (equipo).
    Recomendado: una organización del cliente o de Impulso Digital con Juan como administrador, nunca la cuenta
    personal de Juan donde viven sus otros proyectos. (Por ahora: lo que Juan diga al arrancar; queda en `CUENTAS.md`.)
16. **Planes.** Vercel Hobby es solo para uso personal, sin fines comerciales: para un cliente toca Pro. Supabase gratis
    pausa los proyectos sin uso y tiene tope de archivos; producción en Pro. Verificar precios vigentes en `COSTOS.md`.
    (Por ahora: un proyecto de Supabase **de prueba** gratis y las versiones de prueba de Vercel.)
17. **Dominio para los correos (Resend).** Para enviar desde «@algo» hace falta un dominio verificado (registros
    SPF/DKIM en su DNS). El del gobernador lo tiene Pedro Poller. ¿Se compra uno para la plataforma o se usa uno de
    Impulso Digital? (Por ahora: el remitente de prueba de Resend, que solo envía al correo del dueño de la cuenta.)
18. **Dónde vive el video grande** (material crudo y finales, varios GB por evento):
    - Supabase Storage: lo más simple, subida por partes; cuesta por GB guardado y descargado.
    - Google Drive del cliente: es lo que Hillary ya usa, pero subir desde la app al Drive personal de él tiene trabas
      de permisos de Google.
    - Un almacenamiento sin costo de salida (por ejemplo Cloudflare R2): barato para descargar mucho.
    Recomendado: el video en la plataforma (Supabase o R2) y el Drive solo para leer y ordenar lo que ya existe.
    (Por ahora: Supabase Storage con subida por partes y un tope de tamaño configurable.)
    **25/10:** Juan pidió Drive. Está hecho detrás de `STORAGE_PROVIDER=drive` (D-28). Falta que Juan haga los pasos
    A–D de `DRIVE.md` (Google Cloud, variables en Vercel, conectar y probar, subir lo del Mac).
19. **«Un solo perfil» para redes.** Recomendado: un solo **rol** (las cuatro ven y hacen lo mismo) pero **un usuario
    por persona**, para saber quién hizo qué y para el doble factor. Confirmar con Hillary. (Por ahora: así.)
    **27/10:** igual para Grabación («un solo perfil»): un rol, un usuario por persona (D-29).
20. **Reportes cercanos sin mostrar los de otros** (§11.1 de `IDEA.md`). Recomendado: solo «ya hay N reportes de esto a
    menos de 100 m, ¿te sumas?», sin fotos, textos ni nombres. Confirmar.
21. **Permisos de las redes para publicar solos.** Cada una pide lo suyo y tarda:
    - Meta: app de desarrollador, verificación del negocio y revisión de permisos de publicación.
    - TikTok: hasta que auditan la app, lo publicado sale como privado.
    - X: la API de publicación es de pago.
    - YouTube: la subida gasta mucha cuota diaria.
    Verificar requisitos y precios vigentes. (Por ahora: publicación manual validada, con link y captura de evidencia.)
22. **Doble factor desde el lunes.** Recomendado: obligatorio ya para administrador, jefe, director de despacho,
    supervisión (27/10: sale supervisión y entran política y el IVT, D-29) y quien vea denuncias o ayudas; para el resto, antes de abrir la web al público, con una guía paso a
    paso. Confirmar.
23. **¿Quién es Igor y qué datos extrae?** (audio del 12/10, para los tweets de gestión).
24. **Nombre de la plataforma.** El diseño dice «FB · Operaciones 360». ¿Se queda? (Por ahora: sí, en un solo archivo de
    configuración.)

25. **¿Quien graba ve la fecha y la hora?** Tiene que saber cuándo y dónde estar. Recomendado: solo de los eventos que
    tiene asignados. Confirmar con Hillary. (Por ahora: así, anotado en `DECISIONES.md`.)

## Estado al 23/10/2026 (lo que hizo la sesión de Claude Code)
- #15 y #16: el código está listo para Supabase, Vercel y Resend; **falta que Juan abra las cuentas** (organización del
  cliente) y pegue las variables (`README.md` §Conectar las cuentas). Mientras, la app corre en modo demostración.
- #17: correos en modo buzón (no sale nada). Falta el dominio para Resend.
- #18: video en Supabase Storage por partes (D-12).
- #19, #22, #25: decididos «por ahora» en `DECISIONES.md` (D-09, D-08, D-05). Confirmar con Hillary.
- 2.7 (tweets por día y horas): D-16. Confirmar.
- #6 (clave de IA): sin clave los copies salen con plantilla; con `ANTHROPIC_API_KEY` y `AI_ENABLED=true` los escribe la IA.
- #21: publicación manual validada; las APIs de cada red, en fase 2.
- Nuevo — #26: los límites de video de cada red están cargados de la documentación pública, marcados «verificar»
  (Ajustes → Reglas por red → «Guardar y marcar verificado»).

## Llegó el Diagnóstico Digital 360 (24/10/2026)
Resumen y lo que sirve: `docs/DIAGNOSTICO-360.md` (el ZIP no se subió al repositorio: es confidencial).
- **#1 Branding — llegó parcial.** Paleta: Naranja #FE5A03, Naranja claro #FD943C, Oliva #7F8630, Negro #111111,
  Blanco #FFFFFF, Amarillo #FFD380; Montserrat (máx. dos pesos por pieza); logo «FREDDY / Bernal / GOBERNADOR» solo en
  imagen (4 versiones). Aplicado a los colores (D-21). **Falta:** logo en vector (SVG/AI/PDF), láminas 31–38 del PDF
  *Estrategia_Identidad_Freddy_Bernal_Integrada* (resguardo, tamaños, pesos), logo de Reporte Bernal 2.0 sin azul y saber
  si «F BERNAL» es otra marca.
- **#2 Prompt de imagen — no vino.** El diagnóstico respalda «solo luz y nitidez» y marca como alto riesgo generar
  imágenes sintéticas de personas o hechos.
- **#13 Fórmulas — llegaron propuestas** del diagnóstico (gancho-bloques-acción, dato primero, denuncia-acción-resultado,
  cifra única, cita del jefe, historia con protagonista). Hillary decide cuáles.
- **#23 Igor** — ¿es quien opera TCPRO-5 (escucha de medios en `kunawaro.alwaysdata.net`)? No se integra hasta saberlo.
- **Color principal: oliva** (decidido por Juan, 24/10; D-21).
- **Nuevo #27:** las preguntas que quedan en `docs/DIAGNOSTICO-360.md` (logo, horarios por red, hashtags,
  primera persona, cierres, fórmulas, semáforo de aprobación, TCPRO-5).

## Respuestas de Juan a las preguntas del diagnóstico (24/10/2026) — aplicadas
- **#1 Logo:** el «FREDDY / Bernal / GOBERNADOR» **es el aprobado**. **Falta el vector** (SVG/AI/PDF) y las láminas 31–38.
- **2.7 Tweets:** se usan los horarios del diagnóstico: **2 o 3 tweets al día** en mañana (8–10), mediodía (12–14) y noche
  (19–21); con 2, mañana y noche. Mejores horas por red como aviso al programar (TikTok de noche). D-16 actualizada.
- **Hashtags:** `#Tachira` (sin acento) y se agrega `#Venezuela`.
- **Primera persona y cierre:** «no todos» y «no siempre»: se elige **por pieza** (voz del jefe o institucional; cierre de
  la marca, pregunta, destino o sin cierre). D-24.
- **#13 Fórmulas:** se agregaron **las seis** del diagnóstico (GBA, DATO, DAR, CIFRA, CITA, HIST). Quedan nueve.
- **2.4 Aprobación:** «lo que consideres mejor» → **semáforo** (D-23): verde y amarillo los aprueba supervisión, rojo
  el jefe; sin respuesta no se aprueba. Lo que el jefe publica por su cuenta se **registra después**.
- **#23 Igor:** hizo un programa de investigación de datos que **se conectará más adelante** (fuente de datos para
  fichas, tweets y copies). Pendiente: qué datos entrega, en qué formato y cómo se accede. TCPRO-5 sigue sin integrarse.

## Nuevo (24/10/2026 noche): avisos al teléfono y asistente 360
- **Tarea cada 5 minutos (gratis):** al conectar Supabase, en el panel → Vault crear dos secretos: `app_url` (la dirección
  de la app) y `cron_secret` (el mismo `CRON_SECRET` de Vercel), y activar las extensiones `pg_cron` y `pg_net`. La
  migración `20261025000800_push.sql` programa la tarea sola si existen.
- **Asistente 360 con IA:** necesita el OK legal y elegir proveedores. Mientras, funciona sin IA (modo demostración).
- **Avisos al teléfono:** funcionan ya en la demo para quien los active en su teléfono. Con datos reales, conviene
  poner `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` propias en Vercel (te digo cómo generarlas) y un `VAPID_SUBJECT` con el
  correo del dominio.


## Nuevo (25/10/2026)
- **Correos que Resend rechazó:** quedan «failed» en Ajustes → Buzón y nadie los reenvía solos. Falta un reenvío con la misma clave en la tarea de cada 5 minutos.
- **Permisos en `fb-dev`:** confirmar que el rol de `DATABASE_URL` puede borrar en `auth.sessions` (`npm run db:first-admin` avisa si no).

## Nuevo (27–28/10/2026): segunda vuelta de Hillary
Lo hecho está en `DECISIONES.md` D-29 a D-41. La guía por rol (`GUIA-POR-ROL.md`) **no se manda** hasta que Hillary
pruebe cada rol (lo pidió el 25/10).

**Preguntas para Hillary:**
1. **Aprobaciones sin Supervisión:** ¿alguien aprueba en nombre del jefe (por ejemplo, el despacho las verdes)?
   ¿Fernando Alvarado sigue revisando? (Por ahora: solo el jefe, con doble factor. Si Fernando tiene que comentar, se le
   da Redes. D-30.)
2. **El IVT y la fecha:** ¿está bien que el IVT vea la fecha de sus visitas cuando ya la pusieron? (Por ahora: sí, con
   doble factor, solo de las visitas a obras del IVT, como Grabación con sus eventos. D-34.)
3. **Contactos de las fichas de obra:** ¿administración también deja de verlos, como en las fichas comunitarias?
   (Por ahora: los ve con doble factor. D-41.)
4. **Mila:** ¿el repositorio `escueladigitalusa-a11y/mila-proyecto` es la versión final? ¿Qué pantallas se copian y en
   qué orden? ¿Qué formatos usa el gobernador (¿«Fin de mes» sí o no?), qué cupos por mes, quién pone la valoración de
   1 a 10 y si «Diseño desaprobado + nota» es lo mismo que «Pedir cambios» del jefe? (#11)
   *(Resuelta el 29/10: el encargo de Juan lo confirmó y Redes ya va por formato; las preguntas que quedaron, al final.)*
5. **Grabación:** ¿cada persona ve solo los eventos que le asignaron (así está), o todos ven todo lo de Grabación?
6. **Política y la fecha:** ¿el director de política debe ver la fecha de las actividades que nacen de sus reportes?
   (Por ahora: no; ve «Ya tiene fecha».)
7. **Datos de terceros:** ¿cuánto tiempo se guardan los nombres y teléfonos de las fichas? (Ver #8 de la lista de
   decisiones: tiempo de los datos personales.)

**Lo que falta de nuestra parte:**
- Las migraciones de esta ronda ya están en `fb-dev` (aplicadas y verificadas el 28/10, `PROMPT-SUPABASE.md`). Falta
  que Juan siga esa guía. Ahí se puede probar creando cosas entre roles (en la demo no: D-39).
- ~~Rehacer Redes como Mila, por partes, cuando Hillary confirme la tabla (#11).~~ Hecho el 29–30/10 (D-60 a D-78).

## Nuevo (28/10/2026): tercera vuelta — guías, tutoriales y Mensajes
Lo hecho está en `DECISIONES.md` D-42 a D-59. Las guías siguen sin mandarse a nadie: viven en la app («Mi cuenta» →
«Ayuda y guías») y en el repositorio. Mientras no haya respuesta, sigue lo que dice cada pregunta entre paréntesis.

**Preguntas para Juan (o Hillary):**
1. **El rol de jefe:** ¿de acuerdo con que solo se dé con el comando de instalación y nunca desde Equipo? (Así está.
   D-58.)
2. **«Hoy» y «mañana» en Mensajes:** ¿lo dejamos así (la base rechaza horas, fechas y mapas concretos; a «hoy»,
   «mañana» o un día de la semana la app pregunta «¿dice cuándo va el jefe?» antes de enviar) o el modo estricto, donde
   también se rechazan? (Así está: el primero. D-52, enmienda E1.)
3. *(Ya no aplica desde el 29/10: «Quién habla con quién» se fue; Mensajes son canales que arma el jefe, D-84.)*
4. *(Ya no aplica desde el 29/10: el jefe decide quién va en cada canal, por nombre, D-80.)*
5. **Cuánto se guardan los mensajes** y si se podrá borrar algo a pedido (un dato escrito por error). (Se guardan y no
   se borran. D-54.)
6. **Fotos y audios en los mensajes**, ¿en una fase siguiente? (Hoy solo texto y enlaces de la plataforma.)
7. **Registro de cambios:** ¿está bien que administración vea que hubo un mensaje, un canal o un cambio de miembros
   (quién y cuándo, sin el texto, el nombre del canal ni quiénes)? (Así está. D-82.)
8. **Nombres a la vista:** ¿está bien que cada canal muestre los nombres y roles de quienes están en él? (Así está: es
   lo que reemplaza al aviso, D-79.)
9. **Guías sin señal:** ¿hace falta leerlas sin señal? (Hoy no: el teléfono no guarda páginas con datos de la persona.)
10. *(Ya no aplica desde el 29/10: no hay «Quién habla con quién»; en «Todo el equipo» el jefe tiene «Solo el jefe
    escribe».)*
11. **Administración con un rol del equipo:** si alguna cuenta real tiene las dos cosas, ¿de acuerdo con que use otra
    cuenta para Mensajes? (Así está. D-82.)
12. **Hillary:** ¿los tutoriales y Mensajes entran en su prueba por rol de la demo antes de mandar las guías?

**Preguntas nuevas sobre Mensajes como canales (29/10, D-79 a D-88):**
13. **Canales de entrada:** ¿armamos de entrada algunos canales en la base real, además de «Todo el equipo» (por
    ejemplo «Grabación y Redes» u «Obras y comunidad», como en la demo)? (Hoy no: los arma el jefe.)
14. **El que entra lee lo anterior:** ¿está bien que quien el jefe agrega a un canal lea lo que ya se escribió ahí, como
    en Slack? (Así está, salvo lo guardado de la agenda. D-85.) La otra opción: que lea solo desde que entró.
15. **Quién arma los canales:** ¿alguien más que el jefe (por ejemplo el despacho) debería poder armar canales o cambiar
    quién está? (Hoy no: solo el jefe con doble factor. D-80.)

**Lo que falta de nuestra parte:**
- Aplicar en `fb-dev` la migración de canales `20261029090000_chat_channels.sql` (con el OK de Juan) y probar ahí dos
  personas en un canal desde dos teléfonos (en la demo cada servidor tiene su base, D-88).
- La lista manual de `DEMO.md` en un Android de verdad (teclado, Enter, aviso en la pantalla de bloqueo, tutorial).
- Realtime para Mensajes cuando se pueda probar en `fb-dev` (hoy revisa cada 5 s, D-56).

## Nuevo (29–30/10/2026): Redes por formato — preguntas para Hillary
Lo hecho está en `DECISIONES.md` D-60 a D-78 y la comparación en `docs/capturas/mila-vs-fb/README.md`. Ninguna pregunta
frena: lo que dice entre paréntesis ya está construido así y se cambia en un paso.
1. **Cupo mensual de FB:** ¿8 posts, 12 reels, 4 carruseles, 30 historias y 4 videos de YouTube, o cuánto? (Por defecto
   los de la referencia; se cambian en Ajustes → Cupo y pilares.)
2. **Pilares de FB:** ¿cuáles son y en qué orden? (Vacíos en la configuración real; la demo trae cinco inventados.)
3. **¿Quién aprueba el diseño?** ¿El jefe y Redes, o alguien más (por ejemplo, quien diseña)? (Hoy el jefe y Redes.)
4. **¿YouTube aplica** en esta parte de Redes, o lo lleva Juan aparte? (Construido; se esconde sin migración.)
5. **¿Redes también elimina piezas**, o solo el jefe? (Hoy solo el jefe, con doble factor; administración recupera.)
6. ¿Tú entras como administración o como Redes? Si solo como Redes, ¿abrimos «Cupo y pilares» a Redes y al jefe?
7. ¿«Fin de mes» es una pieza que se publica (un carrusel de cierre) y además el resumen para el jefe, como quedó?
8. ¿Las historias entran en verde, para que el jefe las apruebe juntas? (Así está.)
9. En Drive, ¿el nombre «01 - Post.jpg» sin el título les sirve? (El título trae lugares y la regla de privacidad no los
   deja en nombres de archivo.)
10. ¿Los avisos de cumplimiento deberían bloquear la publicación hasta que alguien los marque «Resuelto»? (Hoy avisan,
    el jefe marca que los leyó y decide.)
11. **Feed: el #1 abajo a la derecha** (el orden de Instagram, como dice el encargo), ¿así? La referencia lo dibuja con
    el #1 abajo a la izquierda; en las capturas (pareja 10) están las dos rejillas. Se cambia en un solo lugar.
12. ¿Qué **usuario de Instagram** va en la cabecera del feed? (Hoy salen el nombre y el cargo de la configuración, sin
    usuario: no lo inventamos.)
13. En las historias, **el texto en pantalla y el sticker vuelven al jefe si se cambian después de aprobar**, porque son
    lo que sale. ¿Les parece bien, o el jefe solo aprueba la imagen y el texto lo decide Redes?

**Lo que falta de nuestra parte:**
- Aplicar en `fb-dev`, con el OK de Juan, `20261029000100_redes_formatos.sql` y después `20261029090000_chat_channels.sql`,
  y correr `npm run db:seed-client` (crea «Mes 1», pasa ahí las piezas sin mes, suma las claves `redes.*`, los formatos
  de historia y carrusel por red y el material nuevo de 360). Después, las pruebas por rol con cuentas de prueba.
- **«¿A qué hora nos va mejor?» por día de la semana:** hoy va por franja horaria; el día queda pendiente (Resultados).
- En la demo, lo que se crea o se mueve en Redes vive en un solo servidor (D-39, D-76): para probar creando entre roles
  hace falta `fb-dev`.

