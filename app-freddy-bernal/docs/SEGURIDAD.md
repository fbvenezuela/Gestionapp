# Seguridad (primera versión)

Actualizado: 23/10/2026. Qué se hizo para blindar la plataforma y qué falta.

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
   - archivos: rutas con uuid, sin fecha ni nombre original;
   - registros: el servidor no imprime datos de la agenda.
4. **Auditoría** por trigger en cada cambio (quién, qué, cuándo, antes y después), en una tabla en la que solo se
   agrega. Solo administración la lee.
5. **Entrar:** solo por invitación, con código de 6 dígitos por correo (sin contraseñas), **doble factor TOTP**
   exigido en la base para los roles sensibles, sesiones que caducan (12 h en demo; Supabase en producción) y
   administración puede cerrar las sesiones de alguien o desactivarlo.
6. **Claves:** solo en variables de entorno. La de servicio de Supabase nunca va al navegador. `.env*` está en
   `.gitignore`; la CI corre gitleaks en cada cambio.
7. **Archivos privados:** se descargan con URLs firmadas de 5 minutos, después de comprobar el permiso de la persona.
   Toda foto se recomprime en el teléfono antes de subir, aunque sea pequeña: eso borra la ubicación GPS del archivo.
   Si el teléfono no puede abrirla (por ejemplo HEIC en Android), no se sube y se pide pasarla a JPG. Los videos
   no se tocan: la ubicación de la cámara se apaga en los teléfonos del equipo.
8. **Cabeceras:** HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. El sitio no se
   indexa (`robots: noindex`).
9. **Nada sale sin permiso:** correos en modo buzón (`EMAIL_MODE=outbox`), nunca a direcciones `.test`, y en las
   versiones de prueba solo a `@resend.dev`. Publicación real apagada (`PUBLISHING_ENABLED=false`).
10. **IA:** solo en el servidor, con tope de gasto y registro de uso. El texto de la ficha se le pasa como
    información, no como instrucciones. Nunca recibe datos de ciudadanos.
11. **Entradas validadas** con zod en cada acción del servidor. Los links de los tweets se revisan solo si son
    públicos (sin IPs ni nombres internos).

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
