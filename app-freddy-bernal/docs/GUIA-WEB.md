# Guía de la web para el equipo

**08/11/2026.** Esta guía cuenta qué tiene la web del gobernador, sección por sección, y cómo la usa la gente.
También dice qué hace cada rol en el panel. El detalle de cada pantalla del panel está en dos manuales:
**`MANUAL-ADMIN-WEB.md`** (editar y publicar) y **`MANUAL-ATENCION.md`** (atender solicitudes).

Hoy todo vive en la **versión de prueba**, sin buscadores. Abrirla al público lo decide Juan. Lo que va entre «» es el
nombre exacto que sale en la pantalla.

## 1. La web, sección por sección

Todas las páginas tienen el mismo marco:

- **Arriba:** el nombre y el cargo del gobernador. Al lado van los dos botones de la gente: **«Hacer un reporte»** (en
  naranja) y **«Consultar mi solicitud»**. En el teléfono, las secciones se abren con **«Menú»** y se cierran con
  «Cerrar». En la computadora van en una barra, debajo del nombre.
- **El menú:** «Inicio», «El gobernador», «Gestión y obras», «Noticias», «Reporte Bernal», «Atención ciudadana»,
  «Transparencia» y «Canales». Se cambia en «Ajustes del sitio» → «Navegación». En la versión publicada no sale
  «Gestión y obras» (§3.2).
- **Abajo, el pie:** los mismos dos botones. Debajo, el aviso «Esto no es un servicio de emergencias. Ante una
  emergencia o si una vida está en peligro, llame a los servicios de emergencia.». Después vienen «Secciones» (el menú
  otra vez) y «Canales oficiales», con el enlace «Cómo identificar las cuentas oficiales». Al final van las páginas
  legales y «Acceso del personal», que lleva al panel.
- **La franja de la versión de prueba:** sale fija arriba de todo y se repite al final del pie. No se puede cerrar
  (§3.3).

Cada sección de abajo dice qué ve la persona y de qué pantalla del panel sale. También dice qué pasa cuando no hay
datos. El público nunca ve un espacio vacío ni un «Por completar»: eso solo sale en la «Vista previa» del panel.

### 1.1 Inicio (`/`)

**Qué ve la persona.** La portada se arma por bloques. En la versión de las pruebas salen en este orden:

1. **El título grande:** el nombre del gobernador y, debajo, su cargo. Si hay foto, va al lado.
2. **«Atención ciudadana»:** el botón grande «Hacer un reporte» y cuatro más: «Hacer una petición», «Enviar una
   observación», «Hacer una denuncia» y «Consultar mi solicitud». Debajo dice «También puede enviar sugerencias y
   reconocimientos.» y repite el aviso de emergencias.
3. **«Gestión en cifras»:** cada cifra con su fuente y su fecha.
4. **«Casos atendidos»:** los tres últimos, con «Ver todos los casos».
5. **«Gestión y obras»:** las tres últimas obras, con «Ver todas las obras».
6. **«Reporte Bernal»:** la última emisión, con «Ver todas las emisiones» y el enlace al canal de YouTube.
7. **«Últimas publicaciones»:** la noticia más nueva en grande y tres más, con «Ver todas las noticias».
8. **«Avisos de servicio»:** solo los vigentes, cada uno con «Actualizado el …» y «Vigente hasta el …».
9. **«Canales oficiales»:** las cuentas, con «Cómo identificar las cuentas oficiales».

**De dónde sale.** Qué bloques salen, y en qué orden, se decide en «Web» → «Páginas» → «Inicio»
(`MANUAL-ADMIN-WEB.md` §6). Lo de adentro de cada bloque sale de su propia pantalla:

| Bloque | Lo llena |
|---|---|
| El título grande | El bloque «Portada con foto» de la misma página |
| «Gestión en cifras» | «Indicadores» |
| «Casos atendidos» | La coordinación, desde cada caso en «Atención» |
| «Gestión y obras» | «Obras y acciones» |
| «Reporte Bernal» | «Reporte Bernal» (los episodios) |
| «Últimas publicaciones» | «Noticias y comunicados» |
| «Avisos de servicio» | «Avisos de servicio» |
| «Canales oficiales» | «Ajustes del sitio» |

**Sin datos.** Un bloque sin contenido no se dibuja. Sin foto, el título grande sale solo, a lo ancho. Una cifra sin
fuente nunca sale. Un aviso vencido deja de salir solo.

**En la versión publicada.** El título grande lleva el nombre y el cargo como los escribe la web oficial, con la foto
de su portada. Después vienen «Atención ciudadana», «Reporte Bernal» y «Últimas publicaciones». Siguen «Opinión» (dos
columnas) y la última edición del «Semanario El Informativo Táchira». Cierra «Canales oficiales». No salen «Gestión en
cifras», «Casos atendidos», «Gestión y obras» ni «Avisos de servicio».

### 1.2 El gobernador (`/gobernador`)

**Qué ve la persona.** Arriba, el título grande con el nombre y el cargo. Debajo, la biografía y la trayectoria, cuando
estén verificadas. Después, «Material para la prensa»: cada documento con «Ver el PDF», y el enlace «Ver todos los
documentos». Al final, «Última actualización» con su fecha.

**De dónde sale.** «Web» → «Páginas» → «El gobernador». El material sale de «Documentos», con la categoría «Material
para la prensa».

**Sin datos.** La biografía y la trayectoria son espacios «Por completar» hasta que lleguen verificadas: el público no
las ve. Sin documentos, no sale «Material para la prensa». Una página sin publicar dice «Página en preparación.».

**En la versión publicada.** La foto del gobernador va junto al título grande. Debajo salen «Biografía», «Elección y
toma de posesión» y «Condecoraciones», con una línea «Fuente:» que enlaza la web oficial. No sale «Material para la
prensa».

### 1.3 Gestión y obras (`/gestion`)

**Qué ve la persona.** Dos vistas de las mismas obras. «Obras» trae tarjetas con su estado («Anunciado», «En
ejecución» o «Concluido») y los filtros «Municipio», «Categoría» y «Estado», con el botón «Filtrar». «Línea de tiempo»
las ordena por mes y se filtra con «Desde» y «Hasta».

Cada obra tiene su ficha: «Descripción», «Registro fotográfico», «Ubicación», «Beneficiarios» y «Organismo
responsable». La «Inversión» y el «Avance» salen solo con su fuente. Siguen las fechas y la «Última actualización». Al
lado está el botón «Enviar una observación sobre esta obra».

**De dónde sale.** «Web» → «Obras y acciones».

**Sin datos.** «Aún no hay obras publicadas.». Con filtros sin resultado: «No hay obras con esos filtros.». Lo que le
falta a una ficha simplemente no sale.

**En la versión publicada.** No está en el menú: la web oficial no tiene obras que traer. La dirección `/gestion` sigue
abriendo y dice «Aún no hay obras publicadas.».

### 1.4 Noticias (`/actualidad`)

**Qué ve la persona.** Arriba, el buscador: «Buscar», «Tipo» y el botón «Buscar». Debajo, los temas más usados, cada
uno como un botón. La noticia más nueva sale en grande y las demás en lista. Al final está la puerta al «Semanario El
Informativo Táchira» («Ediciones en PDF.»).

- En «Tipo» se elige «Noticia», «Comunicado», «Opinión» o «Entrevista».
- Cada nota tiene su página con su fecha, su firma, su foto y su texto. Al final van las «Fuentes» y los temas, y el
  botón «Enviar una observación». Debajo salen «Noticias relacionadas».
- Una columna de «Opinión» dice «Observaciones sobre este artículo» y muestra «Otros artículos de opinión».
- El Semanario tiene su página, `/actualidad/semanario`, con cada edición y su «Ver el PDF».

**De dónde sale.** «Web» → «Noticias y comunicados». El Semanario sale de «Documentos», con la categoría «Semanario».

**Sin datos.** «Aún no hay noticias publicadas.». Una búsqueda sin resultado: «No hay resultados para esa búsqueda.».
Sin ediciones: «Aún no hay ediciones publicadas.». Los temas salen solo cuando hay más de uno.

**En la versión publicada.** Las 48 noticias más nuevas y 8 columnas de «Opinión» de la web oficial, con sus fotos. Los
temas son las secciones de la web oficial. Cada nota termina con «Publicado originalmente en …» y la dirección de la web
oficial. El Semanario trae su PDF.

### 1.5 Reporte Bernal (`/reporte-bernal`)

**Qué ve la persona.** Arriba, el nombre del programa y una línea que dice que es el programa semanal del gobernador.
Debajo va el enlace al canal de YouTube. Primero sale la «Última emisión» y después las «Emisiones anteriores». El video
carga solo cuando la persona lo toca.

**De dónde sale.** «Web» → «Reporte Bernal» (un episodio por emisión). El canal se cambia en «Ajustes del sitio» →
«Canal de YouTube del programa».

**Sin datos.** Una emisión sin video sale con su título y su fecha, sin un reproductor vacío. Sin emisiones, la página
lleva al canal: «Las emisiones de Reporte Bernal se publican en el canal oficial de YouTube.», con el botón «Ver las
emisiones en YouTube». Sin canal, dice «Aún no hay emisiones publicadas.».

**En la versión publicada.** Las emisiones del canal oficial, con su video. Si YouTube no respondió al construir, salen
las de la copia anterior.

### 1.6 Atención ciudadana (`/atencion`)

**Qué ve la persona.** Arriba, un menú propio: «Información general», «Nueva solicitud», «Consultar mi solicitud» y
«Casos atendidos». Después vienen los botones «Nueva solicitud» y «Consultar mi solicitud», con el aviso de emergencias
debajo. También sale un «Ejemplo de comprobante». Más abajo, por partes:

- «Tipos de solicitud»: los seis, cada uno abre el formulario en su tipo.
- «Procedimiento»: cuatro pasos, de «Envío de la solicitud» a «Seguimiento».
- «Estados de una solicitud»: lo que quiere decir cada estado.
- «Denuncias confidenciales», con el botón «Hacer una denuncia».
- «Preguntas frecuentes».
- «Otros canales».
- «Casos atendidos», con el botón «Ver casos atendidos».

Sus otras páginas:

- `/atencion/nueva`: el formulario (§2.1).
- `/atencion/consultar`: la consulta (§2.4).
- `/atencion/atendido`: los casos atendidos (§2.7).

**De dónde sale.** Los textos de esta página son fijos de la app. Lo que sí se cambia desde el panel:

- Las preguntas: «Web» → «Preguntas frecuentes», grupo «Atención ciudadana».
- Los contactos: «Ajustes del sitio» → «Contactos institucionales». Solo salen los marcados «Verificado».
- Los casos: los publica la coordinación desde «Atención».

En «Web» → «Páginas» hay una página «Atención ciudadana», pero hoy la web no la usa.

**Sin datos.** Sin preguntas, no sale esa parte. Sin contactos verificados, «Otros canales» muestra «Canal de atención»:
«Las solicitudes se reciben únicamente a través de este sitio.», seguido del aviso contra estafas. Sin casos publicados,
no salen «Casos atendidos» ni su botón del menú.

**En la versión publicada.** Siete preguntas frecuentes sobre cómo funciona la atención: son de la plataforma, no de la
web oficial. No hay casos publicados, así que «Casos atendidos» no sale en el menú.

### 1.7 Transparencia (`/transparencia`)

**Qué ve la persona.** La página se llama «Documentos y cifras» y tiene dos partes:

- «Documentos»: el buscador («Buscar», «Categoría» y el botón «Buscar») y la lista. Cada documento tiene su «Ver el
  PDF».
- «Estadísticas de atención ciudadana»: se elige el período («Desde el inicio», «Este año» o «Últimos 30 días»). Salen
  «Recibidas», «Resueltas», «Pendientes», «Vencidas», «Primera respuesta» y «Resolución». Siguen las cuentas por tipo,
  por estado, por categoría y por municipio. Debajo están las «Definiciones».

**De dónde sale.** Los documentos, de «Web» → «Documentos» (todas las categorías). Las cifras las cuenta la plataforma
con las solicitudes de Atención: nadie las escribe.

**Sin datos.** «Aún no hay documentos publicados.». Sin solicitudes en el período: «No hay solicitudes en este
período.». Las denuncias no cuentan por categoría ni por municipio.

**En la versión de prueba.** Antes de la primera cifra dice «Cifras de ejemplo de la versión de prueba, calculadas con
solicitudes inventadas.». Pasa en las dos versiones: las solicitudes siempre son inventadas.

### 1.8 Canales (`/canales`)

**Qué ve la persona.** «Canales oficiales», con una tarjeta por cuenta. La cuenta confirmada lleva la marca
«verificada». Si están verificados, salen también el «Portal institucional» y los «Contactos institucionales». Después
viene «Cómo identificar las cuentas oficiales», con cuatro consejos. Uno es el aviso contra estafas: «Ningún funcionario
de la Gobernación solicita dinero, claves, códigos de verificación ni datos bancarios. Desconfíe de quien lo haga en su
nombre.». Al final va el aviso de emergencias.

**De dónde sale.** «Ajustes del sitio»: «Cuentas en redes», «Canal de YouTube del programa», «Canal de WhatsApp»,
«Portal institucional» y «Contactos institucionales».

**Sin datos.** «Las cuentas oficiales se publicarán próximamente.». En producción salen solo las cuentas activas y
verificadas. En la versión de prueba salen también las que faltan por confirmar, con una sola línea arriba: «Estas
cuentas están en proceso de confirmación.» o «Las cuentas sin la marca de verificación están en proceso de
confirmación.».

**En la versión publicada.** Una cuenta sale «verificada» solo si la enlaza el canal de YouTube del gobernador o la
portada de la web oficial.

### 1.9 Las páginas legales

Son tres y salen en el pie:

- «Aviso de privacidad» (`/aviso-de-privacidad`).
- «Condiciones de participación» (`/condiciones-de-participacion`).
- «Accesibilidad» (`/accesibilidad`).

**Qué ve la persona.** El texto por partes y, al final, «Texto sujeto a revisión jurídica.». En «Accesibilidad» dice
«Texto sujeto a revisión.». Debajo va la «Última actualización».

**De dónde sale.** «Web» → «Páginas», cada una por su nombre. Las tres esperan la consulta legal: tienen espacios «Por
completar antes de publicar: …».

**Sin datos.** Los espacios «Por completar» no salen. Una página sin publicar dice «Página en preparación.».

### 1.10 Una dirección que no existe

**Qué ve la persona.** «Esta página no existe» y «La dirección puede estar incompleta o la página ya no está
disponible.». Debajo están los botones «Ir al inicio» y «Ver noticias», y el enlace «Consultar mi solicitud».

- Una dirección vieja de la web de WordPress lleva sola a la nueva cuando tiene su redirección («Redirecciones»,
  `MANUAL-ADMIN-WEB.md` §14).
- Si la base de datos no responde, la página dice «No se pudo cargar la página», con «Intentar de nuevo» e «Ir al
  inicio».

## 2. El recorrido del ciudadano

La persona no necesita cuenta ni contraseña. Todo funciona en el teléfono. La web le habla de usted. En su consulta,
cada respuesta sale como «Respuesta de Atención ciudadana». Así lo vive quien escribe.

### 2.1 Hacer un reporte (los cuatro pasos)

1. Toca **«Hacer un reporte»**, arriba en naranja. Se abre el formulario con el título «Hacer un reporte» y la línea «El
   formulario tiene cuatro pasos. No necesita registrarse.». En la versión de prueba, arriba dice «Versión de prueba. No
   escriba datos reales.».
2. **Paso 1, «Tipo de solicitud».** En «Seleccione una opción» ya está marcado «Reporte». Elige la «Categoría», por
   ejemplo «Vialidad». Toca **«Siguiente»**.
3. **Paso 2, «Lugar».** Elige el «Municipio»: en un reporte es obligatorio. Si quieres, escribe «Parroquia, localidad o
   sector» y «Punto de referencia». En «Ubicación exacta (opcional)», «Usar mi ubicación» o «Marcar en el mapa» guardan
   el punto con el permiso de la persona. «Quitar ubicación» lo borra. Toca **«Siguiente»**.
4. Si ya hay reportes abiertos del mismo problema cerca, sale **«Reportes parecidos»**: «Hay N reportes abiertos del
   mismo problema cerca de ese lugar.». **«Apoyar este reporte»** suma el apoyo (§2.2). **«No, es otro problema»** sigue
   con el reporte propio.
5. **Paso 3, «Detalle de la solicitud».** Escribe el «Título» y la «Descripción». La «Fecha del hecho» es opcional. En
   «Fotos o documentos» van hasta 3 archivos JPG, PNG, WebP o PDF. Toca **«Siguiente»**.
6. **Paso 4, «Contacto y envío».** Arriba sale el resumen («Tipo», «Lugar» y «Detalle»), con «Cambiar» en cada fila.
   En «Datos de contacto (opcional)», marca «Enviar como anónimo» o llena «Nombre», «Correo», «Teléfono» y «Medio de
   contacto preferido». Con un nombre aparece la casilla «Autorizo que se publique mi nombre si mi solicitud aparece en
   «Casos atendidos».». Marca «Leí el aviso de privacidad (se abre en otra pestaña) y acepto el uso de mis datos para
   atender esta solicitud.».
7. Toca **«Enviar»**. Sale «Solicitud recibida», con el comprobante (§2.3).

Para tener en cuenta:

- «Atrás» vuelve al paso anterior. En la barra de pasos («Tipo», «Lugar», «Detalle» y «Contacto»), un paso terminado
  se puede tocar para volver.
- Lo escrito se guarda en esa pestaña. Si la página se recarga, dice «Se recuperó lo que había escrito en esta
  pestaña.», con «Empezar de nuevo».
- Sin señal dice «Sin conexión. Lo escrito queda guardado en este dispositivo. Si toca «Enviar», se enviará cuando
  vuelva la señal.».
- Los demás tipos usan el mismo formulario: «Hacer una petición», «Enviar una observación», «Enviar una sugerencia»,
  «Enviar un reconocimiento» y «Hacer una denuncia». En una observación, una sugerencia o un reconocimiento, el paso 2
  se llama «Lugar (si aplica)» y se puede saltar.

**Una observación sobre una noticia o una obra:**

1. Al final de una noticia, toca «Enviar una observación». En la ficha de una obra, «Enviar una observación sobre esta
   obra».
2. El formulario abre en «Observación». Arriba dice «Sobre esta noticia» o «Sobre esta obra», con su título. «Quitar»
   la desliga.
3. Sigue los cuatro pasos de arriba.

### 2.2 Apoyar un reporte

1. En «Reportes parecidos», toca **«Apoyar este reporte»**.
2. El «Comentario» es opcional: solo lo lee el personal de atención.
3. Los «Datos de contacto (opcional)» y el aviso de privacidad son los mismos del paso 4.
4. Toca **«Enviar apoyo»**. Sale «Apoyo registrado», con un código y una clave propios.

Un apoyo no lleva archivos. Los datos de las otras personas no se muestran. En el panel, el caso cuenta el apoyo y lo
que escribió la persona dice «(solo el equipo)».

### 2.3 El comprobante: código y clave

- El título dice «Solicitud recibida». El recuadro «Comprobante · Atención ciudadana · Gobernación del estado Táchira»
  trae el «Código» (por ejemplo `AC-2026-K7QM2H`) y la «Clave» (cuatro grupos de cuatro letras y números).
- Debajo: «Guárdelos ahora. La clave se muestra una sola vez y no se puede recuperar. Sin ella no es posible consultar
  la solicitud. No la comparta.».
- Hay botones para guardarlo: «Descargar comprobante (PDF)», «Imprimir» y «Copiar código y clave».
- Los archivos suben después, uno por uno, en «Archivos adjuntos». Uno que falla tiene su botón «Reintentar».
- «Próximos pasos» cuenta lo que sigue. Al final están «Consultar mi solicitud» y «Nueva solicitud».
- Si la persona no guardó el comprobante, «Nueva solicitud» pregunta antes: «Antes de continuar, guarde su código y su
  clave. No se pueden recuperar.», con «Sí, ya los guardé».

Nadie del panel tiene la clave: la base guarda solo una huella que no se puede revertir. Si la persona dejó un correo y
el envío de correos está configurado, le llega el código, nunca la clave. En la versión de prueba no sale ningún correo.

### 2.4 Consultar la solicitud

1. Toca **«Consultar mi solicitud»**. Está arriba, en el pie y en Atención ciudadana.
2. Escribe el «Código» y la «Clave» tal como están en el comprobante. Toca **«Consultar»**.
3. Sale «Su solicitud» con el código. Debajo van el tipo, la categoría, el municipio y el día en que se envió.
4. El recuadro «Estado» dice en qué va y qué quiere decir.
5. Siguen «Datos de su solicitud» y el «Historial de la solicitud», con las respuestas de «Atención ciudadana» y lo que
   le pidieron.
6. Al terminar, toca **«Salir»**. La consulta se cierra sola a los 30 minutos.

Para tener en cuenta:

- Un código o una clave equivocados dan siempre «No hay ninguna solicitud con esos datos.».
- La clave no se recupera. Lo dice la parte «Pérdida de la clave».
- Los estados que lee la persona son «Recibida», «En revisión», «Asignada», «En atención», «Requiere información»,
  «Derivada», «Resuelta», «Cerrada» y «No procede».
- Si hay otros reportes del mismo problema, lo dice: «Hay N reportes más del mismo problema.».
- Cuando la marcan «Resuelta», sale «La solicitud fue marcada como resuelta», con la pregunta «¿Se resolvió el
  problema?». La persona elige «Sí, se resolvió» o «No, todavía no» y toca «Responder». Con «No, todavía no» se le pide
  «¿Qué falta por resolver?» y la solicitud vuelve a atención.

### 2.5 Agregar información

1. En la consulta, baja hasta **«Agregar información»**. Si le pidieron un dato, esa parte se llama «Responder la
   solicitud de información» y el estado dice «Requiere información».
2. Escribe en «Información adicional» (o en «Su respuesta»). Si hace falta, agrega hasta 3 fotos o documentos.
3. Toca **«Enviar información»**. Sale «Información enviada al personal de atención.».

Si la solicitud esperaba ese dato, vuelve sola a «En revisión». Una solicitud «Cerrada» o «No procede» ya no recibe
información: la persona envía una nueva.

### 2.6 Hacer una denuncia

1. Toca **«Hacer una denuncia»**: está en la portada y en «Denuncias confidenciales» de Atención ciudadana. También se
   puede elegir «Denuncia» en el paso 1.
2. En el paso 1 sale el aviso: «Las denuncias son confidenciales. Solo las leen el personal encargado de denuncias y la
   coordinación de atención. Su contenido nunca se publica. Si se trata de un delito, acuda también a las autoridades
   competentes.».
3. El paso 2 se llama «Lugar aproximado». Pide solo el «Municipio» y la «Parroquia, localidad o sector», y dice «En una
   denuncia se indica solo el municipio y el sector, sin dirección exacta ni ubicación en el mapa.».
4. Los pasos 3 y 4 son como en un reporte. Toca **«Enviar»**.

El comprobante y la consulta repiten el aviso de las denuncias. Los correos nunca dicen «denuncia». En el panel la leen
solo el operador de denuncias y la coordinación. En «Casos atendidos» sale solo «Denuncia atendida en el municipio …».

### 2.7 Los casos atendidos

1. En Atención ciudadana, toca **«Casos atendidos»**. El botón sale solo cuando hay alguno publicado.
2. La página dice «Solicitudes resueltas. Por privacidad se publican solo las iniciales de cada persona, salvo que
   autorice su nombre. De las denuncias solo se indica el municipio.».
3. Elige «Municipio» o «Categoría» y toca **«Filtrar»**. «Quitar filtros» vuelve a todos.
4. Los casos van agrupados por mes. Cada uno dice su tipo, su categoría y su municipio. Siguen el resumen, el nombre o
   las iniciales y «Resuelta el …».

Los publica la coordinación desde cada caso, sin datos de la persona (`MANUAL-ATENCION.md` §12). Sin casos, la página
dice «No hay casos publicados en este momento.», con el botón «Nueva solicitud».

## 3. La versión de prueba

### 3.1 Dos versiones

- **La publicada en Vercel** (su enlace está en `README.md`) muestra en la web el contenido real de la web oficial. Se
  arma al construir: la construcción lee la web oficial, el canal de YouTube y el Semanario. Guarda una copia fuera del
  repositorio, que es público.
- **La de las pruebas y la local** (`npm run dev` o `npm start` en una computadora) es toda inventada y lleva «(demo)».
  Las capturas del PDF de esta guía salen de esta versión.

### 3.2 Qué es real, qué es inventado y qué no sale

En la versión publicada:

- **Real, de la web oficial:** el nombre, el cargo y la foto de la portada. La biografía, «Elección y toma de posesión»
  y «Condecoraciones», con su fuente. Las 48 noticias más nuevas y 8 de «Opinión», con sus fotos. El Semanario. Las
  emisiones del Reporte Bernal, del canal de YouTube.
- **Inventado:** las personas del panel. Las 60 solicitudes y los tres comprobantes de prueba (§3.6). Las cifras de
  «Transparencia» salen de esas solicitudes, y la página lo dice.
- **De la plataforma:** las siete preguntas frecuentes de Atención ciudadana.
- **No sale:** en la portada, «Gestión en cifras», «Casos atendidos», «Gestión y obras» y «Avisos de servicio». En el
  menú, «Gestión y obras». En «El gobernador», «Material para la prensa».

En el panel, cada nota traída lleva arriba el aviso «Traído de la web vieja».

### 3.3 La franja

- Sale arriba de cada página y al final del pie. No se puede cerrar.
- En la versión publicada dice siempre «Versión de prueba en revisión. No es el sitio oficial.», diga lo que diga el
  ajuste.
- En la versión inventada dice «Versión de prueba. El contenido es de ejemplo.». Se cambia en «Ajustes del sitio» →
  «Aviso de la versión de prueba».
- Los formularios de Atención avisan aparte: «Versión de prueba. No escriba datos reales.».

### 3.4 Lo que no se cambia en la versión publicada

- Arriba de «Ajustes del sitio» dice «Esta demostración muestra el contenido de la web oficial: el nombre, el cargo, las
  cuentas, los contactos y la franja de aviso quedan como están.».
- Si alguien guarda uno de esos ajustes, sale «En esta versión de prueba con el contenido de la web oficial, el nombre,
  las cuentas, los contactos y la franja de aviso no se cambian.».
- «Navegación» y «Pie de página» sí se cambian.
- La razón: cualquiera puede entrar a la demo, y nadie debe poder hacerla pasar por la web oficial.

### 3.5 «Entrar como…» y los usuarios de prueba

1. En la web, toca «Acceso del personal», al final del pie. También sirve abrir `/entrar`.
2. En la tarjeta «Versión de demostración», baja hasta «La web y la atención ciudadana».
3. Toca un rol («Entrar →»). Entras directo, sin código ni doble factor: es un atajo solo para probar.

| En la lista | Correo | Entra a |
|---|---|---|
| Editor de la web | `web.editora@demo.test` | «La web» |
| Aprobador de la web | `web.aprobador@demo.test` | «La web» |
| Coordinador de atención | `atencion.coordinacion@demo.test` | «Atención ciudadana», la bandeja |
| Responsable de área · Servicios públicos | `atencion.servicios@demo.test` | «Atención ciudadana», solo su área |
| Responsable de área · Vialidad y transporte | `atencion.vialidad@demo.test` | «Atención ciudadana», solo su área |
| Operador de denuncias | `atencion.denuncias@demo.test` | «Atención ciudadana», solo denuncias |
| Consulta y auditoría | `consulta@demo.test` | «Atención ciudadana», para leer |
| El jefe (en la lista del equipo, más arriba) | `jefe@demo.test` | Su «Inicio» |
| Administración (en la lista del equipo, más arriba) | `admin@demo.test` | «Hoy» |

Las personas son inventadas. Qué tocar con cada una está en `DEMO.md`. Fuera de la demostración nadie entra así: cada
persona usa su correo, el código que le llega por correo y Google Authenticator.

### 3.6 Los comprobantes de prueba

Se abren en «Consultar mi solicitud» con el año en curso (hoy, `AC-2026-…`). Son iguales en todos los servidores.

| Código | Clave | Qué es |
|---|---|---|
| `AC-<año>-DEMR01` | `K7QM-2HXP-9WRT-4BNE` | Un reporte de un hueco que está «En atención», con tres apoyos y un reporte repetido unido |
| `AC-<año>-DEMR02` | `R3PS-W8N2-DEMV-7QKA` | Un reporte ya resuelto: la consulta dice «Resuelta» y pregunta «¿Se resolvió el problema?» |
| `AC-<año>-DEMR03` | `H4JX-5ZTB-9CNF-W2YE` | Un reporte que «Requiere información»: se responde en «Responder la solicitud de información» |

### 3.7 Lo que se borra y lo que vuelve

- La base de la demostración vive en la memoria del servidor. Si el servidor se reinicia (en Vercel pasa solo), vuelve
  a lo sembrado. En la versión publicada, vuelve al contenido real de la última construcción.
- Cada servidor de Vercel tiene su copia. Lo sembrado es igual en todos. Lo que alguien crea, como una noticia o una
  solicitud nueva, vive solo en el servidor donde se hizo: con otra cuenta o en otro teléfono puede no verse. Para
  probar entre roles, lo más seguro es lo sembrado.
- El contenido real es una foto de la web oficial tomada al construir. Lo que cambie allá sale en la próxima
  construcción. Si la web oficial no responde, se usa la foto anterior, si tiene menos de una semana. Sin ninguna, la
  demo sale con el contenido inventado.
- Ningún correo sale: todos quedan en Ajustes → Buzón de correos.
- En una computadora, `LOCAL_DATA_DIR=./.data npm run dev` guarda todo entre reinicios (`README.md`).

## 4. Quién hace qué

Cada persona entra con su propio usuario y con doble factor: el código que llega por correo y Google Authenticator. No
hay contraseñas. Administración da los roles en Ajustes → Equipo → «Invitar a alguien», en el grupo «Web y atención
ciudadana (siempre con doble factor)». Estos roles no tienen 360 ni Mensajes: su pantalla es la de la web o la de
atención.

| Rol | Menú | En una línea |
|---|---|---|
| Editor de la web | «Web» | Escribe y envía a aprobación. No publica |
| Aprobador de la web | «Web» | Revisa, publica, programa y archiva. Cambia los ajustes del sitio |
| Coordinador de atención | «Atención» | Todo lo que llega, denuncias también |
| Responsable de área | «Atención» | Lo de su área. Nunca denuncias |
| Operador de denuncias | «Atención» | Solo las denuncias |
| Consulta y auditoría | «Atención» | Lee sin contactos ni denuncias |
| El jefe | «Web» y «Atención» | Publica la web. Lee la atención y sus cifras |
| Administración | «Web» y «Atención» | Personas, áreas, plazos y ajustes. Nunca lee un caso ni publica |

### 4.1 Editor de la web

- **Entra a** «La web». Ve las pestañas «Inicio», «Por aprobar» y «Biblioteca».
- **Ve** todo el contenido, borradores incluidos.
- **Hace:** crea un contenido («Nueva noticia», «Crear borrador») y lo escribe («Guardar borrador»). Sube fotos y PDF a
  la «Biblioteca», cada foto con su «Texto alternativo». Mira la «Vista previa» y toca «Enviar a aprobación». Puede
  «Volver a esta versión» en el borrador.
- **No hace:** no publica. No entra a «Ajustes del sitio» ni a «Redirecciones». No ve las solicitudes de la gente.

### 4.2 Aprobador de la web

- **Entra a** «La web». Además de las pestañas del editor, tiene «Ajustes del sitio» y «Redirecciones».
- **Hace** todo lo del editor. En «Por aprobar» mira «Qué cambia si lo publicas» y decide: «Publicar ahora»,
  «Programar» o «Devolver con comentario». También «Archivar» y «Desarchivar». Cambia la dirección de lo ya publicado.
- **Le llega** el aviso «Hay contenido de la web por aprobar».
- **No hace:** no ve las solicitudes de la gente.

### 4.3 Coordinador de atención

- **Entra a** «Atención ciudadana», en la «Bandeja». Sus pestañas: «Bandeja», «Tablero», «Mapa», «Cifras», «Áreas y
  plazos» (para leer) y «Respuestas guardadas».
- **Ve** todo lo que llega, las denuncias también, con el contacto de la persona.
- **Hace:** asigna a cualquier área. Pone la prioridad y la fecha comprometida. Une casos iguales y corrige el tipo o la
  categoría. Modera y borra un contacto si la persona lo pide. Publica en «Casos atendidos». Exporta el CSV, con o sin
  contacto. Arma las «Respuestas guardadas».
- **No hace:** no cambia las áreas ni los plazos: eso es de Administración.

### 4.4 Responsable de área

- **Entra a** «Atención ciudadana». Sus pestañas: «Bandeja», «Tablero», «Mapa» y «Respuestas guardadas».
- **Ve** lo de sus áreas y lo que le asignen. Nunca una denuncia. Un caso de otra área no existe para él.
- **Hace:** responde a la persona y escribe notas internas. Cambia el estado y sube evidencias. Ve el contacto. Asigna
  dentro de su área o se queda el caso con «Tomar el caso».
- **No hace:** no cambia el área, la prioridad ni la fecha: eso lo pide a la coordinación. No ve las «Cifras» ni
  exporta.

### 4.5 Operador de denuncias

- **Entra a** «Atención ciudadana», con las mismas pestañas del responsable.
- **Ve** solo las denuncias. Su mapa está vacío: una denuncia nunca lleva el punto exacto.
- **Hace** lo mismo que un responsable. En las denuncias, además, pone el área, la prioridad y la fecha, y modera.

### 4.6 Consulta y auditoría

- **Entra a** «Atención ciudadana». Sus pestañas: «Bandeja», «Tablero», «Mapa», «Cifras», «Áreas y plazos» y
  «Registro».
- **Ve** todo menos las denuncias, que cuentan solo en los totales. Nunca ve un contacto.
- **Hace:** solo lee. Mira las «Cifras» y el «Registro». Descarga el CSV, siempre sin contactos.

### 4.7 El jefe

- **Entra a** su «Inicio». En el menú tiene «Web» y «Atención», además de lo suyo (en el teléfono, en «Más»).
- **En «Web»** hace lo mismo que el aprobador: publica, programa, devuelve y archiva. El aviso de «Por aprobar» no le
  llega: lo ve en la lista.
- **En «Atención»** es como auditoría: lee todo menos las denuncias, sin contactos, y mira las «Cifras». No exporta.

### 4.8 Administración

- **Entra a** «Hoy». Su «Web» abre «Ajustes del sitio». Su «Atención» muestra «Áreas y plazos» y «Registro de
  atención».
- **En «Web»:** lee todo, borradores incluidos. Cambia «Ajustes del sitio» y «Redirecciones». Nunca escribe ni publica
  contenido.
- **En «Atención»:** arma las áreas y dice quién está en cada una. Pone el área y los días de cada categoría, y los
  plazos. Lee el «Registro». Nunca abre un caso.
- **En Ajustes → Equipo:** invita a cada persona y le da su rol. Si alguien perdió el teléfono, usa «Reiniciar doble
  factor».
- La misma cuenta de Administración no puede ser aprobador de la web ni tener un rol de atención. Sí puede ser editor
  de la web.

## 5. Cómo se edita la web (5 pasos)

1. **«Web»** → el tipo de contenido (por ejemplo «Noticias y comunicados») → «Nueva noticia» → «Título» → «Crear
   borrador».
2. Escribe y toca **«Guardar borrador»**. Las fotos van desde la biblioteca, siempre con su **texto alternativo**.
3. **«Vista previa»** para verlo como saldrá → **«Enviar a aprobación»**.
4. Quien aprueba entra a **«Por aprobar»**, mira **«Qué cambia si lo publicas»** y decide: **«Publicar ahora»**,
   **«Programar»** (hora del Táchira) o **«Devolver con comentario»**.
5. Si algo salió mal: **«Archivar»** lo saca al momento, y **«Versiones»** → «Volver a esta versión» recupera lo de
   antes.

La portada y las páginas se arman por **bloques** («Agregar un bloque», «Subir», «Bajar», «Ocultar»). Detalle:
`MANUAL-ADMIN-WEB.md`.

## 6. Cómo se atiende lo que llega (5 pasos)

1. **«Atención»** → **«Bandeja»** (o «Tablero»). Lo nuevo está en «Por revisar».
2. Abre el caso, léelo y pásalo a **«En revisión»**. Asígnalo con **«Guardar asignación»** o «Tomar el caso».
3. **«Escribir»** → **«Respuesta a la persona»** para decirle que ya la tienen. Escríbele de usted, como le habla la
   web. Lo que es solo para ustedes va en **«Nota interna»**: nunca las mezcles.
4. Trabájalo («En atención»). Si falta un dato, **«Pedir más información»**. Al terminar, **«Subir evidencia»**.
5. **«Resuelto»** con su justificación. La persona confirma desde su consulta; después, **«Cerrado»**. La coordinación
   publica en **«Casos atendidos»** sin datos de la persona.

Detalle (estados, motivos, denuncias, cifras, CSV y moderación): `MANUAL-ATENCION.md`.

## 7. Lo que nunca se hace

- Publicar sin aprobación, o publicar datos inventados (biografía, teléfonos, cuentas, cifras sin fuente).
- Subir a la biblioteca de la web (que es pública) fotos o archivos de la gente que escribe a Atención.
- Contar en público algo de una denuncia, o el nombre de alguien sin su permiso.
- Prometer fechas, plazos o una atención de emergencia.
- Copiar el contacto de una persona fuera de su caso.

## 8. Dónde está el detalle

- Qué tocar con cada usuario de prueba y lo sembrado: `DEMO.md`.
- Las copias de seguridad: `COPIAS-Y-RECUPERACION.md`.
- La salida a producción: `PLAN-MIGRACION-Y-PRODUCCION.md`.
- Lo que falta para abrir la web: `PENDIENTES.md`.
