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

## D-07. Solo supervisión aprueba (ni administración)
- **Qué:** aprobar piezas y tweets es exclusivo del rol `supervisor`, con doble factor. Una versión nueva vuelve a
  revisión; editar un tweet aprobado lo devuelve a borrador.
- **Por qué:** «Nada se publica sin aprobación» y así queda claro quién aprobó. Si Fernando no está, administración le
  da el rol a otra persona (queda en el registro). — **Confirmar** si Fernando aprueba todo o solo lo político
  (PENDIENTES 2.4).

## D-08. Doble factor obligatorio para administración, jefe, despacho y supervisión
- **Qué:** lista en el ajuste `security.mfa_roles` (también operadores de denuncias y ayudas, fase 3). Sin `aal2`, la
  base les niega la agenda, la aprobación y los roles. Redes y grabación, antes de abrir la web (PENDIENTES #22).
- **Cómo se cambia:** `config/clients/fb.json` (`mfaRoles`) o el ajuste en la base.

## D-09. Un rol «redes», un usuario por persona
- **Por qué:** saber quién hizo qué y el doble factor de cada una (PENDIENTES #19). — **Confirmar**.

## D-10. Botones naranjas con texto oscuro
- **Qué:** el naranja `#FE5A03` se mantiene; el texto encima es casi negro y el naranja de textos es más oscuro
  (`--c-accent-ink`).
- **Por qué:** blanco sobre ese naranja da contraste 3:1 y no pasa AA; al sol se lee mal.
- **Cómo se cambia:** `src/app/tokens.css` cuando llegue el manual de marca.

## D-11. Publicación manual en la fase 1
- **Qué:** se valida el video por red, se descarga el paquete y se marca «Ya lo publiqué» con link y captura.
  `PUBLISHING_ENABLED=false`. Los adaptadores reales esperan los permisos de cada red.
- **Por qué:** regla 8 y los tiempos de aprobación de Meta, TikTok y X.

## D-12. Video en Supabase Storage, por partes (TUS)
- **Qué:** subida por partes de 6 MB, que sigue sola al volver la señal y se reanuda si se elige el mismo archivo.
  Tope configurable (`upload.max_mb`, 10 GB por defecto).
- **Por qué:** PENDIENTES #18 recomienda la plataforma para el video y el Drive solo para leer. Si las descargas
  cuestan mucho, se cambia a Cloudflare R2 detrás de la misma ruta de descarga.

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

## D-16. Tweets: 4 o 5 por día, en 5 franjas
- **Qué:** franjas 7–9, 11:30–13:30, 16:30–18:30, 19–20:30, 20:30–22 (hora del Táchira); alterna 5 y 4 por día;
  nunca dos en la misma hora ni minutos en :00. Aviso con 6 días o menos. — **Confirmar** con Hillary (PENDIENTES 2.7).
- **Cómo se cambia:** Ajustes > Horarios de tweets.

## D-17. Copies sin IA por defecto
- **Qué:** con `AI_ENABLED=false` los copies salen de la ficha con una plantilla por fórmula, sin inventar cifras, y
  dicen qué dato falta. Con la clave, la IA escribe siguiendo las mismas reglas; el modelo va en `AI_MODEL`.

## D-18. Next 16 «proxy» solo refresca la sesión
- **Qué:** `src/proxy.ts` no decide permisos. Las páginas llaman a `requireSession()` y la base aplica RLS.

## D-21. Paleta desde la estrategia de marca (provisional) — **Confirmar con Hillary**
- **Qué:** se quitó el azul del panel (`--c-slate` #182a32 → #111111, el Negro de la marca) y el anillo de foco pasa a
  #c94700 (4,5:1 sobre el fondo; el Naranja claro #FD943C daba 2,07:1 y no cumplía AA). Naranja #FE5A03, oliva #7F8630
  y negro #111111 ya coincidían con los tokens. Montserrat ya era la letra.
- **Por qué:** llegó la paleta en el Diagnóstico Digital 360 (24/10); la lámina 33 excluye el azul.
- **Falta:** decidir si el color principal es oliva o naranja y recibir el logo en vector (ver `docs/DIAGNOSTICO-360.md`).
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
