# Flujos de la web y de la atención ciudadana

> Hoy todo esto vive en la versión de prueba. Las solicitudes son inventadas. Ningún correo sale de la plataforma.

<!-- Escrito a mano desde el código, no desde los manuales: los estados y sus motivos salen de src/lib/domain/attention.ts y de supabase/migrations/20261106000200_participacion.sql; lo que hace la persona, de 20261106000300_citizen.sql y src/components/participation; los permisos de la web, de 20261106000110_web_publica.sql y src/lib/actions/web*.ts; el contenido real, de scripts/real-site y src/lib/db/seed-parts/web-real.ts. Si el código cambia, se cambia aquí. Cada diagrama se revisa para que quepa en una hoja A4 con la letra legible. -->

Cómo va cada cosa de la web pública y de la atención ciudadana. GitHub dibuja cada diagrama. Debajo de cada uno va lo que hay que saber. Los nombres de los botones están escritos tal como salen en la pantalla. El detalle de cada pantalla está en `MANUAL-ATENCION.md` y en `MANUAL-ADMIN-WEB.md`. Los flujos del panel están en `FLUJOS.md`.

- [Enviar una solicitud](#flujo-web-envio)
- [Consultar la solicitud](#flujo-web-consulta)
- [Una denuncia](#flujo-web-denuncia)
- [Un caso, de la bandeja al cierre](#flujo-web-caso)
- [Los estados: el camino de siempre](#flujo-web-estados)
- [Los estados: los desvíos](#flujo-web-desvios)
- [Casos iguales y apoyos](#flujo-web-iguales)
- [Spam](#flujo-web-spam)
- [Los correos que recibe la persona](#flujo-web-correos)
- [«Casos atendidos»](#flujo-web-atendidos)
- [Casos vencidos y sin movimiento](#flujo-web-avisos)
- [La web: escribir y enviar a aprobación](#flujo-web-contenido)
- [La web: revisar y decidir](#flujo-web-decidir)
- [La web: cambiar o quitar lo publicado](#flujo-web-arreglar)
- [Fotos y documentos](#flujo-web-fotos)
- [Ajustes del sitio](#flujo-web-ajustes)
- [Direcciones de la web vieja](#flujo-web-redirecciones)
- [El contenido real en la demo publicada](#flujo-web-real)

<a id="flujo-web-envio"></a>

## Enviar una solicitud
Lo hace cualquier persona, sin cuenta, en «Atención ciudadana» (`/atencion/nueva`).

```mermaid
flowchart TD
  envio_inicio["La persona: «Nueva solicitud». Paso 1, «Tipo»: el tipo y su «Categoría». Paso 2, «Lugar»: el «Municipio» y el sector."]
  envio_inicio --> envio_parecidos_q{"¿Hay parecidos?"}
  envio_parecidos_q -- Sí --> envio_parecidos["«Reportes parecidos»: cuántos hay cerca, nunca qué dicen."]
  envio_parecidos -- «Apoyar este reporte» --> envio_apoya["Un «Comentario», si quiere → «Enviar apoyo»."]
  envio_parecidos -- «No, es otro problema» --> envio_detalle
  envio_parecidos_q -- No --> envio_detalle["Paso 3, «Detalle»: «Título» y «Descripción». Si quiere, hasta 3 fotos o PDF."]
  envio_detalle --> envio_contacto["Paso 4, «Contacto»: su contacto, o «Enviar como anónimo» → «Enviar»."]
  envio_contacto --> envio_tres_q{"¿Ya hay 3 iguales?"}
  envio_tres_q -- Sí --> envio_apoyo["«Apoyo registrado»: se suma al reporte más viejo, con su propio código."]
  envio_apoya --> envio_apoyo
  envio_tres_q -- No --> envio_recibida["«Solicitud recibida»: su «Código» y su «Clave» → «Descargar comprobante (PDF)»."]
```

**Qué hay que saber**
- Los parecidos y el apoyo solo existen para un reporte. Quien apoya también recibe su código y su clave.
- Lo escrito se queda en esa pestaña. Si se va la señal, no se pierde. Tampoco se envía dos veces.
- La clave se muestra una sola vez. Nunca va por correo.
- Cada formulario avisa que esto no es un servicio de emergencias.

<a id="flujo-web-consulta"></a>

## Consultar la solicitud
Lo hace la persona con su código y su clave, en «Consultar mi solicitud» (`/atencion/consultar`).

```mermaid
flowchart TD
  consulta_entra["La persona: su «Código» y su «Clave» → «Consultar»."]
  consulta_entra --> consulta_bien_q{"¿Están bien?"}
  consulta_bien_q -- No --> consulta_no["«No hay ninguna solicitud con esos datos.»"]
  consulta_no --> consulta_entra
  consulta_bien_q -- Sí --> consulta_ve["Ve el «Estado» y el «Historial de la solicitud», con las respuestas."]
  consulta_ve --> consulta_estado_q{"¿Qué estado?"}
  consulta_estado_q -- «Requiere información» --> consulta_info["«Su respuesta» → «Enviar información»."]
  consulta_estado_q -- «Resuelta» --> consulta_res["«Sí, se resolvió» o «No, todavía no» → «Responder». También puede «Agregar información»."]
  consulta_estado_q -- Otro abierto --> consulta_mas["«Agregar información» → «Enviar información»."]
  consulta_info --> consulta_sale
  consulta_res --> consulta_sale
  consulta_mas --> consulta_sale
  consulta_sale["«Salir». Si no, se cierra sola a los 30 minutos."]
```

**Qué hay que saber**
- Dice lo mismo sea cual sea el error. Solo cuentan los intentos fallidos.
- Al responder lo que se le pidió, la solicitud vuelve a «En revisión». Con «No, todavía no», escribe «¿Qué falta por resolver?». La solicitud vuelve a «En atención».
- Nunca ve las notas internas ni el motivo de un cambio de estado. Tampoco ve quién del personal hizo cada cosa.
- Una solicitud «Cerrada» o «No procede» ya no recibe información. Quien apoyó un reporte ve solo su estado.

<a id="flujo-web-denuncia"></a>

## Una denuncia
La envía cualquier persona, como las demás. La atienden solo el operador de denuncias y la coordinación.

```mermaid
flowchart TD
  denuncia_entra["La persona: «Hacer una denuncia». El formulario avisa que es confidencial."]
  denuncia_entra --> denuncia_lugar["«Lugar aproximado»: solo el «Municipio» y el sector. Sin mapa."]
  denuncia_lugar --> denuncia_envia["«Enviar». La pantalla del comprobante repite el aviso de las denuncias."]
  denuncia_envia --> denuncia_llega["Llega a la «Bandeja» sin área. La ven solo el operador de denuncias y la coordinación."]
  denuncia_llega --> denuncia_atiende["Operador de denuncias o coordinación: la atienden. También le ponen prioridad y fecha comprometida."]
  denuncia_atiende --> denuncia_pub_q{"¿Se publica?"}
  denuncia_pub_q -- Sí --> denuncia_pub["«Casos atendidos» dice solo «Denuncia atendida en el municipio …»."]
  denuncia_pub_q -- No --> denuncia_nada["No sale nada en la web."]
```

**Qué hay que saber**
- El jefe y auditoría solo la cuentan en los totales. Un responsable de área nunca la ve.
- Su contenido nunca se publica. Nunca va al mapa.
- Los correos a la persona nunca dicen «denuncia». La plataforma no avisa a ninguna autoridad.
- Si otra solicitud es en realidad una denuncia, la coordinación la corrige en «Corregir tipo o categoría». Pierde la ubicación exacta y sale de su área.

<a id="flujo-web-caso"></a>

## Un caso, de la bandeja al cierre
Lo hacen la coordinación y los responsables de área, en «Atención» (`/admin/atencion`). En una denuncia, el operador de denuncias.

```mermaid
flowchart TD
  caso_llega["Llega a la «Bandeja» como «Recibido». Coordinación o responsable de área: lo lee y lo pasa a «En revisión»."]
  caso_llega --> caso_asigna["«Área y responsable» → «Guardar asignación», o «Tomar el caso». Queda «Asignado»."]
  caso_asigna --> caso_responde["«Escribir» → «Respuesta a la persona» → «Enviar respuesta». Después, «En atención»."]
  caso_responde --> caso_falta_q{"¿Falta un dato?"}
  caso_falta_q -- Sí --> caso_pide["«Pedir más información» → «Pedir la información». Queda «Requiere información»."]
  caso_pide -- la persona responde --> caso_responde
  caso_falta_q -- No --> caso_resuelve["«Subir evidencia». «Pasar a» → «Resuelto», con su justificación."]
  caso_resuelve --> caso_confirma_q{"¿Lo confirma?"}
  caso_confirma_q -- «No, todavía no» --> caso_reabre["Vuelve solo a «En atención»."]
  caso_reabre --> caso_resuelve
  caso_confirma_q -- Sí, o no contesta --> caso_cierra["«Pasar a» → «Cerrado», con «Por qué se cierra»."]
```

**Qué hay que saber**
- Llega con el área de su categoría. El área la cambia la coordinación.
- Un responsable de área ve lo de sus áreas y lo que le asignen. Un caso que no le toca no existe para él.
- Lo que es solo para el personal va en «Nota interna». La persona nunca la lee.
- Auditoría y el jefe leen el caso, pero no lo cambian. Administración nunca ve un caso.

<a id="flujo-web-estados"></a>

## Los estados: el camino de siempre
En el caso, «Estado» → «Pasar a» → «Cambiar el estado». La pantalla solo ofrece los pasos que la base acepta.

```mermaid
flowchart TD
  estados_recibido("Recibido")
  estados_revision("En revisión")
  estados_asignado("Asignado")
  estados_atencion("En atención")
  estados_resuelto("Resuelto (con motivo)")
  estados_cerrado("Cerrado (con motivo)")
  estados_recibido --> estados_revision
  estados_recibido --> estados_asignado
  estados_recibido --> estados_atencion
  estados_revision --> estados_asignado
  estados_revision --> estados_atencion
  estados_asignado --> estados_revision
  estados_asignado --> estados_atencion
  estados_atencion --> estados_asignado
  estados_atencion --> estados_resuelto
  estados_resuelto --> estados_cerrado
  estados_resuelto -->|"Reabrir: En atención (con motivo)"| estados_atencion
  estados_cerrado -->|"Reabrir: En revisión (con motivo)"| estados_revision
```

**Qué hay que saber**
- «Resuelto» pide «Cómo se resolvió (justificación)». «Cerrado» pide «Por qué se cierra».
- Reabrir pide «Por qué se reabre». El motivo es interno: la persona no lo ve.
- Lo que la persona lee va en «Mensaje para la persona (opcional)».
- Al asignarlo, un caso «Recibido» o «En revisión» pasa solo a «Asignado». El «No, todavía no» de la persona lo pasa solo a «En atención».

<a id="flujo-web-desvios"></a>

## Los estados: los desvíos
Cuando falta un dato o el caso no se atiende aquí. Se hace en el mismo «Pasar a».

```mermaid
flowchart TD
  desvio_abierto("Recibido, En revisión, Asignado o En atención")
  desvio_info("Requiere información (con motivo)")
  desvio_derivado("Derivado (con motivo)")
  desvio_noprocede("No procede (con motivo)")
  desvio_resuelto("Resuelto (con motivo)")
  desvio_cerrado("Cerrado (con motivo)")
  desvio_abierto -- falta un dato --> desvio_info
  desvio_abierto --> desvio_derivado
  desvio_abierto --> desvio_noprocede
  desvio_info -- a En revisión, Asignado o En atención --> desvio_abierto
  desvio_info --> desvio_noprocede
  desvio_info --> desvio_cerrado
  desvio_derivado -- a En atención --> desvio_abierto
  desvio_derivado --> desvio_resuelto
  desvio_derivado --> desvio_cerrado
  desvio_noprocede -->|"Reabrir: En revisión (con motivo)"| desvio_abierto
```

**Qué hay que saber**
- «Requiere información» pide «Qué información necesitas (lo lee la persona)». También se llega con «Escribir» → «Pedir más información».
- «Derivado» pide «A quién se derivó y por qué». «No procede» pide «Por qué no procede».
- Cuando la persona responde, el caso vuelve solo a «En revisión».
- A un caso «Cerrado» o «No procede» la persona ya no le agrega información.

<a id="flujo-web-iguales"></a>

## Casos iguales y apoyos
Los une la coordinación, desde la tarjeta «Casos iguales» del caso.

```mermaid
flowchart TD
  iguales_apoyo["La persona: «Apoyar este reporte», o su reporte se suma solo."]
  iguales_apoyo --> iguales_cuenta["«Lo que llegó» dice «N personas o casos se sumaron»."]
  iguales_busca["Coordinación: «Casos iguales» → «Buscar el otro caso» → «Buscar»."]
  iguales_busca --> iguales_elige["«Elige el caso» → «¿Cuál se queda?» → «Motivo» → «Unir los casos»."]
  iguales_elige --> iguales_q{"¿Se pueden unir?"}
  iguales_q -- No --> iguales_no["La pantalla dice por qué."]
  iguales_q -- Sí --> iguales_une["El repetido queda «Cerrado», unido al otro. Sus apoyos pasan al que se queda."]
  iguales_une --> iguales_sigue["Quien mandó el repetido lo sigue con su mismo código."]
```

**Qué hay que saber**
- Solo se unen casos del mismo tipo, y los dos abiertos. Las dos historias se guardan.
- Un caso unido dice «Este caso está unido a …: se atiende allí.». Se trabaja en el que se quedó.
- Lo que escribe quien se suma lo lee solo el personal. Quien se suma nunca ve el texto del reporte.

<a id="flujo-web-spam"></a>

## Spam
Lo marca la coordinación en «Moderación». En una denuncia, también el operador de denuncias.

```mermaid
flowchart TD
  spam_lee["Coordinación: lee el caso."]
  spam_lee --> spam_queja_q{"¿Crítica o queja?"}
  spam_queja_q -- Sí --> spam_queja["Nunca es spam: se atiende, o se cierra con su motivo."]
  spam_queja_q -- No --> spam_basura_q{"¿Publicidad o basura?"}
  spam_basura_q -- No --> spam_sigue["Sigue la atención de siempre."]
  spam_basura_q -- Sí --> spam_marca["«Marcar como spam: por qué» → «Marcar como spam»."]
  spam_marca --> spam_queda["Queda «No procede», con la etiqueta «Spam». Sale de la bandeja."]
  spam_queda --> spam_correo["No se le escribe a quien la envió."]
```

**Qué hay que saber**
- Lo marcado como spam se guarda. Se ve con «Incluir las unidas a otro caso y el spam».
- Un dato que expone a alguien se quita con «Retirar un dato que expone a alguien». La historia guarda qué dato y por qué, nunca lo que decía.

<a id="flujo-web-correos"></a>

## Los correos que recibe la persona
Los manda la plataforma sola, después de cada paso.

```mermaid
flowchart TD
  correo_envia["La persona envía su solicitud o su apoyo."]
  correo_envia --> correo_q{"¿Dejó un correo?"}
  correo_q -- No --> correo_no["No le llega ningún correo. Todo está en «Consultar mi solicitud»."]
  correo_q -- Sí --> correo_recibida["Al enviar: «Solicitud recibida AC-…», o «Apoyo registrado AC-…»."]
  correo_recibida -.-> correo_respuesta["Si le responden: «Respuesta a su solicitud AC-…»."]
  correo_respuesta -.-> correo_pedido["Si le piden información: «Se necesita información sobre su solicitud AC-…»."]
  correo_pedido -.-> correo_estado["Si cambia de estado: «Su solicitud AC-…: Resuelta», con el estado nuevo."]
  correo_estado -.-> correo_union["Si se une a otra: «Su solicitud AC-… se tramita junto con otra»."]
```

**Qué hay que saber**
- Si eligió «Prefiero que no me contacten», no le llega ninguno. Una nota interna o un caso marcado como spam tampoco mandan correo.
- La respuesta y el pedido de información le llegan solo a quien la envió. El cambio de estado también les llega a quienes se sumaron o mandaron un caso unido, cada uno con su código.
- Cada correo lleva a «Consultar mi solicitud». Nunca lleva la clave ni lo que escribió el personal. Nunca dice «denuncia».
- En la demostración no sale ninguno: quedan en «Ajustes» → «Buzón de correos». Con datos reales, salen cuando el envío de correos esté configurado.

<a id="flujo-web-atendidos"></a>

## «Casos atendidos»
Lo publica la coordinación desde el caso, cuando ya está «Resuelto».

```mermaid
flowchart TD
  atendido_abre["Coordinación: en un caso «Resuelto», la tarjeta «Casos atendidos»."]
  atendido_abre --> atendido_denuncia_q{"¿Es denuncia?"}
  atendido_denuncia_q -- Sí --> atendido_denuncia["«Publicar en «Casos atendidos»». Sale solo «Denuncia atendida en el municipio …»."]
  atendido_denuncia_q -- No --> atendido_resumen["«Resumen para la web»: lo que se hizo, sin datos de nadie."]
  atendido_resumen --> atendido_permiso_q{"¿Dio permiso?"}
  atendido_permiso_q -- Sí --> atendido_nombre["Su nombre en «Nombre que sale (dio permiso)», o nada → «Publicar en «Casos atendidos»»."]
  atendido_permiso_q -- No --> atendido_iniciales["Sus iniciales en «Iniciales que salen (no dio permiso para su nombre)», como «M. P.», o nada → «Publicar en «Casos atendidos»»."]
```

**Qué hay que saber**
- Sale en `/atencion/atendido` y en la portada. Solo de casos resueltos, nunca de uno marcado como spam o unido a otro.
- El permiso lo da la persona en el formulario. Sin él, la base solo acepta iniciales. Una solicitud anónima sale sin nombre ni iniciales.
- «Actualizar la publicación» cambia el texto. «Retirar de «Casos atendidos»» lo quita, con su motivo.
- En la demo con el contenido real no hay casos publicados. La portada no tiene «Casos atendidos».

<a id="flujo-web-avisos"></a>

## Casos vencidos y sin movimiento
Los avisa la plataforma sola, cada mañana, a quienes atienden el caso.

```mermaid
flowchart TD
  aviso_fecha["Al llegar, el caso recibe su fecha comprometida. La persona nunca la ve."]
  aviso_fecha --> aviso_revisa["La plataforma, cada mañana desde las 7:00 a. m. del Táchira: revisa los casos abiertos."]
  aviso_revisa --> aviso_vencida_q{"¿Pasó su fecha?"}
  aviso_vencida_q -- Sí --> aviso_vencida["«Solicitud vencida: AC-…»"]
  aviso_vencida_q -- No --> aviso_quieto_q{"¿5 días sin movimiento?"}
  aviso_quieto_q -- Sí --> aviso_quieto["«Solicitud sin movimiento: AC-…»"]
  aviso_quieto_q -- No --> aviso_nada["Ese día, nada."]
  aviso_vencida --> aviso_quien
  aviso_quieto --> aviso_quien
  aviso_quien["Le llega a la coordinación y a su responsable, en «Avisos» y en el teléfono. Una vez al día."]
```

**Qué hay que saber**
- La fecha es el menor entre los días de la categoría y los de la prioridad. Hoy son 15 días. Urgente baja a 2 y Alta a 5.
- Sin responsable, el aviso les llega a los responsables de su área. En una denuncia, a los operadores de denuncias.
- Los 5 días los cambia Administración en «Áreas y plazos». Cuenta como movimiento cualquier cambio o mensaje del caso.
- El aviso dice solo el código. Nunca va por correo. En una denuncia dice «Denuncia vencida» o «Denuncia sin movimiento».

<a id="flujo-web-contenido"></a>

## La web: escribir y enviar a aprobación
Lo hace el editor de la web, en «Web» (`/admin/web`). También pueden el aprobador y el jefe.

```mermaid
flowchart TD
  contenido_nuevo["Editor: «Web» → un tipo, como «Noticias y comunicados» → «Nueva noticia» → «Título» → «Crear borrador»."]
  contenido_nuevo --> contenido_escribe["Escribe → «Guardar borrador». Cada guardado queda como una versión."]
  contenido_escribe --> contenido_previa["«Vista previa»: lo ve como saldrá, sin publicarlo."]
  contenido_previa --> contenido_falta_q{"¿Falta algo?"}
  contenido_falta_q -- Sí --> contenido_falta["«Para enviarlo a aprobación falta esto»: lo completa."]
  contenido_falta --> contenido_escribe
  contenido_falta_q -- No --> contenido_envia["«Enviar a aprobación»: queda «En revisión»."]
  contenido_envia --> contenido_aviso["Al aprobador le llega «Hay contenido de la web por aprobar»."]
  contenido_aviso -. si hace falta .-> contenido_retira["«Retirar de revisión»: vuelve a borrador."]
  contenido_retira --> contenido_escribe
```

**Qué hay que saber**
- El editor escribe y envía, pero nunca publica.
- Las páginas no se crean: se editan. La portada se arma por bloques.
- Lo que se escribe y no se guarda queda solo en ese teléfono o esa computadora. Solo «Guardar borrador» lo sube.
- Administración lee todo, los borradores también. Nunca escribe ni publica contenido.

<a id="flujo-web-decidir"></a>

## La web: revisar y decidir
Lo hacen el aprobador de la web y el jefe, en «Web» → «Por aprobar».

```mermaid
flowchart TD
  decidir_abre["Aprobador o jefe: «Por aprobar» → el contenido. Mira «Qué cambia si lo publicas» y la vista previa."]
  decidir_abre --> decidir_sale_q{"¿Sale así?"}
  decidir_sale_q -- No --> decidir_devuelve["«Qué hay que cambiar» → «Devolver con comentario». Vuelve a borrador."]
  decidir_devuelve --> decidir_aviso_dev["A quien lo envió le llega «Te devolvieron un contenido de la web»."]
  decidir_sale_q -- Sí --> decidir_ahora_q{"¿Sale ahora?"}
  decidir_ahora_q -- Sí --> decidir_publica["«Publicar ahora»: queda «Publicado» en ese momento."]
  decidir_ahora_q -- No --> decidir_programa["«Día» y «Hora» del Táchira → «Programar»: queda «Programado»."]
  decidir_publica --> decidir_aviso["A quien lo envió le llega «Tu contenido ya está en la web» o «Tu contenido de la web quedó programado»."]
  decidir_programa --> decidir_aviso
```

**Qué hay que saber**
- Con «Le falta esto para publicarse», «Publicar ahora» no se puede tocar.
- Se publica exactamente lo que se revisó. Si alguien cambió el borrador mientras tanto, la base no publica.
- Lo que ya está en la web no se programa: sus cambios se publican ahora. «Quitar la programación» devuelve a borrador algo programado.
- El aviso de «Por aprobar» le llega solo al aprobador. El jefe lo ve en la lista.

<a id="flujo-web-arreglar"></a>

## La web: cambiar o quitar lo publicado
Para lo que ya está en la web. Archivan el aprobador y el jefe. Volver a una versión lo puede hacer también el editor.

```mermaid
flowchart TD
  arreglo_mal["Algo publicado salió mal."]
  arreglo_mal --> arreglo_q{"¿Qué pasó?"}
  arreglo_q -- Se publicó por error --> arreglo_archiva["Aprobador o jefe: «Archivar». Sale de la web al momento, sin borrar nada."]
  arreglo_archiva --> arreglo_desarchiva["Si hace falta, «Desarchivar» vuelve a poner lo que estaba aprobado."]
  arreglo_q -- Un cambio equivocado --> arreglo_versiones["«Versiones»: cada borrador guardado. «Ver» lo abre en la vista previa."]
  arreglo_versiones --> arreglo_vuelve["«Volver a esta versión»: se copia al borrador como una versión nueva."]
  arreglo_vuelve --> arreglo_publica["Para que salga, se envía a aprobación y se publica otra vez."]
```

**Qué hay que saber**
- Mientras no se publique otra vez, la web sigue mostrando lo aprobado. La lista dice «Cambios sin publicar».
- En «Versiones», «Borrador actual» y «La publicada» marcan cuál es cuál.
- No hay botón de borrar: lo que sobra se archiva. Un contenido archivado no se cambia hasta desarchivarlo.

<a id="flujo-web-fotos"></a>

## Fotos y documentos
Los sube el editor de la web, en «Web» → «Biblioteca». También pueden el aprobador y el jefe.

```mermaid
flowchart TD
  foto_sube["Editor: «Biblioteca» → «Subir una foto» o «Subir un PDF»."]
  foto_sube --> foto_limpia["La foto se achica y pierde la ubicación y los datos de la cámara antes de subir."]
  foto_limpia --> foto_punto["«Punto de interés»: toca en la foto lo que siempre debe verse."]
  foto_punto --> foto_alt["«Texto alternativo», obligatorio. «Pie de foto» y «Crédito», si quiere → «Subir la foto»."]
  foto_alt --> foto_usa["En el editor: «Elegir foto» → «De la biblioteca»."]
  foto_usa --> foto_q{"¿Se puede enviar?"}
  foto_q -- No --> foto_frena["Lo frena una foto archivada, o que dice «[Por escribir]». También una marca como «[correo retirado]»."]
  foto_frena --> foto_usa
  foto_q -- Sí --> foto_congela["Al publicar, cada foto se congela con sus textos."]
```

**Qué hay que saber**
- Todo lo que está en la biblioteca es público. Nunca fotos ni archivos de quienes escriben a Atención ciudadana.
- Sin «Texto alternativo», una foto no se sube: la base lo exige. Un PDF pide su «Título del documento».
- En Vercel, cada archivo llega hasta 4 MB.
- Cambiar los textos de una foto no toca lo publicado hasta publicarlo otra vez. «Archivar» la saca de la biblioteca, pero lo publicado la sigue mostrando.

<a id="flujo-web-ajustes"></a>

## Ajustes del sitio
Los cambian el aprobador y el jefe, en «Web» → «Ajustes del sitio». También Administración.

```mermaid
flowchart TD
  ajustes_entra["Aprobador o jefe, también Administración: «Web» → «Ajustes del sitio»."]
  ajustes_entra --> ajustes_real_q{"¿Demo con lo real?"}
  ajustes_real_q -- Sí --> ajustes_bloqueo["Solo se cambian «Navegación» y «Pie de página». El nombre, las cuentas, los contactos y la franja de aviso no se cambian."]
  ajustes_real_q -- No --> ajustes_cambia["Cambia la sección que haga falta, como «Cuentas en redes»."]
  ajustes_bloqueo --> ajustes_guarda
  ajustes_cambia --> ajustes_guarda
  ajustes_guarda["«Guardar»: «Guardado. La web ya lo muestra.» No pasa por aprobación."]
```

**Qué hay que saber**
- Lo que se guarda aquí sale en la web al momento. Por eso nunca va un dato que nadie confirmó.
- Un contacto sale solo marcado «Verificado». En producción, una cuenta sale solo «Activa» y «Verificada».
- Los «Avisos legales» se ven, pero no se cambian aquí. Son un solo texto de la app.
- El editor de la web no entra a «Ajustes del sitio».

<a id="flujo-web-redirecciones"></a>

## Direcciones de la web vieja
Las cambian el aprobador y el jefe, en «Web» → «Redirecciones». También Administración.

```mermaid
flowchart TD
  direccion_nueva["Aprobador o jefe, también Administración: «Redirecciones» → «Nueva redirección»."]
  direccion_nueva --> direccion_llena["«Dirección vieja» y «Lleva a» → «Agregar la redirección»."]
  direccion_llena --> direccion_ok["«Redirección guardada. La dirección vieja ya lleva a la nueva.»"]
  direccion_ok --> direccion_visita["Después, alguien abre una dirección vieja."]
  direccion_visita --> direccion_tiene_q{"¿Tiene redirección?"}
  direccion_tiene_q -- Sí --> direccion_va["Lo lleva a la nueva."]
  direccion_tiene_q -- No --> direccion_archivo_q{"¿Archivo viejo?"}
  direccion_archivo_q -- Sí --> direccion_gone["«Este archivo de la web anterior ya no está disponible.»"]
  direccion_archivo_q -- No --> direccion_404["«Esta página no existe»."]
```

**Qué hay que saber**
- No se redirige una dirección que la web ya usa. Tampoco se hacen dos desde la misma.
- Las del importador dicen «Del importador». Las demás dicen «A mano». El importador nunca las pisa.
- Cuando quien aprueba cambia la «Dirección en la web» de algo publicado, la vieja sigue llevando a la nueva sola.
- Un cambio se nota en la web en más o menos un minuto. Un archivo viejo es uno de `/wp-content/`.

<a id="flujo-web-real"></a>

## El contenido real en la demo publicada
Pasa solo, cada vez que Vercel construye la demo publicada (D-101).

```mermaid
flowchart TD
  real_construye["Vercel construye la demo publicada, en producción. Lee la web oficial y el canal de YouTube. También el último Semanario."]
  real_construye --> real_responde_q{"¿Respondió?"}
  real_responde_q -- No --> real_copia_q{"¿Copia reciente?"}
  real_copia_q -- No --> real_inventado["La demo sale con el contenido inventado."]
  real_copia_q -- Sí --> real_siembra
  real_responde_q -- Sí --> real_siembra["Lo guarda fuera de git, en .real-site/. Cada servidor de la demo lo siembra al arrancar."]
  real_siembra --> real_ve["Se ve: noticias, opinión, biografía y fotos reales, con la franja «Versión de prueba en revisión. No es el sitio oficial.»"]
  real_siembra --> real_oculta["No sale: «Gestión en cifras», «Casos atendidos», «Gestión y obras» ni «Avisos de servicio»."]
  real_siembra --> real_sigue["Sigue inventado: las 60 solicitudes y los tres comprobantes de prueba. El panel también, menos «Web»."]
```

**Qué hay que saber**
- Se apaga con `DATABASE_URL` o con `REAL_SITE_CONTENT=0`. Las pruebas ven siempre lo inventado.
- Trae hasta 48 noticias y 8 de opinión, las más nuevas. Del canal, hasta 12 emisiones. En «Web», cada noticia dice «Traído de la web vieja».
- Una copia sirve si tiene menos de una semana. Si solo YouTube o el Semanario no responden, esa parte sale de la copia.
- El menú tampoco tiene «Gestión y obras». Nadie puede cambiar el nombre ni las cuentas en «Ajustes del sitio»: la demo no debe pasar por la web oficial.
