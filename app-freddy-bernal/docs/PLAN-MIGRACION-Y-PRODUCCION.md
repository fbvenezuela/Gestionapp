# Plan de migración de la web vieja y de salida a producción

**06/11/2026.** Para Juan, el equipo de la web y el Ing. Pedro Poller (dominio y DNS). Dice qué hace el importador de
freddybernaloficial.com, qué pasa con cada dirección vieja, en qué orden se sale a producción, qué revisar antes de
abrir y cómo volver atrás. Lo que no se pudo comprobar desde aquí está dicho como tal.

## 0. En corto

- **No se migró nada todavía.** El importador está listo y probado: con artículos inventados en las pruebas
  automáticas (contra la misma base que usa la app) y con una **prueba de solo lectura contra freddybernaloficial.com
  sobre 68 artículos reales** (los 10 más nuevos, los 18 que tienen correos Gmail y 40 repartidos entre 2015 y 2024).
  En esa prueba no se escribió nada, no se bajó ninguna foto a disco y nada de la web vieja quedó en el repositorio.
- Los artículos entran como **borradores**. Nada sale a la web sin que una persona lo revise y quien aprueba lo publique.
- Casi todas las fotos viejas **no tienen texto alternativo** (15.442 de 15.444 en la biblioteca vieja): entran con
  «[Por escribir]» y la base no deja publicarlas así. Escribirlos es el trabajo más grande de la migración.
- Para salir faltan las cuentas y los accesos de §4 (Supabase de producción, Vercel, el DNS de Pedro Poller, Turnstile,
  un revisor de archivos) y la consulta legal. La lista para marcar está en §5.

## 1. El importador (`npm run web:import`)

### Qué hace
1. **Lee la web vieja con cortesía:** solo la API pública de WordPress (`/wp-json/wp/v2/…`: artículos, categorías,
   etiquetas y fotos), **una petición a la vez**, con 1 segundo entre una y otra, un nombre propio
   (`FB-Operaciones-360-importador/1.0 …`) y esperando cuando la web dice que está ocupada. Nunca pide nada fuera de
   freddybernaloficial.com (ni siguiendo una redirección).
2. **Cada artículo es una noticia en borrador** con: título, fecha (la del Táchira), tipo y temas (§1.3), la firma
   cuando la web vieja la muestra en público, el texto, el video, la foto principal y la galería, la descripción para
   buscadores y su dirección. Nunca queda publicada.
3. **El texto se convierte, nunca se pega:** párrafos, subtítulos, listas, citas, negritas, cursivas y enlaces (los
   enlaces pasan por la misma regla de la web: solo https, http, mailto o direcciones de la web). Se quedan fuera
   scripts, estilos, formularios, marcos y reproductores de otras páginas. En detalle:
   - Un video de YouTube es el video de la nota (con el reproductor liviano de la web); si había más, quedan como
     enlaces «Ver el video en YouTube».
   - Una publicación de X, Instagram, TikTok o Facebook insertada queda como enlace; una tabla, como lista.
   - Los enlaces a la propia web vieja pasan a ser direcciones de la web nueva (las redirecciones los llevan a su
     lugar). También los 786 artículos que enlazaban con `http://`.
   - Un subtítulo que solo repetía el título al comienzo (muy común desde 2018) se quita.
4. **Datos personales fuera.** Correos, teléfonos (los de Venezuela, de todas las formas en que se escriben) y números
   de cédula salen del título, el texto, los pies de foto y los enlaces, y en su lugar queda «[correo retirado]»,
   «[teléfono retirado]» o «[cédula retirada]». La nota queda señalada, el editor dice qué falta y **la base no deja
   publicar** mientras quede una marca. Nunca se muestran en el reporte: solo se cuentan.
5. **Las fotos se traen, no se enlazan.** Van a la biblioteca de la web (balde `web-public`), revisadas igual que una
   foto que sube el equipo: tienen que ser JPG, PNG o WebP de verdad (por su contenido, no por el nombre), se les quitan
   los datos ocultos (ubicación GPS, cámara, fecha) sin tocar la imagen, y se trae el tamaño más grande que hizo
   WordPress hasta 2.048 px de lado (`--max-side` para otro). Si WordPress tenía texto alternativo o pie, se usa; si no,
   «[Por escribir] Foto traída de la web vieja: describe lo que se ve.». Una foto alojada en otra página no se trae.
   La misma foto en dos artículos es un solo archivo.
6. **Redirecciones 301** de las direcciones viejas a las nuevas (§3), marcadas «Del importador» en
   `/admin/web/redirecciones`. Una redirección hecha a mano nunca se cambia.
7. **Se puede correr las veces que haga falta.** Recuerda de dónde vino cada borrador (tabla `web_import_items`) y
   cada foto (`web_import_media`). Otra corrida actualiza solo los borradores que **nadie tocó** desde la anterior;
   nunca toca lo publicado, lo archivado, lo que está en revisión ni lo que el equipo editó (basta con guardar un
   cambio). Si se corta (luz, señal), se vuelve a correr y sigue.
8. **Un reporte al final** (y con `--report archivo.json`, el detalle de cada artículo, fuera del repositorio).

### Qué no hace
- **No publica nada** ni cambia nada en la web vieja (solo lee).
- No trae la página «Inicio» (está hecha con Elementor; la web nueva tiene la suya), ni comentarios (no hay), ni
  usuarios, ni las 13.223 etiquetas como temas (solo las categorías; las etiquetas quedan como búsquedas, §3).
- No trae **los PDF** (son 17: boletines y revistas de 2019–2022, un decreto y un comunicado) ni otros archivos: un
  enlace a un PDF viejo queda señalado para subirlo a mano a la biblioteca si debe seguir en línea.
- No trae fotos GIF ni AVIF (la biblioteca no las acepta) ni fotos de otras páginas: quedan señaladas.
- No adivina el municipio de una nota, ni escribe resúmenes: el resumen solo se trae si alguien lo escribió en la web
  vieja (el automático de WordPress repetía el primer párrafo). La descripción para buscadores sale de la de Yoast o
  del comienzo del texto.
- **No reconoce nombres de personas, direcciones de casas ni caras.** Las notas de sucesos (Seguridad: 446) pueden
  nombrar a personas: lo decide quien revisa. Tampoco reconoce teléfonos de 7 cifras sin código de área.
- Quita también los correos institucionales: si uno debe quedar, el equipo lo vuelve a escribir.

### Cómo se usa
```bash
cd app-freddy-bernal
npm run web:import                          # prueba (por omisión): lee, cuenta y muestra una muestra. NO escribe nada
npm run web:import -- --limit 10            # la prueba con los 10 más nuevos
npm run web:import -- --apply --limit 20    # escribe: 20 borradores con sus fotos y redirecciones
npm run web:import -- --apply --since 2025-01-01   # solo lo publicado desde esa fecha
npm run web:import -- --apply --no-media    # sin bajar fotos (vienen en otra corrida)
npm run web:import -- --ids 123,456         # solo esos artículos (para revisar o traer de nuevo unos pocos)
npm run web:import -- --apply --report ~/Desktop/importacion.json   # con el detalle de cada artículo
```
| Opción | Qué hace |
|---|---|
| `--dry-run` | La prueba (es lo que hace sin `--apply`). No escribe filas ni archivos. Con `DATABASE_URL` la lee en una transacción de solo lectura para decir qué sería nuevo, qué se actualizaría y qué no se toca; la base local (`LOCAL_DATA_DIR`) no se abre, porque abrirla ya la cambia |
| `--apply` | Escribe. Pregunta antes de empezar (o `--yes`) |
| `--limit N` | Los N artículos más nuevos |
| `--since AAAA-MM-DD` | Solo los publicados desde ese día |
| `--ids 1,2,3` | Solo esos artículos (los números de WordPress) |
| `--no-media` | No baja fotos nuevas (usa las que ya se trajeron) |
| `--max-side PX` | El lado mayor de las fotos (por omisión 2048; con 1536 ocupan cerca de un tercio menos) |
| `--delay MS` | La pausa entre peticiones (por omisión 1000, mínimo 250) |
| `--sample N` | Cuántas filas de muestra muestra el reporte |
| `--report archivo.json` | El detalle de cada artículo (dirección vieja, nueva, qué se hizo y qué revisar). Se niega a guardarlo dentro del repositorio |
| `--site https://…` | Otra web WordPress (por omisión freddybernaloficial.com) |

**Dónde escribe con `--apply`:**
- **Producción (Supabase):** `DATABASE_URL` (la base), y para las fotos `NEXT_PUBLIC_SUPABASE_URL` y
  `SUPABASE_SERVICE_ROLE_KEY` (el balde `STORAGE_BUCKET_WEB_PUBLIC`, por omisión `web-public`). Las lee del ambiente o de
  `.env.local`. Con esa clave se puede todo: lo corre una persona de confianza en su computadora, y la clave nunca va
  al repositorio ni a un chat.
- **En local:** `LOCAL_DATA_DIR=./.data` (la base de la demostración en disco, D-94), **con la app cerrada** (una sola
  copia por carpeta). Las fotos van a `./.data/files/web-public`. Sirve para practicar la revisión antes de producción.

### Cómo se probó (y qué no)
| Prueba | Resultado |
|---|---|
| Pruebas automáticas con artículos inventados (`tests/unit/web-import-*.test.ts`, `tests/rls/web-import.test.ts`) | HTML a texto sin HTML ni código (también con ataques: `javascript:`, eventos, `<svg>`, `data:`), YouTube, redes, tablas, límites; correos, teléfonos y cédulas fuera (y montos, fechas, años y un RIF intactos); la prueba no escribe ni una fila, ni un archivo, ni una línea de auditoría; `--apply` contra la base en memoria; otra corrida sin cambios no escribe nada; lo cambiado en la web vieja se actualiza si nadie lo tocó; lo publicado, editado o en revisión no se toca; una redirección a mano no se pisa; la base no publica «[Por escribir]» ni una marca; quién lee las tablas nuevas |
| Prueba de solo lectura contra la web real (§2) | 68 artículos convertidos sin errores; 4 fotos reales bajadas **solo a memoria** pasaron la revisión de la biblioteca (JPEG, sin datos ocultos) |
| `--apply` contra un Supabase real | **No se pudo comprobar** (no hay cuentas aquí). Lo que escribe en la base se probó contra la base en memoria con las mismas migraciones; la subida al balde de Supabase usa el mismo cliente que la app, pero no se corrió |
| La importación completa (5.372 artículos) | **No se hizo.** Estimado: unas 3 a 4 horas con la pausa de 1 segundo (≈5.400 artículos en 54 páginas y ≈11.000 fotos) |

## 2. La prueba de solo lectura del 06/11/2026

Solo peticiones GET a la API pública; nada escrito; ninguna foto guardada; 5 peticiones por corrida (las fotos no se
bajan en una prueba). La web tenía ese día **5.372 artículos** (5.367 en la mañana, cuando se hizo el diagnóstico) y
**1 página**. La lista de usuarios de la API está cerrada (403): la firma sale del «Escrito por» público de Yoast.

| Muestra | Artículos | Fotos (portada + en el texto) | Se bajarían | Peso | Sin texto alternativo | De otras páginas | Datos personales quitados | Otras señales |
|---|---|---|---|---|---|---|---|---|
| Los 10 más nuevos (4–6/11/2026) | 10 | 22 (10 + 12) | 22 | ≈5,5 MB | 22 | 0 | 0 | — |
| Los 18 con correos Gmail (2017–2026) | 18 | 34 (16 + 18) | 34 | ≈3,1 MB | 34 | 0 | **27 correos (en los 18) y 7 teléfonos (en 4)**: los 18 quedan señalados | 2 artículos de 2017 cuya foto principal ya no existe en la web vieja |
| 40 repartidos (2015, 2018, 2021, 2024) | 40 | 82 (34 + 48) | 81 | ≈13,5 MB | 81 | 1 | 0 | 2 direcciones de más de 120 letras recortadas; 1 publicación de X que quedó como cita y enlace |

**Cómo queda una nota (muestra de los 10 más nuevos):** `/2026/11/<dirección>` → `/actualidad/<la misma dirección>`;
tipo «Noticia»; temas Táchira (4), Nacionales (3), Internacionales (2) y Deportes (1); de 5 a 10 párrafos y de 1 a 6
fotos cada una; todas con «[Por escribir]» en sus fotos. Las redirecciones que se harían para esas 10: 10 de
artículos, 10 `?p=`, 5 de categorías, 78 de etiquetas, 1 de mes, el feed y 22 de fotos.

**Espacio:** en la muestra salen unas 2 fotos por artículo y unos 160 KB por foto (a 2.048 px): **≈1,7 GB** para los
5.372 artículos (estimado grueso). No cabe en el plan gratis de Supabase (1 GB de archivos); sí en Pro (100 GB). Si no
hay Pro: importar desde una fecha (`--since`), o `--max-side 1536`.

## 3. Las direcciones viejas y adónde van

Inventario de `docs/diagnostico.md` §1 y §5. Todas responden **301** (permanente) salvo lo que se dice.

| Dirección vieja | Cuántas | Adónde va | Cómo |
|---|---|---|---|
| `/AAAA/MM/<dirección>/` (cada artículo) | 5.367 (5.372 el 06/11) | `/actualidad/<dirección>` | Una fila por artículo importado. Los 15 de puro número reciben una dirección del título; las de más de 120 letras se recortan; si otra nota ya la usa, se le agrega el número viejo |
| `/?p=<número>` | una por artículo | la misma noticia | Una fila por artículo importado |
| `/categoria/<x>/` y sus páginas `/page/N/` | 11 | Noticias → las noticias de `/actualidad`; Opinión → los artículos; «el informativo» → los comunicados; Táchira, Internacionales, Nacionales, Seguridad, Salud y Deportes → `/actualidad` buscando su nombre; Biografía → `/gobernador`; Sin categoría → `/actualidad` | Una fila por categoría usada; sus páginas se buscan como la categoría |
| `/tag/<x>/` (y sus páginas) | 3.799 con artículos | `/actualidad?q=<la etiqueta>` | Solo las de los artículos importados |
| `/AAAA/MM/` (archivo del mes) | uno por mes con artículos | `/actualidad` | La web nueva no filtra por mes todavía |
| `/page/N/` | — | `/actualidad` | Regla de la app, sin tabla |
| `/?s=<palabras>` | — | `/actualidad?q=<palabras>` | Regla de la app, sin tabla |
| `/<artículo>/feed/` | — | la noticia | Se busca como el artículo |
| `/feed/` | 1 | `/actualidad` | Ya la siembra la configuración del cliente (hoy la web vieja la manda a la portada) |
| `/2014/07/biografia/` | 1 | `/gobernador` | Ya la siembra la configuración del cliente |
| `/wp-content/uploads/AAAA/MM/<foto>` | 15.469 archivos | la foto nueva (`/api/archivos/web/<clave>`) | Una fila por foto traída; sus tamaños (`-300x200`, `-scaled`) encuentran la del original |
| `/wp-content/…` que no se trajo | el resto | **410** «ya no está» | Regla de la app: los buscadores la sueltan antes que con un 404 |
| `www.freddybernaloficial.com/*` | — | sin `www` | En el dominio de Vercel (§4, paso 11) |
| `http://…` | — | `https://…` | Vercel lo hace solo |
| Cualquier otra | — | la página «No encontrada» de la web nueva | — |

- Una redirección a un **borrador que no se ha publicado** termina en «No encontrada» hasta que se publique. Por eso,
  antes del cambio de DNS: publicar lo que se quiere conservar y archivar lo que no.
- Los blogs viejos de wordpress.com no son de este dominio: no se pueden redirigir desde aquí.
- El equipo las ve y las cambia en `/admin/web/redirecciones` (las del importador dicen «Del importador»). Un cambio
  se nota en un minuto.

## 4. La salida a producción, en orden

| # | Paso | Quién | Detalle |
|---|---|---|---|
| 1 | **Proyecto de Supabase de producción** | Juan | Uno nuevo (`fb-prod`) o decidir que `fb-dev` pasa a serlo. Plan Pro si se importan todas las fotos (§2). Región junto a Vercel (`iad1`) |
| 2 | **Migraciones** | Juan con Claude | Todas las de `supabase/migrations`, en orden, como `postgres` (README «Conectar las cuentas»). Las de la web: `20261106000050` a `20261106000300`, `20261106100100` y `20261106300100`. No se edita una ya aplicada |
| 3 | **Baldes** | Juan | La migración `20261106000100` crea `web-public` (**público**) y `participacion-privado` (**privado**). Mirar en Storage que existan y que `participacion-privado` no sea público |
| 4 | **Data API** | Juan | El esquema `citizen` **nunca** se agrega a los expuestos. Comprobar que el rol de `DATABASE_URL` puede hacer `set role anon` (desde aquí **no se pudo comprobar**) |
| 5 | **Configuración del cliente** | Juan | `DATABASE_URL=... npm run db:seed-client` |
| 6 | **Variables en Vercel** (producción) | Juan | Ver la tabla de abajo. Nunca en el repositorio |
| 7 | **Vercel** | Juan | Root Directory `app-freddy-bernal`; región `iad1`; protección de las versiones de prueba; la tarea diaria de `vercel.json` (`/api/cron/tick`, con `CRON_SECRET`) |
| 8 | **Primer administrador y equipo** | Juan | `npm run db:first-admin -- correo "Nombre"`; después, desde Ajustes → Equipo, el editor de la web, quien aprueba, la coordinación de atención, los responsables de área (con su área), denuncias y auditoría, todos con doble factor |
| 9 | **Importar** | Juan con Claude | Una prueba (`npm run web:import`), después `--apply --limit 20`, revisar esos 20 en `/admin/web`, y luego todo (`--apply --report …`). Se puede cortar y seguir |
| 10 | **Revisar los borradores** | Equipo de la web | Ver §5. Se sugiere empezar por 2025–2026 y decidir si las notas Nacionales e Internacionales (unas 800) se publican |
| 11 | **Turnstile** | Juan | Cuenta de Cloudflare, el sitio con el dominio final, y las dos claves en Vercel |
| 12 | **Revisor de archivos** | Juan con Claude | Sin revisor, en producción los archivos que manda la gente **no se descargan** (quedan «sin analizar»). ClamAV en un servidor aparte (Vercel no puede correrlo; `docker-compose.yml` trae uno de ejemplo, no probado aquí) u otro servicio, y `ATTACHMENT_SCANNER=clamav` con `CLAMAV_HOST`/`CLAMAV_PORT` |
| 13 | **Consulta legal** | Juan | Antes de abrir: aviso de privacidad, condiciones de participación, denuncias (qué se guarda, quién lo lee, cuánto tiempo), y el uso de las notas y fotos viejas |
| 14 | **Congelar la web vieja** | Pedro Poller y Prensa | El día antes: no publicar más en WordPress; correr `npm run web:import -- --apply --since <el último día>` para traer lo último |
| 15 | **DNS** | Pedro Poller | Bajar el TTL a 300 s un día antes. Agregar `freddybernaloficial.com` y `www.freddybernaloficial.com` en Vercel (Settings → Domains), con `www` redirigiendo al dominio sin `www`; poner en el DNS los registros que pida Vercel. El certificado https y el paso de http a https los hace Vercel. **Guardar el hosting viejo sin tocar** unas semanas (para volver atrás, §6) |
| 16 | **Abrir a los buscadores** | Juan | `SITE_URL=https://freddybernaloficial.com` y, con su OK, `SITE_INDEXABLE=true`; volver a desplegar |
| 17 | **Search Console** | Juan y Pedro | Propiedad de dominio (un registro TXT que pone Pedro) o la etiqueta con `GOOGLE_SITE_VERIFICATION`; enviar `https://freddybernaloficial.com/sitemap.xml`; inspeccionar la portada, `/gobernador` y una noticia; mirar las páginas «No encontradas» la primera semana. Si la web vieja ya estaba verificada por DNS, **no se pudo comprobar** desde aquí |
| 18 | **Comprobar** | Claude o el equipo | La lista de §5, con unas 20 direcciones viejas de muestra (sacadas del reporte de la importación) |

**Variables de producción** (todas en `.env.example`, con cómo hacer cada clave):

| Variable | Para qué |
|---|---|
| `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | La base, la entrada del equipo y los archivos |
| `PARTICIPATION_PEPPER` | La huella de la clave de cada comprobante. **Obligatoria y no se cambia nunca** (si cambia, los comprobantes viejos no abren) |
| `PARTICIPATION_DATA_KEY` (y `PARTICIPATION_DATA_KEYS_PREVIOUS` al rotar) | Cifra el contacto de quien escribe. Sin ella no se guarda ningún contacto |
| `SITE_URL`, `SITE_INDEXABLE` | La dirección de la web (canónicas, sitemap, redes) y si los buscadores la indexan (`false` hasta el paso 16) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | El control antispam de Cloudflare en los formularios (sin ellas: campo trampa y límites) |
| `ATTACHMENT_SCANNER`, `CLAMAV_HOST`, `CLAMAV_PORT`, `CLAMAV_TIMEOUT_MS` | El revisor de archivos (paso 12) |
| `STORAGE_BUCKET_WEB_PUBLIC`, `STORAGE_BUCKET_PARTICIPATION` | Solo si los baldes se llaman distinto |
| `EMAIL_MODE`, `EMAIL_FROM`, `RESEND_API_KEY` | Correos. `EMAIL_MODE=outbox` mientras sea demostración: nada le llega a nadie |
| `CRON_SECRET`, `APP_TZ`, `GOOGLE_SITE_VERIFICATION` | La tarea diaria, la zona horaria, la verificación de Google |

## 5. Lista para salir (marcar cada una)

**Antes de importar**
- [ ] Proyecto de Supabase de producción, con plan acorde al espacio de las fotos.
- [ ] Todas las migraciones aplicadas; `citizen` no expuesto; baldes creados (`participacion-privado` privado).
- [ ] Una copia de la base **antes** de importar (Supabase → Database → Backups, o `pg_dump`).
- [ ] La prueba (`npm run web:import -- --limit 20`) con el reporte mirado.

**Revisión de los borradores (por cada nota que se publique)**
- [ ] El texto alternativo de cada foto («[Por escribir]» → qué se ve). La base no publica sin él.
- [ ] Ninguna marca «[correo retirado]», «[teléfono retirado]», «[cédula retirada]»: reescribir la frase. La base no
      publica con ellas.
- [ ] Lo que dice el aviso «Traído de la web vieja» del editor (inserciones, tablas, fotos que faltaron, PDF).
- [ ] Nombres de personas que no son figuras públicas (sobre todo en Seguridad), menores en fotos, datos de salud.
- [ ] Tipo, temas, municipio, fecha y la foto principal.
- [ ] Publicar lo que se conserva; archivar lo que no (nada se borra).

**Antes del DNS**
- [ ] Consulta legal hecha.
- [ ] Turnstile con claves; revisor de archivos funcionando (o la decisión escrita de abrir sin descargas de archivos).
- [ ] `PARTICIPATION_PEPPER` y `PARTICIPATION_DATA_KEY` puestas y guardadas aparte en un lugar seguro.
- [ ] Primer administrador y equipo con doble factor; una persona por rol probó su parte.
- [ ] La web vieja congelada y la última importación (`--since`) corrida.
- [ ] El TTL del DNS bajado; el hosting viejo guardado sin tocar.

**Después del DNS (el mismo día)**
- [ ] `https://freddybernaloficial.com` abre la web nueva; `http://` y `www` llegan a ella con 301.
- [ ] 20 direcciones viejas de muestra: artículos, `?p=`, una categoría, una etiqueta, un mes, una foto y su tamaño
      `-300x200`, el feed y la biografía responden 301 al lugar correcto; un `/wp-content/…` no traído responde 410.
- [ ] `robots.txt` deja entrar y `sitemap.xml` lista lo publicado (solo con `SITE_INDEXABLE=true`).
- [ ] Un reporte de prueba de punta a punta (enviar, consultar con el código, atender, resolver).
- [ ] Search Console con el sitemap enviado.

## 6. Cómo volver atrás

| Qué pasó | Qué se hace |
|---|---|
| Una versión nueva de la app falla | Vercel → Deployments → la versión buena → **Instant Rollback** (inmediato, no toca la base) |
| Todo mal después del cambio de DNS | Pedro vuelve a poner el DNS del hosting viejo (con el TTL bajo, en minutos). La web vieja sigue como estaba: el importador solo la leyó |
| Una redirección lleva a un lugar equivocado | Se corrige o se borra en `/admin/web/redirecciones` (en un minuto) |
| Una nota importada publicada tiene un problema | «Archivar»: sale de la web al instante (su historia queda) |
| La importación salió mal antes de abrir | Lo más limpio: restaurar la copia de la base hecha antes de importar (o el punto en el tiempo, si el plan lo tiene). Si no hay copia: archivar los borradores del importador que nadie tocó (Claude lo hace con una consulta sobre `web_import_items`), borrar sus redirecciones del importador y vaciar los archivos nuevos del balde |
| Una foto vieja no debe seguir en línea | Archivarla en la biblioteca, borrar su redirección y quitar su archivo del balde `web-public` (las páginas ya publicadas que la usaban se vuelven a publicar con otra) |

## 7. Lo que queda abierto

- **No se pudo comprobar:** el importador escribiendo en un Supabase real (balde incluido); que el rol de
  `DATABASE_URL` pueda `set role anon`; el estado de Search Console; la duración real de la importación completa.
- El texto alternativo de ≈11.000 fotos lo escribe una persona: es el trabajo más largo. Se puede publicar por partes.
- Las fotos de una nota van todas a la galería (al final), no en el lugar del texto donde estaban.
- La web nueva no filtra por mes: los archivos de mes van a `/actualidad`.
- La tabla de redirecciones tendrá unas 25.000 filas con todo importado (artículos, `?p=`, etiquetas y fotos). Por eso
  la web ya no la lee entera: busca cada dirección vieja por sí sola (por el índice de la tabla) y recuerda la
  respuesta un minuto (también el «no está»: cada dirección vieja distinta que no existe cuesta una consulta corta a la
  base). No se midió con 25.000 filas reales.
- Los nombres de personas en las notas no se detectan solos.
