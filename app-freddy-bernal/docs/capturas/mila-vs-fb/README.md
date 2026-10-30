# Redes: la referencia y FB, lado a lado

Capturas de la plantilla limpia de la referencia (sin su contenido) y de la demo de FB, todo inventado.

## Cómo se hicieron
- **Referencia:** solo su plantilla limpia (nunca su versión con contenido), con textos de prueba neutros escritos por
  nosotros («Post de prueba…», «Texto de ejemplo…») e imágenes abstractas. Están recortadas al tamaño de la ventana (el
  feed, entero) y con todo lo de su marca **tapado** en gris: su logotipo, el pie con su lema, el lema que la plantilla
  trae bajo «Reels» y «YouTube», una línea del tablero escrita para su negocio y la foto de perfil del feed (lleva su
  logotipo). No se copió nada de su contenido, de su marca ni de sus reglas de copy. Ninguna captura se quedó fuera:
  todas se pudieron limpiar.
- **FB:** `npm run capturas` (`scripts/capturas-fb.mts`) sobre la demo, con datos inventados, entrando como Redes y como
  el jefe, a 1366×900 (con ratón) y a 360×780 (como un teléfono: con el dedo, sin ratón). Abre diálogos y los cierra; no guarda ni cambia nada. Los consejos de la pantalla y
  el aviso de la demo se dan por vistos para que no tapen la escena.
- Archivos: `NN-escena-referencia-1366.jpg`, `NN-escena-fb-1366.jpg` y lo mismo con `-360`.
- Mensajes no está en la referencia: en FB son canales que arma el jefe, con el jefe en todos y sin aviso (D-79).

## Lo distinto a propósito, en general
- Menú y textos en español de Venezuela; cada rol ve su menú. El jefe y Redes ven Redes; administración, Ajustes.
- Los estados se calculan (Borrador, En revisión, Programado, Publicado); no hay selector. Una aprobada sin publicar dice «En revisión · ✓ Lista».
- «Revisado y listo para publicar» es la aprobación del jefe, en la base. «Revisar» abre la sala del jefe y vuelve a la tarjeta.
- «Publicado» es «Ya lo publiqué», con enlace por red y captura. Nada se publica solo (sin Metricool, `PUBLISHING_ENABLED=false`).
- Una sola lista de meses para secciones y feed; el feed numera el #1 abajo a la derecha.
- Cada cambio se guarda solo (sin «Guardar cambios», deshacer ni historial de guardado); lo escrito se queda en el teléfono hasta que hay señal.
- El rol lo da la base de datos (RLS), no un selector en el navegador; Redes nunca ve fecha, hora ni dirección de un evento.
- Eliminar una pieza: solo el jefe, con doble factor, y no se borra de verdad (administración la recupera).
- La receptividad va en posts, reels y carruseles. Los avisos de cumplimiento los pone Redes.
- Drive «Organizar por orden del feed» está detrás de un interruptor apagado y nombra `01 - Post.jpg`, sin el título.

## Pareja por pareja

### 01 · Tablero de Redes (el jefe)

| Referencia | FB |
|---|---|
| <img src="01-tablero-referencia-1366.jpg" width="440" alt="Referencia, Tablero de Redes (el jefe), 1366 px"> | <img src="01-tablero-fb-1366.jpg" width="440" alt="FB, Tablero de Redes (el jefe), 1366 px"> |
| <img src="01-tablero-referencia-360.jpg" width="200" alt="Referencia, Tablero de Redes (el jefe), 360 px"> | <img src="01-tablero-fb-360.jpg" width="200" alt="FB, Tablero de Redes (el jefe), 360 px"> |

**Igual:** Una tabla de formatos contra las siete categorías: Revisados, Por revisar, Diseño aprobado, Diseño desaprobado, Publicado, Copy faltante e Imagen faltante. «Por mes» o «Por trimestre», con flechas para ir al anterior o al siguiente. Números grandes arriba (receptividad media, listas para publicar, programadas).

**Distinto:** Todo en español y con el menú de FB; arriba, la barra de secciones con sus contadores. La tabla suma Historias, YouTube y Fin de mes; en el teléfono la tabla se vuelve un bloque por formato. Abajo, actividad reciente con tiempos relativos («hace 5 min»), acciones rápidas y la búsqueda.

**Por qué:** La regla de la agenda: en Redes no hay horas ni fechas de eventos; «hace 5 min» no dice cuándo es nada. Celular primero: una tabla de 8 columnas no cabe en 360 px.

### 02 · Tablero por trimestre

| Referencia | FB |
|---|---|
| <img src="02-tablero-trimestre-referencia-1366.jpg" width="440" alt="Referencia, Tablero por trimestre, 1366 px"> | <img src="02-tablero-trimestre-fb-1366.jpg" width="440" alt="FB, Tablero por trimestre, 1366 px"> |
| <img src="02-tablero-trimestre-referencia-360.jpg" width="200" alt="Referencia, Tablero por trimestre, 360 px"> | <img src="02-tablero-trimestre-fb-360.jpg" width="200" alt="FB, Tablero por trimestre, 360 px"> |

**Igual:** La misma tabla sumando los tres meses del trimestre, con las flechas.

**Distinto:** El trimestre dice qué meses suma («Trimestre 1 · Mes 1 a Mes 3»).

**Por qué:** Los meses son una sola lista para todo Redes (D-67): el trimestre se arma con esa lista.

### 03 · Salto desde un número (Reels × Imagen faltante)

| Referencia | FB |
|---|---|
| <img src="03-salto-desde-un-numero-referencia-1366.jpg" width="440" alt="Referencia, Salto desde un número (Reels × Imagen faltante), 1366 px"> | <img src="03-salto-desde-un-numero-fb-1366.jpg" width="440" alt="FB, Salto desde un número (Reels × Imagen faltante), 1366 px"> |
| <img src="03-salto-desde-un-numero-referencia-360.jpg" width="200" alt="Referencia, Salto desde un número (Reels × Imagen faltante), 360 px"> | <img src="03-salto-desde-un-numero-fb-360.jpg" width="200" alt="FB, Salto desde un número (Reels × Imagen faltante), 360 px"> |

**Igual:** Cada número lleva a la primera pieza de esa casilla y la vez siguiente a la que sigue.

**Distinto:** Abre la tarjeta en su sección, con el mes en la dirección (?mes=) y el foco en el título; en el teléfono la abre aunque las demás estén plegadas.

**Por qué:** Así el enlace se puede compartir y el lector de pantalla llega directo a la pieza.

### 04 · Reels con la tarjeta abierta

| Referencia | FB |
|---|---|
| <img src="04-reels-referencia-1366.jpg" width="440" alt="Referencia, Reels con la tarjeta abierta, 1366 px"> | <img src="04-reels-fb-1366.jpg" width="440" alt="FB, Reels con la tarjeta abierta, 1366 px"> |
| <img src="04-reels-referencia-360.jpg" width="200" alt="Referencia, Reels con la tarjeta abierta, 360 px"> | <img src="04-reels-fb-360.jpg" width="200" alt="FB, Reels con la tarjeta abierta, 360 px"> |

**Igual:** Video 9:16, portada, referencia, las tomas («Lo que dice», «La acción», «Texto en pantalla»), copy y valoración del 1 al 10. Pestañas de mes con su cupo, «+ Nuevo mes», orden de la lista y «+ Nuevo reel».

**Distinto:** La cabecera es la misma en los seis formatos: miniatura, número en el feed, estado, día de creación, pilar y «En Feed · Mes 1 #N». El estado se calcula (Borrador, En revisión, Programado, Publicado): no hay selector libre. En una pieza aprobada, lo que sale (el título del Short, el video y la portada) se ve en lectura con «Editar (vuelve al jefe)». Las tomas son campos separados, no un texto libre.

**Por qué:** Nada sale sin la aprobación del jefe y lo que sale es lo aprobado (D-61, D-62). Campos separados se pueden revisar y guardar uno por uno, también sin señal.

### 05 · Posts con sus tarjetas

| Referencia | FB |
|---|---|
| <img src="05-posts-referencia-1366.jpg" width="440" alt="Referencia, Posts con sus tarjetas, 1366 px"> | <img src="05-posts-fb-1366.jpg" width="440" alt="FB, Posts con sus tarjetas, 1366 px"> |
| <img src="05-posts-referencia-360.jpg" width="200" alt="Referencia, Posts con sus tarjetas, 360 px"> | <img src="05-posts-fb-360.jpg" width="200" alt="FB, Posts con sus tarjetas, 360 px"> |

**Igual:** Texto del arte con su jerarquía (antetítulo, titular, sellos, letra pequeña), concepto visual, caption, CTA, hashtags, «Enlaces / referencias» y «Proporción» 4:5 o 1:1.

**Distinto:** Sin «Fecha de publicación» libre ni proporción 9:16. Las casillas de revisión pasan a una fila propia: «Enviar a aprobación» con lo que falta, y el jefe aprueba en su sala.

**Por qué:** Una fecha libre choca con la regla de la agenda y no la usaba nada; Instagram recorta el 9:16 en el perfil. «Revisado» es la aprobación del jefe en la base (D-63), no una casilla que cualquiera marca.

### 06 · Carrusel con sus láminas

| Referencia | FB |
|---|---|
| <img src="06-carrusel-referencia-1366.jpg" width="440" alt="Referencia, Carrusel con sus láminas, 1366 px"> | <img src="06-carrusel-fb-1366.jpg" width="440" alt="FB, Carrusel con sus láminas, 1366 px"> |
| <img src="06-carrusel-referencia-360.jpg" width="200" alt="Referencia, Carrusel con sus láminas, 360 px"> | <img src="06-carrusel-fb-360.jpg" width="200" alt="FB, Carrusel con sus láminas, 360 px"> |

**Igual:** Láminas en orden (portada, desarrollo, resumen, CTA), cada una con su texto y su imagen 1080×1350; hook, CTA y caption.

**Distinto:** Al aprobar, las imágenes y el orden de las láminas quedan congelados; los textos de planificación siguen libres.

**Por qué:** Lo que se publica es lo que el jefe vio.

### 07 · Historias

| Referencia | FB |
|---|---|
| <img src="07-historia-referencia-1366.jpg" width="440" alt="Referencia, Historias, 1366 px"> | <img src="07-historia-fb-1366.jpg" width="440" alt="FB, Historias, 1366 px"> |
| <img src="07-historia-referencia-360.jpg" width="200" alt="Referencia, Historias, 360 px"> | <img src="07-historia-fb-360.jpg" width="200" alt="FB, Historias, 360 px"> |

**Igual:** Idea original, formato del sticker, texto en pantalla, seguimiento y foto o clip 9:16, con las tarjetas en rejilla.

**Distinto:** Se suman «Texto del sticker» y «Enlace del sticker» (solo https://). Si el texto en pantalla o el sticker cambian después de aprobar, la historia vuelve al jefe. Una historia nueva entra en verde, para que el jefe apruebe varias juntas.

**Por qué:** El texto en pantalla y el sticker son lo que sale (pregunta 13 para Hillary).

### 08 · YouTube

| Referencia | FB |
|---|---|
| <img src="08-youtube-referencia-1366.jpg" width="440" alt="Referencia, YouTube, 1366 px"> | <img src="08-youtube-fb-1366.jpg" width="440" alt="FB, YouTube, 1366 px"> |
| <img src="08-youtube-referencia-360.jpg" width="200" alt="Referencia, YouTube, 360 px"> | <img src="08-youtube-fb-360.jpg" width="200" alt="FB, YouTube, 360 px"> |

**Igual:** Guion por tomas, video horizontal 16:9, portada y descripción con capítulos.

**Distinto:** El título del video queda congelado al aprobar, como el del reel.

**Por qué:** El título sale con el video.

### 09 · Fin de mes (el jefe)

| Referencia | FB |
|---|---|
| <img src="09-fin-de-mes-referencia-1366.jpg" width="440" alt="Referencia, Fin de mes (el jefe), 1366 px"> | <img src="09-fin-de-mes-fb-1366.jpg" width="440" alt="FB, Fin de mes (el jefe), 1366 px"> |
| <img src="09-fin-de-mes-referencia-360.jpg" width="200" alt="Referencia, Fin de mes (el jefe), 360 px"> | <img src="09-fin-de-mes-fb-360.jpg" width="200" alt="FB, Fin de mes (el jefe), 360 px"> |

**Igual:** Las piezas del cierre de cada mes, sin cupo, con sus imágenes y títulos.

**Distinto:** Arriba, el «Resumen del mes» para el jefe: lo hecho de cada cupo, lo aprobado, lo publicado, la receptividad media, los diseños desaprobados, los avisos abiertos y lo publicado con su miniatura. Sin el campo «Ciudad».

**Por qué:** Es la rendición de cuentas que pidió el encargo (D-72); «Ciudad» invita a escribir lugares.

### 10 · Feed del mes (página entera)

| Referencia | FB |
|---|---|
| <img src="10-feed-referencia-1366.jpg" width="440" alt="Referencia, Feed del mes (página entera), 1366 px"> | <img src="10-feed-fb-1366.jpg" width="440" alt="FB, Feed del mes (página entera), 1366 px"> |
| <img src="10-feed-referencia-360.jpg" width="200" alt="Referencia, Feed del mes (página entera), 360 px"> | <img src="10-feed-fb-360.jpg" width="200" alt="FB, Feed del mes (página entera), 360 px"> |

**Igual:** 24 espacios fijos por mes (8 posts, 12 reels y 4 carruseles), «Elegir publicación» en los vacíos, marco verde «✓ Publicado», el número y el formato en cada celda, «Vaciar este mes», «+ Nuevo mes» y la línea de ocupados con la receptividad.

**Distinto:** La numeración: en FB el #1 está abajo a la derecha y el #24 arriba a la izquierda; en la referencia el #1 está abajo a la izquierda (ver las rejillas de abajo). La cabecera de perfil muestra el nombre y el cargo de la configuración del cliente, sin usuario, seguidores ni biografía. En la computadora, un «⋯» visible en cada celda; en el teléfono, se toca la celda y sale el menú (Publicar antes, Publicar después, Cambiar de espacio, Mover a otro mes, Quitar del feed). Arrastrar es solo con ratón. Las pestañas de mes son las mismas de las secciones.

**Por qué:** El encargo pide el #1 abajo a la derecha, el orden de Instagram (pregunta 11: se cambia en un solo lugar). No inventamos un usuario de Instagram (pregunta 12). En el teléfono no hay ratón para arrastrar; el teclado usa los mismos botones.

Las dos rejillas con su orden de publicación (el #1 sale primero):

```
Referencia             FB
#22 #23 #24            #24 #23 #22
#19 #20 #21            #21 #20 #19
 …                      …
#4  #5  #6             #6  #5  #4
#1  #2  #3             #3  #2  #1
```

### 11 · Elegir publicación: primero el formato

| Referencia | FB |
|---|---|
| <img src="11-selector-formatos-referencia-1366.jpg" width="440" alt="Referencia, Elegir publicación: primero el formato, 1366 px"> | <img src="11-selector-formatos-fb-1366.jpg" width="440" alt="FB, Elegir publicación: primero el formato, 1366 px"> |
| <img src="11-selector-formatos-referencia-360.jpg" width="200" alt="Referencia, Elegir publicación: primero el formato, 360 px"> | <img src="11-selector-formatos-fb-360.jpg" width="200" alt="FB, Elegir publicación: primero el formato, 360 px"> |

**Igual:** La hoja «Mes 1 · Espacio #NN» con «Elige el formato y luego el título» y los tres grupos con su número de títulos.

**Distinto:** En el teléfono la hoja sale desde abajo.

**Por qué:** Se alcanza con el pulgar.

### 12 · Elegir publicación: los títulos

| Referencia | FB |
|---|---|
| <img src="12-selector-titulos-referencia-1366.jpg" width="440" alt="Referencia, Elegir publicación: los títulos, 1366 px"> | <img src="12-selector-titulos-fb-1366.jpg" width="440" alt="FB, Elegir publicación: los títulos, 1366 px"> |
| <img src="12-selector-titulos-referencia-360.jpg" width="200" alt="Referencia, Elegir publicación: los títulos, 360 px"> | <img src="12-selector-titulos-fb-360.jpg" width="200" alt="FB, Elegir publicación: los títulos, 360 px"> |

**Igual:** Cada título con su miniatura o «Sin media», y «Ya en Mes 1 · #N» si ya está en otro espacio.

**Distinto:** Una pieza de otro mes dice «De Mes 2»; tocar una que ya está puesta pregunta «Está en Mes 1 · #N. ¿La mueves a este espacio?».

**Por qué:** La base no deja una pieza en dos espacios en ningún mes (D-69): se pregunta antes de moverla.

### 13 · Publicado en verde

| Referencia | FB |
|---|---|
| <img src="13-publicado-en-verde-referencia-1366.jpg" width="440" alt="Referencia, Publicado en verde, 1366 px"> | <img src="13-publicado-en-verde-fb-1366.jpg" width="440" alt="FB, Publicado en verde, 1366 px"> |
| <img src="13-publicado-en-verde-referencia-360.jpg" width="200" alt="Referencia, Publicado en verde, 360 px"> | <img src="13-publicado-en-verde-fb-360.jpg" width="200" alt="FB, Publicado en verde, 360 px"> |

**Igual:** La tarjeta publicada se pone verde y su celda del feed lleva «✓ Publicado».

**Distinto:** «Publicado» es «Ya lo publiqué», con un enlace por red y una captura, y solo se prende si el jefe aprobó y el diseño no está desaprobado.

**Por qué:** Nada sale sin aprobación; el estado sale de lo que pasó, no de una casilla.

### 14 · Meses con su cupo (Mes 3 en Posts)

| Referencia | FB |
|---|---|
| <img src="14-meses-con-cupo-referencia-1366.jpg" width="440" alt="Referencia, Meses con su cupo (Mes 3 en Posts), 1366 px"> | <img src="14-meses-con-cupo-fb-1366.jpg" width="440" alt="FB, Meses con su cupo (Mes 3 en Posts), 1366 px"> |
| <img src="14-meses-con-cupo-referencia-360.jpg" width="200" alt="Referencia, Meses con su cupo (Mes 3 en Posts), 360 px"> | <img src="14-meses-con-cupo-fb-360.jpg" width="200" alt="FB, Meses con su cupo (Mes 3 en Posts), 360 px"> |

**Igual:** Pestañas Mes 1, Mes 2, Mes 3 con su cuenta contra el cupo, «+ Nuevo mes» y la invitación a crear en un mes vacío.

**Distinto:** Una sola lista de meses para las secciones y el feed: cambiar de mes en una sección lo cambia en todas, y la barra de secciones cuenta ese mes. El cupo es una línea informativa; se cambia en Ajustes → Cupo y pilares.

**Por qué:** La referencia tiene dos listas de meses que se descuadran (D-67). Pasarse del cupo no bloquea nada.

### 15 · Mover a otro mes

| Referencia | FB |
|---|---|
| <img src="15-mover-a-otro-mes-referencia-1366.jpg" width="440" alt="Referencia, Mover a otro mes, 1366 px"> | <img src="15-mover-a-otro-mes-fb-1366.jpg" width="440" alt="FB, Mover a otro mes, 1366 px"> |
| <img src="15-mover-a-otro-mes-referencia-360.jpg" width="200" alt="Referencia, Mover a otro mes, 360 px"> | <img src="15-mover-a-otro-mes-fb-360.jpg" width="200" alt="FB, Mover a otro mes, 360 px"> |

**Igual:** La lista de meses con el actual marcado y el aviso de que su espacio en el feed se va con ella.

**Distinto:** Si el otro mes tiene el feed lleno, la pieza queda «Sin programar» y lo dice.

**Por qué:** Una pieza nunca queda en dos espacios.

### 16 · Borrar un mes

| Referencia | FB |
|---|---|
| <img src="16-borrar-un-mes-referencia-1366.jpg" width="440" alt="Referencia, Borrar un mes, 1366 px"> | <img src="16-borrar-un-mes-fb-1366.jpg" width="440" alt="FB, Borrar un mes, 1366 px"> |
| <img src="16-borrar-un-mes-referencia-360.jpg" width="200" alt="Referencia, Borrar un mes, 360 px"> | <img src="16-borrar-un-mes-fb-360.jpg" width="200" alt="FB, Borrar un mes, 360 px"> |

**Igual:** La confirmación dice cuántas piezas tiene, que no se borra ninguna y que pasan al primer mes.

**Distinto:** Lo cuida la base: una pieza nunca queda en un mes borrado.

**Por qué:** Borrar un mes no borra piezas (prueba por rol).

### 17 · Diseño desaprobado con su nota

| Referencia | FB |
|---|---|
| <img src="17-diseno-desaprobado-referencia-1366.jpg" width="440" alt="Referencia, Diseño desaprobado con su nota, 1366 px"> | <img src="17-diseno-desaprobado-fb-1366.jpg" width="440" alt="FB, Diseño desaprobado con su nota, 1366 px"> |
| <img src="17-diseno-desaprobado-referencia-360.jpg" width="200" alt="Referencia, Diseño desaprobado con su nota, 360 px"> | <img src="17-diseno-desaprobado-fb-360.jpg" width="200" alt="FB, Diseño desaprobado con su nota, 360 px"> |

**Igual:** «Diseño aprobado» y «Diseño desaprobado» se excluyen, con la nota «¿Qué no le gustó del diseño?».

**Distinto:** Dice quién lo marcó y cuándo (en tiempo relativo). La marca que pone el jefe solo la quita el jefe; un diseño desaprobado después de aprobar no se puede publicar. La receptividad son 10 estrellas de 44 px, en dos filas de 5 en el teléfono; debajo, «Enviar a aprobación» con lo que falta.

**Por qué:** Si no, Redes quitaría la marca del jefe y publicaría (D-64). Botones de 44 px para dedos.

### 18 · Tarjeta plegada

| Referencia | FB |
|---|---|
| <img src="18-tarjeta-plegada-referencia-1366.jpg" width="440" alt="Referencia, Tarjeta plegada, 1366 px"> | <img src="18-tarjeta-plegada-fb-1366.jpg" width="440" alt="FB, Tarjeta plegada, 1366 px"> |
| <img src="18-tarjeta-plegada-referencia-360.jpg" width="200" alt="Referencia, Tarjeta plegada, 360 px"> | <img src="18-tarjeta-plegada-fb-360.jpg" width="200" alt="FB, Tarjeta plegada, 360 px"> |

**Igual:** Plegada queda la cabecera con su miniatura.

**Distinto:** En el teléfono todas empiezan plegadas menos la primera, y cada persona encuentra el pliegue como lo dejó.

**Por qué:** Listas largas livianas en un Android barato.

### 19 · La banda «Antes de publicar»

| Referencia | FB |
|---|---|
| <img src="19-antes-de-publicar-referencia-1366.jpg" width="440" alt="Referencia, La banda «Antes de publicar», 1366 px"> | <img src="19-antes-de-publicar-fb-1366.jpg" width="440" alt="FB, La banda «Antes de publicar», 1366 px"> |
| <img src="19-antes-de-publicar-referencia-360.jpg" width="200" alt="Referencia, La banda «Antes de publicar», 360 px"> | <img src="19-antes-de-publicar-fb-360.jpg" width="200" alt="FB, La banda «Antes de publicar», 360 px"> |

**Igual:** Una banda ámbar «Antes de publicar:» con el aviso de la pieza.

**Distinto:** Los avisos tienen tipo (por ejemplo «Necesita autorización escrita», «Verificar la fuente y la fecha del dato»), «Resuelto» y «Agregar aviso». Los pone Redes, el jefe los ve en su sala y marca «Leí los avisos de cumplimiento»; un aviso nuevo en una pieza aprobada la devuelve al jefe.

**Por qué:** Para un gobierno esto importa (D-66).

### 20 · Buscar en Redes

| Referencia | FB |
|---|---|
| <img src="20-busqueda-referencia-1366.jpg" width="440" alt="Referencia, Buscar en Redes, 1366 px"> | <img src="20-busqueda-fb-1366.jpg" width="440" alt="FB, Buscar en Redes, 1366 px"> |
| <img src="20-busqueda-referencia-360.jpg" width="200" alt="Referencia, Buscar en Redes, 360 px"> | <img src="20-busqueda-fb-360.jpg" width="200" alt="FB, Buscar en Redes, 360 px"> |

**Igual:** Se busca en todo Redes.

**Distinto:** Es una pantalla propia, con resultados por formato, en títulos, campos de la tarjeta, copies, avisos y tweets.

**Por qué:** La referencia filtra la sección abierta; aquí Redes son varias pantallas y también están los tweets.

### 21 · «¿Qué quieres crear?»

| Referencia | FB |
|---|---|
| <img src="21-crear-referencia-1366.jpg" width="440" alt="Referencia, «¿Qué quieres crear?», 1366 px"> | <img src="21-crear-fb-1366.jpg" width="440" alt="FB, «¿Qué quieres crear?», 1366 px"> |
| <img src="21-crear-referencia-360.jpg" width="200" alt="Referencia, «¿Qué quieres crear?», 360 px"> | <img src="21-crear-fb-360.jpg" width="200" alt="FB, «¿Qué quieres crear?», 360 px"> |

**Igual:** La hoja con los formatos y «Se creará en Mes 1».

**Distinto:** Son seis formatos (con «Pieza de fin de mes»), con lo que lleva cada uno; la pieza se abre en su sección. «Desde un evento» queda en la ficha del evento.

**Por qué:** Cada pieza vive en un solo lugar (D-60, D-70).

### 22 · La barra de secciones

| Referencia | FB |
|---|---|
| <img src="22-barra-de-secciones-referencia-1366.jpg" width="440" alt="Referencia, La barra de secciones, 1366 px"> | <img src="22-barra-de-secciones-fb-1366.jpg" width="440" alt="FB, La barra de secciones, 1366 px"> |
| <img src="22-barra-de-secciones-referencia-360.jpg" width="200" alt="Referencia, La barra de secciones, 360 px"> | <img src="22-barra-de-secciones-fb-360.jpg" width="200" alt="FB, La barra de secciones, 360 px"> |

**Igual:** Cada formato con lo revisado de su cupo y las marcas de copy e imagen faltante.

**Distinto:** Va arriba y no a la izquierda, con Tablero, Feed, Tweets y «Buscar en Redes»; sin el «MES 1 ‹ ›» (las pestañas de mes están justo debajo). En el teléfono se desliza de lado.

**Por qué:** Así se ve igual en el teléfono y en la computadora, y el menú de la app sigue siendo uno solo.
