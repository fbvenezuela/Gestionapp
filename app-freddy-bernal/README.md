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

### 1. Supabase
1. Crear la organización del cliente y dos proyectos: `fb-dev` y `fb-prod` (región EE. UU. Este).
2. Aplicar las migraciones: `npx supabase link --project-ref <ref>` y `npx supabase db push` (nunca `db reset` en
   producción).
3. Cargar la configuración del cliente: `DATABASE_URL=... npm run db:seed-client`.
4. Crear el primer administrador: `DATABASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run db:first-admin -- correo@x.com "Nombre"`.
5. Authentication → Sign In / Providers → Email: **desactivar «Allow new users to sign up»**; activar email OTP.
6. Authentication → Email Templates → «Magic Link»: poner el código, por ejemplo
   `<p>Tu código para entrar es <b>{{ .Token }}</b>. Vence en 10 minutos.</p>`.
7. Authentication → Multi-Factor: activar **TOTP**.
8. Authentication → Sessions: «Time-box user sessions» 12 h e «Inactivity timeout» 8 h (requiere Pro).
9. Authentication → SMTP Settings → **Resend**: host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña =
   la API key de Resend, remitente del dominio verificado.
10. Database → Extensions: `pg_cron` y `pg_net` si se quiere el cron cada 5 minutos (ver `docs/ARQUITECTURA.md`).

### 2. Vercel
1. Importar el repositorio. **Root Directory: `app-freddy-bernal`**. Framework: Next.js.
2. Variables (Settings → Environment Variables), separadas por ambiente:
   - Preview y Development → `fb-dev`; Production → `fb-prod`.
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
