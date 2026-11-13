# Informe de pruebas — web pública y atención ciudadana (06/11/2026)

Lo que se probó de la web nueva del gobernador (`/`), la participación ciudadana (`/atencion`), el administrador de la
web (`/admin/web`) y el de la atención (`/admin/atencion`), cómo se probó, los números que salieron y **lo que no se
pudo comprobar**. Todo en modo demostración: datos inventados, base en memoria, nada sale a personas reales.

## En corto

- **Pasa todo:** las pruebas de unidad y de RLS (2.859), el lint, el chequeo de tipos, el armado y **las 311 pruebas
  de punta a punta** (6 omitidas, las de Google Drive simulado; 0 fallan).
- **Los diez recorridos** del encargo largo y los del encargo del 6/11 tienen cada uno su prueba de punta a punta que
  los recorre de verdad en el navegador (tabla en §3). Se agregó `tests/e2e/web-recorridos.spec.ts` para los que
  estaban cubiertos solo en parte.
- **Lighthouse en el teléfono** (medido aquí, no en Vercel): rendimiento 94–97, accesibilidad 100, buenas prácticas
  100 y SEO 66 en las cuatro páginas medidas. El SEO baja **a propósito**: la versión de prueba les pide a los
  buscadores que no la muestren (D-95); sin esa única regla, el SEO da 100.
- **Peso de la portada:** 219 KB con gzip (lo que sirve `next start`) y unos 204 KB con brotli (estimado, como sirve
  Vercel). **La meta del encargo, menos de 200 KB sin fotos, no se cumple por poco** (§5).
- **axe:** 0 problemas de accesibilidad, de ningún nivel, en 68 pantallas (las públicas y las del administrador, a 360
  px y en computadora).
- **Modo local:** con `LOCAL_DATA_DIR=./.data`, una solicitud con foto y una nota del equipo siguen ahí después de
  apagar y prender el servidor (§10).
- **Se arreglaron cinco cosas** que salieron al medir y al mirar las capturas (§8).
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
| `npm test` (unidad + RLS) | **209 archivos: 2.859 pasan, 3 omitidas** (las mismas de antes), en 315 s, sobre el código final |
| `npm run lint` | sin errores ni avisos |
| `npm run typecheck` | sin errores |
| `npm run build` | arma sin errores (también con `LOCAL_DATA_DIR=./.data`, §10) |
| De punta a punta completo (`npm run test:e2e`) | **317 pruebas: 311 pasan, 6 omitidas, 0 fallan**, en 23,4 min. Las 6 omitidas son las de Google Drive simulado, que solo corren con `STORAGE_PROVIDER=drive` y `DRIVE_FAKE=1` (no son de la web) |
| Después del último arreglo (§8.5) | se repitieron `admin-atencion`, `web-recorridos` y `web-roles`: 40 pasan |

De la web y la atención hay 7 archivos de RLS (`web-cms`, `web-cms-admin`, `web-ciudadano`, `web-atencion`,
`web-atencion-admin`, `web-import`, `seguridad-web`) y 37 de unidad (`web-*`, `participation-*`, `attention-*`,
`seguridad-*` y dos de `storage-*`); de punta a punta, 91 pruebas en `web-publica` (21), `participacion` (18),
`admin-web` (8), `admin-atencion` (8), `web-roles` (7), `seguridad-web` (4) y `web-recorridos` (25).

## 3. Los recorridos y su prueba

Cada recorrido se hace en el navegador como lo haría la persona: con sus botones y sus campos, sin atajos por dentro.
«Teléfono» es a 360 px; «computadora», a 1280 px. Los archivos están en `tests/e2e/`.

| # | Recorrido | Prueba (archivo › prueba) | Dónde | Resultado |
|---|---|---|---|---|
| 1 | El editor crea una noticia, la mira en vista previa y quien aprueba la publica | `admin-web` › «el editor crea una noticia con su foto…» y «quien aprueba la publica y aparece en /actualidad…»; `web-recorridos` › «una noticia en la computadora…» (2 pruebas: además, antes de aprobarla no está en la web, y al archivarla sale) | teléfono y computadora | pasa |
| 2 | Se cambia y se reordena una sección de la portada y se publica | `admin-web` › «el editor cambia y reordena bloques de la portada; quien aprueba lo publica y la portada lo muestra» y «volver a una versión…» | teléfono | pasa |
| 3 | Una persona manda una solicitud con un archivo | `participacion` › «un reporte con una foto…» (teléfono) y «…de punta a punta, en la computadora»; `web-recorridos` › «1) una persona manda una petición con un PDF…» | teléfono y computadora | pasa |
| 4 | La coordinación la recibe y la asigna | `admin-atencion` › «la coordinación recibe una solicitud enviada desde el formulario público y la asigna»; `web-recorridos` › «2) la coordinación la recibe por su código, ve el contacto, la asigna… y le sube la prioridad» | teléfono y computadora | pasa |
| 5 | El responsable responde y cambia el estado | `admin-atencion` › «el responsable del área responde, deja una nota interna y cambia el estado»; `web-recorridos` › «3) el responsable pide más información…» y «4) …le contesta, la atiende y la resuelve…» | teléfono y computadora | pasa |
| 6 | La persona consulta y agrega información | `admin-atencion` › «la persona consulta: ve la respuesta (nunca la nota interna) y agrega información»; `participacion` › «un reporte con una foto…»; `web-recorridos` › «3) …la persona la ve en su consulta y responde con una foto» (texto **y** archivo) | teléfono y computadora | pasa |
| 7 | El equipo resuelve y la historia queda | `admin-atencion` › «el equipo lo resuelve con evidencia, la persona lo ve y la historia completa queda»; `web-recorridos` › «5) la persona confirma que se resolvió; la coordinación la cierra y la historia completa queda, también para la persona» (cada paso, en orden) | teléfono y computadora | pasa |
| 8 | Alguien sin permiso no abre el caso, sus archivos, sus notas internas ni la exportación | `admin-atencion` › «un responsable de otra área, el editor de la web y alguien de fuera no abren el caso, sus archivos ni la exportación» y «auditoría lo lee sin el contacto…»; `admin-web` › «quien no es de la web no entra…»; `web-recorridos` › «6) un id cambiado no revela nada…» y «…el responsable de servicios ve solo los de su área y nunca una denuncia» | teléfono y computadora | pasa |
| 9 | Una clave mala o un id cambiado no revelan nada | `participacion` › «clave mala, código alterado o inventado: siempre la misma respuesta…»; `seguridad-web` › «los archivos: un comprobante malo recibe el «no encontrado» de siempre…»; `web-recorridos` › «6) un id cambiado no revela nada: otra consulta, la cookie alterada, un id inventado o un caso de otra área» | teléfono y computadora | pasa |
| 10 | Un envío repetido no crea otra solicitud | `participacion` › «un reintento (la respuesta se perdió) no crea otra solicitud: vuelve el mismo código»; `web-recorridos` › «con JavaScript: la respuesta se pierde… la coordinación ve una sola» y «sin JavaScript: el mismo formulario llega dos veces… la coordinación ve una sola» | teléfono | pasa |
| 6/11 | Un caso de cada tipo (reporte, petición, acotación, sugerencia, reconocimiento, denuncia) se sigue con su código | `web-recorridos` › 12 pruebas «teléfono: …» y «computadora: …» (comprobante, consulta con código y clave en minúsculas, solo lo suyo, la denuncia privada) y «la coordinación recibe los doce con su tipo…»; `participacion` › «una … llega y da su comprobante» | teléfono y computadora | pasa |
| 6/11 | Atenderlo en el panel hasta resolverlo | los recorridos 4 a 7 | teléfono y computadora | pasa |
| 6/11 | Editar un bloque de la portada, aprobarlo y verlo publicado | el recorrido 2 | teléfono | pasa |

Lo que agrega `web-recorridos.spec.ts` (25 pruebas) que antes faltaba: cada tipo **seguido con su código** (antes, solo
el reporte); agregar un **archivo** desde la consulta; el pedido de más información y su respuesta; la confirmación de
la persona y el cierre con la historia completa; abrir el archivo de **otra** persona con una consulta propia abierta,
con la galleta alterada o con ids inventados; contar que un envío repetido deja **una sola** solicitud (con y sin
JavaScript); la noticia en la computadora y su archivo; que el formulario no rompa su CSP; y que los archivos de la
consulta se lean en el teléfono.

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

- **En las pruebas de punta a punta**, axe revisa las pantallas principales de la web, del formulario, de la consulta y
  de los dos administradores, a 360 px y en computadora, y la prueba falla con cualquier problema grave o crítico (WCAG
  2.0 A y AA): pasaron todas.
- **Barrido completo** (aparte, con las reglas WCAG 2.0 y 2.1 A y AA más las «buenas prácticas» de axe, y contando
  también los problemas moderados y menores): 68 pantallas — las 19 páginas públicas y una consulta abierta, y 14 del
  administrador (editor, aprobador, coordinación, la ficha de un caso, auditoría), cada una a 360 px y a 1280 px.
  **Resultado: 0 problemas** (críticos 0, graves 0, moderados 0, menores 0). Para comprobar que el barrido sí encuentra
  problemas, se pasó igual por una página hecha mal a propósito: encontró 9.
- **Lighthouse:** accesibilidad 100 en las cuatro páginas medidas (§4).
- **Lo que esto no cubre:** un programa solo encuentra una parte de los problemas de accesibilidad. No se probó con un
  lector de pantalla de verdad ni con personas (§11). Lo que sí revisan otras pruebas: «Saltar al contenido» es lo
  primero con el teclado, el menú del teléfono abre y se cierra con el teclado, el foco va al resumen de errores y al
  comprobante, y nada se sale de la pantalla hacia los lados.

## 7. Capturas

Se tomaron capturas de página completa de las 19 páginas públicas, el formulario paso a paso (con errores y con el
comprobante), una consulta abierta, y 19 pantallas del administrador (editor, aprobador, coordinación, auditoría y
denuncias), a 360 px y a 1280 px, más 5 páginas públicas en modo oscuro: 97 capturas contando las de después de los
arreglos, guardadas **fuera del repositorio** (en la carpeta de trabajo de esta sesión). En cada una se buscó, además,
con un programa, cualquier elemento que se saliera de la pantalla hacia los lados: **ninguno**.

Al mirarlas se encontraron y arreglaron cuatro cosas (§8.2 a §8.5). Lo que quedó, a propósito o por menor:
- El botón para elegir archivo de la evidencia del equipo y los campos de fecha son los del navegador: en este Chromium
  (en inglés) dicen «Choose File» y «mm/dd/yyyy»; en un teléfono o una computadora en español salen en español.
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
5. **En la computadora, el código de cada solicitud en la bandeja se partía en tres** («AC-» / «2026-» / «RQ8FZM»)
   (`ff7c287`): ahora va en un renglón. Este arreglo llegó después de la corrida completa; se repitieron las pruebas de
   la bandeja (§2).

Además, solo en las pruebas: toda revisión de axe espera a que no quede ningún aviso y a que la página tenga su título
(`readyForAxe()` en `tests/e2e/helpers.ts`; §11).

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

Para trabajar en una computadora sin cuentas ni Docker, con los datos inventados de la demo y lo que uno haga encima
(D-94). Se comprobó así, en este contenedor:

```bash
cd app-freddy-bernal
npm install                                  # la primera vez
LOCAL_DATA_DIR=./.data npm run build
LOCAL_DATA_DIR=./.data npm start             # la web en http://localhost:3000
```

- **La web:** http://localhost:3000 · **el panel:** http://localhost:3000/panel · **entrar:** http://localhost:3000/entrar
  (la tarjeta «Versión de demostración»: un toque por rol, sin código ni doble factor; quién es quién en
  `docs/DEMO.md`).
- **Para que solo la abra esta computadora:** `LOCAL_DATA_DIR=./.data npm start -- -H 127.0.0.1` (si no, escucha en
  toda la red y cualquiera de la red puede entrar como cualquier rol).
- **Para parar:** Ctrl+C. **Para volver:** el mismo `npm start` (no hace falta armar otra vez si el código no cambió).
- **Para empezar de cero:** con la app parada, borrar la carpeta `.data`.
- **Acceso inicial seguro:** el modo local y la demo son **solo para probar** (cualquiera que llegue al servidor entra
  con cualquier rol, y la clave de contactos de la demo está en el repositorio): nunca datos reales. El primer
  administrador de verdad se crea solo en producción, con `npm run db:first-admin` (README, «Primer administrador»):
  sin contraseñas, con código por correo y doble factor.

**Lo que se comprobó (06/11, en este contenedor):**
1. `LOCAL_DATA_DIR=./.data npm run build` armó sin errores; `LOCAL_DATA_DIR=./.data npm start` quedó escuchando en
   http://localhost:3000.
2. La primera página que necesitó la base la armó en `.data/pglite` y la sembró **una vez** con los datos inventados
   (unos 5 s esa primera vez; la marca `.data/pglite.json` guarda la hora de la siembra).
3. Desde el formulario, a 360 px, se mandó un reporte **con una foto**; dio su código y su clave. La coordinación
   (entrando con un toque) lo encontró por su código y le dejó una nota interna.
4. Se apagó el servidor (se libera `.data/pglite.lock`) y se prendió otra vez, ahora con `-H 127.0.0.1`.
5. Con el código y la clave, la consulta abrió: «Recibida», con su título, y **la foto se bajó** (la guarda
   `.data/files/participacion-privado`). La coordinación vio el caso **con su nota interna**; la bandeja contaba lo
   mismo que antes de apagar (59 en la vista de siempre) y la hora de la siembra no cambió: **no volvió a sembrar ni
   perdió nada**.
6. Con `-H 127.0.0.1`, la dirección de la red del contenedor no respondió: solo la abre esta computadora.

Una observación: `npm run build` con `LOCAL_DATA_DIR` escribe en `.data/files` los 16 archivos de ejemplo de la demo (8
PDF y 8 fotos), los mismos (con los mismos nombres) que después usa la base local; la base no la toca. No hace daño. La
carpeta `.data` de esta prueba se borró al terminar.

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
- **El modo local en Windows o Mac.** Se probó en Linux (este contenedor), no en las computadoras del equipo.
- **Lectores de pantalla.** axe y Lighthouse revisan lo que se puede revisar con un programa; nadie navegó con
  TalkBack, VoiceOver o NVDA.
- **Buscadores.** Con `SITE_INDEXABLE=true` (sitemap, Search Console, cómo sale el gobernador en Google): no se probó;
  la web de prueba no se deja indexar.
- **Mapas en producción.** Los mosaicos de OpenStreetMap no cargan en este contenedor; con tráfico real hace falta un
  proveedor de mosaicos (su política de uso).
- **El título que llega después:** justo después de una acción que redibuja la página (abrir una consulta, agregar una
  redirección), axe vio la página sin su título (`<title>`): una vez aquí y dos veces en CI (runs 54 y 58, 07–09/11).
  Next pone el título con los metadatos de la página, en un límite propio que llega después del resto; aquí no se
  repitió en 48 corridas buscándolo (22 antes, 26 el 13/11, con la máquina cargada y la red frenada). Toda revisión de
  axe espera el título (hasta 5 s); si una página de verdad no tuviera título, igual fallaría.

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

## 13. Anexo (07/11/2026): el contenido real en la demo y los textos de la casa

Desde el 07/11 la versión de prueba publicada trae al construir el contenido real de la web oficial (D-101), y los
textos de la web y de la atención pasaron al registro de la casa: «usted» al ciudadano, nada de andamio para el
público y un solo texto por aviso legal. Lo que se probó, en este contenedor:

- **Unidad y RLS:** 220 archivos, 2.969 pruebas bien y 3 saltadas. Las del contenido real
  (`tests/unit/real-site-*.test.ts`) corren contra un sitio oficial, un canal de YouTube (sus listas y su API) y un Drive
  **inventados**: nada sale a la red. Cubren lo que entra y lo que queda fuera, los datos personales, las fotos, el
  Semanario, la copia anterior cuando algo no responde, los mismos ids en cada servidor, el orden en que se pide el
  Reporte Bernal y que la clave de YouTube nunca quede en una dirección, en el registro, en un error ni en lo escrito.
  Otra prueba cuida que la semilla inventada le hable de usted a la persona.
- **Una construcción real** (`NODE_USE_ENV_PROXY=1 REAL_SITE_CONTENT=1 npm run build`, solo GET): la lectura tardó
  26 s con la caché de una corrida anterior (13 peticiones; la primera vez, sin caché, 68 s y 109). Trajo 48 noticias,
  8 de opinión, 1 Semanario y 95 fotos (17,2 MB). Quedaron fuera 3 fotos AVIF y YouTube: desde aquí sus dos listas
  respondieron 404. Las ocho páginas revisadas (`/`, `/gobernador`, `/actualidad`, `/reporte-bernal`,
  `/actualidad/semanario`, `/canales`, `/atencion` y `/transparencia`), una foto y el PDF respondieron 200, con la
  franja «Versión de prueba en revisión. No es el sitio oficial.» y nada «(demo)» en la portada ni en `/atencion`.
- **Lo que viaja con cada función:** en los `.nft.json` de esa construcción, las 96 fotos y PDF de `.real-site/media`
  van solo con la ruta de la biblioteca (`/api/archivos/web/[key]`); ninguna con las de los archivos privados.
- **La construcción normal** (`npm run build`, apagado): borró `.real-site/`, armó las 95 páginas y la portada volvió a
  lo inventado.
- **De punta a punta**, sobre esa construcción normal (`E2E_PORT=3500 npx playwright test --trace off`): 317 bien, 6
  saltadas (las de Drive, que solo corren con `STORAGE_PROVIDER=drive DRIVE_FAKE=1`) y ninguna mal, en 18 minutos.
- **No se pudo comprobar:** el despliegue de producción en Vercel (que se encienda solo, que conserve `.next/cache`, si
  sus constructores llegan a YouTube); la API de YouTube con una clave real (no hay clave y no se pide); las emisiones
  reales del Reporte Bernal (YouTube no respondió desde aquí).
- Las capturas con contenido real existen solo fuera del repositorio.
