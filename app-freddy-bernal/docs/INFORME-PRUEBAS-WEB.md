# Informe de pruebas — web pública y atención ciudadana (06/11/2026)

Lo que se probó de la web nueva del gobernador (`/`), la participación ciudadana (`/atencion`), el administrador de la
web (`/admin/web`) y el de la atención (`/admin/atencion`), cómo se probó, los números que salieron y **lo que no se
pudo comprobar**. Todo en modo demostración: datos inventados, base en memoria, nada sale a personas reales.

> **BORRADOR EN CURSO** — faltan los números de la corrida completa de punta a punta, el barrido de axe y la prueba del
> modo local. Este aviso se quita cuando estén.

## En corto

- **Pasa:** las pruebas de unidad y de RLS (2.859), el lint, el chequeo de tipos y el armado (`npm run build`).
- **Los diez recorridos** del encargo largo y los del encargo del 6/11 tienen cada uno su prueba de punta a punta que
  los recorre de verdad en el navegador (tabla en §3). Se agregó `tests/e2e/web-recorridos.spec.ts` para los que
  estaban cubiertos solo en parte.
- **Lighthouse en el teléfono** (medido aquí, no en Vercel): rendimiento 94–97, accesibilidad 100, buenas prácticas
  100 y SEO 66 en las cuatro páginas medidas. El SEO baja **a propósito**: la versión de prueba les pide a los
  buscadores que no la muestren (D-95); sin esa única regla, el SEO da 100.
- **Peso de la portada:** 219 KB con gzip (lo que sirve `next start`) y unos 204 KB con brotli (estimado, como sirve
  Vercel). **La meta del encargo, menos de 200 KB sin fotos, no se cumple por poco** (§5).
- **Se arreglaron cuatro cosas** que salieron al medir y al mirar las capturas (§8).
- **No se pudo comprobar** nada de producción: Supabase real, Vercel, el revisor de archivos (ClamAV), Turnstile, los
  correos, el volumen real de datos ni fotos reales (§11).

## 1. Qué se probó y cómo

| Tipo de prueba | Qué mira | Dónde está | Cómo se corre |
|---|---|---|---|
| Unidad | La lógica sin pantalla: esquemas, bloques de texto seguro, códigos y claves, límites, CSV, limpieza de fotos, estados, duplicados, PDF del comprobante, redirecciones, importador | `tests/unit/` | `npm test` |
| RLS (permisos en la base) | Cada rol y el público intentan leer o cambiar lo que no les toca: borradores, casos de otra área, denuncias, contactos, notas internas, archivos, exportación, registro | `tests/rls/` (PGlite, el mismo Postgres de la demo) | `npm test` |
| De punta a punta | La app armada como en producción, en un Chromium de verdad, a 360 px (teléfono) y a 1280 px (computadora), con el ingreso real del equipo (código por correo y doble factor) y **axe** (accesibilidad) en las pantallas principales | `tests/e2e/` | §12 |
| Lighthouse | Rendimiento, accesibilidad, buenas prácticas y SEO, como lo mide Google para un teléfono | fuera del repositorio | §4 |
| Peso | Lo que baja un teléfono en la primera visita | `tests/e2e/web-publica.spec.ts` (portada) y una medición aparte | §5 |
| Capturas | Mirar cada pantalla a 360 px y en computadora, clara y oscura | fuera del repositorio | §7 |

**Dónde se corrió:** el contenedor de Claude (Linux, 4 núcleos), Node 22.22, Next 16.4.3, Chromium 153 sin pantalla,
la base de la demostración (PGlite en memoria) y el servidor de producción de Next (`next start`). **No** en Vercel ni
con Supabase.

## 2. Resultados

| Comprobación | Resultado |
|---|---|
| `npm test` (unidad + RLS) | **209 archivos: 2.859 pasan, 3 omitidas** (las mismas de antes), en 310 s |
| `npm run lint` | sin errores ni avisos |
| `npm run typecheck` | sin errores |
| `npm run build` | arma sin errores |
| De punta a punta completo (`npm run test:e2e`) | _pendiente_ |

De la web y la atención hay 7 archivos de RLS (`web-cms`, `web-cms-admin`, `web-ciudadano`, `web-atencion`,
`web-atencion-admin`, `web-import`, `seguridad-web`) y unos 35 de unidad (`web-*`, `participation-*`, `attention-*`,
`seguridad-*`, `storage-*`); de punta a punta, `web-publica`, `participacion`, `admin-web`, `admin-atencion`,
`web-roles`, `seguridad-web` y `web-recorridos`.

## 3. Los recorridos y su prueba

_pendiente_

## 4. Lighthouse en el teléfono

Lighthouse 13.5.0 con su configuración de teléfono de siempre (un Moto G Power simulado, 4G lento simulado, procesador
4 veces más lento), contra `next start` en este contenedor, tres corridas por página; la tabla da la mediana. Después
del arreglo de §8.1.

| Página | Rendimiento | Accesibilidad | Buenas prácticas | SEO | Primer contenido (FCP) | Contenido principal (LCP) | Bloqueo (TBT) | Saltos (CLS) |
|---|---|---|---|---|---|---|---|---|
| `/` (portada) | 97 | 100 | 100 | 66 | 0,9 s | 2,5 s | 111 ms | 0 |
| `/actualidad` | 97 | 100 | 100 | 66 | 0,9 s | 2,5 s | 114 ms | 0 |
| `/gestion` | 97 | 100 | 100 | 66 | 0,9 s | 2,3 s | 126 ms | 0 |
| `/atencion/nueva` (formulario) | 94 | 100 | 100 | 66 | 0,9 s | 2,9 s | 137 ms | 0 |

- **Las tres corridas** dieron: portada 97/97/97, actualidad 95/97/97, gestión 97/99/96, formulario 94/94/95.
- **SEO 66 es a propósito.** La única regla que falla es «la página no se deja indexar»: la versión de prueba les dice
  a los buscadores que no la muestren (cabecera, etiqueta y `robots.txt`, D-95). Sin esa regla, las cuatro páginas
  sacan 100 en SEO. Con `SITE_INDEXABLE=true` (producción y decisión de Juan) esa regla cambia; **no se midió** así,
  porque esa variable se fija al armar la app.
- **Antes del arreglo de §8.1** el formulario sacaba 96 en buenas prácticas: el navegador avisaba que la página había
  intentado algo que su propia CSP prohíbe.
- **La meta del encargo del 6/11** (90 o más en las cuatro categorías en el teléfono) se cumple en rendimiento,
  accesibilidad y buenas prácticas; en SEO solo cuando la web se abra a los buscadores.
- **Lo que no dice este número:** no es Vercel (allá hay brotli y una red de distribución, que deberían ayudar), no hay
  fotos reales (la demo no tiene fotos: todas son espacios «Foto por subir»), y la red y el teléfono son simulados.

## 5. Peso de las páginas

Lo que baja un teléfono de 360 px en su primera visita, bajando hasta el final de la página. «gzip» es lo que manda
`next start`; «brotli» es una estimación de lo que mandaría Vercel (los mismos archivos comprimidos con brotli nivel 5).
La demo **no tiene fotos**, así que con fotos y sin fotos pesan lo mismo.

| Página | gzip | brotli (estimado) | Pedidos | De eso, JavaScript |
|---|---|---|---|---|
| `/` (portada) | 219 KB | 204 KB | 13 | 146 KB |
| `/actualidad` | 211 KB | 198 KB | 12 | 144 KB |
| `/actualidad/<una noticia>` | 210 KB | 198 KB | 13 | 146 KB |
| `/gestion` | 214 KB | 200 KB | 13 | 146 KB |
| `/gestion/<una obra>` | 209 KB | 197 KB | 13 | 146 KB |
| `/gobernador` | 209 KB | 198 KB | 13 | 146 KB |
| `/transparencia` | 214 KB | 200 KB | 12 | 144 KB |
| `/atencion/nueva` (formulario) | 294 KB | 276 KB | 18 | 223 KB |
| `/atencion/consultar` | 272 KB | 257 KB | 18 | 207 KB |

- **Meta del encargo:** menos de 200 KB en la primera carga de la portada sin fotos. **No se cumple por poco:** 219 KB
  con gzip, unos 204 KB con brotli. La prueba de `web-publica.spec.ts` lo mide en cada corrida y avisa si pasa de 240
  KB (es un freno para que no crezca, no la meta).
- **Qué pesa en la portada:** JavaScript 146 KB (unos 117 KB son la base de Next y React, que toda página trae), la
  letra Montserrat 35 KB, la hoja de estilos 16 KB y la página en sí 21 KB.
- **Con fotos reales** cada página pesará más; las fotos salen en AVIF o WebP del tamaño de la pantalla y las de
  abajo cargan al llegar a ellas, pero **no se pudo medir** sin fotos de verdad.

## 6. Accesibilidad (axe)

_pendiente_

## 7. Capturas

Se tomaron capturas de página completa de las 19 páginas públicas, el formulario paso a paso (con errores y con el
comprobante), una consulta abierta, y 19 pantallas del administrador (editor, aprobador, coordinación, auditoría y
denuncias), a 360 px y a 1280 px, más 5 páginas públicas en modo oscuro: 97 capturas contando las de después de los
arreglos, guardadas **fuera del repositorio** (en la carpeta de trabajo de esta sesión). En cada una se buscó, además, con un programa, cualquier
elemento que se saliera de la pantalla hacia los lados: **ninguno**.

Al mirarlas se encontraron y arreglaron tres cosas (§8.2 a §8.4). Lo que quedó, a propósito o por menor:
- El botón para elegir archivo de la evidencia del equipo es el del navegador: en este Chromium dice «Choose File»; en
  un teléfono o una computadora en español dice «Elegir archivo».
- En la tarjeta de vista previa para redes del editor, la dirección dice `localhost:3000` porque aquí no hay
  `SITE_URL`; en producción dice la dirección de la web.
- Al pedir más información, el historial del equipo muestra la pregunta dos veces: como el mensaje que lee la persona y
  como «Motivo (interno)» del cambio de estado. No es un error de permisos (la persona ve solo el mensaje), pero se
  podría quitar la repetición.
- El mapa del administrador sale sin mosaicos en este contenedor (no llega a OpenStreetMap); se ve el marco y los
  puntos.

## 8. Lo que se arregló en esta etapa

1. **El formulario rompía su propia CSP** (`d5bc0a2`). Lighthouse marcó buenas prácticas 96 en `/atencion/nueva`: zod,
   la librería que valida el formulario en el teléfono, prueba al cargar si puede usar `new Function` para ir más
   rápido, y la CSP de la web (sin `'unsafe-eval'`, a propósito) lo bloquea y el navegador lo reporta. Ahora zod va sin
   ese atajo en el navegador (`src/lib/participation/input.ts`; el servidor lo sigue usando). Buenas prácticas pasó a
   100 y la prueba «el formulario de punta a punta y la consulta no rompen la CSP de la web» lo vigila.
2. **En el teléfono, los archivos de la consulta se leían una palabra por renglón** (`93f887d`): el botón «Descargar»
   le quitaba el ancho al texto («3 KB · 17 de octubre de 2026 · sin revisión antivirus…»). Ahora el botón baja cuando
   no cabe al lado. Lo mismo en el punto del mapa del formulario, el aviso de la obra o noticia enlazada y los archivos
   del comprobante. Prueba: «en el teléfono, cada archivo de la consulta se lee entero».
3. **En la computadora, la ficha del caso estiraba «Lo que llegó»** (`93f887d`): la columna de la derecha es muy alta y
   la tarjeta de la izquierda quedaba con un gran espacio vacío adentro. Ahora cada tarjeta de la izquierda tiene su
   alto y el historial ocupa lo que sobra.
4. **En la computadora, prioridad, fecha comprometida y la búsqueda de casos iguales** quedaban apretadas en la columna
   angosta (la ayuda en cinco renglones, «Guardar fecha» partido en dos) (`93f887d`): ahí van una debajo de la otra.

## 9. Revisión de seguridad

La revisión del 06/11 (`docs/SEGURIDAD.md`, «Web pública y atención ciudadana: revisión del 06/11») atacó de verdad la
base rol por rol, a la persona sin cuenta y a la app (CSRF, XSS, redirecciones, SSRF, archivos, límites, cabeceras).
Encontró **seis problemas, tres medios y tres bajos, y los seis están arreglados**, cada uno con una prueba que falla
con el código anterior:
1. **Medio:** un archivo se guardaba antes de que la base dijera si se podía (escribir y borrar sin límite); un cuerpo
   sin tamaño se leía entero; una foto de pocos KB podía decir medir 50.000 × 50.000 píxeles.
2. **Medio:** el correo de quien usó la web quedaba en claro en el buzón de Administración, y el recibido decía
   «denuncia».
3. **Medio:** en la versión de prueba, cualquiera podía leer lo que otra persona mandó por el formulario (el buzón de
   prueba del ingreso), y el formulario no avisaba que no se pusieran datos reales.
4. **Bajo:** Auditoría podía ver por el registro de cambios lo que la base le esconde (archivos sin publicar y notas
   internas del sitio).
5. **Bajo:** el límite por red creía cualquier cabecera de IP.
6. **Bajo (defensa adicional):** las funciones del ciudadano dependían de que el esquema `citizen` nunca se expusiera
   en la API de Supabase; ahora se niegan si las llaman por ahí.

Se intentó y no se logró: abrir el caso, el mensaje o el archivo de otra persona con un comprobante propio; que un
responsable trabaje un caso de otra área; que Auditoría o el jefe lean denuncias o contactos; adivinar códigos; usar
la galleta de la consulta para otro caso; CSRF; XSS por texto, enlaces o datos estructurados; redirecciones abiertas.
Lo que queda con su riesgo (fotos de la biblioteca en el depósito público antes de publicarse, el límite por red grueso,
la CSP con `'unsafe-inline'`, la versión de prueba sin protección de acceso) está en esa misma sección. **Esta etapa no
repitió esa revisión**; sus pruebas corrieron otra vez dentro de `npm test` y de la corrida completa de punta a punta,
y `web-recorridos.spec.ts` agrega pruebas de punta a punta de ids cambiados (§3, recorrido 9).

## 10. En local, con datos que se quedan

_pendiente_

## 11. Lo que no se pudo comprobar

Todo lo de esta sección **no se probó**; lo que el informe dice de ello es lo que debería pasar, no lo que se vio.

- **Producción con Supabase.** Las migraciones de la web (`20261106000050` a `20261106400200`) no están aplicadas en
  `fb-dev`; no se probó que el usuario de `DATABASE_URL` pueda hacer `set role anon`, ni los depósitos de archivos de
  Supabase (público y privado) con sus enlaces firmados, ni el importador con `--apply` contra una base real. Las
  pruebas de RLS corren en PGlite (el mismo Postgres que usa la demo); en esta etapa no se repitieron contra un
  Postgres aparte.
- **Vercel.** Ni la versión de prueba ni la de producción: brotli y la red de distribución, el límite de 4,5 MB por
  pedido (los archivos de más de 4 MB necesitan subir directo al almacenamiento, no está hecho), las cabeceras de IP
  que pone Vercel, la tarea diaria (cron) que publica lo programado y manda los avisos.
- **`docker-compose.yml`** (Postgres para RLS y ClamAV): no hay Docker en este contenedor; nunca se corrió.
- **El revisor de archivos (ClamAV).** Sin `ATTACHMENT_SCANNER=clamav` todo archivo queda «sin analizar»; en la demo
  se puede bajar con un aviso, en producción no se baja hasta que el revisor lo apruebe. Nunca se probó con un ClamAV
  de verdad ni con un archivo infectado de prueba.
- **Turnstile** (la comprobación de Cloudflare contra robots): sin claves está apagado; quedan el campo trampa y los
  límites por dispositivo y por red. No se probó con claves.
- **Los correos.** Todo va al buzón de salida (`EMAIL_MODE=outbox`); ningún correo salió. No se probó Resend ni que un
  aviso de estado llegue a una bandeja real.
- **Volumen real.** La demo tiene 60 solicitudes y unas 70 piezas de contenido. La web vieja tiene 5.372 artículos,
  unas 15.400 fotos y daría unas 25.000 redirecciones: no se midió la web ni la bandeja con eso, ni con muchas personas
  a la vez (no hubo prueba de carga).
- **Fotos reales.** La demo no tiene fotos (D-95: nada inventado ni ajeno): no se midió el peso ni el tiempo de carga
  con fotos, ni cómo se ven las páginas con ellas.
- **Teléfonos y navegadores reales.** Solo Chromium simulando un teléfono; no Safari en un iPhone, ni Firefox, ni
  Android de gama baja, ni una red lenta de verdad (solo simulada en Lighthouse).
- **Lectores de pantalla.** axe y Lighthouse revisan lo que se puede revisar con un programa; nadie navegó con
  TalkBack, VoiceOver o NVDA.
- **Buscadores.** Con `SITE_INDEXABLE=true` (sitemap, Search Console, cómo sale el gobernador en Google): no se probó;
  la web de prueba no se deja indexar.
- **Mapas en producción.** Los mosaicos de OpenStreetMap no cargan en este contenedor; con tráfico real hace falta un
  proveedor de mosaicos (su política de uso).
- **Una observación sin causa encontrada:** una vez, justo después de abrir una consulta, axe vio la página sin su
  título (`<title>`); en 22 corridas de prueba hechas para buscarlo no volvió a pasar. La prueba nueva espera el título
  (hasta 5 s) antes de revisar con axe; si una página de verdad no tuviera título, igual fallaría.

## 12. Cómo repetir estas pruebas

```bash
cd app-freddy-bernal
npm test                       # unidad + RLS
npm run lint && npm run typecheck
npm run build
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e        # todo, de punta a punta (en el contenedor de Claude)
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test tests/e2e/web-recorridos.spec.ts   # solo los recorridos
```

Fuera de un contenedor, `npm run test:e2e` usa el Chromium que instala Playwright (`npx playwright install chromium`).

Lighthouse (no está en el repositorio): con la app armada y corriendo (`npm start`),
`npx lighthouse http://localhost:3000/ --only-categories=performance,accessibility,best-practices,seo` usa la
configuración de teléfono por defecto. En este contenedor se instaló aparte (Lighthouse 13.5.0) y se le pasó el Chromium
con `CHROME_PATH`.
