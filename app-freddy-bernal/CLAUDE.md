# CLAUDE.md — guía para seguir trabajando en este proyecto

@AGENTS.md

Lee primero `PROMPT-APP-FREDDY-BERNAL.md` (reglas que no se rompen, §4) y `docs/IDEA.md`. Juan habla español de
Venezuela y dicta por voz; contéstale corto y sin jerga. La interfaz en español; el código en inglés.

## Estado (28/10/2026)
- **Fase 0 y Fase 1 construidas**, en modo demostración (base en memoria con datos inventados). Faltan las cuentas
  (Supabase, Vercel, Resend) para pasar a datos reales: ver `README.md` y `docs/PENDIENTES.md`.
- Módulos: entrar por invitación + código + TOTP; Hoy por rol; agenda (calendario para jefe/despacho, lista sin fecha
  para redes); ficha del evento con ficha técnica, storyboard y modo lectura; material por partes; biblioteca por día;
  piezas con versiones; copies en tres largos con 9 fórmulas, voz y cierre por pieza (plantilla o IA); aprobación con
  semáforo (todo lo aprueba el jefe desde el 27/10, plazos y lista de chequeo; D-23, D-30); tweets de la semana desde
  documento (2–3 al día); publicación manual validada por red con mejores horas; registro de lo que publica el jefe por
  su cuenta; resultados (manual, CSV, «¿a qué hora nos va mejor?»); vista del jefe; ajustes; buzón; registro de cambios;
  avisos al teléfono (Web Push, D-25); asistente del equipo «360» (`docs/ASISTENTE.md`, D-26, sin IA hasta el OK legal);
  mejoras de uso (D-27: «Más», modo sol, consejos, pantallas en vivo, diálogo propio); material en Google Drive del
  cliente detrás de `STORAGE_PROVIDER=drive`, solo con la base real (`docs/DRIVE.md`, D-28).
- **Segunda vuelta de Hillary (27–28/10, `docs/PROMPT-CAMBIOS-HILLARY-2026-10-27.md`; D-29 a D-41):**
  - Seis roles (jefe, despacho, política, IVT, grabación, redes) y administración técnica; salen Secretaría y
    Supervisión sin perder historia. Solo el jefe aprueba (`can_approve()`), y tiene todo: su Inicio con cuatro
    botones y la puerta `/redes`.
  - Agenda compartida jefe + despacho (`can_manage_agenda()`): lo del jefe nace aceptado, lo del despacho «Por
    decidir»; cancelar sin borrar, historial y «gana el último» con aviso. Administración ya no edita la agenda.
  - Fichas: obra del IVT (con diálogo FAB sin inventar cifras) y comunitaria de política por municipio (historia que
    solo se agrega). «Guardar y avisar al jefe» → «Por ponerle fecha» → `schedule_ficha()` crea el evento. El IVT ve
    la fecha de sus visitas; política nunca. Contactos de terceros aparte y con doble factor.
  - Grabación entrega storyboard y nota para el editor; «Descargar todo» a una carpeta, sin fechas. Resultados con
    miniaturas. Glass v2 (tarjetas esmeriladas, listas largas sólidas, AA). Demo con los mismos ids en cada servidor.
  - Pruebas por rol de §8 en `tests/rls/por-rol.test.ts` y `tests/e2e/por-rol.spec.ts`. Guía en
    `docs/GUIA-POR-ROL.md` (no se manda hasta que Hillary pruebe cada rol). Preguntas abiertas: `docs/PENDIENTES.md`,
    al final.
- Marca: oliva como color principal (D-21). Diagnóstico Digital 360 resumido en `docs/DIAGNOSTICO-360.md` (el ZIP es
  confidencial y no está en el repositorio).
- Pruebas: Vitest (unidad + RLS) y Playwright a 360 px con axe. CI en `.github/workflows/ci.yml`.

## Cómo está armado (lo esencial)
- **Datos:** `src/lib/db`. Toda consulta de una persona va por `db(session, sql => …)` / `withUser`, que corre como el
  rol `authenticated` con sus claims: **RLS siempre**. `withSystem` solo para tareas sin persona. **Nunca** anides
  `withSystem` dentro de `withUser` (la base demo procesa una transacción a la vez: se bloquea).
- **Escrituras:** server actions en `src/lib/actions/*` con `act(schema, raw, fn)` (zod + RLS + mensajes en español).
  Los archivos `'use server'` solo exportan acciones; la lógica pura va a `src/lib/domain`, lecturas a `src/lib/data`.
- **Parámetros JSON:** usa `$1::text::jsonb` con `JSON.stringify(...)` (postgres.js re-codifica si pones `$1::jsonb`).
- **Fechas:** los drivers devuelven `Date`; usa `dt()`, `fmtDateTime()`, `ms()` de `src/lib/time.ts` (zona del Táchira).
- **Colores:** solo tokens de `src/app/tokens.css` (hay una prueba que lo verifica).
- **Migraciones:** `supabase/migrations`, nunca edites una aplicada: agrega otra. El esquema `auth` falso para demo y
  pruebas está en `supabase/shim/`.
- **Datos del cliente:** `config/clients/fb.json` (nada de Freddy en el código, §11.6).

## Cómo probar
```bash
cd app-freddy-bernal
npm test && npm run lint && npm run typecheck
npm run build && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e   # en el contenedor de Claude
```
Usuarios demo en `docs/DEMO.md`. En demo, `DEMO_SHORTCUTS` (activo por defecto) deja entrar con un toque y sin doble
factor; con `DATABASE_URL` nunca se activa. Playwright levanta dos servidores: 3100 estricto y 3101 con atajos.

## Qué falta (siguiente sesión)
1. `fb-dev` (Supabase, gratis) ya tiene las 26 migraciones, hasta `20261028002200`, y la configuración del cliente con
   los seis roles (aplicadas y verificadas el 28/10, `docs/PROMPT-SUPABASE.md`). Falta lo de esa guía: los pasos de
   Juan en el panel (SMTP primero), las variables en Vercel y la primera entrada (OTP, TOTP, Drive).
2. Respuestas de Hillary a las preguntas de la segunda vuelta (`docs/PENDIENTES.md`, al final) y, si confirma la tabla
   de diferencias, Redes como Mila por partes (#11).
3. Fase 2: publicación automática (Meta, X, TikTok, YouTube), métricas por API, análisis con IA, Drive del cliente,
   reporte semanal en PDF, Realtime en «Hoy» y colas.
4. Fase 3: web pública (indicadores, trazabilidad, obras, reportes con mapa, denuncias, ayudas, SEO).
5. Pendientes de negocio: `docs/PENDIENTES.md`.
