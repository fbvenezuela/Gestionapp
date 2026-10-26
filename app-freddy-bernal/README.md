# FB · Operaciones 360

Plataforma interna del equipo: agenda (con la regla de fecha y hora), material por evento, piezas con copies por
fórmula, aprobación de supervisión, tweets de la semana, publicación validada y resultados.

- Qué es y por qué: `docs/IDEA.md`, `PROMPT-APP-FREDDY-BERNAL.md`.
- Cómo está hecha: `docs/ARQUITECTURA.md`. Decisiones: `docs/DECISIONES.md`. Seguridad: `docs/SEGURIDAD.md`.
- Costos: `docs/COSTOS.md`. Recorrido de prueba: `docs/DEMO.md`.

## Arrancar en local
```bash
cd app-freddy-bernal
npm install            # copia también MediaInfo (WASM) a public/
npm run dev            # http://localhost:3000 — sin DATABASE_URL arranca en modo demostración
```
Con datos reales: copia `.env.example` a `.env.local` y llena las variables (o `npx vercel env pull`).

## Pruebas
```bash
npm run lint && npm run typecheck
npm test                                   # lógica + RLS en Postgres en memoria
TEST_DATABASE_URL=postgres://... npm run test:rls   # RLS en un Postgres DESECHABLE (nunca producción)
npm run build && npm run test:e2e          # Playwright a 360 px + axe
```

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
   Authentication → Users → Add user (ver `docs/PROMPT-SUPABASE.md`). O desde la terminal:
   `DATABASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run db:first-admin -- correo@x.com "Nombre"`.
   El script pide antes la configuración del cliente, usa la invitación pendiente si ya existe, no muestra el
   correo y, si algo falla, sale con error sin dejar invitaciones sueltas.
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
1. Importar el repositorio. **Root Directory: `app-freddy-bernal`**. Framework: Next.js.
2. Variables (Settings → Environment Variables), separadas por ambiente:
   - Por ahora solo existe `fb-dev` y va en Production (`docs/PROMPT-SUPABASE.md`). Si algún día hay `fb-prod`:
     Preview y Development → `fb-dev`; Production → `fb-prod`.
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
     `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_MODE`, `CRON_SECRET`, y si hay IA: `AI_ENABLED`, `AI_MODEL`,
     `ANTHROPIC_API_KEY`, `AI_MONTHLY_CAP_USD`.
   - **Para la demostración sin cuentas:** no pongas `DATABASE_URL`; solo `SESSION_SECRET` (una cadena larga al azar).
3. Settings → Deployment Protection: activar para las versiones de prueba.
4. Settings → Functions: región `iad1` (la misma de la base).

### 3. Resend
1. Crear la cuenta del cliente y la API key (permiso «Sending access»).
2. Domains → agregar el dominio y poner en su DNS los registros SPF, DKIM y DMARC (cuando Pedro Poller pase el DNS,
   o con un dominio nuevo).

## Volver a la versión anterior (Instant Rollback)
En Vercel → Deployments → la versión buena → «…» → **Instant Rollback**. Es inmediato y no toca la base. Si una
migración rompió algo, se arregla con una migración nueva (nunca editando una ya aplicada).

## Reglas
Están en `PROMPT-APP-FREDDY-BERNAL.md` §4 y en `CLAUDE.md`.
