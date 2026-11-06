# Manual de atención ciudadana

**06/11/2026.** Para quienes atienden lo que la gente manda desde la web: la coordinación de atención, los
responsables de área, el operador de denuncias, auditoría, el jefe y Administración. Todo está en el panel, en el
menú **«Atención»** (`/admin/atencion`). Los nombres de los botones están escritos tal como salen en la pantalla.

> Hoy es la **versión de prueba**: las 60 solicitudes que hay son inventadas (llevan «(demo)») y ningún correo le
> llega a nadie. No escribas datos reales de nadie en la demostración.

**La idea en una línea:** cada solicitud es privada y tiene un **código** (por ejemplo `AC-2026-K7QM2H`). La persona
la sigue con su código y su **clave** en «Consultar mi solicitud». Nadie del equipo tiene esa clave: solo se guarda
una huella que no se puede revertir.

## 1. Quién ve y hace qué

| Rol | Ve | Hace |
|---|---|---|
| **Coordinador de atención** | Todo, denuncias también | Todo: asignar a cualquier área, prioridad y fecha comprometida, unir casos, corregir tipo o categoría, moderar, borrar un contacto a pedido, «Lo atendido», cifras y exportar (con o sin contacto) |
| **Responsable de área** | Lo de sus áreas y lo que le asignen. **Nunca denuncias** | Responder, notas internas, estados, evidencias, ver el contacto; asigna dentro de su área o «Tomar el caso» |
| **Operador de denuncias** | **Solo denuncias** | Lo mismo que un responsable, y además en las denuncias: área, prioridad, fecha y moderación |
| **Consulta y auditoría** | Todo menos las denuncias (que cuentan solo en los totales), sin contactos | Solo leer; cifras; exportar sin contactos; el «Registro» |
| **Jefe** | Como auditoría | Solo leer y las cifras |
| **Administración** | **Nunca un caso** | Arma las áreas, quién está en cada una, el área y los días de cada categoría y los plazos («Áreas y plazos»), y lee el «Registro» |

- **Siempre con doble factor** (código por correo y Google Authenticator; no hay contraseñas). Teléfono perdido:
  Administración → Ajustes → Equipo → «Reiniciar doble factor».
- **Cómo se da el rol:** Administración → Ajustes → Equipo → «Invitar a alguien», el rol en «Web y atención ciudadana
  (siempre con doble factor)». A un responsable se le marcan sus áreas («Sus áreas (ve y atiende lo de estas áreas y lo
  que le asignen)»); después se cambian con «Cambiar».
- Un caso que no te toca **no existe para ti**: no sale en la lista y su dirección dice «no encontrado». Lo hace
  cumplir la base de datos, no solo la pantalla.

## 2. Lo que llega: seis tipos

| Tipo | Qué es |
|---|---|
| **Reporte** | Un problema en la comunidad: agua, luz, vialidad, aseo, salud, escuelas… |
| **Petición** | Pedir algo al despacho: una ayuda, un trámite, algo para la comunidad |
| **Acotación** | Una opinión sobre la gestión o una obra |
| **Sugerencia** | Una idea para mejorar algo |
| **Reconocimiento** | Un agradecimiento |
| **Denuncia** | Un hecho grave. Privada de punta a punta (§13) |

Cada formulario dice que **esto no es un servicio de emergencias** (§18).

## 3. La bandeja y el tablero

Arriba, las pestañas de lo que tu rol puede usar: **«Bandeja»**, **«Tablero»**, **«Mapa»**, **«Cifras»**, **«Áreas y
plazos»**, **«Respuestas guardadas»** y **«Registro»**.

Cuatro números, de lo que puedes ver (sin el spam ni lo unido a otro caso):

| Número | Cuenta |
|---|---|
| **Por revisar** | Recibido y En revisión |
| **En atención** | Asignado, En atención, Requiere información y Derivado |
| **Resueltas** | Resuelto y Cerrado |
| **Vencidas** | Abiertas que ya pasaron su fecha comprometida |

- **Bandeja:** tarjetas en el teléfono y tabla desde la tableta, 25 por página, con cuántas hay en cada estado. Cada
  una dice su código, tipo, estado, «Vencida» y la prioridad si no es normal.
- **Tablero:** una columna por estado (de Recibido a Resuelto) y una última de «Cerradas y «No procede»». Cada columna
  muestra las 12 más nuevas y «Ver las N en la lista». El botón de un toque (por ejemplo «→ En revisión») hace solo
  el paso de siempre cuando no pide motivo; para lo demás, «Otro estado…» abre el caso. No se arrastran tarjetas.

## 4. Buscar y filtrar

- **«Buscar por código o título»**: el código entero o su comienzo (`AC-2026-K7`), o palabras del título. **«Estado»**
  y **«Filtrar»**.
- **«Más filtros»**: Tipo, Categoría, Municipio, Parroquia (cuando esté la lista oficial), «Parroquia, localidad o
  sector», Prioridad, Área («Sin área»), Responsable («Las mías», «Sin responsable» o una persona), «Llegó desde»,
  «Llegó hasta», «Solo las vencidas» e «Incluir las unidas a otro caso y el spam».
- **«Quitar los filtros»** vuelve a todo.
- Los filtros quedan en la dirección de la página: copiar el enlace sirve para mostrarle a un compañero la misma vista
  (él verá solo lo que su rol le deja).

## 5. Un caso, paso a paso

Al abrir un caso se ve: el título, el código, el tipo, el estado y, si aplica, «Vencida», la prioridad y «Spam».
Debajo: **«Lo que llegó»** (el texto, la categoría, dónde, cuándo pasó, si marcó un punto con su permiso, si dejó
contacto y si permite su nombre, y la noticia u obra de la que habla), y las tarjetas «Estado», «Área y responsable»,
«Prioridad y fecha comprometida», «Contacto de la persona», «Archivos», «Resolución», «Casos iguales», «Lo atendido»,
«Corregir tipo o categoría», «Moderación», «Escribir» y toda la historia. Cada quien ve los botones de lo que puede
hacer en ESE caso; si solo puedes leerlo, dice «Lo puedes consultar, pero no te toca atenderlo: sin contacto y sin
cambios.».

Un reporte de principio a fin:
1. **Léelo** completo. Si no es de tu área, avísale a la coordinación (ella cambia el área).
2. Pásalo a **«En revisión»** (en el tablero, de un toque).
3. **Asígnalo:** en «Área y responsable», «Guardar asignación», o «Tomar el caso» si es tuyo. Queda «Asignado».
4. **Respóndele a la persona** que ya lo tienen (§8): «Escribir» → «Respuesta a la persona» → «Enviar respuesta».
5. Mientras trabajan, **«En atención»**. Lo que hablen entre ustedes va en **notas internas**.
6. Si falta un dato: **«Pedir más información»**.
7. Al terminar, sube la **evidencia** (la foto del después) con «Subir evidencia».
8. **«Resuelto»** con «Cómo se resolvió (justificación)» y, mejor, un mensaje para la persona.
9. La persona confirma desde su consulta, o dice que no se resolvió y el caso vuelve solo a «En atención».
10. **«Cerrado»** con su motivo, cuando ya no hay más que hacer.
11. Si vale la pena contarlo, la coordinación lo publica en **«Lo atendido»** (§12).

## 6. Los estados y cuándo hace falta un motivo

En la tarjeta «Estado»: **«Pasar a»** → el estado → **«Cambiar el estado»**. La pantalla solo ofrece los pasos que
la base acepta.

| Estado | Lo que ve la persona | Cuándo | Motivo |
|---|---|---|---|
| **Recibido** | «Recibida» | Acaba de llegar | — |
| **En revisión** | «En revisión» | Alguien la está leyendo | — |
| **Asignado** | «Asignada» | Ya tiene área o responsable | — |
| **En atención** | «En atención» | El área está trabajando | — |
| **Requiere información** | «Necesitamos más información» | Falta un dato de la persona | **Sí:** «Qué información hace falta» y, para la persona, «Qué información necesitas (lo lee la persona)» |
| **Derivado** | «Derivada» | Se mandó al organismo que lo atiende | **Sí:** «A quién se derivó y por qué» |
| **Resuelto** | «Resuelta» | Se hizo lo que se pedía | **Sí:** «Cómo se resolvió (justificación)» |
| **Cerrado** | «Cerrada» | Terminó; no recibe más movimientos | **Sí:** «Por qué se cierra» |
| **No procede** | «No procede» | No se puede atender por esta vía | **Sí:** «Por qué no procede» |
| **Reabrir** (desde Resuelto, Cerrado o No procede) | El estado nuevo | Hay que volver a trabajarlo | **Sí:** «Por qué se reabre» |

- **El motivo es interno: la persona nunca lo lee.** Lo que ella lee es el cuadro «Mensaje para la persona
  (opcional)». En «No procede», «Derivado» y «Cerrado», escríbele unas líneas: su pantalla dice que el equipo le
  explicó por qué.
- Cuando la persona responde a un pedido de información, el caso vuelve solo a «En revisión».
- A un caso «Cerrado» o «No procede» la persona ya no le puede agregar información.

## 7. Asignar, prioridad y fecha comprometida

- Cada solicitud nueva llega al **área de su categoría** («Áreas y plazos», §19).
- **El área la cambia la coordinación** (y en una denuncia, el operador de denuncias). Un responsable asigna dentro de
  su área o se lo queda con «Tomar el caso». «Motivo (opcional)» queda en la historia.
- **Prioridad** (Baja, Normal, Alta, Urgente) → «Guardar prioridad», y **«Fecha comprometida»** → «Guardar fecha»: las
  pone la coordinación (y en una denuncia, el operador de denuncias). La fecha vale hasta el final de ese día.
- La fecha comprometida sale sola: **el menor** entre los días de la categoría y los de la prioridad (con la
  configuración de hoy: 15 días por categoría; Urgente 2 y Alta 5). Si nadie la puso a mano, cambia cuando cambia la
  prioridad.
- **La fecha comprometida es interna: la persona no la ve. Nunca se la prometas** (§18).
- Para cambiar quién tiene un caso terminado, primero hay que reabrirlo.

## 8. Escribir: nota interna, respuesta y pedido de información

En **«Escribir»**, elige en «Qué vas a escribir»:

| Qué | Quién lo lee | Botón |
|---|---|---|
| **Nota interna** | Solo el equipo. **La persona nunca la lee** | «Guardar nota interna» |
| **Respuesta a la persona** | La persona, en su consulta (y si dejó un correo, le llega un aviso sin el texto) | «Enviar respuesta» |
| **Pedir más información** | La persona; el caso pasa a «Requiere información» hasta que responda | «Pedir la información» |

**Nunca las mezcles.** Lo que es para el equipo (opiniones, nombres de funcionarios, lo que dijo otra persona, lo de
otros casos) va solo en notas internas. Antes de «Enviar respuesta», léela otra vez: la persona la lee tal cual y no se
puede borrar. En la historia, cada mensaje dice «no la ve la persona» o «la ve la persona». Ojo: auditoría y el jefe
leen las notas internas (está por decidir con el equipo, `docs/PENDIENTES.md`).

**Respuestas guardadas:** en «Usar una respuesta guardada», elige una, ajústala al caso y envíala. Las arma la
coordinación en la pestaña «Respuestas guardadas» («Nueva respuesta guardada» → «Crear la respuesta»; «Cambiar» →
«Guardar»; se pueden apagar), en dos grupos: «Responder» y «Pedir información». Sin nombres, teléfonos ni direcciones
de nadie.

## 9. El contacto de la persona

- **«Ver contacto»**: el contacto está cifrado y al verlo **queda registrado quién lo miró y cuándo**. Solo lo ven
  quienes atienden el caso. Si la mandó anónima, dice «La envió como anónima: no dejó contacto. Sigue el caso con su
  código.».
- Úsalo **solo para atender ese caso**. Nunca lo copies a grupos de WhatsApp, a notas personales ni a otro caso.
- La plataforma solo escribe **por correo**. Si la persona prefiere llamada o WhatsApp, sigue lo que diga la
  coordinación y deja una nota interna de lo hablado. Si eligió «Que no me contacten», no se le escribe.
- **La persona pidió borrar su contacto:** la coordinación abre «La persona pidió borrar su contacto», escribe el
  «Motivo» y toca «Borrar el contacto». No se puede recuperar; el caso sigue.

**Los correos de estado** salen después de una respuesta, un pedido de información, un cambio de estado o una unión de
casos. La respuesta y el pedido, solo a quien la mandó; un cambio de estado, también a quienes se sumaron y a los casos
unidos, cada uno con su código. Nunca llevan el texto del equipo, el tipo de solicitud ni la clave: dicen qué pasó y que
entre a «Consultar mi solicitud». **En la demostración no sale ninguno** (quedan en Ajustes → Buzón de correos). Con
datos reales salen solo cuando el envío de correos esté configurado; mientras tanto, la persona lo ve en su consulta.

## 10. Archivos y evidencias

- En **«Archivos»** están los de la persona y las evidencias del equipo. **Nunca son públicos.** «Ver la foto» o
  «Descargar».
- Cada archivo dice si se revisó: «Revisado: limpio», «Sin analizar», «Revisándose» o «Peligroso: no se abre». En la
  demo: «Archivos sin analizar (versión de prueba): ábrelos solo si confías en ellos.». **En producción solo se abre lo
  limpio**: sin el revisor de archivos instalado, nada se abre (`docs/PENDIENTES.md`).
- **Subir evidencia:** «Foto o documento de la atención» (JPG, PNG o PDF, hasta 8 MB; 4 MB en Vercel; a las fotos se
  les quita la ubicación) y «Que la vea la persona en su consulta» → «Subir evidencia». Después, «Compartir con la
  persona» o «Dejar de compartir». Antes de compartir, mira que no salgan caras de otras personas, placas ni
  documentos con datos.
- **«Retirar este archivo»** (coordinación; en denuncias, el operador): «Por qué se retira» → «Retirar». Se guarda pero
  no se sirve más.
- Descarga solo lo necesario. Nunca reenvíes los archivos de la gente ni los subas a la biblioteca de la web (esa es
  pública).

## 11. Casos iguales y apoyos

- **Apoyos («¿te sumas?»):** antes de enviar un reporte, la web le dice a la persona cuántos hay del mismo problema
  cerca y le ofrece sumarse. El cuarto del mismo problema en el mismo lugar se suma solo. En «Lo que llegó» sale «N
  personas o casos se sumaron»; lo que escribió cada una dice «(solo el equipo)». Quien se suma tiene su propio código.
- **Unir dos casos** (la coordinación), cuando son el mismo problema, del mismo tipo y abiertos: «Casos iguales» →
  «Buscar el otro caso» (por código o palabras) → «Elige el caso» → «¿Cuál se queda?» → «Motivo» → «Unir los casos».
  Las dos historias se guardan; el repetido se cierra y apunta al que se queda, y sus apoyos pasan a ese. Quien mandó
  el repetido lo sigue con su mismo código.
- Un caso unido dice «Este caso está unido a …: se atiende allí.». Se trabaja en el que se quedó.

## 12. «Lo atendido» y el anonimato

La coordinación publica en la web lo que se resolvió, **sin datos de la persona**. Sale en «Lo atendido» de la web y
en la portada. Solo para casos que se marcaron «Resuelto» (también si después se cerraron), nunca spam ni unidos.
- **«Resumen para la web»**: lo que se hizo, en pocas palabras. Sin nombres, teléfonos ni direcciones de nadie, ni
  detalles que la identifiquen («la señora de la casa azul frente a la plaza»).
- **El nombre:** solo si dio permiso («Nombre que sale (dio permiso)», míralo en «Ver contacto»). Si no, **iniciales**
  («Iniciales que salen (no dio permiso para su nombre)», por ejemplo «M. P.»). Si la mandó anónima, sin nombre ni
  iniciales. Se puede dejar vacío.
- **Una denuncia** sale solo como «Denuncia atendida en el municipio …»: sin nombre, sin categoría, sin texto.
- «Publicar en «Lo atendido»» (o «Actualizar la publicación»). Para quitarla: «Retirar de «Lo atendido»» → «Por qué
  se retira» → «Retirar».

## 13. Denuncias

- **Privadas de punta a punta:** solo las leen el operador de denuncias y la coordinación. El jefe y auditoría solo
  las cuentan en los totales; un responsable de área nunca las ve.
- **Nunca llevan el punto exacto ni un punto de referencia:** solo municipio y sector. Nunca van al mapa.
- El formulario le dice a la persona que acuda también a las autoridades competentes. **Los contactos de esas
  autoridades todavía no están en la web**: se agregan cuando el equipo los tenga verificados. No des números que nadie
  confirmó.
- Si una solicitud de otro tipo es en realidad una denuncia, la coordinación la corrige en «Corregir tipo o categoría»:
  pierde la ubicación exacta y sale del área.
- Los correos nunca dicen «denuncia»; los avisos internos dicen «Denuncia vencida» o «Denuncia sin movimiento».
- La plataforma no avisa a ninguna autoridad. Si una denuncia habla de un delito o de una vida en riesgo, avisa de
  inmediato a la coordinación: lo que se hace fuera de la plataforma lo decide ella (el protocolo está pendiente de la
  consulta legal).

## 14. Avisos de casos vencidos o quietos

- Un caso abierto que **pasó su fecha comprometida**, o que lleva **varios días sin movimiento** (5 por omisión; lo
  cambia Administración en «Áreas y plazos»), avisa **una vez al día por caso**, en la mañana (hoy la tarea diaria
  corre a las 7:00 a. m. del Táchira).
- Le llega a la coordinación y a su responsable (si nadie lo tiene, a los responsables de su área; en una denuncia, al
  equipo de denuncias), en la campana de «Avisos» y en el teléfono. Nunca por correo.
- El aviso dice solo el código: «Solicitud vencida: AC-…» o «Solicitud sin movimiento: AC-…». Nunca lo que escribió
  la persona.

## 15. Las cifras y lo que quiere decir cada una

En **«Cifras»** (coordinación, auditoría y el jefe): «Desde», «Hasta» y «Ver», o «Últimos 30 días», «Este mes» y
«Todo». Las definiciones son las mismas que dice la pantalla:

| Cifra | Qué cuenta |
|---|---|
| **Recibidas** | Solicitudes que llegaron entre las dos fechas. No cuentan el spam ni las que se unieron a otro caso igual |
| **Resueltas** | Solicitudes que el equipo marcó «Resuelto» entre las dos fechas, hayan llegado cuando hayan llegado |
| **Pendientes** | Solicitudes abiertas hoy (ni resueltas, ni cerradas, ni «No procede») que llegaron hasta la fecha final |
| **Vencidas** | De las pendientes, las que ya pasaron su fecha comprometida |
| **Tiempo a la primera respuesta** | Desde que llegó hasta la primera respuesta del equipo: una respuesta a la persona, un pedido de información o un cambio de estado. Cuenta las que llegaron entre las fechas y ya tienen respuesta. Una nota interna no es una respuesta |
| **Tiempo de resolución** | Desde que llegó hasta que el equipo la marcó «Resuelto». Cuenta las resueltas entre las fechas |
| **Mediana y promedio** | La mediana es el tiempo del caso del medio: la mitad tardó menos y la otra mitad más. El promedio se mueve mucho con unos pocos casos muy lentos |
| **Por tipo, estado, categoría, municipio y área** | Lo que llegó entre las fechas, por categoría, municipio y área. Para auditoría y el jefe, las denuncias cuentan solo en los totales por tipo y estado |

Sin datos, dice «Nada llegó en estas fechas.» o «Sin casos para medir en estas fechas.». Usa la mediana para decir
cuánto se tarda.

## 16. Exportar (CSV) y sus cuidados

- Al final de la bandeja, **«Exportar lo que ves (CSV)»**, con los filtros que tengas puestos: **«Descargar CSV»**. La
  coordinación tiene además **«Descargar con el contacto (queda registrado caso por caso)»**. Auditoría nunca recibe
  contactos ni denuncias, aunque los pida.
- El archivo es UTF-8 con «;» entre columnas, para que Excel en español lo abra con los acentos bien. Lleva: código,
  tipo, categoría, estado, prioridad, municipio, parroquia, sector, área, responsable, fechas (llegó, comprometida,
  primera respuesta, resuelta), si está vencida, apoyos, la confirmación de la persona, a qué caso se unió, si es spam
  y **el título** (más nombre, correo, teléfono y preferencia si se pidió el contacto). **No lleva** descripciones,
  mensajes ni archivos. Hasta 5.000 filas, las más viejas primero. Ninguna celda ejecuta fórmulas.
- **Cada exportación queda registrada** (quién, cuándo y con qué filtros).
- **Cuidados:** es información de personas. Exporta solo lo que necesitas; no lo mandes por WhatsApp ni por correo;
  no lo dejes en «Descargas» de una computadora compartida; bórralo cuando termines; nunca lo subas a una carpeta
  pública.

## 17. Spam, amenazas y datos expuestos

Están en **«Moderación»** (la coordinación; en denuncias, el operador de denuncias). Todo queda en la historia con su
motivo.
- **Una crítica o una queja nunca es spam:** se atiende, o se cierra con su motivo.
- **Spam** (publicidad, basura repetida, nada que atender): «Marcar como spam: por qué» → «Marcar como spam». Queda en
  «No procede», guardada, y no se le escribe a quien la envió. Sale de la bandeja (se ve con «Incluir las unidas a
  otro caso y el spam»).
- **Datos de alguien expuestos** (el teléfono de un vecino, el nombre y la dirección de otra persona, la foto de un
  documento): «Retirar un dato que expone a alguien» (el título, la descripción, el punto de referencia, la parroquia o
  sector, o la ubicación en el mapa) con su «Por qué» → «Retirar el dato». Un mensaje: «Retirar el texto de un
  mensaje» → «Retirar el texto» (queda «[Texto retirado por el equipo]»). Un archivo: «Retirar este archivo» (§10). Se
  reemplaza para siempre; la historia guarda qué dato y por qué, nunca lo que decía.
- **Amenazas** (al gobernador, al equipo o a otra persona): no la respondas desde el caso; avisa de inmediato a la
  coordinación; retira los datos que expongan a alguien; si no hay nada que atender, «No procede» con su motivo. Lo que
  se haga fuera de la plataforma lo decide la coordinación (el protocolo está pendiente de la consulta legal).

## 18. Lo que nunca se promete

- **Esto no es un servicio de emergencias.** En una emergencia, a los servicios de emergencia locales. Nunca digas
  «ya va la ambulancia» o «ya va la patrulla». (Los números oficiales de emergencia del estado todavía no están en la
  web: están «por completar».)
- **Ni fechas ni plazos.** La fecha comprometida es interna. Di lo que es cierto: «Lo estamos revisando», «Te
  avisaremos por aquí».
- **Ni resultados que no dependen del equipo:** una ayuda, una obra, la decisión de otro organismo.
- **Ni publicar su nombre sin su permiso**, ni contarle a otra persona que alguien escribió.
- **Nunca pidas datos de más:** ni cédula, ni afiliación política, ni nada que no haga falta para atender.

## 19. Áreas y plazos (Administración)

Lo arma Administración; la coordinación, auditoría y el jefe lo leen.
- **«Nueva área»**: «Nombre del área» y «Qué atiende» → «Crear el área». «Cambiar el nombre o apagarla» → «Guardar el
  área». Un área apagada no recibe casos nuevos.
- **Responsables:** «Agregar un responsable» → «Agregar»; «Quitar» para sacarlo.
- **«Categorías»**: a qué área va cada una y sus «Días» → «Guardar». Sin área, la asigna la coordinación.
- **«Plazos y avisos»**: los días por prioridad (gana el más corto entre este y el de la categoría; vacío: el de la
  categoría) y «Avisar de un caso sin movimiento después de (días)» → «Guardar los plazos».

## 20. El mapa

**«Mapa»**: solo los casos con un punto que la persona marcó **con su permiso**; las denuncias nunca. «Cuáles» (Las
abiertas o Todas), «Categoría», «Área» y «Ver». El mapa carga solo al tocar **«Ver el mapa»** (ahorra datos). Debajo,
«La lista de estos casos» y los que no tienen punto, contados en «Sin ubicación, por municipio».

## 21. El registro

**«Registro»** (auditoría y Administración): quién hizo qué y cuándo (cambios, contactos vistos y exportaciones). No
se edita ni se borra, y no guarda lo que dicen los casos.

## 22. Para probar en la demostración

En `/entrar`, la tarjeta «Versión de demostración», bajo «La web y la atención ciudadana»: coordinación, los dos
responsables (Servicios públicos y Vialidad y transporte), denuncias y auditoría. Los correos y los tres comprobantes
que abren su caso en «Consultar mi solicitud» están en `docs/DEMO.md`.

## 23. Lo que todavía no hace

- Los correos de estado necesitan el envío de correos configurado (`docs/PENDIENTES.md`).
- El tablero no arrastra tarjetas y muestra 12 por estado; la lista tiene todo.
- No hay filtros guardados.
- El CSV llega hasta 5.000 filas.
- Sin el revisor de archivos, en producción los archivos de la gente no se abren.
- Sin JavaScript, la persona no puede «Agregar información» (sí consultar y confirmar).
- Las evidencias, hasta 4 MB en Vercel.
