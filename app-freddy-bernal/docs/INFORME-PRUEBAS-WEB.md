# Informe de pruebas — web pública y atención ciudadana (06/11/2026)

Lo que se probó de la web nueva del gobernador (`/`), la participación ciudadana (`/atencion`), el administrador de la
web (`/admin/web`) y el de la atención (`/admin/atencion`), cómo se probó, los números que salieron y **lo que no se
pudo comprobar**. Todo en modo demostración: datos inventados, base en memoria, nada sale a personas reales.

> **BORRADOR EN CURSO** — faltan los números de la corrida completa de punta a punta, el barrido de axe y la prueba del
> modo local. Este aviso se quita cuando estén.

## En corto

- **Pasa:** las pruebas de unidad y de RLS (2.859), el lint, el chequeo de tipos y el armado (`npm run build`).
- **Los diez recorridos** que pidió el encargo largo y los del encargo del 6/11 tienen cada uno su prueba de punta a
  punta que los recorre de verdad en el navegador (tabla en §3). Se agregó `tests/e2e/web-recorridos.spec.ts` para los
  que estaban cubiertos solo en parte.
- **Lighthouse en el teléfono** (medido aquí, no en Vercel): rendimiento 94–97, accesibilidad 100, buenas prácticas
  100 y SEO 66 en las cuatro páginas medidas. El SEO baja **a propósito**: la versión de prueba le dice a los buscadores
  que no la muestren (D-95); sin esa única regla, el SEO da 100.
- **Peso de la portada:** 219 KB con gzip (lo que sirve `next start`) y unos 204 KB con brotli (estimado, como sirve
  Vercel). **La meta del encargo, menos de 200 KB, no se cumple por poco.**
- **Se arreglaron cuatro cosas** que salieron al medir y al mirar las capturas (§8).
- **No se pudo comprobar** nada de producción: Supabase real, Vercel, el revisor de archivos (ClamAV), Turnstile, los
  correos, el volumen real de datos ni fotos reales (§11).

## 1. Qué se probó y cómo

| Tipo de prueba | Qué mira | Dónde está | Cómo se corre |
|---|---|---|---|
| Unidad | La lógica sin pantalla: esquemas, bloques de texto seguro, códigos y claves, límites, CSV, limpieza de fotos, estados, duplicados, PDF del comprobante, redirecciones, importador | `tests/unit/` | `npm test` |
| RLS (permisos en la base) | Cada rol y el público intentan leer o cambiar lo que no les toca: borradores, casos de otra área, denuncias, contactos, notas internas, archivos, exportación, registro | `tests/rls/` (PGlite, el mismo Postgres de la demo) | `npm test` |
| De punta a punta | La app armada como en producción, en un Chromium real, a 360 px (teléfono) y a 1280 px (computadora), con el ingreso real del equipo (código por correo y doble factor) y **axe** (accesibilidad) en las pantallas principales | `tests/e2e/` | `npm run build && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e` |
| Lighthouse | Rendimiento, accesibilidad, buenas prácticas y SEO, como lo mide Google para un teléfono | fuera del repositorio | §4 |
| Peso | Lo que baja un teléfono en la primera visita | `tests/e2e/web-publica.spec.ts` (portada) y una medición aparte (§5) | §5 |
| Capturas | Mirar cada pantalla a 360 px y en computadora, clara y oscura | fuera del repositorio (no van al repositorio) | §7 |

**Dónde se corrió:** el contenedor de Claude (Linux, 4 núcleos), Node 22.22, Next 16.4.3, Chromium 153 sin pantalla,
la base de la demostración (PGlite en memoria) y el servidor de producción de Next (`next start`), no Vercel.

## 2. Resultados

| Comprobación | Resultado |
|---|---|
| `npm test` (unidad + RLS) | **209 archivos, 2.859 pasan, 3 omitidas** (las mismas de antes), 310 s |
| `npm run lint` | sin errores ni avisos |
| `npm run typecheck` | sin errores |
| `npm run build` | arma sin errores |
| De punta a punta completo | _pendiente_ |

De la web y la atención son, entre otras: 7 archivos de RLS (`web-cms`, `web-cms-admin`, `web-ciudadano`,
`web-atencion`, `web-atencion-admin`, `web-import`, `seguridad-web`) y unos 35 de unidad (`web-*`, `participation-*`,
`attention-*`, `seguridad-*`, `storage-*`).

## 3. Los recorridos y su prueba

_pendiente_

## 4. Lighthouse en el teléfono

_pendiente_

## 5. Peso de las páginas

_pendiente_

## 6. Accesibilidad (axe)

_pendiente_

## 7. Capturas

_pendiente_

## 8. Lo que se arregló en esta etapa

_pendiente_

## 9. Revisión de seguridad

_pendiente_

## 10. En local, con datos que se quedan

_pendiente_

## 11. Lo que no se pudo comprobar

_pendiente_

## 12. Cómo repetir estas pruebas

_pendiente_
