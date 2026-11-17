# Guía de administración

> **No se manda todavía: Hillary pidió probar cada rol antes (25/10).**

<!-- Generado por `npm run docs:guides` desde src/lib/guides/ (admin.ts). No se edita a mano: se cambia la fuente y se corre otra vez. -->

Administración es el rol técnico: invita al equipo y le da sus roles, cuida los ajustes de la app y el asistente 360, y también los ajustes de la página web y las áreas y los plazos de la atención. No decide, no aprueba, no escribe en la agenda, no publica en la web y nunca abre un caso de la atención. En la app: `/ayuda/administracion` (solo administración).

## Lo que no es de administración
- Mensajes no es para administración: no entras a los canales del equipo, y una cuenta con administración no entra a Mensajes aunque tenga otro rol.
- El rol de jefe no se da desde Equipo: lo da quien instala la app, una sola vez. Cada rol del equipo que das le llega al jefe como aviso.
- Las guías del equipo nombran a administración solo donde hace falta (quién lee lo que le preguntan a 360 y quién recupera una pieza eliminada): esta guía es aparte.
- Nada sale hacia afuera mientras se prueba: los correos quedan en el «Buzón de correos» y nada se publica solo.

## Cada pantalla

### Equipo (`/ajustes/equipo`)
Las personas del equipo, sus roles, su doble factor y sus sesiones. Cada persona tiene su usuario, aunque compartan el rol.

- «Invitar a alguien»: el nombre, el correo y el rol, y «Enviar invitación». Le llega un correo y entra con un código.
- «Cambiar» los roles de una persona. Las casillas que no se pueden marcar dicen por qué.
- «Cerrar sus sesiones» si perdió el teléfono; «Reiniciar doble factor» para que lo active de nuevo.
- «Desactivar» a quien ya no trabaja (no se borra; «Activar» lo trae), y «Anular» una invitación sin aceptar.
- Cada rol del equipo que das le llega al jefe como aviso.
- No puedes: Darte tus propios roles: los da otra persona de administración.
- No puedes: Ser también el jefe o el despacho en la misma cuenta: usa otra cuenta.
- No puedes: Dar el rol de jefe: «El rol de jefe lo da quien instala la app.»

### Categorías (`/ajustes/categorias`)
La lista de categorías del contenido (eventos, piezas y tweets).

- Agregas, cambias el nombre o apagas una categoría.

### Fórmulas de copies (`/ajustes/formulas`)
Las fórmulas con las que se escriben los copies (FAB, PAS, AIDA y las que agregues).

- Agregas o corriges una fórmula; Redes la elige en cada pieza.

### Horarios de tweets (`/ajustes/horarios`)
Las franjas del día y cuántos tweets salen por día, para repartir la tanda de la semana.

- Cambias las franjas y el número por día.

### Reglas por red (`/ajustes/redes`)
La duración, las medidas y el peso de lo que se publica en cada red, con los que se revisa una publicación.

- Cambias el número de una red cuando la red cambia sus reglas.

### Marca (`/ajustes/marca`)
El nombre de la app para 360, los colores, los logos, el saludo, los cierres y los hashtags.

- Cambias los textos de la marca que usan los copies.
- El «Nombre de la app» y el «Nombre corto» los usa 360; el nombre del menú y de los correos lo cambia quien instaló la app.

### Cupo y pilares (`/ajustes/contenido`)
El cupo del mes de cada formato de Redes, los pilares del contenido y las piezas que eliminó el jefe.

- «Cupo del mes»: cuántos reels, posts, carruseles, historias y videos de YouTube se planean por mes. Es una meta: si se hacen más piezas, no pasa nada, y fin de mes no tiene cupo. Toca «Guardar cupo».
- «Pilares»: los temas del contenido. «Agregar pilar», su nombre y su «Color»; subirlo, bajarlo o quitarlo, y «Guardar pilares». Cambiarle el nombre no lo quita de sus piezas; si lo quitas, quedan «Sin pilar».
- «Piezas eliminadas»: las que eliminó el jefe. «Recuperar» la devuelve a su mes (o al primero, si su mes ya no está), sin espacio en el feed.
- En cada sección de Redes, «Cambiar en Ajustes» te trae aquí.
- No puedes: Eliminar piezas: solo el jefe elimina, con el doble factor.

### Google Drive
Dónde se guardan los videos, la conexión y una prueba. Solo sale en Ajustes cuando el material va a Drive.

- Conectas la cuenta de Drive del equipo y pruebas que sube y baja.
- «Organizar por orden del feed» sale aquí solo cuando lo enciende quien instala la app; hoy está apagado.

### Asistente (`/ajustes/asistente`)
Lo que sabe 360, cómo contesta y cómo le va.

- Las pestañas: «Lo que sabe», «Cómo contesta», «Conversaciones», «Cómo va», «Lo que preguntan», «Por confirmar», «Lo que hizo» y «Ajustes».
- En «Conversaciones» lees lo que el equipo le pregunta a 360: tú sí lees esas conversaciones, y el panel de 360 se lo dice a cada persona.
- En «Por confirmar», los avisos que preparó 360 y que tú confirmas o descartas.
- Una pregunta a 360 sobre lo que dice un mensaje del equipo se guarda sin el texto.

### Buzón de correos (`/ajustes/buzon`)
Todos los correos que generó la app. Mientras se prueba, ninguno sale: quedan aquí.

- Revisas que el correo diga lo que tiene que decir, sin fecha ni hora de la agenda.

### Registro de cambios (`/ajustes/registro`)
Quién cambió qué y cuándo, en toda la app.

- Lees los cambios del más nuevo al más viejo, con quién, qué y cuándo; abajo, «Ver más antiguos» trae los anteriores. No tiene buscador ni filtro.
- De Mensajes sale solo que hubo un mensaje, un canal o un cambio de miembros, quién y cuándo: nunca el texto, el nombre del canal ni quiénes son.
- Lo que hizo la app sola sale como «La app»; lo que una persona mandó desde la web, como «La web».

### Ver como
Para ver los menús de otro rol, arriba (en el teléfono, dentro de Mi cuenta). Tus permisos no cambian.

- Eliges un rol o «Mi vista». Mientras miras, sale una franja que lo dice.
- Los tutoriales también siguen «Ver como»; Mensajes no.

### Redes (`/redes`)
Puedes hacer lo de Redes: el tablero, las secciones por formato, el feed, Tweets, Publicar y Resultados.

- Creas, editas y mandas a aprobar piezas; creas meses, les cambias el nombre y armas el feed.
- Marcar el diseño, la receptividad y los avisos de cumplimiento, y borrar un mes, son de Redes y del jefe: tú los ves.
- No puedes: Aprobar ni eliminar piezas: todo lo aprueba el jefe, y solo él elimina. Tú recuperas en «Cupo y pilares».

### Por aprobar (`/aprobar`)
Ves lo que espera al jefe, pero no apruebas: todo lo aprueba el jefe.

- En una pieza: el nivel, arriba, en su cajita (dice, por ejemplo, «Nivel amarillo»); comentar, o «Pedir frase al jefe» si hace falta su voz («Anotar pedido de frase»).

### La agenda y las fichas (`/agenda`)
Lees la agenda, «Por ponerle fecha», las obras y los municipios.

- Puedes crear y completar fichas de obra.
- En el material de un evento, «Quitar» un archivo que no va.
- No puedes: Crear eventos, ponerles fecha o decidirlos: eso es del jefe y del despacho.
- No puedes: Ver los contactos ni los documentos de un reporte comunitario.

### La web (`/admin/web`)
«La web» es la pantalla del contenido: arriba, «Inicio», «Por aprobar», «Biblioteca», «Ajustes del sitio» y «Redirecciones». Tú la lees toda, borradores incluidos; tu «Web» abre directo «Ajustes del sitio».

- La pestaña «Por aprobar» dice cuántos contenidos esperan aprobación, por ejemplo «Por aprobar (2)».
- En «Inicio», cuatro números: «Borradores», «Esperan aprobación», «Programados» y «Publicados».
- Si algo espera aprobación, debajo de los números sale «Esperando aprobación», con «Ver todo»: lo revisa el aprobador o el jefe, y tú lo lees.
- «Contenido»: una tarjeta por tipo, con cuántos hay en la web, en borrador, en revisión y programados.
- Tú no escribes, no envías a aprobación ni publicas desde «La web». Lo hacen el editor de la web, el aprobador y el jefe; tú lo lees todo.

### Por aprobar de la web (`/admin/web/por-aprobar`)
«Por aprobar» lista lo que espera aprobación, lo más viejo primero. Ahí deciden el aprobador de la web y el jefe; tú lo lees, pero no apruebas.

- Cada línea dice si es «primera publicación» o «cambios a algo publicado», quién lo envió y cuándo.
- Al abrirlo: quién lo envió, el último cambio y, si está en la web, cuándo se publicó; «Ver la vista previa», «Abrir el editor», «Versiones» y «Verlo en la web».
- «Le falta esto para publicarse» dice lo que falta. Mientras falte algo, «Publicar ahora» no se puede tocar.
- «Qué cambia si lo publicas» compara campo por campo, con «Antes» y «Ahora», y etiquetas «Nuevo», «Quitado», «Cambió», «Se oculta» y «Se muestra». En una página, también los bloques y su orden. Si es la primera vez, dice que todo es nuevo.
- Tú no apruebas ni publicas en la web. Deciden el aprobador de la web y el jefe: «Publicar ahora», «Programar» o «Devolver con comentario».
- Tú no devuelves contenidos. Los devuelven el aprobador de la web y el jefe, con «Qué hay que cambiar» y «Devolver con comentario».

### Biblioteca de la web (`/admin/web/biblioteca`)
La «Biblioteca» guarda las fotos y los PDF de la web. Todo lo que está ahí es público. Suben el editor de la web, el aprobador y el jefe; tú la lees.

- Nunca fotos ni archivos de las personas que escriben a Atención, ni cédulas, ni documentos privados, ni menores sin permiso. Los archivos de las solicitudes van aparte, en privado, y nunca pasan por aquí.
- Solo se aceptan fotos JPG, PNG o WebP, y cada archivo va hasta 4 MB, también los PDF. Si pesa más, sale «El archivo pasa de 4 MB: súbelo más liviano.».
- «Texto alternativo» (obligatorio): lo oyen las personas ciegas, con un programa que les lee la pantalla en voz alta, y lo usan buscadores como Google. Describe lo que se ve en pocas palabras: quién, qué hace, dónde.
- «Buscar» busca en el texto alternativo, el pie, el crédito o el título; también están «Tipo» (Todo, Fotos, Documentos) y «Archivados». Cada archivo dice «Sin usar» o en cuántos contenidos se usa, por ejemplo «Se usa en 1 contenido».
- Tú no subes fotos ni PDF a la biblioteca. Suben el editor de la web, el aprobador y el jefe, con «Subir una foto» o «Subir un PDF»; tú la lees.

### Ajustes del sitio (`/admin/web/ajustes`)
«Ajustes del sitio» es lo fijo de la web: el menú, el pie, los contactos, las cuentas, los canales y el nombre. Tu «Web» abre directo aquí: lo que guardas sale en la web al momento, sin aprobación.

- Lo cambian el aprobador de la web, el jefe y Administración. Cada sección tiene su «Guardar», y al guardar dice «Guardado. La web ya lo muestra.».
- «Navegación»: el menú de la web, en orden («Agregar enlace»), cada enlace con su «Nombre» y su «Dirección», el final de la dirección, que empieza con «/». La de «Gestión y obras» es «/gestion».
- «Pie de página»: un texto corto y los enlaces legales («Agregar enlace legal»).
- «Contactos institucionales»: teléfonos, correos o direcciones («Agregar contacto»). Solo salen los marcados «Verificado».
- «Cuentas en redes»: red, usuario y enlace de cada cuenta («Agregar cuenta»), con «Verificada», «Activa» y una «Nota interna (no sale en la web)». Una cuenta abandonada se apaga: con «Activa» sin marcar, nunca sale.
- Aquí nunca va un teléfono, un correo o una cuenta que nadie del equipo confirmó, porque sale en la web al momento.
- Los «Avisos legales», como el aviso de emergencias, no se cambian aquí. Son textos fijos; cuando la Gobernación confirme el número oficial de emergencias, se agregará a ese aviso en todas partes.
- La franja «Versión de prueba en revisión. No es el sitio oficial.» no se cambia mientras la web sea de prueba.

### Redirecciones (`/admin/web/redirecciones`)
Las redirecciones llevan una dirección vieja a la nueva, para que ningún enlace guardado o compartido se pierda. Las ven y las cambian el aprobador de la web, el jefe y Administración.

- La dirección vieja puede ser de la web anterior o una de esta web que cambió.
- «Nueva redirección»: en «Dirección vieja», la dirección como estaba; en «Lleva a», la página de esta web adonde debe llevar. En ambas va solo el final de la dirección, el que empieza con «/».
- En «Tipo» se deja la opción que viene marcada, «Para siempre (lo normal)». Debajo dice cuándo sirven las otras, como «Por un tiempo», si la dirección vieja se va a volver a usar.
- Se toca «Agregar la redirección», y sale «Redirección guardada. La dirección vieja ya lleva a la nueva.».
- Una página que todavía existe en la web no se redirige. No se puede redirigir una dirección que la web ya usa, ni hacer dos redirecciones desde la misma dirección.

### Atención ciudadana (`/admin/atencion`)
Tu «Atención» no abre la bandeja: muestra «Áreas y plazos» y «Registro de atención». Administración nunca lee las solicitudes ni sus contactos.

- En «Áreas y plazos» armas las áreas, quién está en cada una, el área y los días de cada categoría y los plazos. El «Registro de atención» dice quién hizo qué y cuándo, sin lo que dicen los casos.
- Las pestañas de los casos, «Bandeja», «Tablero» y «Mapa», son de quienes los leen: la coordinación, los responsables de área, denuncias, auditoría y el jefe; «Cifras», de la coordinación, auditoría y el jefe.
- Las personas de la atención (coordinación, responsables de área, denuncias y auditoría) se invitan en «Ajustes» → «Equipo», siempre con doble factor.
- Tú no ves la bandeja ni los casos que llegan. Tu «Atención» muestra «Áreas y plazos» y el «Registro de atención».

### Áreas y plazos (`/admin/atencion/areas`)
«Áreas y plazos» es lo que armas para que la atención funcione: las áreas, quién está en cada una, el área y los días de cada categoría y los plazos. La coordinación, auditoría y el jefe lo leen.

- «Nueva área»: «Nombre del área» y «Qué atiende» → «Crear el área». Para cambiar una: «Cambiar el nombre o apagarla» → «Guardar el área».
- Para apagar un área: «Cambiar el nombre o apagarla», se desmarca «Activa (apagada, no recibe casos nuevos; nada se borra)» y «Guardar el área».
- Responsables: «Agregar un responsable» → la persona → «Agregar». «Quitar» la saca del área. Solo salen las personas que tienen el rol de responsable de área.
- «Categorías»: a qué área va cada una y sus «Días» → «Guardar». Sin área, la asigna la coordinación. «En el formulario» decide si la categoría sale en el formulario de la web.
- «Plazos y avisos»: los días por prioridad y «Avisar de un caso sin movimiento después de (días)» → «Guardar los plazos».
- Entre los días de la prioridad y los de la categoría gana el más corto. Si la prioridad está vacía, valen los de la categoría.

### Registro de atención (`/admin/atencion/registro`)
«Registro de atención» dice quién hizo qué y cuándo: los cambios, los contactos vistos y las exportaciones. Es tuyo y de auditoría; no se edita ni se borra, y no guarda lo que dicen los casos.

- Lo abres con «Registro de atención», desde tu «Atención».
- Una línea que empieza con «La web» es lo que una persona hizo desde la web: una solicitud nueva, un apoyo, un mensaje o un archivo suyo.
- Una que empieza con «La app» es algo que la app hizo sola, como las respuestas guardadas que trae o la revisión de un archivo.
- Ajustes → «Registro de cambios» dice esas líneas con las mismas palabras.
- Nadie edita ni borra una línea del registro.
- El registro no guarda lo que dicen los casos. Dice quién hizo qué y cuándo, y tú nunca ves un caso.

## Preguntas
**Alguien perdió el teléfono, ¿qué hago?**
En Equipo, «Cerrar sus sesiones» y «Reiniciar doble factor». La próxima vez que entre, lo activa de nuevo.

**¿Por qué no puedo marcar «Jefe» en Equipo?**
«El rol de jefe lo da quien instala la app.» Se da una sola vez: así nadie arma otra cuenta que apruebe todo o esté en todos los canales.

**¿Puedo leer los mensajes del equipo?**
No. Mensajes no tiene entrada para administración, ni con «Ver como», ni en el registro de cambios.

**¿Qué ve el equipo de lo que hago?**
Cada rol que das le llega al jefe como aviso. Las personas saben que lees lo que le preguntan a 360: el panel de 360 lo dice.

**¿Puedo eliminar una pieza?**
No: solo el jefe elimina piezas. Tú la recuperas en Ajustes → «Cupo y pilares» → «Piezas eliminadas» → «Recuperar».

**¿Dónde cambio el cupo del mes o los pilares?**
En Ajustes → «Cupo y pilares», con el doble factor. El cupo es una meta: si se hacen más piezas, no pasa nada.
