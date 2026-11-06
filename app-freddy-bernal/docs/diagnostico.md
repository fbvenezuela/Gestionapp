# Diagnóstico de la web actual (etapa 0 de la web nueva)

Revisado el **06/11/2026**, solo leyendo: freddybernaloficial.com (páginas y su API pública de WordPress,
`/wp-json/wp/v2/…`), el **Diagnóstico Digital 360** (sitio público, `contenido.json`, módulos 1, 4, 7 y 9; corte del 3 al
5/09/2026) y `docs/DIAGNOSTICO-360.md`. Medido con curl y con Playwright + Chromium + axe en un teléfono de 360 px. La
red del contenedor sí abrió la web. **Aquí no se copia contenido de la web vieja**: ni textos, ni fotos, ni correos, ni
teléfonos. La lista completa de direcciones quedó en un archivo de trabajo fuera del repositorio, para el importador.

## 1. Qué es la web hoy

| Qué | Cuánto |
|---|---|
| Sistema | WordPress con un tema de plantilla («freddyb», basado en Benqu) + Elementor 4.3.6 + Yoast SEO + LiteSpeed Cache, sobre Apache |
| Artículos | **5.367**, del 14/07/2014 al 05/11/2026. En 2026 van 758: unos 3 al día (agosto 103, septiembre 90, octubre 99) |
| Páginas | **1 sola** («Inicio», armada con Elementor). Todo lo demás son artículos |
| Categorías | 11: Táchira 2.749 · Internacionales 645 · Noticias 611 · Seguridad 446 · Salud 407 · Deportes 377 · Opinión 253 · Nacionales 163 · Biografía 1 · Informativo 1 · Sin categoría 0 |
| Etiquetas | **13.223**; solo 3.799 tienen algún artículo y 2.360 se usaron una sola vez |
| Archivos subidos | **15.471** según la API. De los 15.469 listados: 15.179 JPG, 133 WebP, 105 PNG, 23 AVIF, 4 GIF, 17 PDF, 6 páginas HTML guardadas, 1 .docx y 1 .zip |
| Portada en el teléfono | **1,9 MB** y 77 archivos antes de bajar; **unos 3 MB** y 92 archivos al recorrerla (fotos 2 MB, letras 0,5 MB, estilos 0,2 MB, programas 0,2 MB) |

- **Menú:** Inicio · Nacionales · Táchira · Noticias · Internacionales · Salud · Seguridad · Deportes · Opinión. **Pie:**
  las mismas categorías, cuatro íconos de redes y «Copyright 2025».
- **No tiene:** página del gobernador (la única biografía es un artículo de 2014 que nunca se actualizó), gestión u
  obras, sección de Reporte Bernal, archivo del Semanario, transparencia, contacto, formularios, WhatsApp ni enlace a
  tachira.gob.ve.
- **Es un portal de noticias:** la portada mezcla notas del Táchira con nacionales e internacionales (tiene un bloque
  fijo «Internacionales»), y solo 1.008 de los 5.367 títulos (19 %) nombran a Bernal, al gobernador o a la gobernación.
- **Lo que está bien** (no perderlo): certificado https válido; `www` → sin `www` con 301; la portada por http pasa a
  https con 301; canónicas y sitemaps en https; el sitemap de Yoast trae los 5.367 artículos; viewport correcto y sin
  desplazamiento lateral a 360 px; menú lateral con botones grandes; `lang="es"`; el acceso de administración escondido
  (`/wp-admin/` → 404), `xmlrpc.php` y la lista de usuarios de la API cerrados; se publica a diario.

## 2. Problemas encontrados (con la prueba)

| # | Problema | Prueba: dirección y lo que se vio |
|---|---|---|
| 1 | **Sirve por http y por https** | `http://freddybernaloficial.com/2026/11/impulsan-el-deporte-escolar-con-la-fvf-en-cardenas/` responde 200 por http, sin redirigir; igual `/categoria/tachira/`, las fotos de `/wp-content/uploads/…`, `robots.txt` y la API. Solo la portada y `www` redirigen. Sin HSTS. 786 artículos enlazan o insertan fotos del propio sitio con `http://` |
| 2 | **Enlaza el canal de YouTube abandonado** | Cabecera y pie llevan a `youtube.com/@FreddyBernalOficial`: 135 videos (los mismos que en septiembre), el último hace unos 9 meses. El programa sale en `@FreddyBernal.oficial`: 188 videos, «Reporte Bernal 261» hace 5 días. 208 artículos nombran «Reporte Bernal» y ninguno enlaza el episodio |
| 3 | **Cuentas incompletas** | Cabecera y pie: Facebook, Instagram, X y el YouTube viejo. Faltan los dos TikTok, Threads, el YouTube activo y WhatsApp. El banner muestra TikTok e Instagram escritos dentro de la imagen, sin enlace. Los íconos no tienen nombre para lectores de pantalla |
| 4 | **Google no sabe quién es** | Datos estructurados de Yoast: WebPage, WebSite, BreadcrumbList y Article. **Ningún `Person` del gobernador ni `GovernmentOrganization`**: el único `Person` es la cuenta de quien sube la nota, con `sameAs` en `http://`. Todos los títulos terminan en «- Freddy Bernal Freddy Bernal - Gobernador del estado Táchira» (el nombre repetido). La descripción para compartir de la portada es un pegote de titulares. `og:locale` es `es_ES`. Artículos viejos sin descripción: 0 de 100 en una muestra de 2017; 100 de 100 en muestras de 2022–2023 y de 2026 |
| 5 | **robots.txt y sitemaps se contradicen** | `robots.txt` no dice dónde está el sitemap; bloquea `/category/` (las categorías están en `/categoria/`, así que no aplica) y `/tag/`, pero `sitemap_index.xml` le manda a Google 3.799 páginas de `/tag/`. Conviven el sitemap de Yoast y un `/sitemap.xml` viejo con 8 direcciones (20/02/2026). No hay etiqueta de Search Console en la página |
| 6 | **El Semanario vive en Google Drive** | El bloque «Semanario» de la portada es una foto (sin texto alternativo) que lleva a **un solo PDF en Google Drive**, con un nombre de archivo de puros números. No hay números anteriores; solo 1 artículo nombra el Semanario |
| 7 | **El pie dice «Copyright 2025»** | En todas las páginas, el 06/11/2026 |
| 8 | **Correos dentro de artículos** | En la plantilla no aparece ningún correo. Dentro del texto de **18 artículos** (2017–2026) hay direcciones Gmail —15 distintas, en 12 de ellos hacia el final— puestas como contacto de concursos, programas o instituciones; no se puede saber cuáles son personales (`/wp-json/wp/v2/posts?search=gmail.com` → 18). Algunos artículos traen también teléfonos. No se escriben aquí: la lista está en el inventario de trabajo |
| 9 | **Identidad distinta de la marca** | Azul marino, azul y amarillo de una plantilla con Bootstrap: cuatro azules en la hoja de estilos (`#1d2027`, `#3b60fe`, `#1a609f` y el gris `#434343`), letras Encode Sans Condensed y DM Sans. La marca decidida es **oliva `#7F8630` principal, con Montserrat y sin azul** (D-21, `docs/DISENO.md`) |
| 10 | **Nadie atiende** | No hay formulario, contacto, WhatsApp ni comentarios. La única caja de texto es la de buscar |
| 11 | **Pesada para una conexión mala** | Sin fotos, la portada pesa **unos 950 KB** (la meta es menos de 200 KB). En la primera visita la página **se carga dos veces** (el «modo invitado» de LiteSpeed). Estilos repetidos (un CSS combinado de 655 KB sin comprimir más los originales), dos librerías de carrusel, jQuery, tres letras de íconos de Font Awesome (420 KB), Google Fonts con todos los pesos, un banner de 427 KB y miniaturas de 768 px mostradas a 140 px. Un artículo: 2,3 MB; una categoría: 2,4 MB; la portada en computadora: 4,5 MB |
| 12 | **Accesibilidad** | axe en la portada a 360 px: **70 enlaces sin nombre** (íconos de redes, el del menú y fotos que llevan a notas), **7 botones sin nombre** (los dos de buscar y los del carrusel), 5 textos con poco contraste (fechas `#818181` sobre blanco: 3,9 a 1), sin región principal (`<main>`), títulos que saltan niveles y tres `h1`. La categoría no tiene `h1` y sus resúmenes no llegan al contraste (4,1 a 1). Los buscadores no tienen etiqueta (solo el texto de ejemplo) y no hay «saltar al contenido». **52 de 53 fotos de la portada sin texto alternativo; en la biblioteca, 15.442 de 15.444** |
| 13 | **En el teléfono** | Sin desplazamiento lateral, pero **el menú no abre al primer toque**: los programas de la página esperan a que uno toque la pantalla, ese toque solo los carga y el menú abre al segundo. La primera pantalla es la fecha, cuatro íconos de 21–30 × 28 px (lo cómodo es 44 px), el banner y el buscador; letra de 15 px; 14 cosas tocables pequeñas en las tres primeras pantallas |
| 14 | **Contenido desordenado** | Etiquetas repetidas («tachira» y «tachira-2»); 15 artículos con dirección de puro número (por ejemplo `/2019/09/3911/`); texto pegado de correos y de Word en algunos artículos (clases `MsoBodyText`, `gmail_quote`); la biografía es `/2014/07/biografia/`, de 2014 |
| 15 | **Archivos sueltos** | En `/wp-content/uploads/` hay 6 páginas HTML guardadas, un .zip y un .docx. Unas 5.600 fotos se llaman «WhatsApp-Image…» y 3.600 «photo_…» (exportación de Telegram): llegan por mensajería y se suben tal cual |
| 16 | **Sin cabeceras de seguridad** | Las respuestas https no traen HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy` ni `Permissions-Policy` |

## 3. El Diagnóstico Digital 360 frente a lo que se ve hoy

El diagnóstico se hizo del 3 al 5/09/2026. Cada hallazgo que toca la web se revisó otra vez el 06/11:

| Módulo | Hallazgo del diagnóstico | Hoy (06/11/2026) | Estado |
|---|---|---|---|
| M01 | El sitio enlaza 4 de 8 cuentas; faltan los dos TikTok, Threads, WhatsApp y tachira.gob.ve | 4 enlaces (Facebook, Instagram, X, YouTube viejo); nada de lo que faltaba | **vigente** |
| M01 | Se sirve por http en unas rutas y por https en otras | artículos, categorías, fotos y API responden por http sin redirigir | **vigente** |
| M01 | El Semanario se reparte desde Google Drive | sí, un PDF en Drive desde la portada | **vigente** |
| M01 | El pie dice «Copyright 2025» | sí | **vigente** |
| M01 | Los dos blogs viejos de WordPress siguen en línea, abandonados | `freddybernalrosales.wordpress.com` sí (última entrada del 08/06/2016) | **vigente** |
| M01 | (ídem) | `bernalfreddy.wordpress.com`: WordPress.com dice que ese blog no existe | **ya no** |
| M01 | Los blogs viejos muestran un Gmail personal al pie de los artículos | en `freddybernalrosales` sí, en una firma. En freddybernaloficial.com no hay correo en la plantilla (sí en el texto de 18 artículos, problema 8) | **vigente** en el blog viejo |
| M01 | Mastodon abandonado desde junio de 2020 | última publicación el 11/06/2020 (API pública de Mastodon) | **vigente** |
| M01 | No hay canal de atención ciudadana | la web no tiene ninguno | **vigente** |
| M01 | La gente escribe pidiendo ayuda en una cuenta falsa de Instagram | Instagram no se puede revisar sin sesión | **no se pudo comprobar** |
| M01 | El sitio es un portal de noticias, sin datos ni indicadores | sí | **vigente** |
| M04 | La web enlaza el canal inactivo y no el activo | sí: el viejo sigue con 135 videos (el último hace unos 9 meses; el diagnóstico lo ponía en octubre de 2025); el activo pasó de 145 a 188 | **vigente** |
| M07 | En Google manda un futbolista homónimo y la web no sale | no se buscó en Google desde aquí | **no se pudo comprobar** |
| M07 | El panel de Google tiene otro inventario de cuentas (incluye TikTok) | ídem | **no se pudo comprobar** |
| M07 | Falta `schema.org/Person` | no hay `Person` del gobernador ni `GovernmentOrganization` | **vigente** |
| M07, M09 | Fotos sin texto alternativo (11 de 12) | 52 de 53 en la portada; 15.442 de 15.444 en la biblioteca | **vigente** |
| M09 | Cuatro azules sin escala | los cuatro siguen en la hoja de estilos | **vigente** |
| M09 | Encode Sans Condensed + DM Sans, cuerpo a 15 px | sí, 15 px | **vigente** |
| M09 | Fotos con nombre de Telegram y tamaños dispares | unas 3.600 «photo_…» y 5.600 «WhatsApp-Image…» | **vigente** |
| M09 | El logotipo solo se usa en el banner del sitio | sigue solo dentro del banner (es una imagen) | **vigente** |
| M09 | El contraste cumple en todo lo revisado | lo que ellos revisaron cumple, pero las fechas (3,9 a 1) y los resúmenes (4,1 a 1) no | **ya no** |

- El M07 dejó sin revisar Search Console, `robots.txt`, el sitemap y los títulos: aquí sí se revisaron (problemas 4 y 5).
- El resto de esos módulos es de las redes (biografías, insignias, fotos de perfil, miniaturas, listas y capítulos de
  YouTube): la web no lo cambia y no se revisó aquí (**no se pudo comprobar**). Las cifras de seguidores y vistas son de
  septiembre y no se usan como dato.
- Los colores tienen dos versiones: el ADN de comunicación del paquete (`docs/DIAGNOSTICO-360.md`) fija oliva y naranja
  sin azul; el M09 describe la marca del sitio como azul y amarillo. Manda lo que decidió Juan: **oliva** (D-21).

## 4. Qué corrige la web nueva

| Problema | Lo que hace la web nueva |
|---|---|
| 1. http y https | Todo por https con HSTS. Cada dirección vieja pasa por la tabla de redirecciones 301 (`web_redirects`, la llena el importador); canónicas en https |
| 2. YouTube | `/reporte-bernal`: episodios con fecha, temas y enlaces; el video carga solo al tocarlo (`youtube-nocookie.com`); el canal sale de los ajustes del sitio |
| 3. Cuentas | Una sola lista de cuentas en los ajustes del sitio (`web_settings`): la misma en el pie, en `/canales` y en los datos estructurados (`sameAs`). En producción solo las verificadas; en la demo, las «por confirmar» marcadas |
| 4 y 5. Google, robots, sitemaps | `Person` y `GovernmentOrganization` en JSON-LD y `NewsArticle` en las noticias; título y descripción únicos y editables; vista para compartir con imagen; `sitemap.ts` solo con lo publicado; `robots.ts`; Search Console en el plan de migración. Mientras sea versión de prueba, no se indexa (D-95) |
| 6. Semanario | `/actualidad/semanario` y `/transparencia`: cada número es un documento con fecha y versión, en el propio dominio |
| 7. Año del pie | Sale solo |
| 8. Correos | Nunca un correo personal: el contacto es por los formularios de `/atencion`. El importador quita los correos del texto y señala los teléfonos para que el equipo decida; todo sale en el reporte de `--dry-run` |
| 9. Identidad | Oliva y naranja de la marca (tokens), Montserrat, letra grande y aire; el nombre en letras, sin logo inventado, hasta que llegue el vector y el manual |
| 10. Nadie atiende | `/atencion/nueva` sin cuenta (reporte, petición, acotación, sugerencia, reconocimiento y denuncia), código y clave para seguir el caso en `/atencion/consultar`, y la bandeja `/admin/atencion`: todo queda asignado, con plazo, avisos y «lo atendido» |
| 11. Peso | Páginas hechas en el servidor y casi sin JavaScript; fotos AVIF/WebP del tamaño justo y diferidas; sin carruseles; letras propias. Se mide y se reporta lo medido (meta: menos de 200 KB sin fotos en la portada) |
| 12 y 13. Accesibilidad y teléfono | Texto alternativo obligatorio en la base, etiqueta en cada campo, región principal, títulos en orden, foco visible, contraste AA desde los tokens, botones de 44 px, pensada desde 360 px; axe en las pruebas de punta a punta |
| 14. Orden | Secciones claras: el gobernador, gestión (obras con filtros y línea de tiempo), actualidad, Reporte Bernal, atención, transparencia y canales; categorías cortas en vez de 13 mil etiquetas |
| 15. Archivos | Biblioteca de medios con compresión al subir, texto alternativo y punto de enfoque; el importador solo trae imágenes y PDF |
| 16. Cabeceras | CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy` en la web pública |

## 5. Lo que vale la pena conservar

- **Los 5.367 artículos**, con fecha, título, categoría y foto destacada (160 no tienen). Desde 2020 son 4.720 (88 %).
- **La biografía** (`/2014/07/biografia/`), solo como punto de partida para escribir una nueva; no se copia.
- **La biblioteca:** 15.444 imágenes y 17 PDF (boletines y revistas de 2019–2022, un decreto y un comunicado). Los
  originales pesarían unos 2–3 GB (estimado con 300 fotos recientes: mediana 157 KB): no caben en el plan gratis de
  Supabase (1 GB), sí en Pro (100 GB). Se traen solo las que usen los artículos importados.
- **Direcciones viejas** (patrones; el destino exacto lo fija el plan de migración):

| Dirección vieja | Cuántas | Destino propuesto (301) |
|---|---|---|
| `/AAAA/MM/<slug>/` | 5.367 | `/actualidad/<slug>`; las 15 de puro número reciben un slug nuevo del título |
| `/categoria/<slug>/` (y `/page/N/`) | 11 | `/actualidad` filtrada por esa categoría |
| `/tag/<slug>/` | 3.799 con artículos | `/actualidad` con esa búsqueda |
| `/AAAA/MM/` (archivo del mes) | — | `/actualidad` filtrada por ese mes |
| `/page/N/` y `/?s=…` | — | `/actualidad` (con la búsqueda) |
| `/?p=<id>` | — | el artículo nuevo, con el id de WordPress que guarda el importador |
| `/2014/07/biografia/` | 1 | `/gobernador` |
| `/feed/` | hoy apagado (301 a la portada) | `/actualidad` |
| `/wp-content/uploads/AAAA/MM/<archivo>` | 15.469 | las importadas, a su dirección nueva; el resto, a decidir en el plan |
| `www.freddybernaloficial.com/*` | — | sin `www`, como hoy |

- La lista completa (cada artículo con fecha, título y dirección; los 18 con correos; los 786 con enlaces `http://`)
  quedó fuera del repositorio. El importador la vuelve a sacar de la API cuando corra.

## 6. Decisiones técnicas (D-90 a D-96), en simple

- **D-90. Misma app, sin Payload.** La web, su administrador y la atención viven en esta app (Next.js + Supabase).
  Payload traería otro inicio de sesión, otro panel y otra capa de datos que se salta la RLS, y nadie probó que funcione
  con Next 16.4 y React 19.3. Lo que da un CMS (bloques, versiones, aprobación, programar, biblioteca) se hace aquí,
  sobre Postgres con RLS.
- **D-91. Direcciones.** `/` pasa a ser la portada pública (hoy manda al equipo a su inicio). El equipo entra por
  `/panel`, y la app instalada abre ahí. El administrador está en `/admin/web` (contenido) y `/admin/atencion`
  (solicitudes), con la misma sesión y el mismo doble factor del panel. `/acerca`, `/privacidad` y `/condiciones`
  siguen siendo de la plataforma interna (registradas en Google para Drive); las legales de la web son
  `/aviso-de-privacidad`, `/condiciones-de-participacion` y `/accesibilidad`.
- **D-92. Seis tipos de solicitud:** reporte (un problema en la ciudad), petición, acotación, sugerencia,
  reconocimiento y denuncia. La denuncia es privada de punta a punta: solo la leen el operador de denuncias y el
  coordinador, y se le dice a la persona que acuda también a las autoridades. No es un servicio de emergencias (lo
  dice cada formulario). No hay muro público.
- **D-93. Roles** (todos con doble factor y todo en la auditoría):

| Rol | Puede |
|---|---|
| Superadministrador (`admin`) | ajustes, usuarios, áreas, catálogos y ajustes del sitio; por defecto no lee los casos; nunca publica contenido |
| Editor de la web (`writer`) | crear y editar contenido y fotos, y mandarlo a aprobación; no publica ni ve casos |
| Aprobador de la web (`web_publisher`) | revisar, publicar, programar, archivar y volver a una versión (el jefe también) |
| Coordinador de atención (`attention_coordinator`) | todas las solicitudes, denuncias incluidas: asignar, unir, plazos, cifras, CSV y publicar «lo atendido» |
| Responsable de área (`reports_operator`) | las solicitudes de su área o suyas (nunca denuncias): responder, notas, estados, evidencias |
| Operador de denuncias (`complaints_operator`) | solo denuncias |
| Consulta y auditoría (`auditor`) | ver solicitudes sin datos de contacto y el registro de auditoría |

El jefe también puede publicar en la web y ver las cifras; los roles que ya existen siguen igual.

- **D-94. Correr en local sin Docker:** con `LOCAL_DATA_DIR=./.data` la base de demostración (PGlite) y los archivos
  se guardan en disco y se siembran solo la primera vez. Producción: Supabase (base, usuarios y archivos). Hay un
  `docker-compose.yml` para servicios de apoyo (Postgres 17, Mailpit, MinIO, ClamAV), anotado como «no se corrió aquí»
  si no hay Docker. Lo que no tiene clave queda apagado y anotado en `.env.example` y `docs/PENDIENTES.md`.
- **D-95. La demo se nota:** lo inventado solo sale de `seed-demo` y lleva «(demo)» en el título; la web muestra
  «Versión de prueba: el contenido es inventado»; no se indexa (robots, meta y cabecera) salvo `SITE_INDEXABLE=true`,
  que es decisión de Juan. Nada de biografía, fotos, teléfonos, correos, horarios, cuentas o parroquias inventadas:
  espacios «por completar» que se llenan desde el administrador.
- **D-96. El público también pasa por la RLS:** lo que ve un visitante se lee con el rol `anon`, que solo ve lo
  publicado y nunca un borrador. Las solicitudes no se leen directo: se mandan y se consultan con funciones de la base
  que revisan todo y devuelven solo un resumen seguro.

## 7. Supuestos

- La web nueva reemplazará a freddybernaloficial.com en el mismo dominio cuando Juan lo decida (dominio y DNS: Ing.
  Pedro Poller). Hasta entonces vive en la versión de prueba, sin indexar.
- Lo importado entra **como borrador**; nada se publica solo. Se importan todas las categorías (también Nacionales e
  Internacionales) y el equipo decide qué publicar.
- Las cuentas de la sección 8 son «por confirmar»: en producción solo salen las que confirme el equipo.
- Los pesos medidos son confiables; los tiempos no: se midió desde fuera de Venezuela, por un proxy y sin limitar la
  red. No había Lighthouse en el contenedor: se usó Playwright + Chromium + axe.
- Las 66 parroquias siguen pendientes (`config/clients/fb.json`): mientras falten, la parroquia se escribe a mano.
- No se pudo comprobar desde aquí: los resultados y el panel de Google, Search Console (puede estar verificado por
  DNS), Instagram, TikTok y Threads (sus páginas solo cargan con JavaScript o sesión) y el tipo de cuenta de Facebook.

## 8. Cuentas y canales por confirmar

El equipo marca cuáles son oficiales y cuáles se dejan de enlazar. Solo redes y nombres de cuenta.

| Red | Cuenta | Dónde se vio | Nota |
|---|---|---|---|
| Facebook | perfil `Freddy-Alirio-Bernal-Rosales-100079248706206` | cabecera y pie de la web; banner («Freddy Bernal Rosales»); M01 | el diagnóstico dice que es perfil personal, no página |
| Instagram | @freddybernalven | cabecera y pie; banner (@FreddyBernalVen); M01 | |
| X | @FreddyBernal | cabecera y pie; M01 | |
| YouTube | @FreddyBernalOficial | cabecera y pie; banner («Freddy Bernal Oficial»); M01 y M04 | sin videos nuevos hace unos 9 meses |
| YouTube | @FreddyBernal.oficial | M04; YouTube el 06/11 | donde sale Reporte Bernal hoy; la web no lo enlaza |
| TikTok | @freddybernalr | banner (texto dentro de la imagen); M01 | no se pudo abrir desde aquí |
| TikTok | @freddybernalvzla | M01 | cuenta secundaria según el diagnóstico |
| Threads | @freddybernalven | M01 | no se pudo abrir desde aquí |
| Mastodon | @FreddyBernal (servidor mastodon.social) | M01; API de Mastodon el 06/11 | sin publicar desde el 11/06/2020 |
| Blog | freddybernalrosales.wordpress.com | M01; enlace dentro de un artículo de 2014 | abandonado desde 2016 |
| Blog | bernalfreddy.wordpress.com | M01 | ya no existe |
| Portal institucional | tachira.gob.ve | M01 y M07 | la web no lo enlaza |
| WhatsApp | — | no se encontró | el equipo dirá si hay un canal |

No se listan aquí, a propósito, la cuenta de Instagram que suplanta al gobernador ni las cuentas de otras personas que
se llaman igual: están en el diagnóstico (M01, punto 2) y la web nunca las enlaza.
