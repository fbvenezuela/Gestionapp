# FB · Operaciones 360

Una sola app (Next.js + Postgres de Supabase con RLS en todas las tablas) con dos caras:
- **El panel del equipo** (`/panel`): agenda con la regla de fecha y hora, fichas, material por evento, Redes por
  formato, copies, tweets, aprobación del jefe, publicación validada, resultados, Mensajes y el asistente 360.
- **La web pública del gobernador** (`/`): portada, el gobernador, gestión y obras, actualidad y Semanario, Reporte
  Bernal, transparencia y canales, con la **atención ciudadana** sin cuenta (`/atencion`). Dentro del panel, su
  administrador: **«Web»** (`/admin/web`, contenido por bloques con aprobación) y **«Atención»** (`/admin/atencion`,
  las solicitudes que llegan).

Hoy todo corre en **modo demostración** con datos inventados; la web no se indexa y abrirla al público lo decide Juan
(`docs/PENDIENTES.md`).

## Instalar
Hace falta **Node 22** (el de la CI) con npm, y git. No hace falta Docker.
```bash
git clone https://github.com/fbvenezuela/Gestionapp.git
cd Gestionapp/app-freddy-bernal
npm install            # copia también MediaInfo (WASM) a public/
npm run dev            # http://localhost:3000
```

## Tres formas de correrla

| Modo | Cómo | Para qué | Los datos |
|---|---|---|---|
| **Demostración** | `npm run dev` sin `DATABASE_URL` (o `npm run build && npm start`) | Probar y enseñar | Inventados, en memoria: al reiniciar vuelven a los de siempre |
| **Local con datos que se quedan** | `LOCAL_DATA_DIR=./.data npm run dev` | Trabajar varios días en tu computadora, sin cuentas | Los inventados más lo que hagas, en `./.data` (abajo) |
| **Producción** | Con `DATABASE_URL` y las cuentas («Conectar las cuentas»), en Vercel | Datos reales | Supabase (base, usuarios y archivos). Los atajos de la demo no existen |

Para la demostración y el modo local no hay que llenar nada. Con datos reales: copia `.env.example` a `.env.local`
(nunca va al repositorio) y llena las variables, o `npx vercel env pull`. Cada variable está explicada en
`.env.example`.

### Las direcciones en tu computadora
- **http://localhost:3000** → la web pública (la portada).
- **http://localhost:3000/panel** → el panel del equipo: con sesión, al inicio de tu rol; sin sesión, a entrar.
- **http://localhost:3000/entrar** → la tarjeta **«Versión de demostración»**: toca un rol («Entrar →») y entras
  directo, sin código ni doble factor («Entrar como…»; los de la web y la atención están bajo «La web y la atención
  ciudadana»). Con `DEMO_SHORTCUTS=false` se ve el flujo real: el código aparece en la pantalla y se activa el doble
  factor con Google Authenticator. Con `DATABASE_URL` el atajo nunca existe. Quién es quién: `docs/DEMO.md`.
- `npm run dev` escucha en toda tu red; para que solo la abra tu computadora: `npm run dev -- -H 127.0.0.1`. **Nunca
  datos reales en la demostración ni en el modo local** (la clave de contactos de la demo está en el repositorio).

### En local con datos que se quedan (sin Docker, D-94)
```bash
LOCAL_DATA_DIR=./.data npm run dev    # o ponlo en .env.local
```
- La primera vez arma la base de la demostración (PGlite en `./.data/pglite`) con los mismos datos inventados de
  siempre y la siembra **una sola vez** (la marca es `./.data/pglite.json`). Desde ahí, lo que hagas queda al reiniciar.
- Los archivos de la demo también quedan: `./.data/files/web-public` (la biblioteca de la web),
  `./.data/files/participacion-privado` (los archivos de las solicitudes) y `./.data/uploads` (el material del panel).
- Si el código trae una migración nueva, se aplica sola al arrancar (y se recarga la configuración del cliente).
- Una sola copia de la app por carpeta (`./.data/pglite.lock`): para dos servidores, dos carpetas. `next build` no la
  usa.
- Para empezar de cero, o si la base local se daña: para el servidor y borra la carpeta.
- Entras igual que en la demo: «Entrar como…» con el rol que quieras (`docs/DEMO.md`). `.data/` no va al repositorio.
- Para guardar una copia: con la app cerrada, copia la carpeta entera (`docs/COPIAS-Y-RECUPERACION.md` §8).
- `docker-compose.yml` trae lo opcional (un Postgres desechable para las pruebas de RLS y ClamAV para revisar los
  archivos); no se probó en el entorno donde se escribió.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | La app en http://localhost:3000 (demostración, o modo local con `LOCAL_DATA_DIR`) |
| `npm run build && npm start` | La versión armada, como en Vercel. `npm run build` corre antes el «prebuild» (`scripts/real-site/snapshot.mts`): sin `REAL_SITE_CONTENT=1` no hace nada más que borrar una `.real-site/` vieja (menos de un segundo) |
| `npm test` | Pruebas de la lógica y de RLS en un Postgres en memoria |
| `TEST_DATABASE_URL=postgres://... npm run test:rls` | Las de RLS en un Postgres **desechable** (nunca producción) |
| `npm run build && npm run test:e2e` | De punta a punta con Playwright, a 360 px y en computadora, con axe |
| `npm run lint` y `npm run typecheck` | Revisión del código |
| `npm run db:seed-client` | Carga la configuración del cliente (`config/clients/fb.json`) en una base real, sin pisar lo que haya |
| `npm run db:first-admin -- correo "Nombre"` | El primer administrador (o el jefe, con `--jefe`): ver abajo |
| `npm run web:import` | El importador de la web vieja (por omisión, una prueba que no escribe nada) |
| `npm run docs:guides` | Vuelve a generar las guías por rol desde la app (`docs/GUIA-POR-ROL.md`, `FLUJOS.md`, `GUIA-ADMINISTRACION.md`) |
| `npm run drive:import` | Sube una carpeta al Google Drive del cliente (`docs/DRIVE.md`) |
| `npm run capturas` | Las capturas lado a lado de Redes (`docs/capturas/`) |

En el contenedor de Claude, Playwright usa `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` (`CLAUDE.md`).

## Conectar las cuentas (lo hace Juan; nunca pegar claves en el chat)

### 1. Supabase (plan gratis)
Hoy hay un proyecto, `fb-dev` (`docs/CUENTAS.md`). Lo que falta, paso a paso y con Claude: `docs/PROMPT-SUPABASE.md`.

1. **Base de datos.** Las migraciones de `supabase/migrations` van en orden de nombre y como el rol `postgres`, con
   el conector de Supabase o con `npx supabase db push --db-url "<URL del Session pooler>"`. La primera,
   `20261023000000_hosted_defaults.sql`, tiene que correr con la base vacía. Nunca se edita una ya aplicada: se
   agrega otra. Nunca `db reset` en producción.
2. **Configuración del cliente:** `DATABASE_URL=... npm run db:seed-client`.
3. **Correo propio (SMTP), lo primero en Authentication.** Con el correo de Supabase los proyectos gratis nuevos no
   dejan cambiar las plantillas, y ese correo solo llega a los miembros de la organización (2 por hora).
   Authentication → Emails → SMTP Settings. Lo gratis: Gmail con contraseña de aplicación (verificación en 2 pasos y
   luego myaccount.google.com/apppasswords): host `smtp.gmail.com`, puerto `465`, usuario y remitente el Gmail.
   Resend sirve solo con un dominio verificado (sin dominio, solo le escribe al dueño de la cuenta).
4. **Después, la plantilla «Magic Link»** (Authentication → Emails → Templates): el código y ningún enlace, por
   ejemplo `<p>Tu código para entrar es <b>{{ .Token }}</b>. Vence en 10 minutos.</p>`.
5. **Sign In / Providers → Email:** largo del código (OTP length) **6**, vencimiento **600** segundos y **apagar
   «Allow new users to sign up»**. (La app acepta códigos de 6 a 10 números, por si el largo cambia.)
6. **URL Configuration:** Site URL = la dirección de producción (`https://fb-operaciones-360.vercel.app`).
7. **Multi-Factor:** TOTP encendido (viene así).
8. **Opcional:** apagar la Data API (Project Settings → Data API). La app no usa PostgREST (`/rest/v1`). Después,
   probar que «Hoy» se refresca solo y que se puede ver un archivo.
9. **Primer administrador:** con su invitación pendiente en `public.invitations`, se crea su usuario en
   Authentication → Users → Add user (ver `docs/PROMPT-SUPABASE.md`), o con `npm run db:first-admin` (paso a paso en
   «El primer administrador, de forma segura», abajo). El script pide antes la configuración del cliente, usa la
   invitación pendiente si ya existe, no muestra el correo y, si algo falla, sale con error sin dejar invitaciones
   sueltas. **El jefe** se crea igual, con `--jefe` al final: `npm run db:first-admin -- correo@x.com "Nombre" --jefe`.
   El rol de jefe solo lo da el sistema (este comando, la semilla o una migración); Administración no lo da desde
   «Equipo» (D-58). Cada rol que da una persona le llega al jefe como aviso.
10. **Nunca borrar personas** en Authentication → Users: falla cuando ya hicieron algo. Se desactivan en la app
    (Ajustes → Equipo).
11. **Claves y conexión para Vercel** (las pone Juan; nunca en el repositorio):
    - Botón verde **Connect** → **Transaction pooler** (puerto 6543, usuario `postgres.<ref>`): es `DATABASE_URL`,
      con la contraseña de la base y `?sslmode=require` al final. La conexión directa es solo IPv6 en el plan
      gratis: Vercel no llega.
    - **Settings → API Keys:** la publishable (`sb_publishable_…`) va en `NEXT_PUBLIC_SUPABASE_ANON_KEY`; la secreta
      (`sb_secret_…`), en `SUPABASE_SERVICE_ROLE_KEY`. Los nombres de las variables no cambian.
12. **Lo que da el plan gratis:** 50 MB por archivo (el video va por Google Drive: `STORAGE_PROVIDER=drive`,
    `docs/DRIVE.md`), 500 MB de base, y se pausa tras 7 días sin uso (la tarea de `pg_cron` cada 5 minutos lo
    mantiene activo; si se pausa, se reanuda gratis desde el panel). El tiempo límite y la inactividad de las
    sesiones (Authentication → Sessions) son de Pro.

### 2. Vercel
1. Importar el repositorio. **Root Directory: `app-freddy-bernal`**. Framework: Next.js. El comando de construcción
   está en `vercel.json` (`npm run build`, con su «prebuild»): no lo cambies en Settings.
2. Variables (Settings → Environment Variables), separadas por ambiente:
   - Por ahora solo existe `fb-dev` y va en Production (`docs/PROMPT-SUPABASE.md`). Si algún día hay `fb-prod`:
     Preview y Development → `fb-dev`; Production → `fb-prod`.
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
     `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_MODE`, `CRON_SECRET`, y si hay IA: `AI_ENABLED`, `AI_MODEL`,
     `ANTHROPIC_API_KEY`, `AI_MONTHLY_CAP_USD`.
   - La web pública y la atención ciudadana (con `DATABASE_URL`, sin estas dos no se guarda ningún comprobante ni
     contacto): `PARTICIPATION_PEPPER` y `PARTICIPATION_DATA_KEY` (cómo generarlas en `.env.example`); después
     `SITE_URL`, y `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` cuando haya cuenta de Cloudflare. `SITE_INDEXABLE`
     solo con el OK de Juan. El esquema `citizen` **nunca** se agrega a los esquemas expuestos de la Data API.
   - **Para la demostración sin cuentas:** no pongas `DATABASE_URL`; solo `SESSION_SECRET` (una cadena larga al azar).
     La versión de producción de la demo trae sola el contenido real de la web oficial (abajo, D-101): no hace falta
     ninguna variable. `REAL_SITE_CONTENT=0` lo apaga; `YOUTUBE_API_KEY` es opcional.
3. Settings → Deployment Protection: activar para las versiones de prueba.
4. Settings → Functions: región `iad1` (la misma de la base).

### 3. Resend
1. Crear la cuenta del cliente y la API key (permiso «Sending access»).
2. Domains → agregar el dominio y poner en su DNS los registros SPF, DKIM y DMARC (cuando Pedro Poller pase el DNS,
   o con un dominio nuevo).

## El primer administrador, de forma segura
Con datos reales **no hay registro abierto** («Allow new users to sign up» apagado, paso 5) **ni contraseñas**: cada
persona entra con su correo, un código que le llega y el doble factor de Google Authenticator. Por eso a la primera
persona la crea el sistema, una sola vez, desde la computadora de Juan:
1. Antes: las migraciones y `npm run db:seed-client` (pasos 1 y 2), el correo propio y la plantilla del código (pasos
   3 y 4).
2. Las tres claves van a la terminal desde el gestor de contraseñas, sin escribirlas en un archivo ni en el chat (así
   no quedan en el historial):
   ```bash
   read -rs DATABASE_URL && export DATABASE_URL                            # pega y Enter (no se ve)
   read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
   export NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   npm run db:first-admin -- correo@dominio.com "Nombre Apellido"
   ```
   El comando no muestra el correo, usa la invitación pendiente si ya existía y, si algo falla, sale con error sin
   dejar invitaciones sueltas. No crea ninguna contraseña ni manda nada.
3. Esa persona abre `/entrar`, escribe su correo, pone el código que le llega y activa el doble factor con su
   teléfono.
4. Desde ahí, al resto lo invita Administración en Ajustes → Equipo, cada quien con su rol (los de la web y la
   atención, siempre con doble factor). **El jefe** se crea igual que el primer administrador, con `--jefe` al final:
   ese rol solo lo da el sistema (D-58).
5. Revisa en Ajustes → Equipo que estén solo las personas que deben estar. Nunca se borra a nadie en Authentication →
   Users: se desactiva en la app.

## Traer la web vieja (importador)
Los artículos de freddybernaloficial.com entran como **borradores** (nunca publicados), con sus fotos en la
biblioteca y las redirecciones de sus direcciones viejas. Todo el plan, con la salida a producción:
`docs/PLAN-MIGRACION-Y-PRODUCCION.md`.
```bash
npm run web:import                         # prueba: lee la web vieja y NO escribe nada
npm run web:import -- --apply --limit 20   # escribe 20 (DATABASE_URL de Supabase, o LOCAL_DATA_DIR con la app cerrada)
npm run web:import -- --help               # todas las opciones (--since, --ids, --no-media, --report…)
```
Nada de la web vieja va al repositorio: el reporte (`--report`) se guarda fuera de él.

## La demo con el contenido real de la web oficial (D-101)
La versión de prueba publicada en Vercel muestra las noticias, la opinión, la biografía, las fotos, el Semanario y
las emisiones del Reporte Bernal de la web oficial, dentro del diseño nuevo. Se leen **al construir** (solo GET, con
pausas) y quedan en `.real-site/`, que **nunca va al repositorio** (el repositorio es público). Solo en la
demostración (sin `DATABASE_URL`): con la base real nunca se enciende.
```bash
npm run build                                          # como CI y en tu computadora: apagado, contenido inventado
REAL_SITE_CONTENT=1 npm run build && npm start         # con el contenido real (detrás de un proxy: NODE_USE_ENV_PROXY=1)
```
- **En Vercel se enciende solo** en el despliegue de producción (`VERCEL_ENV=production`) del repositorio de la demo
  (`web.realSite.vercelRepo` en `config/clients/fb.json`: una copia del repositorio no lo enciende). Hace falta que el
  proyecto tenga encendido «Automatically expose System Environment Variables» (Settings → Environment Variables; viene
  encendido en los proyectos nuevos). Si queda apagado, el registro de la construcción dice qué vio de `VERCEL` y
  `VERCEL_ENV`. Después del primer despliegue de producción, el registro debe decir «[contenido real] encendido
  (despliegue de producción en Vercel)». Las versiones de prueba de cada rama y CI quedan con el contenido inventado.
- `REAL_SITE_CONTENT`: `1` lo enciende en cualquier construcción; `0` lo apaga al construir y, al abrir la app, deja la
  base y las fotos con lo inventado. Las páginas que la construcción ya armó con el contenido real siguen así hasta que
  se vuelve a construir: para ver lo inventado, `npm run build` sin la variable (las pruebas de punta a punta se niegan
  a correr al lado de una `.real-site/`).
- `REAL_SITE_BUDGET_S`: cuántos segundos puede tardar (480 si no se pone). Pasado ese tiempo, o si la web oficial no
  responde, se usa la copia anterior (Vercel la guarda en `.next/cache/real-site/`); sin copia, la demo sale con el
  contenido inventado y el registro de la construcción lo avisa. **La construcción nunca falla por la web oficial.**
- `YOUTUBE_API_KEY` (opcional): si las listas públicas del canal no responden, las emisiones se piden a la API oficial
  de YouTube con esta clave. La clave va solo en una cabecera de la petición: nunca en el registro ni en `.real-site/`.
  La pone Juan en Vercel si la quiere (`docs/PENDIENTES.md`).
- Con `LOCAL_DATA_DIR`, la base local guarda lo que sembró la primera vez: para pasar de inventado a real (o al
  revés), borra la carpeta. Al arrancar avisa si su primera siembra ya no coincide con la construcción.
- **Si la web oficial retira algo** (una nota, una foto): la próxima construcción lo deja fuera. Lo bajado se guarda
  una semana como mucho y la copia anterior no se usa si tiene más de una semana. Para sacarlo ya: en Vercel,
  «Redeploy» sin la caché de construcción («Use existing Build Cache» apagado), y borrar los despliegues viejos que
  lo muestren.

## Volver a la versión anterior (Instant Rollback)
En Vercel → Deployments → la versión buena → «…» → **Instant Rollback**. Es inmediato y no toca la base. Si una
migración rompió algo, se arregla con una migración nueva (nunca editando una ya aplicada).

## Copias de seguridad
Qué se copia (la base, los baldes de archivos, la configuración y las claves que viven fuera del repositorio), cómo,
cada cuánto, cómo se restaura y cómo se prueba: `docs/COPIAS-Y-RECUPERACION.md`. Lo principal: el plan gratis de
Supabase no tiene copias automáticas, sus copias nunca traen los archivos, y sin `PARTICIPATION_DATA_KEY` los
contactos de la gente no se pueden leer.

## Dónde está cada cosa
- **Para el equipo:** `docs/GUIA-WEB.md` (la web sección por sección, el recorrido del ciudadano, la versión de prueba
  y quién hace qué), `docs/MANUAL-ADMIN-WEB.md` (editar y publicar), `docs/MANUAL-ATENCION.md` (atender solicitudes),
  `docs/GUIA-POR-ROL.md`, `docs/FLUJOS.md` y
  `docs/GUIA-ADMINISTRACION.md` (el panel), `docs/DEMO.md` (qué probar con cada rol).
- **Para salir a producción:** `docs/PENDIENTES.md` (lo que falta y quién), `docs/PLAN-MIGRACION-Y-PRODUCCION.md`,
  `docs/COPIAS-Y-RECUPERACION.md`, `docs/PROMPT-SUPABASE.md`, `docs/CUENTAS.md`, `docs/COSTOS.md` y `docs/DRIVE.md`.
- **Cómo está hecha:** `docs/IDEA.md` (qué es y por qué), `PROMPT-APP-FREDDY-BERNAL.md`, `docs/ARQUITECTURA.md`,
  `docs/DECISIONES.md`, `docs/SEGURIDAD.md`, `docs/diagnostico.md` (la web vieja), `docs/INFORME-PRUEBAS-WEB.md` (las
  pruebas de la web y sus límites), `docs/DISENO.md` y `docs/ASISTENTE.md`.

## Reglas
Están en `PROMPT-APP-FREDDY-BERNAL.md` §4 y en `CLAUDE.md`.
