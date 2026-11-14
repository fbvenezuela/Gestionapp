// «Manual de atención ciudadana» (docs/MANUAL-ATENCION.md): the panel's «Atención», screen by screen. Part 5 of
// «Guía de la web y sus flujos»: its sections are 5.1 to 5.23 (`pdf`).
// Ported 1:1 from the doc (WF-C, design §4(a)): one source for the doc (src/lib/guides/render-web-md.ts writes it back
// byte for byte), «Ayuda y guías» and 360. Never edit the .md: edit this and run `npm run docs:guides`. Text with the
// screen's labels in «» (exact), the client's words as huecos ([PROGRAMA], [SEMANARIO], [WEB_OFICIAL]) that
// fillClientWords() fills from config/clients/<brand>.json. `wrap`: only for the doc (the length of each of its lines);
// change a text and drop its `wrap`. 360's fields of each section (what, items, tasks, cannot, rules, faq, easy, example,
// why) are filled in the next round; `audience` says to whom 360 explains it (design §4(d)).
import type { WebDoc } from '../types';

export const MANUAL_ATENCION: WebDoc = {
  id: 'manual-atencion',
  file: 'docs/MANUAL-ATENCION.md',
  title: 'Manual de atención ciudadana',
  date: '09/11/2026',
  width: 119,
  sections: [
    {
      id: 'manual-atencion',
      pdf: '5.0',
      title: 'Manual de atención ciudadana',
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: 'Para quienes atienden lo que la gente manda desde la web: la coordinación de atención, los responsables de área, el operador de denuncias, auditoría, el jefe y Administración. Todo está en el panel, en el menú **«Atención»**, que abre la pantalla «Atención ciudadana». En el teléfono, el jefe y Administración lo encuentran en «Más». Lo que va entre comillas, «así», es el texto exacto que sale en la pantalla.', wrap: [106, 113, 118, 86] },
        {
          kind: 'note',
          paras: [
            '**Hoy se usa una versión de prueba.** Arriba de cada página de la web dice «Versión de prueba en revisión. No es el sitio oficial.». Google no la muestra. Las noticias, las columnas de opinión, la biografía y el Semanario son una copia de la web oficial, [WEB_OFICIAL] (ver [§prueba-que-es]). En «Atención» hay 60 solicitudes de ejemplo para practicar: todas llevan «(demo)» en el título. Los comprobantes de prueba se abren en «Consultar mi solicitud» (ver [§practicar]).',
            'Por ahora la versión de prueba no envía correos. No escribas datos reales de nadie: lo que se envía en la versión de prueba lo puede ver cualquiera que la use. El formulario de la web lo avisa con «Versión de prueba. No escriba datos reales.».',
          ],
        },
        { kind: 'p', text: '**La idea en una línea:** cada solicitud es privada y tiene un **código** (por ejemplo `AC-2026-K7QM2H`). La persona la sigue con su código y su **clave** en «Consultar mi solicitud». Nadie del equipo ve esa clave ni la puede recuperar.', wrap: [116, 108, 10] },
      ],
    },
    {
      id: 'atencion-quien-ve-y-hace',
      pdf: '5.1',
      title: 'Quién ve y hace qué',
      heading: { level: 2, num: '1.' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'table',
          head: ['Rol', 'Ve', 'Hace'],
          rows: [
            ['**Coordinador de atención**', 'Todo, denuncias también', 'Todo: asignar a cualquier área, prioridad y fecha comprometida, unir casos, corregir tipo o categoría, moderar, borrar un contacto a pedido, «Casos atendidos», «Respuestas guardadas», cifras y exportar (con o sin contacto)'],
            ['**Responsable de área**', 'Lo de sus áreas y lo que le asignen. **Nunca denuncias**', 'Responder, notas internas, estados, evidencias y ver el contacto. Asigna dentro de su área o usa «Tomar el caso»'],
            ['**Operador de denuncias**', '**Solo denuncias**', 'Lo mismo que un responsable. Además, en las denuncias pone prioridad y fecha, y modera. Una denuncia no tiene área'],
            ['**Consulta y auditoría**', 'Todo menos las denuncias (que cuentan solo en los totales), sin contactos', 'Solo lee. Ve las cifras, exporta sin contactos y lee el «Registro»'],
            ['**Jefe**', 'Como auditoría', 'Solo lee y ve las cifras'],
            ['**Administración**', '**Nunca un caso**', 'Arma las áreas, quién está en cada una, el área y los días de cada categoría y los plazos («Áreas y plazos»). Lee el «Registro»'],
          ],
        },
        {
          kind: 'list',
          items: [
            '**Siempre con doble factor:** el código que llega por correo y Google Authenticator. No hay contraseñas. En la versión de prueba se entra con un toque, sin código (ver [§practicar]).',
            '**Teléfono perdido:** Administración → «Ajustes» → «Equipo» → «Cambiar» en la fila de la persona → «Reiniciar doble factor».',
            '**Cómo se da el rol:** Administración → «Ajustes» → «Equipo» → «Invitar a alguien». El rol va en «Web y atención ciudadana (siempre con doble factor)» → «Enviar invitación». A un responsable se le marcan sus áreas en «Sus áreas (ve y atiende lo de estas áreas y lo que le asignen)». Después se cambian con «Cambiar».',
            'Un caso que no te toca **no lo ves**: no sale en tu lista. Aunque alguien te mande su enlace, la pantalla dice «No encontramos esto».',
          ],
        },
      ],
    },
    {
      id: 'seis-tipos',
      pdf: '5.2',
      title: 'Lo que llega: seis tipos',
      heading: { level: 2, num: '2.' },
      audience: ['boss'],
      blocks: [
        {
          kind: 'table',
          head: ['Tipo', 'Lo que dice el formulario'],
          rows: [
            ['**Reporte**', '«Fallas en los servicios públicos de su comunidad.»'],
            ['**Petición**', '«Solicitudes de ayuda o de apoyo al despacho del gobernador.»'],
            ['**Observación**', '«Opiniones u observaciones sobre la gestión, una obra o una publicación.»'],
            ['**Sugerencia**', '«Propuestas para mejorar un servicio.»'],
            ['**Reconocimiento**', '«Agradecimientos por un trabajo bien hecho.»'],
            ['**Denuncia**', '«Hechos irregulares que deben investigarse. Es confidencial.» Es privada de punta a punta (ver [§denuncias])'],
          ],
        },
        { kind: 'p', text: 'Cada formulario dice que **esto no es un servicio de emergencias**, con estas palabras: «Esto no es un servicio de emergencias. Ante una emergencia o si una vida está en peligro, llame a los servicios de emergencia.». Ese aviso no se cambia desde el panel (ver [§lo-que-nunca-se-promete]).' },
        { kind: 'p', text: '**La web le habla de usted a la persona** y firma como «Atención ciudadana». Lo que le escribas también va de usted.' },
      ],
    },
    {
      id: 'bandeja-y-tablero',
      pdf: '5.3',
      title: 'La bandeja y el tablero',
      heading: { level: 2, num: '3.' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: 'Arriba, las pestañas de lo que tu rol puede usar: **«Bandeja»**, **«Tablero»**, **«Mapa»**, **«Cifras»**, **«Áreas y plazos»**, **«Respuestas guardadas»** y **«Registro»**.' },
        { kind: 'p', text: 'Cuatro números cuentan lo que puedes ver, sin el spam ni lo unido a otro caso:' },
        {
          kind: 'table',
          head: ['Número', 'Cuenta'],
          rows: [
            ['**Por revisar**', 'Recibido y En revisión'],
            ['**En atención**', 'Asignado, En atención, Requiere información y Derivado'],
            ['**Resueltas**', 'Resuelto y Cerrado'],
            ['**Vencidas**', 'Abiertas que ya pasaron su fecha comprometida'],
          ],
        },
        {
          kind: 'list',
          items: [
            '**Bandeja:** tarjetas en el teléfono y una tabla desde la tableta, 25 por página. Arriba dice cuántas hay en cada estado. Cada una muestra su código, su tipo y su estado. También dice «Vencida» si ya pasó su fecha, y la prioridad si no es normal.',
            '**Tablero:** una columna por estado, de Recibido a Resuelto, y una última de «Cerradas y «No procede»». Cada columna muestra las más nuevas, hasta 12. Si hay más, sale un enlace con cuántas son, por ejemplo «Ver las 140 en la lista». El botón de un toque (por ejemplo «→ En revisión») da el paso de siempre cuando no pide motivo. Para lo demás, «Otro estado…» abre el caso. Las tarjetas no se arrastran.',
          ],
        },
      ],
    },
    {
      id: 'buscar-y-filtrar',
      pdf: '5.4',
      title: 'Buscar y filtrar',
      heading: { level: 2, num: '4.' },
      audience: ['boss'],
      blocks: [
        {
          kind: 'list',
          items: [
            '**«Buscar por código o título»:** el código entero o una parte (por ejemplo `AC-2026-K7`), o palabras del título. También están **«Estado»** y el botón **«Filtrar»**.',
            '**«Más filtros»:** Tipo, Categoría, Municipio, Parroquia (sale cuando esté la lista oficial de parroquias), «Parroquia, localidad o sector», Prioridad, Área («Sin área»), Responsable («Las mías», «Sin responsable» o una persona), «Llegó desde», «Llegó hasta», «Solo las vencidas» e «Incluir las unidas a otro caso y el spam».',
            '**«Quitar los filtros»** vuelve a todo.',
            'Si copias la dirección de la página (arriba, en el navegador) y se la mandas a un compañero, verá los mismos filtros, pero solo lo que su rol le deja ver.',
          ],
          wrap: { 3: [108, 45] },
        },
      ],
    },
    {
      id: 'un-caso',
      pdf: '5.5',
      title: 'Un caso, paso a paso',
      heading: { level: 2, num: '5.' },
      audience: ['boss'],
      blocks: [
        { kind: 'p', text: 'Al abrir un caso se ve el título, el código, el tipo y el estado. Si aplica, también «Vencida», la prioridad y «Spam». Debajo está **«Lo que llegó»**: el texto, la categoría, dónde, cuándo pasó, si marcó un punto con su permiso, si dejó contacto, si permite su nombre y la noticia u obra de la que habla. Después vienen las tarjetas «Estado», «Área y responsable», «Prioridad y fecha comprometida», «Contacto de la persona», «Archivos», «Resolución», «Casos iguales», «Casos atendidos», «Corregir tipo o categoría», «Moderación», «Escribir» y el «Historial». Cada quien ve los botones de lo que puede hacer en **ese** caso. Si solo puedes leerlo, dice «Lo puedes consultar, pero no te toca atenderlo: sin contacto y sin cambios.».' },
        { kind: 'p', text: 'Un reporte de principio a fin:' },
        {
          kind: 'steps',
          items: [
            '**Léelo** completo. Si no es de tu área, avísale a la coordinación: ella cambia el área.',
            'Pásalo a **«En revisión»**. En el tablero es un toque.',
            '**Asígnalo** en «Área y responsable» con «Guardar asignación», o con «Tomar el caso» si es tuyo. Queda «Asignado».',
            '**Respóndele a la persona** que ya lo tienen (ver [§escribir]): «Escribir» → «Respuesta a la persona» → «Enviar respuesta».',
            'Mientras trabajan, pásalo a **«En atención»**. Lo que hablen entre ustedes va en **notas internas**.',
            'Si falta un dato, usa **«Pedir más información»**.',
            'Al terminar, sube la **evidencia** (la foto del después) con «Subir evidencia».',
            'Pásalo a **«Resuelto»** con «Cómo se resolvió (justificación)». Mejor si le dejas también un mensaje a la persona.',
            'La persona confirma desde su consulta. Ahí ve «¿Se resolvió el problema?», con «Sí, se resolvió» y «No, todavía no». Si dice que no, el caso vuelve solo a «En atención».',
            'Pásalo a **«Cerrado»** con su motivo cuando ya no haya más que hacer.',
            'Si vale la pena contarlo, la coordinación lo publica en **«Casos atendidos»** (ver [§casos-atendidos]).',
          ],
          wrap: { 8: [111, 57] },
        },
      ],
    },
    {
      id: 'estados',
      pdf: '5.6',
      title: 'Los estados y cuándo hace falta un motivo',
      heading: { level: 2, num: '6.' },
      audience: ['boss'],
      blocks: [
        { kind: 'p', text: 'En la tarjeta «Estado»: **«Pasar a»** → el estado → **«Cambiar el estado»**. La lista solo trae los pasos que se pueden dar desde el estado en que está el caso. Los que piden motivo dicen «(con motivo)».', wrap: [112, 90] },
        {
          kind: 'table',
          head: ['Estado', 'Lo que ve la persona', 'Cuándo', 'Motivo'],
          rows: [
            ['**Recibido**', '«Recibida»', 'Acaba de llegar', 'No'],
            ['**En revisión**', '«En revisión»', 'Alguien la está leyendo', 'No'],
            ['**Asignado**', '«Asignada»', 'Ya tiene área o responsable', 'No'],
            ['**En atención**', '«En atención»', 'El área está trabajando', 'No'],
            ['**Requiere información**', '«Requiere información»', 'Falta un dato de la persona', '**Sí:** «Qué información necesitas (lo lee la persona)». Este sí lo lee la persona'],
            ['**Derivado**', '«Derivada»', 'Se mandó al organismo que lo atiende', '**Sí:** «A quién se derivó y por qué»'],
            ['**Resuelto**', '«Resuelta»', 'Se hizo lo que se pedía', '**Sí:** «Cómo se resolvió (justificación)»'],
            ['**Cerrado**', '«Cerrada»', 'Terminó. No recibe más movimientos', '**Sí:** «Por qué se cierra»'],
            ['**No procede**', '«No procede»', 'No se puede atender por esta vía', '**Sí:** «Por qué no procede»'],
            ['**Reabrir** («Reabrir: …», desde Resuelto, Cerrado o No procede)', 'El estado nuevo', 'Hay que volver a trabajarlo', '**Sí:** «Por qué se reabre»'],
          ],
        },
        {
          kind: 'list',
          items: [
            '**El motivo es interno: la persona nunca lo lee.** Ella lee el cuadro «Mensaje para la persona (opcional)». En «No procede», su consulta dice «Se explicó por qué no puede atenderse por esta vía.»: escríbele siempre esas líneas. En «Derivado» y «Cerrado», escríbele también unas líneas.',
            'Cuando la persona responde a un pedido de información, el caso vuelve solo a «En revisión».',
            'A un caso «Cerrado» o «No procede» la persona ya no le puede agregar información.',
          ],
        },
      ],
    },
    {
      id: 'asignar',
      pdf: '5.7',
      title: 'Asignar, prioridad y fecha comprometida',
      heading: { level: 2, num: '7.' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            'Cada solicitud nueva llega al **área de su categoría** (ver [§areas-y-plazos]).',
            '**El área la cambia la coordinación.** Un responsable asigna dentro de su área, o se lo queda con «Tomar el caso». Lo que escribas en «Motivo (opcional)» queda en el historial.',
            '**Una denuncia no tiene área.** En su caso, la tarjeta «Área y responsable» dice «Denuncias». Su responsable solo puede ser un operador de denuncias o alguien de la coordinación.',
            '**Prioridad** (Baja, Normal, Alta, Urgente) → «Guardar prioridad». **«Fecha comprometida»** → «Guardar fecha». Las pone la coordinación (y en una denuncia, el operador de denuncias). La fecha vale hasta el final de ese día.',
            'La fecha comprometida sale sola: **el plazo más corto** entre los días de la categoría y los de la prioridad. Hoy, en «Áreas y plazos», son 15 días por categoría, 2 para Urgente y 5 para Alta. Si nadie la puso a mano, cambia cuando cambia la prioridad.',
            '**La fecha comprometida es interna: la persona no la ve. Nunca se la prometas** (ver [§lo-que-nunca-se-promete]).',
            'Para cambiar quién tiene un caso terminado, primero hay que reabrirlo.',
          ],
          wrap: { 1: [114, 61] },
        },
      ],
    },
    {
      id: 'escribir',
      pdf: '5.8',
      title: 'Escribir: nota interna, respuesta y pedido de información',
      heading: { level: 2, num: '8.' },
      audience: ['boss'],
      blocks: [
        { kind: 'p', text: 'En **«Escribir»**, elige en «Qué vas a escribir»:' },
        {
          kind: 'table',
          head: ['Qué', 'Quién lo lee', 'Botón'],
          rows: [
            ['**Nota interna**', 'Solo el equipo. **La persona nunca la lee**', '«Guardar nota interna»'],
            ['**Respuesta a la persona**', 'La persona, en su consulta. Si dejó un correo, le llega un aviso sin el texto', '«Enviar respuesta»'],
            ['**Pedir más información**', 'La persona. El caso pasa a «Requiere información» hasta que responda', '«Pedir la información»'],
          ],
        },
        { kind: 'p', text: '**Nunca las mezcles.** Lo que es para el equipo va solo en notas internas: opiniones, nombres de funcionarios, lo que dijo otra persona o lo de otros casos. Antes de «Enviar respuesta», léela otra vez: la persona la lee tal cual y no se puede borrar. En el «Historial», cada mensaje dice «no la ve la persona» o «la ve la persona». Ojo: auditoría y el jefe también leen las notas internas.' },
        { kind: 'p', text: '**Respuestas guardadas:** en «Usar una respuesta guardada», elige una, ajústala al caso y envíala. Las arma la coordinación en la pestaña «Respuestas guardadas», en dos grupos: «Para responder» y «Para pedir información». Una nueva se hace en «Nueva respuesta guardada» → «Crear la respuesta». Una que ya existe se cambia con «Cambiar» → «Guardar». Para apagarla, se desmarca «En uso (apagada, no se ofrece; nada se borra)». Sin nombres, teléfonos ni direcciones de nadie. Las que ya trae la app le hablan de usted a la persona, como todo lo que ella lee.' },
      ],
    },
    {
      id: 'contacto',
      pdf: '5.9',
      title: 'El contacto de la persona',
      heading: { level: 2, num: '9.' },
      audience: [],
      blocks: [
        {
          kind: 'list',
          items: [
            '**«Ver contacto»** muestra «Nombre», «Correo», «Teléfono» y «Prefiere». La tarjeta avisa: «El contacto está cifrado. Al verlo queda registrado quién lo miró y cuándo.». Solo lo ven quienes atienden el caso. Si la mandó anónima, dice «La envió como anónima: no dejó contacto. Sigue el caso con su código.».',
            'Úsalo **solo para atender ese caso**. Nunca lo copies a grupos de WhatsApp, a notas personales ni a otro caso.',
            'La app solo le escribe a la persona **por correo**. Si la persona prefiere llamada o WhatsApp, sigue lo que diga la coordinación y deja una nota interna de lo hablado. Si eligió «Que no me contacten», no se le escribe.',
            '**La persona pidió borrar su contacto:** la coordinación abre «La persona pidió borrar su contacto», escribe el «Motivo» y toca «Borrar el contacto». No se puede recuperar. El caso sigue.',
          ],
        },
        { kind: 'p', text: '**Los correos a la persona** salen después de una respuesta, un pedido de información, un cambio de estado o una unión de casos. La respuesta y el pedido le llegan solo a quien la mandó. Un cambio de estado les llega también a quienes se sumaron y a quienes mandaron los casos unidos, cada uno con su código. Nunca llevan el texto del equipo, el tipo de solicitud ni la clave: dicen qué pasó y que entre a «Consultar mi solicitud». **Por ahora la versión de prueba no envía ninguno.** Los que mandaría quedan en «Ajustes» → «Buzón de correos», que solo ve Administración. Mientras tanto, la persona ve todo en su consulta.' },
      ],
    },
    {
      id: 'archivos-y-evidencias',
      pdf: '5.10',
      title: 'Archivos y evidencias',
      heading: { level: 2, num: '10.' },
      audience: ['boss'],
      blocks: [
        {
          kind: 'list',
          items: [
            'En **«Archivos»** están los de la persona y las evidencias del equipo. **Nunca son públicos.** Cada uno tiene «Descargar», y las fotos también «Ver la foto».',
            'Cada archivo dice si ya lo revisó el antivirus: «Revisado: limpio», «Sin analizar», «Revisándose» o «Peligroso: no se abre».',
            'Por ahora la versión de prueba no les pasa el antivirus. Todos dicen «Sin analizar», y la tarjeta avisa: «Archivos sin analizar (versión de prueba): ábrelos solo si confías en ellos.». Cuando la web abra al público, solo se abrirá lo que diga «Revisado: limpio».',
            '**Subir evidencia:** en «Foto o documento de la atención», elige el archivo (JPG, PNG o PDF, hasta 4 MB). A las fotos se les quitan los datos de ubicación. La casilla «Que la vea la persona en su consulta» viene marcada: desmárcala si la evidencia es solo para el equipo. Después toca «Subir evidencia». Más tarde se cambia con «Compartir con la persona» o «Dejar de compartir». Antes de compartir, mira que no salgan caras de otras personas, placas ni documentos con datos.',
            '**«Retirar este archivo»** (la coordinación; en denuncias, el operador): «Por qué se retira» → «Retirar». Queda guardado, pero ya nadie lo puede abrir.',
            'Descarga solo lo necesario. Nunca reenvíes los archivos de la gente. Tampoco los subas a la «Biblioteca» de «Web»: todo lo que está ahí es público.',
          ],
          wrap: { 1: [114, 9] },
        },
      ],
    },
    {
      id: 'casos-iguales',
      pdf: '5.11',
      title: 'Casos iguales y apoyos',
      heading: { level: 2, num: '11.' },
      audience: ['boss'],
      blocks: [
        {
          kind: 'list',
          items: [
            '**Apoyos («Apoyar este reporte»):** antes de enviar un reporte, la web le muestra a la persona «Reportes parecidos»: cuántos hay abiertos del mismo problema cerca. Puede tocar «Apoyar este reporte» → «Enviar apoyo», o «No, es otro problema». Quien apoya recibe «Apoyo registrado» con su propio código.',
            'El cuarto reporte del mismo problema en el mismo lugar se suma solo al más viejo.',
            'En «Lo que llegó» sale cuántos se sumaron, por ejemplo «4 personas o casos se sumaron». Lo que escribió cada una dice «(solo el equipo)».',
            '**Unir dos casos** (la coordinación), cuando son el mismo problema, del mismo tipo y están abiertos: «Casos iguales» → «Buscar el otro caso» (por código o palabras) → «Buscar» → «Elige el caso» → «¿Cuál se queda?» → «Motivo» → «Unir los casos». Se guardan las historias de los dos. El repetido se cierra y apunta al que se queda, y sus apoyos pasan a ese. Quien mandó el repetido lo sigue con su mismo código.',
            'Un caso unido dice «Este caso está unido a …: se atiende allí.». Se trabaja en el que se quedó.',
          ],
          wrap: { 2: [112, 24] },
        },
      ],
    },
    {
      id: 'casos-atendidos',
      pdf: '5.12',
      title: '«Casos atendidos» y el anonimato',
      heading: { level: 2, num: '12.' },
      audience: ['boss'],
      blocks: [
        { kind: 'p', text: 'La coordinación publica en la web lo que se resolvió, **sin datos de la persona**. Sale en la página «Casos atendidos» de «Atención ciudadana». También puede salir en la portada, en el bloque «Casos atendidos». Solo se publica un caso que se marcó «Resuelto», también si después se cerró. Nunca el spam ni un caso unido. El botón «Casos atendidos» sale en la web cuando hay al menos un caso publicado. Todavía no hay ninguno. En la portada, ese bloque está oculto por ahora: lo muestra el equipo de la web en «Web» → «Páginas» → «Inicio» (ver [§bloques-y-formato]).' },
        {
          kind: 'list',
          items: [
            '**«Resumen para la web»:** lo que se hizo, en pocas palabras. Sin nombres, teléfonos ni direcciones de nadie. Tampoco detalles que la identifiquen (“la señora de la casa azul frente a la plaza”).',
            '**El nombre** sale solo si dio permiso: «Nombre que sale (dio permiso)». Míralo en «Ver contacto». Si no dio permiso, van **iniciales**: «Iniciales que salen (no dio permiso para su nombre)», por ejemplo «M. P.». Si la mandó anónima, sale sin nombre ni iniciales. Se puede dejar vacío.',
            '**Una denuncia** sale solo como «Denuncia atendida en el municipio …». No lleva nada más.',
            'Toca «Publicar en «Casos atendidos»» (o «Actualizar la publicación»). Para quitarla: «Retirar de «Casos atendidos»» → «Por qué se retira» → «Retirar».',
          ],
        },
      ],
    },
    {
      id: 'denuncias',
      pdf: '5.13',
      title: 'Denuncias',
      heading: { level: 2, num: '13.' },
      audience: [],
      blocks: [
        {
          kind: 'list',
          items: [
            '**Privadas de punta a punta:** solo las leen el operador de denuncias y la coordinación. El jefe y auditoría solo las cuentan en los totales. Un responsable de área nunca las ve.',
            '**Nunca llevan el punto exacto ni un punto de referencia:** solo municipio y sector. Nunca van al mapa.',
            'El formulario, el comprobante y la consulta le dicen a la persona: «Las denuncias son confidenciales. Solo las leen el personal encargado de denuncias y la coordinación de atención. Su contenido nunca se publica. Si se trata de un delito, acuda también a las autoridades competentes.». **Los contactos de esas autoridades todavía no están en la web.** Se agregan cuando estén verificados. No des números que nadie confirmó.',
            'Si una solicitud de otro tipo es en realidad una denuncia, la coordinación la corrige en «Corregir tipo o categoría». Así pierde la ubicación exacta y sale del área.',
            'Los correos nunca dicen «denuncia». Los avisos internos dicen «Denuncia vencida» o «Denuncia sin movimiento».',
            'La app no avisa a ninguna autoridad. Si una denuncia habla de un delito o de una vida en riesgo, avisa de inmediato a la coordinación. Mientras la Gobernación no defina cómo actuar en estos casos, lo que se haga fuera de la app lo decide la coordinación.',
          ],
          wrap: { 0: [113, 64] },
        },
      ],
    },
    {
      id: 'avisos-de-casos',
      pdf: '5.14',
      title: 'Avisos de casos vencidos o quietos',
      heading: { level: 2, num: '14.' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            'Un caso abierto avisa si **pasó su fecha comprometida** o si lleva **varios días sin movimiento**. Hoy son 5 días, y los cambia Administración en «Áreas y plazos». Avisa **una vez al día por caso**, cada mañana.',
            'Le llega a la coordinación y a su responsable. Si nadie lo tiene, les llega a los responsables de su área. En una denuncia, al equipo de denuncias. Sale en la campana («Avisos»). Si activaste los avisos en «Mi cuenta» → «Mi perfil y avisos» → «Activar avisos», también llega al teléfono. Nunca por correo.',
            'El aviso dice solo el código: «Solicitud vencida: AC-…» o «Solicitud sin movimiento: AC-…». Nunca lo que escribió la persona.',
          ],
          wrap: { 2: [113, 11] },
        },
      ],
    },
    {
      id: 'cifras',
      pdf: '5.15',
      title: 'Las cifras y lo que quiere decir cada una',
      heading: { level: 2, num: '15.' },
      audience: ['boss'],
      blocks: [
        { kind: 'p', text: 'En **«Cifras»** (coordinación, auditoría y el jefe) se eligen las fechas con «Desde», «Hasta» y «Ver», o con «Últimos 30 días», «Este mes» y «Todo». Al abrir, muestra los últimos 30 días.' },
        { kind: 'p', text: 'Las definiciones son las mismas que dice la pantalla:' },
        {
          kind: 'table',
          head: ['Cifra', 'Qué cuenta'],
          rows: [
            ['**Recibidas**', 'Solicitudes que llegaron entre las dos fechas. No cuentan el spam ni las que se unieron a otro caso igual'],
            ['**Resueltas**', 'Solicitudes que el equipo marcó «Resuelto» entre las dos fechas, hayan llegado cuando hayan llegado'],
            ['**Pendientes**', 'Solicitudes abiertas hoy (ni resueltas, ni cerradas, ni «No procede») que llegaron hasta la fecha final'],
            ['**Vencidas**', 'De las pendientes, las que ya pasaron su fecha comprometida'],
            ['**Tiempo a la primera respuesta**', 'Desde que llegó hasta la primera respuesta del equipo: una respuesta a la persona, un pedido de información o un cambio de estado. Cuenta las que llegaron entre las fechas y ya tienen respuesta. Una nota interna no es una respuesta'],
            ['**Tiempo de resolución**', 'Desde que llegó hasta que el equipo la marcó «Resuelto». Cuenta las resueltas entre las fechas'],
            ['**Mediana y promedio**', 'La mediana es el tiempo del caso del medio: la mitad tardó menos y la otra mitad más. El promedio se mueve mucho con unos pocos casos muy lentos'],
            ['**Por tipo, estado, categoría, municipio y área**', 'Lo que llegó entre las fechas, por categoría, municipio y área. Para auditoría y el jefe, las denuncias cuentan solo en los totales por tipo y estado'],
          ],
        },
        { kind: 'p', text: 'Sin datos, dice «Nada llegó en estas fechas.» o «Sin casos para medir en estas fechas.». Usa la mediana para decir cuánto se tarda.' },
      ],
    },
    {
      id: 'exportar',
      pdf: '5.16',
      title: 'Exportar la lista y sus cuidados',
      heading: { level: 2, num: '16.' },
      audience: [],
      blocks: [
        {
          kind: 'list',
          items: [
            'Al final de la bandeja está **«Exportar lo que ves (CSV)»**. Baja la lista en un archivo que se abre directo en Excel. Trae los filtros que tengas puestos. El botón es **«Descargar CSV»**. La coordinación tiene además **«Descargar con el contacto (queda registrado caso por caso)»**. Auditoría nunca recibe contactos ni denuncias, aunque los pida.',
            'El archivo trae una fila por solicitud: código, tipo, categoría, estado, prioridad, municipio, parroquia, sector, área, responsable, fechas (llegó, comprometida, primera respuesta, resuelta), si está vencida, apoyos, la confirmación de la persona, a qué caso se unió, si es spam y **el título**. Con el contacto, suma nombre, correo, teléfono y cómo prefiere que la contacten. **No lleva** descripciones, mensajes ni archivos. Trae hasta 5.000 solicitudes, de la más vieja a la más nueva.',
            '**Cada exportación queda registrada:** quién, cuándo y con qué filtros.',
            '**Cuidados:** es información de personas. Exporta solo lo que necesitas. No lo mandes por WhatsApp ni por correo. No lo dejes en «Descargas» de una computadora compartida. Bórralo cuando termines. Nunca lo subas a una carpeta pública.',
          ],
          wrap: { 0: [111, 92, 114, 27] },
        },
      ],
    },
    {
      id: 'moderacion',
      pdf: '5.17',
      title: 'Spam, amenazas y datos expuestos',
      heading: { level: 2, num: '17.' },
      audience: ['boss'],
      blocks: [
        { kind: 'p', text: 'Están en **«Moderación»** (la coordinación; en denuncias, el operador de denuncias). Todo queda en el historial con su motivo.' },
        {
          kind: 'list',
          items: [
            '**Una crítica o una queja nunca es spam:** se atiende, o se cierra con su motivo.',
            '**Spam** (publicidad o mensajes repetidos sin nada que atender): «Marcar como spam: por qué» → «Marcar como spam». Queda en «No procede», guardada, y no se le escribe a quien la envió. Sale de la bandeja. Se ve con «Incluir las unidas a otro caso y el spam».',
            '**Datos de alguien expuestos** (por ejemplo, el teléfono de un vecino o la foto de un documento): en «Retirar un dato que expone a alguien», elige el dato: «El título», «La descripción», «El punto de referencia», «La parroquia, localidad o sector» o «La ubicación en el mapa». Escribe el «Por qué» → «Retirar el dato». Para un mensaje: «Retirar el texto de un mensaje» → «Retirar el texto». En su lugar queda «[Texto retirado por el equipo]». Para un archivo: «Retirar este archivo» (ver [§archivos-y-evidencias]). Lo retirado se reemplaza para siempre. El historial guarda qué dato y por qué, nunca lo que decía.',
            '**Amenazas** a cualquier persona, también al gobernador o al equipo: no la respondas desde el caso. Avisa de inmediato a la coordinación. Retira los datos que expongan a alguien. Si no hay nada que atender, ponla en «No procede» con su motivo. Mientras la Gobernación no defina cómo actuar en estos casos, lo que se haga fuera de la app lo decide la coordinación.',
          ],
        },
      ],
    },
    {
      id: 'lo-que-nunca-se-promete',
      pdf: '5.18',
      title: 'Lo que nunca se promete',
      heading: { level: 2, num: '18.' },
      audience: ['boss'],
      blocks: [
        {
          kind: 'list',
          items: [
            '**Esto no es un servicio de emergencias.** La web lo dice así: «Esto no es un servicio de emergencias. Ante una emergencia o si una vida está en peligro, llame a los servicios de emergencia.». Nunca digas “ya va la ambulancia” o “ya va la patrulla”. La web no da ningún número de emergencias. Ese aviso no se cambia desde el panel. Cuando la Gobernación confirme el número oficial de emergencias, se agregará al aviso.',
            '**Ni fechas ni plazos.** La fecha comprometida es interna. Di lo que es cierto, de usted: “Lo estamos revisando”, “Le avisaremos por aquí”.',
            '**Ni resultados que no dependen del equipo**, como una ayuda o la decisión de otro organismo.',
            '**Ni publicar su nombre sin su permiso**, ni contarle a otra persona que alguien escribió.',
            '**Nunca pidas datos de más**, como la cédula o la afiliación política. Pide solo lo que hace falta para atender.',
          ],
        },
      ],
    },
    {
      id: 'areas-y-plazos',
      pdf: '5.19',
      title: 'Áreas y plazos (Administración)',
      heading: { level: 2, num: '19.' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: 'Lo arma Administración, que entra por «Atención» → «Áreas y plazos». La coordinación, auditoría y el jefe lo leen.' },
        {
          kind: 'list',
          items: [
            '**«Nueva área»:** «Nombre del área» y «Qué atiende» → «Crear el área». Para cambiar una: «Cambiar el nombre o apagarla» → «Guardar el área». Para apagarla, se desmarca «Activa (apagada, no recibe casos nuevos; nada se borra)».',
            '**Responsables:** «Agregar un responsable» → la persona → «Agregar». «Quitar» la saca del área. Solo salen las personas que tienen el rol de responsable de área.',
            '**«Categorías»:** a qué área va cada una y sus «Días» → «Guardar». Sin área, la asigna la coordinación. «En el formulario» decide si la categoría sale en el formulario de la web.',
            '**«Plazos y avisos»:** los días por prioridad y «Avisar de un caso sin movimiento después de (días)» → «Guardar los plazos». Entre los días de la prioridad y los de la categoría gana el más corto. Si la prioridad está vacía, valen los de la categoría.',
          ],
          wrap: { 3: [115, 118, 16] },
        },
      ],
    },
    {
      id: 'mapa',
      pdf: '5.20',
      title: 'El mapa',
      heading: { level: 2, num: '20.' },
      audience: ['boss'],
      blocks: [
        { kind: 'p', text: '**«Mapa»** muestra solo los casos con un punto que la persona marcó **con su permiso**. Las denuncias nunca van ahí. Se filtra con «Cuáles» (Las abiertas o Todas), «Categoría», «Área» y «Ver». El mapa carga solo al tocar **«Ver el mapa»**, para ahorrar datos. Debajo están «La lista de estos casos» y los que no tienen punto, contados en «Sin ubicación, por municipio».' },
      ],
    },
    {
      id: 'registro',
      pdf: '5.21',
      title: 'El registro',
      heading: { level: 2, num: '21.' },
      audience: ['admin'],
      blocks: [
        { kind: 'p', text: '**«Registro»** es de auditoría y de Administración, que lo abre con «Registro de atención». Dice quién hizo qué y cuándo: los cambios, los contactos vistos y las exportaciones. No se edita ni se borra, y no guarda lo que dicen los casos. Una línea que empieza con «La web» es lo que una persona hizo desde la web: una solicitud nueva, un apoyo, un mensaje o un archivo suyo. Una que empieza con «La app» es algo que la app hizo sola, como las respuestas guardadas que trae o la revisión de un archivo. Ajustes → «Registro de cambios» dice esas líneas con las mismas palabras.', wrap: [113, 116, 113, 118, 111] },
      ],
    },
    {
      id: 'practicar',
      pdf: '5.22',
      title: 'Para practicar en la versión de prueba',
      heading: { level: 2, num: '22.' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'steps',
          items: [
            'En la web, toca «Acceso del personal», al final de cualquier página. Se abre «Entrar».',
            'En la tarjeta «Versión de demostración», baja hasta «La web y la atención ciudadana».',
            'Toca un rol. Entras directo, sin código ni doble factor.',
            'Para cambiar de rol: «Mi cuenta» (arriba a la derecha) → «Salir».',
          ],
        },
        {
          kind: 'table',
          head: ['En la lista', 'Qué probar'],
          rows: [
            ['«Coordinador de atención»', 'Ve todas, denuncias también. Busca `DEMR01`: tiene tres apoyos y un caso repetido unido. Prueba «Ver contacto», «Escribir» → «Respuesta a la persona» y «Pasar a» → «Cambiar el estado». Mira también «Tablero», «Mapa», «Cifras», «Respuestas guardadas» y «Descargar CSV»'],
            ['«Responsable de área · Servicios públicos»', 'Solo lo de su área (agua, luz, aseo…) o lo que le asignen. Nunca denuncias. `DEMR02` (resuelto) y `DEMR03` (requiere información) son de su área. Prueba «Tomar el caso», una nota interna y «Subir evidencia»'],
            ['«Responsable de área · Vialidad y transporte»', 'Lo mismo, con vialidad y transporte. `DEMR01` es de su área. No ve los casos de otras áreas'],
            ['«Operador de denuncias»', 'Solo las denuncias. Su mapa sale vacío, porque las denuncias nunca van al mapa'],
            ['«Consulta y auditoría»', 'Todo menos las denuncias, sin contactos y sin poder cambiar nada. «Cifras», «Registro» y «Descargar CSV», sin contactos'],
          ],
        },
        { kind: 'p', text: 'Más arriba, en la misma tarjeta, están «El jefe» (lee las solicitudes y ve las cifras) y «Administración» (abre «Áreas y plazos», nunca un caso).' },
        { kind: 'p', text: '**Los comprobantes de prueba** se abren en la web, en «Consultar mi solicitud», sin entrar al panel. El número del medio del código es el año en curso.' },
        {
          kind: 'table',
          head: ['Código', 'Clave', 'Qué es'],
          rows: [
            ['`AC-2026-DEMR01`', '`K7QM-2HXP-9WRT-4BNE`', 'Un reporte de un hueco, «En atención», con tres apoyos y un reporte repetido unido'],
            ['`AC-2026-DEMR02`', '`R3PS-W8N2-DEMV-7QKA`', 'Un reporte resuelto. La consulta pregunta «¿Se resolvió el problema?». «No, todavía no» lo devuelve a «En atención»'],
            ['`AC-2026-DEMR03`', '`H4JX-5ZTB-9CNF-W2YE`', 'Un reporte que «Requiere información». Se responde con «Responder la solicitud de información»'],
          ],
        },
        { kind: 'p', text: 'Un código o una clave equivocados dan siempre «No hay ninguna solicitud con esos datos.».' },
        {
          kind: 'list',
          items: [
            'Lo que creas o cambias en la versión de prueba se borra cada cierto tiempo. Entonces vuelve a lo que traía al empezar.',
            'Lo recién hecho puede no verse desde otra cuenta u otro teléfono. Para practicar entre roles, usa los casos de ejemplo y los tres comprobantes.',
          ],
        },
      ],
    },
    {
      id: 'limites-de-atencion',
      pdf: '5.23',
      title: 'Límites de hoy',
      heading: { level: 2, num: '23.' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            'Por ahora la versión de prueba no envía correos. La persona sigue su caso en «Consultar mi solicitud» (ver [§contacto]).',
            'Por ahora la versión de prueba no les pasa el antivirus a los archivos que llegan (ver [§archivos-y-evidencias]).',
            'Cada archivo, el de la persona o la evidencia, va hasta 4 MB.',
            'El tablero no arrastra tarjetas y muestra 12 por estado. La lista tiene todo.',
            'No guarda filtros. Para volver a la misma vista, guárdala en los favoritos del navegador.',
            'La exportación trae hasta 5.000 solicitudes.',
            'La web todavía no da los contactos de las autoridades ni un número de emergencias (ver [§denuncias] y [§lo-que-nunca-se-promete]).',
          ],
        },
      ],
    },
  ],
};
