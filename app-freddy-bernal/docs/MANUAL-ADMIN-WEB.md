# Manual del administrador de la web

**06/11/2026.** Para el equipo que escribe y publica la web del gobernador: el editor de la web, quien aprueba, el
jefe y Administración. Todo se hace desde el panel, en el menú **«Web»** (`/admin/web`). Los nombres de los botones
están escritos tal como salen en la pantalla.

> Hoy la web vive en la **versión de prueba** y ningún buscador la muestra. La versión de prueba publicada en Vercel
> trae el contenido real de la web oficial (noticias, opinión, biografía, fotos y el Semanario; D-101): cada nota sale
> con el aviso «Traído de la web vieja» (§15). En las pruebas y en local, todo es inventado y lleva «(demo)». Abrirla
> al público es una decisión de Juan (`docs/PENDIENTES.md`).

**La idea en una línea:** cada contenido tiene un **borrador** (lo que se escribe) y **lo publicado** (exactamente lo
que se aprobó, lo único que ve la gente). Cambiar un borrador nunca cambia la web hasta que alguien lo publique otra
vez. Nada se borra: lo que sobra se archiva.

## 1. Quién hace qué

| Rol | Qué hace en «Web» |
|---|---|
| **Editor de la web** | Crea y escribe borradores, sube fotos y PDF a la biblioteca, los envía a aprobación y puede volver a una versión vieja (solo en el borrador). **Nunca publica.** No entra a «Ajustes del sitio» ni a «Redirecciones» y no ve las solicitudes de la gente |
| **Aprobador de la web** | Todo lo del editor, y además revisa, **publica**, programa, devuelve con un comentario, archiva y desarchiva, cambia la dirección de lo ya publicado, los «Ajustes del sitio» y las «Redirecciones» |
| **Jefe** | Lo mismo que el aprobador. Ojo: el aviso de «Por aprobar» solo le llega al aprobador; el jefe lo ve en la lista |
| **Administración** | Lee todo (también los borradores) y cambia los «Ajustes del sitio» y las «Redirecciones». Nunca escribe ni publica contenido. Su «Web» abre directo los ajustes |

- **Siempre con doble factor.** Se entra con el correo, el código que llega por correo y el código de Google
  Authenticator. No hay contraseñas. Si alguien pierde o cambia el teléfono: Administración → Ajustes → Equipo →
  «Reiniciar doble factor».
- **Cómo se da el rol:** Administración → Ajustes → Equipo → «Invitar a alguien», el rol en «Web y atención
  ciudadana (siempre con doble factor)» → «Enviar invitación». Cada persona con su propio usuario.
- La base de datos vuelve a revisar el permiso en cada botón: aunque alguien llegue a una pantalla que no es suya, no
  puede publicar ni cambiar nada.

## 2. La pantalla «Web»

Arriba, una fila de botones: **«Inicio»**, **«Por aprobar (N)»**, **«Biblioteca»** y, para el aprobador, el jefe y
Administración, **«Ajustes del sitio»** y **«Redirecciones»**.

En «Inicio» se ve:
- Cuatro números: **«Borradores»**, **«Esperan aprobación»**, **«Programados»** y **«Publicados»**.
- **«Por aprobar»** (para quien aprueba) o **«Esperando aprobación»** (para el editor), con «Ver todo».
- **«Contenido»**: una tarjeta por tipo, con cuántos hay en la web, en borrador, en revisión y programados.
- Las puertas a la biblioteca, los ajustes y las redirecciones, y **«Lo último que cambió»**.

## 3. Las listas y sus etiquetas

Cada tipo tiene su lista (por ejemplo «Noticias y comunicados»). Arriba: **«Buscar»** (palabras del título o del
resumen), **«Estado»** (Todos, Borradores, En revisión, Programados, Publicados, Archivados) y **«Filtrar»**;
«Quitar los filtros» vuelve a la lista completa. Lo que espera aprobación sale primero.

Cada contenido lleva una o dos etiquetas:

| Etiqueta | Qué quiere decir |
|---|---|
| **Borrador** | Nunca se ha publicado |
| **En revisión** | Se envió a aprobación y espera |
| **Programado** | Ya está aprobado y sale solo a su hora |
| **Publicado** | Está en la web |
| **Cambios sin publicar** | Está en la web, pero el borrador tiene cambios: la web sigue mostrando lo aprobado |
| **Devuelto con comentario** | Quien aprueba lo devolvió: el comentario sale arriba del editor |
| **Archivado** | No se ve en la web; su historia se guarda |

## 4. Crear un contenido

En la lista del tipo, el botón de arriba (**«Nueva noticia»**, **«Nueva obra o acción»**, **«Nuevo episodio»**,
**«Nuevo documento»**, **«Nuevo aviso»**, **«Nueva pregunta»** o **«Nuevo indicador»**) → escribe el **«Título»** (la
dirección en la web sale de él) → **«Crear borrador»**. Se abre el editor.

**Las páginas no se crean, se editan.** Son seis y ya existen: la portada («Inicio»), «El gobernador», «Participa» y
las tres legales («Aviso de privacidad», «Condiciones de participación» y «Accesibilidad»). Una página nueva no
tendría lugar en el menú de la web.

Lo que pide cada tipo:

| Tipo | Lo principal | Reglas |
|---|---|---|
| **Noticia** (noticia, comunicado, artículo o entrevista) | Título, Resumen, Fecha, Tipo, Firma, Municipio, Foto principal, «Texto de la nota», Galería, «Video de YouTube (su código)», Fuentes y Temas | El código del video son los 11 caracteres que van después de «v=» en el enlace |
| **Obra o acción** | Categoría, Estado (Anunciado, En ejecución o Concluido), Municipio, «Parroquia, localidad o sector», Descripción, «Para quién», «Organismo responsable», fechas, «Última actualización» y Evidencias | **Nunca un monto ni un porcentaje sin su fuente:** «Agregar la inversión (con su fuente)» y «Agregar el avance (con su fuente)» piden de dónde sale la cifra. Sin fuente, no se ponen |
| **Reporte Bernal** (episodio) | Fecha, video, «Duración (minutos)», «Foto de portada», Temas y Enlaces | Sin código de video, la web no muestra el reproductor; la vista previa avisa «Video por enlazar» |
| **Documento** | Categoría (Semanario, Informe, Memoria y Cuenta, Normativa, Material para la prensa u Otro), «Archivo PDF», Versión y Páginas | El Semanario sale en Noticias › Semanario; el material para la prensa, en «El gobernador» |
| **Aviso de servicio** | Título, Servicio, «Texto del aviso», «Actualizado» (con «Ahora»), «Vence (opcional)» y «Municipios afectados» | La hora es la del Táchira. Al vencer deja de salir solo. Sin municipios marcados, es para todo el estado. Sin teléfonos que nadie verificó |
| **Pregunta frecuente** | Pregunta, Grupo (Atención ciudadana, Esta web o La gestión), Respuesta y Orden | Las de «Atención ciudadana» salen en la página de Atención |
| **Indicador** | «Qué se cuenta», Cifra, Unidad, «Fecha del dato», Fuente, «Enlace de la fuente» y Cálculo | **Una cifra sin fuente nunca sale en la web.** «Cálculo»: «Escrita a mano» o «Lo cuenta la plataforma» |

**Nunca se inventa nada:** ni biografía, ni fotos, ni teléfonos, ni correos, ni horarios, ni cuentas, ni parroquias.
Lo que falte se deja como espacio **«Por completar»** (ver §6) y se llena cuando el dato llegue confirmado. Ese espacio
nunca sale en la web: solo lo ve el equipo en la vista previa. Lo mismo una foto, un video o un archivo que falta: la
web no dibuja nada en su lugar y la vista previa avisa qué falta.

## 5. El editor

La barra de arriba acompaña mientras bajas:
- **«Guardar borrador»**: guarda y deja una versión nueva (cada guardado es una versión).
- **«Vista previa»**: guarda si hace falta y muestra el borrador tal como se vería (§7).
- **«Enviar a aprobación»** (dice **«Guardar y enviar a aprobación»** si hay cambios sin guardar). Mientras espera,
  el botón cambia a **«Retirar de revisión»**, que lo devuelve a borrador.
- **«Revisar y publicar»**: solo para quien aprueba.
- A la derecha dice **«Cambios sin guardar»** o **«Todo guardado»**.

Más abajo:
- **«Dirección en la web»**: minúsculas, números y guiones (sin espacios ni acentos). «Usar el título como
  dirección» la arma del título. Después de publicado, la dirección solo la cambia quien aprueba, y la vieja sigue
  llevando a la nueva sola. La dirección de una página no se cambia.
- El formulario del tipo (§4) y, en páginas, noticias y obras, **«Buscadores y redes»**: «Título para buscadores»
  (unos 60 caracteres), «Descripción para buscadores» (unos 155), «Imagen para redes» (mejor horizontal, 1200 × 630),
  «Dirección canónica (opcional)» (casi nunca hace falta) y «Pedir a los buscadores que no la muestren». La tarjeta
  **«Así se ve al compartir el enlace»** muestra cómo queda en WhatsApp, Facebook o X. Si los dejas vacíos se usan el
  título, el resumen y la foto principal. También pasan por la aprobación.
- **«Para enviarlo a aprobación falta esto»**: la lista de lo que falta. Cuando está completo dice **«Listo para
  enviar a aprobación»**.
- **«Nota de esta versión (opcional)»**: para saber después qué cambió («Corregí la fecha»).

Avisos que pueden salir arriba del editor: «Te lo devolvieron con este comentario», «Esperando aprobación», «Esto ya
está en la web» (tus cambios salen solo cuando se publique de nuevo), «Programado: sale el …», «Traído de la web
vieja» (§15) y «Archivado: no se ve en la web».

- **Lo que escribes y no guardas se queda en este equipo.** Si se va la luz o la señal, al volver dice «Recuperamos
  cambios que no se habían guardado en este equipo.»; «Descartarlos» los borra. Solo «Guardar borrador» lo sube.
- **Dos personas a la vez:** si otra persona guardó mientras escribías, sale «Alguien guardó cambios en este contenido
  mientras lo editabas. Copia lo tuyo y vuelve a abrirlo para ver lo último.».

## 6. Las páginas por bloques y el formato del texto

Una página (la portada primero) es una lista de **bloques** que se ven en ese orden. En «Bloques de la página», cada
bloque tiene **«Editar»**, **«Subir»**, **«Bajar»** y **«Ocultar»** / **«Mostrar»**; al abrirlo, **«Duplicar»** y
**«Eliminar el bloque»** (pregunta antes). Un bloque oculto lleva la etiqueta «Oculto»: se queda en el borrador pero no
sale en la web. Eliminar un bloque solo cambia el borrador; lo publicado sigue igual y las versiones lo guardan.

**«Agregar un bloque»** abre la lista de los 15 tipos: Portada con foto, Texto, Foto, Galería, Video, Documentos,
Preguntas frecuentes, Indicadores, Obras y gestión, Noticias, Llamado a la acción, Avisos de servicio, Canales
oficiales, Accesos de participación y Casos atendidos. Cada uno dice para qué sirve. Algunos detalles:
- **Portada con foto:** sin foto, la portada sale solo con el texto, a lo ancho; la vista previa muestra «Foto por
  subir desde el administrador». Si el mensaje todavía no está, escribe «Por completar desde el administrador: …»: el
  equipo lo ve como un espacio por llenar y el público no ve nada.
- **Video:** «Mostrar el episodio más reciente» cambia solo cada vez que se publica un episodio.
- **Documentos, Preguntas, Indicadores y Obras:** «Salen en el orden en que los marques. Sin marcar ninguno, se usan
  los últimos.» Lo que no está publicado dice «(no publicado: no se verá)»; un indicador sin fuente, «(sin fuente: no
  se verá)».
- **Canales oficiales:** las cuentas se cambian en «Ajustes del sitio» (§13).
- **Llamado a la acción:** el «Enlace del botón» va a una dirección de esta web (`/atencion/nueva`) o a `https://…`.

**El formato del texto.** El texto se arma por partes, cada una en su cuadro: **Párrafo, Título, Subtítulo, Lista,
Lista numerada, Cita y Por completar**. Los botones con un «+» («Párrafo», «Título», «Lista», «Cita» y «Por
completar») agregan partes; el tipo de cada parte se cambia en su lista; las flechas las suben o bajan y la papelera
las quita. En una lista, un punto por línea. Dentro de un
párrafo o una lista:

| Para | Escribe | O usa el botón |
|---|---|---|
| Negrita | `**así**` | Negrita |
| Cursiva | `*así*` | Cursiva |
| Enlace | `[texto del enlace](https://…)` | Enlace → «Dirección del enlace» → «Poner el enlace» (selecciona antes las palabras) |

- Los enlaces solo van a `https://…`, `http://…`, `mailto:…` o a una dirección de esta web que empiece con `/`. Otro
  enlace se marca en rojo y no se guarda.
- Nunca se pega HTML ni código: la web dibuja el texto con sus propias reglas.
- Para escribir un asterisco o un corchete tal cual, ponle una barra delante: `\*`.
- **«Así se ve en la web»** (debajo del texto) lo muestra como quedará.

## 7. La vista previa

«Vista previa» muestra **el borrador** dibujado igual que la web, con una franja naranja arriba: **«Vista previa: no
está publicado»**, con «Volver al editor» y, para quien aprueba, «Revisar y publicar». Solo la ven las personas de la
web y Administración, y ningún buscador. Las listas dentro de la página (las últimas noticias, las obras…) muestran lo
que el público ve hoy. Si al borrador le falta algo para dibujarse, la vista previa dice qué. Desde «Versiones», «Ver»
muestra una versión guardada.

## 8. Aprobar: revisar, comparar y decidir

**«Por aprobar»** lista lo que espera, lo más viejo primero; cada línea dice si es «primera publicación» o «cambios a
algo publicado», quién lo envió y cuándo. Al abrirlo:
- Quién lo envió, el último cambio y, si está en la web, cuándo se publicó.
- «Ver la vista previa», «Abrir el editor», «Versiones» y «Verlo en la web».
- **«Le falta esto para publicarse»**, si falta algo.
- **«Qué cambia si lo publicas»**: campo por campo, con «Antes» y «Ahora», y etiquetas «Nuevo», «Quitado»,
  «Cambió», «Se oculta» y «Se muestra»; en una página, también los bloques y, si cambió el orden, «Orden publicado»
  frente a «Orden nuevo». Si es la primera vez, dice que todo es nuevo: revísalo completo en la vista previa. La
  comparación es por campo y por bloque, no palabra por palabra.

En **«Decidir»** (cada botón pregunta antes):
- **«Publicar ahora»**: sale en la web en ese momento, exactamente como lo viste.
- **«Programar»**: elige «Día» y «Hora» (§9).
- **«Devolver con comentario»**: escribe en «Qué hay que cambiar» y toca «Devolver con comentario». Quien lo envió lo
  lee en su aviso y arriba del editor.
- **«Quitar la programación»** (si estaba programado): vuelve a borrador.
- **«Archivar»** (§10).

Si alguien cambió el borrador mientras revisabas, la base no publica: «El contenido cambió mientras lo revisabas.
Ábrelo de nuevo para ver lo último.». Así sale exactamente lo que se revisó.

**Avisos (en la campana y en el teléfono, nunca por correo):** al enviar, al aprobador le llega «Hay contenido de la
web por aprobar». Al decidir, a quien lo envió le llega «Tu contenido ya está en la web», «Tu contenido de la web quedó
programado» o «Te devolvieron un contenido de la web».

## 9. Programar (hora del Táchira)

En «Programar», «Día» y «Hora» son **hora del Táchira**. A esa hora aparece sola en la web, en menos de un minuto.
Hasta entonces nadie lo ve. Una hora que ya pasó no se acepta («Elige una hora que todavía no haya pasado, o publica
ahora.»).

**Límite:** lo que **ya está en la web no se programa**: sus cambios se publican ahora («Ya está en la web: sus cambios
se publican ahora.»). Si un cambio debe salir a cierta hora, guárdalo listo y tócale «Publicar ahora» a esa hora. Lo
nuevo sí se programa.

## 10. Archivar

**«Archivar»** saca el contenido de la web **al momento**, sin borrar nada: su historia y lo aprobado se quedan.
**«Desarchivar»** vuelve a poner lo que estaba aprobado (si estaba publicado, se ve otra vez). Un contenido archivado
no se cambia hasta desarchivarlo. Solo el aprobador y el jefe archivan. No hay botón de borrar.

## 11. Versiones

Desde el editor, **«Versiones»**: cada borrador guardado, con quién, cuándo y su nota; «Borrador actual» y «La
publicada» marcan cuál es cuál. **«Ver»** abre esa versión en la vista previa. **«Volver a esta versión»** la copia al
borrador como una versión nueva (nada se pierde); para que salga en la web hay que enviarla a aprobación y publicarla
otra vez. El editor también puede hacerlo.

## 12. La biblioteca de fotos y documentos

> **Todo lo que está en la biblioteca es público.** Nunca fotos ni archivos de las personas que escriben a Atención,
> ni cédulas, ni documentos privados, ni menores sin permiso. Los archivos de las solicitudes viven aparte, en privado,
> y nunca pasan por aquí.

**Subir:** «Biblioteca» → «Subir una foto» o «Subir un PDF».
- Fotos JPG, PNG o WebP. La foto **se achica y pierde la ubicación y los datos de la cámara en tu equipo, antes de
  subir**, y el servidor lo revisa otra vez. No se aceptan HEIC, AVIF ni GIF: guárdala como JPG.
- Tamaños: fotos hasta 10 MB (ya achicadas) y PDF hasta 20 MB; **en Vercel (la versión de prueba y producción),
  hasta 4 MB por archivo**. Una foto de al menos 120 píxeles por lado y de no más de 12.000.
- Los PDF guardan sus datos ocultos (autor, programa): revísalos antes de subirlos.

**Las palabras de cada foto:**
- **«Texto alternativo»** (obligatorio): lo leen las personas que usan lector de pantalla y los buscadores. Describe
  lo que se ve en pocas palabras, como se lo contarías a alguien que no puede verla: quién, qué hace, dónde. No
  empieces con «foto de…». Si la foto tiene un texto importante, escríbelo. Por ejemplo (inventado): «Obreros
  asfaltan una calle de tierra frente a una escuela» y no «foto1» ni «Obra».
- «Pie de foto» (lo que cuenta la foto, debajo de ella) y «Crédito» (quién la tomó), opcionales.
- **Punto de interés:** toca en la foto lo que siempre debe verse (una cara, la obra), o muévelo con las flechas del
  teclado o con «Horizontal» y «Vertical». Así, cuando la web la recorta, eso no se pierde.

**Buscar y ordenar:** «Buscar» (texto alternativo, pie, crédito o título), «Tipo» (Todo, Fotos, Documentos) y
«Archivados». Cada archivo dice «Sin usar» o «Se usa en N contenidos». Al abrirlo:
- Cambias sus palabras y su punto → «Guardar». Lo ya publicado conserva los textos con que se aprobó hasta que se
  publique de nuevo.
- **«Dónde se usa»**: cada contenido, con «En lo publicado» o «En el borrador».
- **«Archivar»** / **«Devolver a la biblioteca»**. Archivado, nadie puede elegirlo; las páginas publicadas que lo usan
  lo siguen mostrando, y un borrador que lo use no se puede enviar hasta cambiarlo.
- Si se subió algo que no debía ser público, archívalo y avísale a Juan: el archivo se borra a mano en Supabase
  Storage (la app solo archiva).

En el editor, «Elegir foto», «Elegir PDF», «Cambiar» o «Agregar foto» abren la biblioteca con «De la biblioteca» y
«Subir una nueva».

## 13. Ajustes del sitio

Los cambia el aprobador, el jefe o Administración. **Lo que se guarda aquí sale en la web al momento, sin
aprobación** («Guardado. La web ya lo muestra.»). Cada sección tiene su «Guardar».

| Sección | Para qué |
|---|---|
| **Navegación** | El menú de la web, en orden («Agregar enlace»). Cada enlace va a una dirección de esta web (empieza con `/`) |
| **Pie de página** | Un texto corto y los enlaces legales («Agregar enlace legal») |
| **Contactos institucionales** | Teléfonos, correos o direcciones («Agregar contacto»). **Solo los marcados «Verificado» salen** |
| **Cuentas en redes** | Red, usuario y enlace de cada cuenta («Agregar cuenta»), con «Verificada», «Activa» y una «Nota interna (no sale en la web)». Salen en el pie, en «Canales» y en los datos para Google. **En producción solo salen las activas y verificadas**; en la versión de prueba también las que no lo están, marcadas «sin verificar». Una cuenta abandonada se apaga («Activa» sin marcar): nunca sale |
| **Canal de WhatsApp**, **Portal institucional**, **Canal de YouTube del programa** | Cada uno con «La web lo muestra», «Verificado» y «Activo». El portal solo sale verificado |
| **Nombre y saludo** | El nombre, el cargo, la región, el saludo y el «Nombre de la cabecera». El título grande de la portada sale del nombre y el cargo; hoy la web no muestra el saludo (el de los copies de redes se cambia en Ajustes → Marca) |
| **Datos estructurados** | Lo que leen los buscadores sobre la persona y la institución |
| **Avisos legales** | Se ven, pero no se cambian aquí: el aviso de emergencias y el de las denuncias son un solo texto fijo de la app, el mismo en el pie de la web, en «Canales», en los formularios de Atención, en el comprobante y su PDF y en los correos. Si el cliente confirma un número oficial de emergencias, se agrega en ese texto (lo cambia quien programa) |
| **Aviso de la versión de prueba** | La franja fija que solo sale en la demostración |

**Regla:** nunca un teléfono, un correo o una cuenta que nadie del equipo confirmó. Las notas internas no salen en la
web.

## 14. Redirecciones

Llevan una dirección vieja (de la web de WordPress, o una que cambió) a la nueva, para que ningún enlace guardado o
compartido se pierda. Las ve y las cambia el aprobador, el jefe o Administración.
- **«Nueva redirección»**: «Dirección vieja» (por ejemplo `/2024/05/una-nota`), «Lleva a» (una dirección de esta web,
  por ejemplo `/actualidad/una-nota`) y «Tipo» (lo normal: «301 · para siempre (lo normal)») → **«Agregar la
  redirección»**.
- En la lista, cada una dice **«Del importador»** o **«A mano»**. Cambia el destino y toca «Guardar», o «Quitar»
  (pregunta antes: quien entre a esa dirección verá «Esta página no existe»).
- No se puede redirigir una dirección que la web ya usa, ni hacer dos desde la misma. Una hecha a mano nunca la pisa
  el importador.
- Un cambio se nota en la web en más o menos un minuto.

## 15. Revisar lo que trajo el importador

Los artículos de la web vieja entran como **borradores** de noticias (nunca publicados). Los corre Juan con Claude
(`docs/PLAN-MIGRACION-Y-PRODUCCION.md`). Cada uno trae arriba el aviso **«Traído de la web vieja»** con su dirección
vieja, su fecha y lo que hay que revisar (por ejemplo «Se quitaron correos del texto: quedó «[correo retirado]».» o
«Fotos sin texto alternativo…»). Antes de enviar cada nota:
1. **El texto alternativo de cada foto.** Las fotos viejas casi nunca lo tienen y entran con «[Por escribir] …». Se
   escribe en la biblioteca. **La base no publica una foto con «[Por escribir]».**
2. **Las marcas de datos quitados**: «[correo retirado]», «[teléfono retirado]» o «[cédula retirada]». Reescribe la
   frase sin el dato. **La base no publica mientras quede una marca.**
3. Lo demás que dice el aviso: publicaciones de redes que quedaron como enlace, tablas que quedaron como lista, fotos
   que faltaron, PDF viejos (se suben a mano si deben seguir en línea).
4. **Nombres de personas que no son figuras públicas** (sobre todo en las notas de sucesos), menores en fotos y datos
   de salud: el importador no los reconoce solo.
5. Tipo, temas, municipio, fecha y foto principal. Las fotos del texto van todas a la galería, al final.
6. Publicar lo que se conserva y **archivar** lo que no (nada se borra).

En cuanto guardas un cambio en un borrador importado, una corrida nueva del importador ya no lo toca.

## 16. Si algo sale mal

| Pasó | Qué hacer |
|---|---|
| Se publicó algo por error | «Archivar»: sale de la web al momento |
| Se publicó un cambio equivocado | «Versiones» → «Volver a esta versión» → enviar → publicar |
| Una dirección vieja lleva a donde no es | «Redirecciones»: cambia el destino o «Quitar» |
| Se subió a la biblioteca un archivo que no debía ser público | Archívalo y avísale a Juan para borrarlo en Supabase Storage |
| No puedo publicar: «falta esto» | Completa lo que dice la lista; en lo importado, el texto alternativo y las marcas |
| Perdí el teléfono del doble factor | Administración: Ajustes → Equipo → «Reiniciar doble factor» |

Lo que todavía no hace: la comparación palabra por palabra, programar un cambio a algo ya publicado, fotos HEIC o
AVIF, PDF de más de 4 MB en Vercel y el aviso de «Por aprobar» para el jefe (`docs/PENDIENTES.md`).
