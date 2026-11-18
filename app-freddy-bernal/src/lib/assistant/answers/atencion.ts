import type { Answer } from './types';

// The long tail of «Atención» for the boss and Administración (WF-C, design §4(a)): what they ask about the citizen's
// journey (the form, the receipt, the consulta, a denuncia, «Casos atendidos») and about the desk (its roles, the
// figures, the export, moderation, the areas and their plazos) that the guide's own sections do not answer by themselves.
// Written from docs/MANUAL-ATENCION.md and docs/GUIA-WEB.md part 2 (src/lib/guides/web): what the guide does not say, an
// answer does not say either. The boss reads the desk like auditoría (no contacts, denuncias only in the totals, no
// export); Administración arms «Áreas y plazos», reads the «Registro de atención» and never opens a case. 360 never reads
// nor repeats what a person sent, and never says a code or a key, not even the practice ones. A role that cannot do
// something is told «No» and who does it, never the steps. Every id says «atencion» (the index puts it in Atención's
// domain, engine.ts curatedEntries).
export const ATENCION: Answer[] = [
  // ── The page «Atención ciudadana» of the web (GUIA-WEB 1.6) ──
  {
    id: 'atencion-pagina-de-la-web',
    roles: ['boss', 'admin'],
    q: ['que ve la gente en atencion ciudadana de la web', 'la pagina de atencion ciudadana que otras paginas tiene en su menu', 'que menu tiene atencion ciudadana en la web'],
    a: 'Un menú propio («Información general», «Nueva solicitud», «Consultar mi solicitud» y «Casos atendidos»), los botones «Nueva solicitud» y «Consultar mi solicitud» y un «Ejemplo de comprobante». Más abajo: «Tipos de solicitud», «Procedimiento», «Estados de una solicitud», «Denuncias confidenciales», «Preguntas frecuentes», «Otros canales» y «Casos atendidos».',
  },
  {
    id: 'atencion-otros-canales',
    roles: ['boss', 'admin'],
    q: ['que sale en otros canales si no hay contactos verificados', 'que es otros canales en atencion ciudadana', 'de donde salen los contactos de otros canales'],
    a: 'Salen los «Contactos institucionales» de «Ajustes del sitio» marcados «Verificado». Sin ninguno verificado, «Otros canales» muestra «Canal de atención»: «Las solicitudes se reciben únicamente a través de este sitio.», con el aviso contra estafas.',
  },
  // ── What the person does on the web (GUIA-WEB part 2) ──
  {
    id: 'atencion-sin-cuenta',
    roles: ['boss', 'admin'],
    q: [
      'la gente necesita cuenta para mandar algo por la web',
      'la gente tiene que registrarse para mandar un reporte',
      'hay que tener cuenta para hacer un reporte en la web',
      'la persona necesita usuario para mandar una solicitud',
      'se puede mandar un reporte desde el telefono',
      'sirve desde el celular el formulario de atencion',
    ],
    a: 'No: la persona no necesita cuenta ni contraseña, y todo funciona en el teléfono. El formulario lo dice arriba: «El formulario tiene cuatro pasos. No necesita registrarse.». Al enviar recibe un código y una clave para seguir su solicitud.',
  },
  {
    id: 'atencion-reporte-pasos',
    roles: ['boss', 'admin'],
    q: [
      'cuales son los pasos del formulario de reporte',
      'como hace un vecino para reportar una falla',
      'como reporta la gente que no le llega el agua',
      'que pasos tiene el formulario de atencion',
      'como es el formulario para hacer un reporte',
      'como manda la gente un reporte por la web',
    ],
    a: 'Cuatro pasos, desde «Hacer un reporte»: 1) «Tipo de solicitud»: la «Categoría», por ejemplo «Agua». 2) «Lugar»: el «Municipio» y, si quiere, el punto en el mapa. 3) «Detalle de la solicitud»: «Título», «Descripción» y hasta 3 fotos o documentos. 4) «Contacto y envío»: su contacto o «Enviar como anónimo». Toca «Enviar» y sale «Solicitud recibida», con su comprobante.',
  },
  {
    id: 'atencion-formulario-sin-senal',
    roles: ['boss', 'admin'],
    q: [
      'si a la persona se le va la señal se pierde el reporte',
      'si se le recarga la pagina a la persona se pierde lo escrito',
      'si se le cae el internet llenando el formulario se le borra todo',
      'que pasa si se va la señal a mitad del reporte',
      'el formulario de atencion guarda lo escrito',
      'y si se le va la luz llenando la solicitud',
      'y si a la persona se le va la señal o quiere volver atras en el formulario',
    ],
    a: 'No se pierde: lo escrito se guarda en esa pestaña. Si la página se recarga, dice «Se recuperó lo que había escrito en esta pestaña.», con «Empezar de nuevo». Sin señal, avisa que lo escrito queda guardado en ese dispositivo y que, si toca «Enviar», se enviará cuando vuelva la señal. Y «Atrás» vuelve al paso anterior.',
  },
  {
    id: 'atencion-formulario-atras',
    roles: ['boss', 'admin'],
    q: [
      'si se equivoco en un paso del formulario como se devuelve',
      'como vuelve la persona al paso anterior del formulario',
      'la persona puede cambiar algo antes de enviar la solicitud',
      'como corrige la persona un paso del reporte',
      'el formulario tiene boton para volver atras',
    ],
    a: '«Atrás» vuelve al paso anterior, y en la barra de pasos («Tipo», «Lugar», «Detalle» y «Contacto») un paso terminado se toca para volver. En el paso 4, el resumen trae «Cambiar» en cada fila.',
  },
  {
    id: 'atencion-ubicacion-mapa',
    roles: ['boss', 'admin'],
    q: [
      'como marca la gente el sitio exacto en el mapa',
      'como pone la persona el punto del problema en el mapa',
      'la persona tiene que dar su ubicacion en el formulario',
      'para que es usar mi ubicacion en el formulario',
      'como quita la persona el punto que marco en el mapa',
    ],
    a: 'En el paso 2, «Lugar»: en «Ubicación exacta (opcional)», «Usar mi ubicación» o «Marcar en el mapa» guardan el punto, siempre con el permiso de la persona, y «Quitar ubicación» lo borra. Es opcional: en un reporte, lo obligatorio es el «Municipio». Una denuncia nunca lleva el punto en el mapa.',
  },
  {
    id: 'atencion-fecha-del-hecho',
    roles: ['boss', 'admin'],
    q: ['la fecha del hecho hay que ponerla', 'la fecha del hecho es obligatoria', 'la persona tiene que poner la fecha del hecho', 'para que es la fecha del hecho del formulario'],
    a: 'No: la «Fecha del hecho» es opcional. Va en el paso 3, «Detalle de la solicitud», junto al «Título» y la «Descripción», que sí se piden.',
  },
  {
    id: 'atencion-aviso-privacidad',
    roles: ['boss', 'admin'],
    q: [
      'la persona tiene que aceptar algo de privacidad antes de enviar',
      'el formulario pide aceptar el aviso de privacidad',
      'donde acepta la persona el uso de sus datos',
      'la persona tiene que marcar el aviso de privacidad',
    ],
    a: 'Sí: en el paso 4, «Contacto y envío», marca «Leí el aviso de privacidad (se abre en otra pestaña) y acepto el uso de mis datos para atender esta solicitud.». Sus datos de contacto son opcionales: puede marcar «Enviar como anónimo».',
  },
  {
    id: 'atencion-anonimo',
    roles: ['boss', 'admin'],
    q: [
      'se puede enviar una solicitud como anonimo',
      'la persona puede mandar un reporte sin dar su nombre',
      'que pasa si la persona manda la solicitud anonima',
      'como se manda una solicitud anonima',
    ],
    a: 'Sí: en el paso 4, en «Datos de contacto (opcional)», marca «Enviar como anónimo». No deja contacto: sigue su caso con su código y su clave, y en «Casos atendidos» sale sin nombre ni iniciales.',
  },
  {
    id: 'atencion-otros-tipos',
    roles: ['boss', 'admin'],
    q: [
      'que otros tipos de solicitud hay aparte del reporte',
      'que tipos de solicitud hay en atencion',
      'que puede mandar la gente por la web',
      'cuales son los seis tipos de solicitud',
      'que es una peticion en atencion',
    ],
    a: 'Seis: «Reporte» (fallas en los servicios públicos), «Petición» (ayuda o apoyo al despacho del gobernador), «Observación», «Sugerencia», «Reconocimiento» y «Denuncia», que es confidencial. Todos usan el mismo formulario; en una observación, una sugerencia o un reconocimiento, el paso del lugar se puede saltar.',
  },
  {
    id: 'atencion-observacion-noticia',
    roles: ['boss', 'admin'],
    q: [
      'como deja alguien un comentario sobre una noticia de la web',
      'como manda la gente una observacion de una noticia',
      'como opina alguien sobre una obra de la web',
      'donde esta el boton para comentar una noticia',
      'como se manda una observacion sobre una obra',
    ],
    a: 'Al final de la noticia, «Enviar una observación»; en la ficha de una obra, «Enviar una observación sobre esta obra». El formulario abre en «Observación» y arriba dice «Sobre esta noticia» o «Sobre esta obra», con su título («Quitar» la desliga). Después sigue los cuatro pasos de siempre.',
  },
  {
    id: 'atencion-parecidos',
    roles: ['boss', 'admin'],
    q: [
      'que pasa si ya hay un reporte parecido cerca',
      'que pasa si otro vecino ya reporto lo mismo',
      'que le sale a la persona si alguien ya reporto lo mismo cerca',
      'la gente ve si ya reportaron el mismo problema',
      'como se suma alguien a un reporte que ya existe',
    ],
    a: 'Antes de seguir, le sale «Reportes parecidos», con cuántos hay abiertos del mismo problema cerca, nunca qué dicen. «Apoyar este reporte» → «Enviar apoyo» suma su apoyo y recibe «Apoyo registrado», con su propio código; «No, es otro problema» sigue con su reporte. Solo pasa en un reporte.',
  },
  {
    id: 'atencion-apoyo-que-lleva',
    roles: ['boss', 'admin'],
    q: [
      'un apoyo lleva fotos o datos de contacto',
      'cuando alguien apoya un reporte que puede escribir y quien lo lee',
      'quien lee el comentario de un apoyo',
      'el que apoya ve los datos de los otros',
      'que se llena al apoyar un reporte',
    ],
    a: 'Un apoyo no lleva archivos. Lleva un «Comentario» opcional, que solo lee el personal de atención, y los mismos «Datos de contacto (opcional)» y aviso de privacidad del paso 4. Quien apoya nunca ve los datos ni el texto de los demás, y en su consulta ve solo el estado de ese reporte.',
  },
  {
    id: 'atencion-apoyos-en-el-caso',
    roles: ['boss', 'admin'],
    q: ['como se ven los apoyos en el caso', 'donde se ven los apoyos de un reporte', 'en el caso sale cuantos apoyaron', 'en el panel como se ven los que se sumaron a un reporte'],
    a: {
      boss: 'En el caso, «Lo que llegó» dice cuántos se sumaron, y lo que escribió cada uno lleva la marca «(solo el equipo)». Lo lees ahí, en «Atención»: yo no leo lo que manda la gente.',
      admin: 'En el caso, «Lo que llegó» dice cuántos se sumaron, y lo que escribió cada uno lleva la marca «(solo el equipo)». Tú no abres casos, y yo no leo lo que manda la gente.',
    },
  },
  {
    id: 'atencion-archivos-despues',
    roles: ['boss', 'admin'],
    q: ['los archivos del reporte se suben de una vez', 'que pasa si falla una foto de la solicitud', 'la persona como sube los archivos de su reporte', 'cuantas fotos puede mandar la persona'],
    a: 'No: los archivos suben después de enviar, uno por uno, en «Archivos adjuntos» del comprobante. Uno que falla tiene su botón «Reintentar». Van hasta 3: fotos JPG, PNG o WebP, o documentos PDF.',
  },
  {
    id: 'atencion-comprobante-que-sigue',
    roles: ['boss', 'admin'],
    q: [
      'que dice el comprobante de lo que sigue',
      'despues del comprobante que mas le aparece a la persona',
      'que le sale a la persona despues de enviar',
      'que botones tiene el comprobante',
      'que trae la pantalla de solicitud recibida',
    ],
    a: 'Sale «Solicitud recibida», con el «Código» y la «Clave», que se guardan con «Descargar comprobante (PDF)», «Imprimir» o «Copiar código y clave». Debajo, «Archivos adjuntos» (los archivos suben uno por uno) y «Próximos pasos», que cuenta lo que sigue. Al final, «Consultar mi solicitud» y «Nueva solicitud».',
  },
  {
    id: 'atencion-nueva-sin-guardar',
    roles: ['boss', 'admin'],
    q: ['y si la persona le da nueva solicitud sin guardar el comprobante', 'que pasa si la persona no guardo el comprobante', 'la app le avisa a la persona que guarde el comprobante', 'si la persona sigue sin guardar el comprobante'],
    a: 'Antes de seguir le pregunta: «Antes de continuar, guarde su código y su clave. No se pueden recuperar.», con «Sí, ya los guardé». Los guarda con «Descargar comprobante (PDF)», «Imprimir» o «Copiar código y clave». La clave se muestra una sola vez: sin ella no se puede consultar la solicitud.',
  },
  {
    id: 'atencion-clave-perdida',
    roles: ['boss', 'admin'],
    q: [
      'alguien perdio la clave de su solicitud se la puedo recuperar',
      'si la persona pierde la clave del comprobante podemos darsela',
      'se puede recuperar la clave de una solicitud',
      'la persona perdio su clave que se hace',
      'quien tiene la clave de las solicitudes',
    ],
    a: {
      boss: 'No: la clave no se recupera. Nadie del panel la tiene, tampoco tú: se muestra una sola vez, y lo explica la parte «Pérdida de la clave» de «Consultar mi solicitud». Si la persona dejó un correo, le llega el código, nunca la clave.',
      admin: 'No: la clave no se recupera. Nadie del panel la tiene, tampoco tú: se muestra una sola vez, y lo explica la parte «Pérdida de la clave» de «Consultar mi solicitud». Si la persona dejó un correo, le llega el código, nunca la clave.',
    },
  },
  {
    id: 'atencion-consulta-salir',
    roles: ['boss', 'admin'],
    q: ['la consulta de la solicitud se cierra sola', 'como termina la persona su consulta', 'cuanto tiempo queda abierta la consulta de una solicitud', 'la consulta se queda abierta'],
    a: 'Al terminar, la persona toca «Salir». Si no, la consulta se cierra sola a los 30 minutos. Para volver a entrar, escribe otra vez su código y su clave.',
  },
  {
    id: 'atencion-consulta-otros-reportes',
    roles: ['boss', 'admin'],
    q: ['la persona sabe si hay mas reportes del mismo problema', 'en la consulta sale si otros reportaron lo mismo', 'la consulta dice si otros reportaron el mismo problema', 'la gente ve los otros reportes del mismo problema'],
    a: 'Sí: si hay otros reportes del mismo problema, su consulta lo dice, con cuántos son. Nunca ve qué dicen ni los datos de quienes los mandaron.',
  },
  {
    id: 'atencion-consulta-estados',
    roles: ['boss', 'admin'],
    q: [
      'que estados ve la gente cuando consulta',
      'que estados ve la persona en su consulta',
      'que estados puede tener una solicitud para la persona',
      'como se llaman los estados que lee la persona',
      'que dice el estado de la consulta',
    ],
    a: 'La persona lee «Recibida», «En revisión», «Asignada», «En atención», «Requiere información», «Derivada», «Resuelta», «Cerrada» y «No procede». El recuadro «Estado» de su consulta dice en qué va y qué quiere decir. Cuando la marcan «Resuelta», le pregunta «¿Se resolvió el problema?».',
  },
  {
    id: 'atencion-resuelta-confirma',
    roles: ['boss', 'admin'],
    q: [
      'cuando marcan resuelta la solicitud la persona que hace',
      'como confirma la gente que ya le resolvieron',
      'que pasa si la persona dice que no se resolvio',
      'y si la persona dice que todavia no',
      'la persona puede decir que no le resolvieron',
    ],
    a: 'En su consulta sale «La solicitud fue marcada como resuelta», con «¿Se resolvió el problema?»: elige «Sí, se resolvió» o «No, todavía no» y toca «Responder». Con «No, todavía no» escribe «¿Qué falta por resolver?», y el caso vuelve solo a «En atención».',
  },
  {
    id: 'atencion-consulta-que-ve',
    roles: ['boss', 'admin'],
    q: ['que ve la persona cuando consulta su solicitud', 'que sale en la consulta de una solicitud', 'que le muestra la consulta a la persona', 'que trae la pagina de consultar mi solicitud'],
    a: 'Ve «Su solicitud» con su código, el tipo, la categoría y el municipio; el recuadro «Estado»; «Datos de su solicitud» y el «Historial de la solicitud», con las respuestas de «Atención ciudadana» y lo que le pidieron. Nunca ve las notas internas, el motivo de un cambio de estado ni quién del personal hizo cada cosa.',
  },
  {
    id: 'atencion-notas-internas',
    roles: ['boss', 'admin'],
    q: ['la persona ve las notas internas', 'quien lee las notas internas de un caso', 'la gente lee lo que escribe el equipo en el caso', 'el jefe lee las notas internas'],
    a: {
      boss: 'Solo el equipo: quienes atienden el caso, auditoría y tú. La persona nunca lee una nota interna; lo que es para ella va en «Respuesta a la persona», y nunca se mezclan.',
      admin: 'Solo el equipo: quienes atienden el caso, auditoría y el jefe; tú nunca abres un caso. La persona nunca lee una nota interna; lo que es para ella va en «Respuesta a la persona», y nunca se mezclan.',
    },
  },
  {
    id: 'atencion-consulta-como-sabe',
    roles: ['boss', 'admin'],
    q: [
      'como sabe la persona en que va su reporte',
      'como sigue la gente su solicitud',
      'como sabe la señora si ya le resolvieron',
      'como ve la persona las respuestas del equipo',
      'donde ve la persona la respuesta a su solicitud',
    ],
    a: 'Con su código y su clave, en «Consultar mi solicitud» (arriba en la web, en el pie y en «Atención ciudadana»): ve el «Estado» y el «Historial de la solicitud», con las respuestas. Si dejó un correo, le llega un aviso cuando le responden o cambia el estado, nunca con la clave.',
  },
  {
    id: 'atencion-agregar-informacion',
    roles: ['boss', 'admin'],
    q: [
      'como manda la persona un dato que le pidieron',
      'como le contesta la persona al equipo cuando le piden un dato',
      'como agrega informacion la persona a su solicitud',
      'la persona manda fotos despues de enviar',
      'como contesta la persona lo que le preguntaron',
    ],
    a: 'En su consulta, en «Agregar información» (o «Responder la solicitud de información», si le pidieron un dato), escribe en «Información adicional» (o «Su respuesta»), agrega hasta 3 fotos o documentos si hace falta y toca «Enviar información». Si esperaban ese dato, el caso vuelve solo a «En revisión». Una solicitud «Cerrada» o «No procede» ya no recibe nada: la persona envía una nueva.',
  },
  // ── Denuncias (MANUAL-ATENCION 13, GUIA-WEB 2.6) ──
  {
    id: 'atencion-denuncia-como-funciona',
    roles: ['boss', 'admin'],
    q: ['como funciona una denuncia que llega', 'que tiene de especial una denuncia', 'que pasa con una denuncia que llega', 'las denuncias son confidenciales', 'como se maneja una denuncia'],
    a: {
      boss: 'Es confidencial: el formulario lo avisa y pide solo el municipio y el sector, sin mapa. La leen solo el operador de denuncias y la coordinación; tú la ves solo en los totales. Su contenido nunca se publica: en «Casos atendidos» sale solo «Denuncia atendida en el municipio …», y los correos nunca dicen «denuncia».',
      admin: 'Es confidencial: el formulario lo avisa y pide solo el municipio y el sector, sin mapa. La leen solo el operador de denuncias y la coordinación; tú nunca la ves. Su contenido nunca se publica: en «Casos atendidos» sale solo «Denuncia atendida en el municipio …», y los correos nunca dicen «denuncia».',
    },
  },
  {
    id: 'atencion-denuncias-quien-lee',
    roles: ['boss', 'admin'],
    q: ['quien lee las denuncias', 'quien ve las denuncias que llegan', 'quienes atienden las denuncias', 'a quien le llegan las denuncias'],
    a: {
      boss: 'Solo el operador de denuncias y la coordinación de atención: las denuncias son privadas de punta a punta. Tú y auditoría las ven solo en los totales, y un responsable de área nunca las ve.',
      admin: 'Solo el operador de denuncias y la coordinación de atención: las denuncias son privadas de punta a punta. El jefe y auditoría las cuentan solo en los totales, un responsable de área nunca las ve y tú tampoco.',
    },
  },
  {
    id: 'atencion-jefe-denuncias',
    roles: ['boss'],
    q: ['puedo leer las denuncias', 'por que no veo las denuncias', 'el jefe puede ver las denuncias', 'puedo abrir una denuncia'],
    a: 'No: las denuncias son confidenciales, privadas de punta a punta. Las leen solo el operador de denuncias y la coordinación; tú las ves solo en los totales, igual que auditoría.',
    go: '/admin/atencion',
  },
  {
    id: 'atencion-denuncia-direccion',
    roles: ['boss', 'admin'],
    q: ['en una denuncia la persona pone la direccion exacta', 'la denuncia lleva el punto en el mapa', 'que lugar pide una denuncia', 'por que la denuncia no pide el punto en el mapa'],
    a: 'No: en una denuncia el paso 2 se llama «Lugar aproximado» y pide solo el «Municipio» y la «Parroquia, localidad o sector». El formulario lo dice: «En una denuncia se indica solo el municipio y el sector, sin dirección exacta ni ubicación en el mapa.». Por eso nunca va al mapa.',
  },
  {
    id: 'atencion-denuncia-aviso',
    roles: ['boss', 'admin'],
    q: ['que aviso le sale a la gente cuando denuncia', 'el comprobante de una denuncia dice algo distinto', 'que le dicen a la persona que hace una denuncia', 'donde sale el aviso de las denuncias'],
    a: 'En el paso 1 sale el aviso de las denuncias: «Las denuncias son confidenciales.», y sigue «Solo las leen el personal encargado de denuncias y la coordinación de atención. Su contenido nunca se publica. Si se trata de un delito, acuda también a las autoridades competentes.». El comprobante y la consulta lo repiten.',
  },
  {
    id: 'atencion-denuncia-mal-tipo',
    roles: ['boss', 'admin'],
    q: [
      'si alguien manda como reporte algo que es una denuncia que se hace',
      'puedo corregir el tipo de una solicitud que en realidad es denuncia',
      'como se cambia el tipo de una solicitud',
      'quien corrige la categoria de una solicitud',
    ],
    a: {
      boss: 'La coordinación la corrige en «Corregir tipo o categoría»: así pierde la ubicación exacta y sale de su área. Tú lo lees, pero no lo cambias.',
      admin: 'No: tú no abres casos. La coordinación la corrige en «Corregir tipo o categoría»: así pierde la ubicación exacta y sale de su área.',
    },
  },
  {
    id: 'atencion-policia',
    roles: ['boss', 'admin'],
    q: [
      'la app le avisa a la policia si llega una denuncia de un delito',
      'que se hace si una denuncia habla de un delito',
      'la app avisa a alguna autoridad',
      'que pasa si una solicitud dice que una vida esta en riesgo',
    ],
    a: 'No: la app no avisa a ninguna autoridad. Si una denuncia habla de un delito o de una vida en riesgo, se avisa de inmediato a la coordinación, y lo que se haga fuera de la app lo decide ella. La web todavía no da los contactos de las autoridades ni un número de emergencias.',
  },
  {
    id: 'atencion-denuncia-avisos',
    roles: ['boss', 'admin'],
    q: ['que dicen los avisos de una denuncia vencida', 'a quien le llegan los avisos de las denuncias', 'como avisa la app de una denuncia quieta'],
    a: 'Dicen «Denuncia vencida» o «Denuncia sin movimiento», con el código y nunca lo que escribió la persona. Les llegan al equipo de denuncias, una vez al día, en «Avisos» y al teléfono; nunca por correo.',
  },
  // ── «Casos atendidos» (GUIA-WEB 2.7, MANUAL-ATENCION 12) ──
  {
    id: 'atencion-casos-atendidos-que-dice',
    roles: ['boss', 'admin'],
    q: ['que dice cada caso publicado en casos atendidos', 'como se ve la pagina de casos atendidos', 'como ve la gente los casos atendidos', 'que sale de cada caso en casos atendidos'],
    a: 'En «Casos atendidos» van agrupados por mes. Cada caso dice su tipo, su categoría y su municipio, el resumen, el nombre (si la persona dio permiso) o sus iniciales, y «Resuelta el …». De una denuncia sale solo el municipio. Se filtran con «Municipio» o «Categoría» y «Filtrar»; «Quitar filtros» vuelve a todos. Sin casos dice «No hay casos publicados en este momento.».',
  },
  {
    id: 'atencion-casos-atendidos-vacio',
    roles: ['boss', 'admin'],
    q: [
      'y si no hay casos publicados que sale',
      'casos atendidos sin casos publicados que dice',
      'por que no veo el boton de casos atendidos en la web',
      'por que no sale casos atendidos en el menu de atencion',
      'cuando sale el boton casos atendidos',
    ],
    a: 'El botón «Casos atendidos» sale en la web cuando hay al menos un caso publicado, y hoy todavía no hay ninguno. Sin casos, la página dice «No hay casos publicados en este momento.», con el botón «Nueva solicitud».',
  },
  {
    id: 'atencion-casos-atendidos-quien',
    roles: ['boss', 'admin'],
    q: ['que son los casos atendidos y quien los publica', 'quien publica en casos atendidos', 'que se publica en casos atendidos', 'los casos atendidos llevan el nombre de la persona'],
    a: {
      boss: 'La coordinación, desde cada caso resuelto: los publica en la web sin datos de la persona, con sus iniciales, salvo que autorice su nombre, y de una denuncia solo el municipio. Salen en la página «Casos atendidos» de «Atención ciudadana». Tú no publicas ahí: lo lees.',
      admin: 'La coordinación, desde cada caso resuelto: los publica en la web sin datos de la persona, con sus iniciales, salvo que autorice su nombre, y de una denuncia solo el municipio. Salen en la página «Casos atendidos» de «Atención ciudadana». Tú no publicas ahí.',
    },
  },
  // ── The desk's roles, and who does what (GUIA-WEB 4, MANUAL-ATENCION 1) ──
  {
    id: 'atencion-roles',
    roles: ['boss', 'admin'],
    q: ['que roles hay en atencion ciudadana', 'cuales son los roles de atencion y que hace cada uno', 'que roles tiene la atencion', 'que hace cada rol de atencion'],
    a: {
      boss: 'Cuatro: «Coordinador de atención» (todo lo que llega, denuncias también), «Responsable de área» (lo de su área, nunca denuncias), «Operador de denuncias» (solo las denuncias) y «Consulta y auditoría» (lee sin contactos ni denuncias). Los da Administración en «Ajustes» → «Equipo». Tú lees como auditoría.',
      admin: 'Cuatro: «Coordinador de atención» (todo lo que llega, denuncias también), «Responsable de área» (lo de su área, nunca denuncias), «Operador de denuncias» (solo las denuncias) y «Consulta y auditoría» (lee sin contactos ni denuncias). Los das tú en «Ajustes» → «Equipo» → «Invitar a alguien».',
    },
  },
  {
    id: 'atencion-que-hace-el-jefe',
    roles: ['boss', 'admin'],
    q: ['que hace el jefe en atencion', 'que ve el jefe en atencion', 'que hace el jefe en web y en atencion', 'y en atencion yo que hago'],
    a: {
      boss: 'En «Atención» lees, como auditoría: todos los casos menos las denuncias (cuentan solo en los totales), sin contactos, y las «Cifras». No respondes, no asignas, no cambias estados y no exportas. En «Web» haces lo mismo que el aprobador.',
      admin: 'En «Atención», el jefe lee como auditoría: todos los casos menos las denuncias, sin contactos, y mira las «Cifras»; no exporta ni cambia nada. En «Web» hace lo mismo que el aprobador: publica, programa, devuelve y archiva, y el aviso de «Por aprobar» no le llega: lo ve en la lista.',
    },
    go: '/admin/atencion',
  },
  {
    id: 'atencion-admin-por-que-no-veo',
    roles: ['admin'],
    q: ['por que no veo las solicitudes', 'por que no puedo abrir los casos de atencion', 'por que no veo la bandeja de atencion', 'por que mi atencion no muestra los casos'],
    a: 'Porque Administración nunca abre un caso ni ve contactos. En «Atención» tú tienes «Áreas y plazos» y el «Registro de atención». Los casos los ven quienes los atienden, auditoría y el jefe.',
    go: '/admin/atencion/areas',
  },
  {
    id: 'atencion-admin-dar-rol',
    roles: ['admin'],
    q: [
      'como le doy a alguien el rol de responsable de area',
      'como doy un rol de atencion',
      'como le cambio las areas a un responsable',
      'como invito a alguien de atencion',
      'como le doy el rol de coordinador de atencion',
    ],
    a: 'En «Ajustes» → «Equipo» → «Invitar a alguien»: marca el rol en «Web y atención ciudadana (siempre con doble factor)» y, a un responsable, sus áreas en «Sus áreas (ve y atiende lo de estas áreas y lo que le asignen)». Toca «Enviar invitación». Después, sus áreas se cambian con «Cambiar» en su fila.',
  },
  {
    id: 'atencion-jefe-roles-quien-da',
    roles: ['boss'],
    q: ['quien da los roles de atencion', 'como le doy un rol de atencion a alguien', 'quien le da el rol a la coordinadora de atencion'],
    a: 'Tú no los das: Administración, en «Ajustes» → «Equipo» → «Invitar a alguien», con el rol en «Web y atención ciudadana (siempre con doble factor)»; a un responsable de área le marca sus áreas. Cada persona entra con su propio usuario.',
  },
  // ── The figures, the export and the case's care (MANUAL-ATENCION 9, 15, 16, 17, 18) ──
  {
    id: 'atencion-cifras-donde',
    roles: ['boss'],
    q: ['donde veo las cifras de atencion', 'como cambio las fechas de las cifras de atencion', 'como veo las cifras de atencion de otro periodo', 'como veo cuanto se tarda atencion'],
    a: 'En «Atención» → «Cifras»: eliges las fechas con «Desde», «Hasta» y «Ver», o con «Últimos 30 días», «Este mes» y «Todo». Al abrir muestra los últimos 30 días. Para decir cuánto se tarda, usa la mediana.',
    go: '/admin/atencion/estadisticas',
  },
  {
    id: 'atencion-cifras-que-muestran',
    roles: ['boss'],
    q: ['que muestran las cifras de atencion', 'que numeros salen en cifras de atencion', 'que cuenta la pantalla de cifras', 'que hay en las cifras de atencion'],
    a: '«Recibidas», «Resueltas» (las que el equipo marcó «Resuelto» entre las dos fechas, hayan llegado cuando hayan llegado), «Pendientes» y «Vencidas»; el «Tiempo a la primera respuesta» y el «Tiempo de resolución», con mediana y promedio; y lo que llegó por tipo, estado, categoría, municipio y área. El spam y lo unido a otro caso no entran, y las denuncias van solo en los totales.',
    go: '/admin/atencion/estadisticas',
  },
  {
    id: 'atencion-exportar-quien',
    roles: ['boss', 'admin'],
    q: ['quien puede exportar con los contactos', 'quien exporta la lista con los contactos', 'quien descarga la lista de solicitudes', 'quien puede descargar el csv de atencion'],
    a: {
      boss: 'La coordinación, con «Exportar lo que ves (CSV)»: «Descargar CSV» o «Descargar con el contacto (queda registrado caso por caso)». Auditoría descarga siempre sin contactos ni denuncias. Cada exportación queda registrada: quién, cuándo y con qué filtros. Tú no exportas.',
      admin: 'La coordinación y auditoría: exportar es de la coordinación y de auditoría. La coordinación también con el contacto («Descargar con el contacto (queda registrado caso por caso)»), y auditoría siempre sin contactos ni denuncias. Cada exportación queda en el «Registro de atención». Tú no exportas.',
    },
  },
  {
    id: 'atencion-jefe-exportar',
    roles: ['boss'],
    q: ['como descargo la lista de solicitudes en excel', 'como bajo la lista de atencion', 'puedo descargar el csv de atencion', 'como saco las solicitudes en un excel'],
    a: 'No: tú no exportas. La lista la descargan la coordinación («Exportar lo que ves (CSV)», con o sin el contacto) y auditoría, siempre sin contactos. Tú ves las «Cifras».',
    go: '/admin/atencion/estadisticas',
  },
  {
    id: 'atencion-exportar-cuidados',
    roles: ['boss', 'admin'],
    q: ['que cuidados hay con el archivo exportado', 'que cuidados hay con la lista de solicitudes descargada', 'se puede mandar por whatsapp el archivo de atencion', 'donde se guarda el csv de atencion'],
    a: 'Es información de personas: se exporta solo lo necesario, no se manda por WhatsApp ni por correo, no se deja en la carpeta de descargas de una computadora compartida, se borra al terminar y nunca se sube a una carpeta pública.',
  },
  {
    id: 'atencion-exportar-que-trae',
    roles: ['boss', 'admin'],
    q: ['que trae el archivo que exporta la coordinacion', 'que columnas tiene el csv de atencion', 'que lleva la lista exportada de atencion', 'la exportacion trae las descripciones'],
    a: 'Una fila por solicitud: código, tipo, categoría, estado, prioridad, municipio, parroquia, sector, área, responsable, las fechas del caso, si está vencida, apoyos, la confirmación de la persona y el título. Con el contacto suma nombre, correo y teléfono. No lleva descripciones, mensajes ni archivos, y trae hasta 5.000 solicitudes.',
  },
  {
    id: 'atencion-admin-quien-exporto',
    roles: ['admin'],
    q: ['quien exporto la lista de solicitudes donde lo veo', 'donde veo las exportaciones de atencion', 'como se quien descargo el csv de atencion', 'queda registrado quien exporta'],
    a: 'En el «Registro de atención»: cada exportación queda registrada, con quién, cuándo y con qué filtros, igual que cada contacto visto. No guarda lo que dicen los casos.',
    go: '/admin/atencion/registro',
  },
  {
    id: 'atencion-contacto-whatsapp',
    roles: ['boss', 'admin'],
    q: [
      'puedo pasarle el contacto de una señora a un funcionario por whatsapp',
      'se puede copiar el contacto de una persona a un grupo',
      'puedo pasarle el contacto de alguien de atencion a otra persona',
      'el contacto de la persona se puede usar para otra cosa',
    ],
    a: {
      boss: 'No: el contacto de la persona se usa solo para atender su caso, y nunca se copia a grupos de WhatsApp, a notas personales ni a otro caso. Además, tú no ves contactos: los ven solo quienes atienden el caso.',
      admin: 'No: el contacto de la persona se usa solo para atender su caso, y nunca se copia a grupos de WhatsApp, a notas personales ni a otro caso. Además, Administración nunca ve un contacto.',
    },
  },
  {
    id: 'atencion-borrar-contacto',
    roles: ['boss', 'admin'],
    q: ['si una persona pide que borren su contacto quien lo hace', 'como se borra el contacto de una persona', 'la persona puede pedir que borren sus datos', 'se puede recuperar un contacto borrado'],
    a: 'Tú no lo borras: lo hace la coordinación, en «La persona pidió borrar su contacto», con su «Motivo» y «Borrar el contacto». No se puede recuperar, y el caso sigue.',
  },
  {
    id: 'atencion-dato-expuesto',
    roles: ['boss', 'admin'],
    q: ['si alguien puso el telefono de un vecino en el reporte que se hace', 'como se quita un dato que expone a alguien', 'una solicitud trae la cedula de otra persona', 'como se borra un dato personal de un caso'],
    a: {
      boss: 'Lo quita la coordinación (en una denuncia, el operador de denuncias), en «Moderación» → «Retirar un dato que expone a alguien»: elige el dato, escribe el «Por qué» y toca «Retirar el dato». El historial guarda qué dato y por qué, nunca lo que decía. Tú lo lees, pero no lo cambias.',
      admin: 'Lo quita la coordinación (en una denuncia, el operador de denuncias), en «Moderación» → «Retirar un dato que expone a alguien»: elige el dato, escribe el «Por qué» y toca «Retirar el dato». El historial guarda qué dato y por qué, nunca lo que decía. Tú no abres casos.',
    },
  },
  {
    id: 'atencion-amenaza',
    roles: ['boss', 'admin'],
    q: ['que hacemos si llega una amenaza contra el gobernador', 'que se hace con una amenaza que llega por la web', 'llego una amenaza en una solicitud', 'como se responde una amenaza'],
    a: 'Quien la recibe no la responde desde el caso: avisa de inmediato a la coordinación. Se retiran los datos que expongan a alguien y, si no hay nada que atender, va a «No procede» con su motivo. Mientras la Gobernación no defina cómo actuar, lo que se haga fuera de la app lo decide la coordinación.',
  },
  {
    id: 'atencion-queja-no-spam',
    roles: ['boss', 'admin'],
    q: ['una queja contra la gobernacion es spam', 'una critica se marca como spam', 'cuando se marca algo como spam', 'quien marca el spam en atencion'],
    a: 'No: una crítica o una queja nunca es spam: se atiende, o se cierra con su motivo. Spam es publicidad o mensajes repetidos sin nada que atender; lo marca la coordinación en «Moderación», y en una denuncia también el operador de denuncias.',
  },
  {
    id: 'atencion-cedula',
    roles: ['boss', 'admin'],
    q: ['se le puede pedir la cedula a la persona', 'se le pueden pedir datos de mas a la persona', 'que datos se le pueden pedir a la gente', 'se le puede preguntar la afiliacion politica a la persona'],
    a: 'No: nunca se piden datos de más, como la cédula o la afiliación política. Se pide solo lo que hace falta para atender.',
  },
  {
    id: 'atencion-motivo-interno',
    roles: ['boss', 'admin'],
    q: [
      'la persona lee el motivo cuando le cambian el estado',
      'el motivo del cambio de estado lo ve la persona',
      'que lee la persona cuando cambian el estado de su caso',
      'y el de requiere informacion tambien es interno',
    ],
    a: 'No: el motivo es interno, la persona nunca lo lee. Ella lee el «Mensaje para la persona (opcional)». La excepción es «Requiere información»: «Qué información necesitas (lo lee la persona)» sí lo lee.',
  },
  {
    id: 'atencion-no-procede-persona',
    roles: ['boss', 'admin'],
    q: ['que lee la persona cuando le ponen no procede', 'que ve la persona si su solicitud no procede', 'que se le escribe a la persona en no procede'],
    a: 'Su consulta dice «Se explicó por qué no puede atenderse por esta vía.»: por eso quien atiende siempre le escribe unas líneas en «Mensaje para la persona (opcional)». El motivo de «No procede» es interno y ella no lo lee.',
  },
  {
    id: 'atencion-respuesta-borrar',
    roles: ['boss', 'admin'],
    q: ['se puede borrar una respuesta que ya se mando', 'como se borra una respuesta que se le mando a la persona', 'se puede editar una respuesta enviada a la persona', 'una respuesta a la persona se puede cambiar'],
    a: 'No: una respuesta a la persona no se puede borrar, y ella la lee tal cual. Por eso hay que leerla otra vez antes de «Enviar respuesta».',
  },
  {
    id: 'atencion-correos-cuando',
    roles: ['boss', 'admin'],
    q: ['cuando le llegan correos a la persona', 'que correos recibe la persona que escribe', 'la app le manda correos a la gente', 'que dicen los correos que recibe la persona'],
    a: 'Si dejó un correo: al enviar, con su código, y después de una respuesta, un pedido de información, un cambio de estado o una unión de casos. Nunca llevan la clave, el texto del equipo ni el tipo de solicitud, y nunca dicen «denuncia»: dicen qué pasó y que entre a «Consultar mi solicitud». La versión de prueba todavía no envía correos.',
  },
  {
    id: 'atencion-buzon',
    roles: ['admin'],
    q: ['donde veo los correos que le mandaria la app a la gente', 'los correos que manda la web donde quedan', 'por que no le llegan correos a la persona en la prueba', 'la version de prueba manda correos'],
    a: 'La versión de prueba todavía no envía correos: los que mandaría quedan en «Ajustes» → «Buzón de correos», que solo ves tú, Administración. Mientras tanto, la persona ve todo en su consulta.',
  },
  {
    id: 'atencion-buzon-jefe',
    roles: ['boss'],
    q: ['donde veo los correos que le mandaria la app a la gente', 'los correos que manda la web donde quedan', 'por que no le llegan correos a la persona en la prueba', 'la version de prueba manda correos'],
    a: 'La versión de prueba todavía no envía correos: los que mandaría quedan en «Buzón de correos», que solo ve Administración. Mientras tanto, la persona ve todo en «Consultar mi solicitud».',
  },
  // ── Avisos, areas and plazos (MANUAL-ATENCION 7, 14, 19) ──
  {
    id: 'atencion-avisos-vencidos',
    roles: ['boss', 'admin'],
    q: ['cuando avisa la app de un caso vencido', 'cada cuanto avisa la app de los casos quietos', 'que es un caso sin movimiento', 'a quien le llega el aviso de una solicitud vencida', 'como avisa la app de los casos vencidos'],
    a: {
      boss: 'Cada mañana, una vez al día por caso: si un caso abierto pasó su fecha comprometida o lleva 5 días sin movimiento (cualquier cambio o mensaje cuenta). Le llega a la coordinación y a su responsable, en «Avisos» y al teléfono, nunca por correo, y dice solo el código. Los 5 días los cambia Administración en «Áreas y plazos».',
      admin: 'Cada mañana, una vez al día por caso: si un caso abierto pasó su fecha comprometida o lleva 5 días sin movimiento (cualquier cambio o mensaje cuenta). Le llega a la coordinación y a su responsable, en «Avisos» y al teléfono, nunca por correo, y dice solo el código. Los 5 días los cambias tú en «Áreas y plazos».',
    },
  },
  {
    id: 'atencion-admin-avisos-vencidos',
    roles: ['admin'],
    q: ['puedo recibir yo los avisos de los casos vencidos', 'a administracion le llegan los avisos de atencion', 'me llegan los avisos de las solicitudes vencidas'],
    a: 'No: esos avisos les llegan a la coordinación y al responsable del caso; sin responsable, a los de su área, y en una denuncia, al equipo de denuncias. Tú decides cuántos días sin movimiento hacen falta, en «Áreas y plazos».',
    go: '/admin/atencion/areas',
  },
  {
    id: 'atencion-plazo-cual-gana',
    roles: ['boss', 'admin'],
    q: ['que pesa mas para el plazo la categoria o la prioridad', 'cuantos dias tienen hoy las categorias y las prioridades', 'como se calcula la fecha comprometida', 'de donde sale la fecha comprometida'],
    a: {
      boss: 'Gana el plazo más corto entre los días de la categoría y los de la prioridad. Hoy son 15 días por categoría, 2 para «Urgente» y 5 para «Alta». Si nadie la puso a mano, la fecha comprometida cambia cuando cambia la prioridad. Los días los pone Administración.',
      admin: 'Gana el plazo más corto entre los días de la categoría y los de la prioridad. Hoy son 15 días por categoría, 2 para «Urgente» y 5 para «Alta». Si nadie la puso a mano, la fecha comprometida cambia cuando cambia la prioridad. Los días los cambias tú en «Áreas y plazos».',
    },
  },
  {
    id: 'atencion-jefe-plazos',
    roles: ['boss'],
    q: ['puedo cambiar los plazos de atencion', 'quien cambia los plazos de atencion', 'puedo cambiar las areas de atencion', 'como cambio los dias de una categoria de atencion'],
    a: 'No: las áreas y los plazos los cambia Administración, en «Áreas y plazos». Tú los lees ahí.',
    go: '/admin/atencion/areas',
  },
  {
    id: 'atencion-admin-plazos',
    roles: ['admin'],
    q: ['donde cambio cuantos dias espera la app antes de avisar que un caso esta quieto', 'como cambio los plazos de atencion', 'como cambio los dias por prioridad', 'donde cambio los dias sin movimiento'],
    a: 'En «Áreas y plazos» → «Plazos y avisos»: los días por prioridad y «Avisar de un caso sin movimiento después de (días)», y toca «Guardar los plazos». Entre los días de la prioridad y los de la categoría gana el más corto.',
    go: '/admin/atencion/areas',
  },
  {
    id: 'atencion-admin-categorias',
    roles: ['admin'],
    q: ['como cambio los dias de una categoria', 'como le pongo el area a una categoria', 'que es en el formulario en las categorias de atencion', 'como quito una categoria del formulario de la web'],
    a: 'En «Áreas y plazos» → «Categorías»: a cada una le pones su área y sus «Días», y tocas «Guardar». «En el formulario» decide si la categoría sale en el formulario de la web. Sin área, la asigna la coordinación.',
    go: '/admin/atencion/areas',
  },
  {
    id: 'atencion-admin-responsables',
    roles: ['admin'],
    q: ['como saco a alguien de un area', 'como quito un responsable de un area', 'como agrego a alguien a un area de atencion', 'por que no me sale una persona para agregar al area'],
    a: 'En «Áreas y plazos», en el área: «Quitar» al lado de la persona la saca del área, y «Agregar un responsable» → la persona → «Agregar» suma a otra. Solo salen las personas que tienen el rol de responsable de área.',
    go: '/admin/atencion/areas',
  },
  // ── What the boss and Administración cannot do on a case (the «¿puedo…?» the guide's lists miss) ──
  {
    id: 'atencion-unir-casos',
    roles: ['boss', 'admin'],
    q: ['puedo unir dos casos', 'puedo unir dos casos repetidos', 'quien une los casos iguales', 'como se unen dos casos'],
    a: {
      boss: 'No: unir casos es de la coordinación, desde «Casos iguales» → «Buscar el otro caso», cuando son el mismo problema, del mismo tipo y están abiertos. Tú lees los casos.',
      admin: 'No: tú no abres casos. Los une la coordinación, desde «Casos iguales» → «Buscar el otro caso», cuando son el mismo problema, del mismo tipo y están abiertos.',
    },
  },
  {
    id: 'atencion-reabrir',
    roles: ['boss', 'admin'],
    q: ['puedo reabrir un caso cerrado', 'como se reabre un caso', 'quien reabre un caso resuelto', 'se puede reabrir un caso que ya estaba cerrado'],
    a: {
      boss: 'No: tú solo lees. Reabren la coordinación y su responsable, desde «Resuelto», «Cerrado» o «No procede», con «Por qué se reabre». Para cambiar quién tiene un caso terminado, primero hay que reabrirlo; después se asigna otra vez.',
      admin: 'No: tú nunca abres un caso. Reabren la coordinación y los responsables, desde «Resuelto», «Cerrado» o «No procede», con «Por qué se reabre». Para cambiar quién tiene un caso terminado, primero hay que reabrirlo; después se asigna otra vez.',
    },
  },
  {
    id: 'atencion-registro-borrar',
    roles: ['admin'],
    q: ['puedo borrar una linea del registro', 'se puede editar el registro de atencion', 'el registro de atencion se puede borrar', 'puedo cambiar algo del registro de atencion'],
    a: 'No: ni el «Registro de atención» ni el «Registro de cambios» de Ajustes se editan o se borran. El de atención dice quién hizo qué y cuándo, sin lo que dicen los casos.',
    go: '/admin/atencion/registro',
  },
  {
    id: 'atencion-tablero-arrastrar',
    roles: ['boss'],
    q: ['puedo arrastrar las tarjetas del tablero', 'como se mueve un caso en el tablero', 'las tarjetas del tablero de atencion se arrastran'],
    a: 'No: las tarjetas del tablero no se arrastran. Quien atiende da el paso de siempre con el botón de un toque, por ejemplo «→ En revisión», o abre el caso con «Otro estado…». Tú solo lees.',
    go: '/admin/atencion',
  },
  {
    id: 'atencion-solo-vencidas',
    roles: ['boss'],
    q: ['como veo solo las solicitudes vencidas', 'como filtro las vencidas en atencion', 'como busco las solicitudes vencidas en la bandeja'],
    a: 'En la «Bandeja», «Más filtros» → «Solo las vencidas» → «Filtrar». «Quitar los filtros» vuelve a todo.',
    go: '/admin/atencion',
  },
  {
    id: 'atencion-archivos-publicos',
    roles: ['boss', 'admin'],
    q: ['los archivos que manda la gente son publicos', 'las fotos de una solicitud salen en la web', 'se puede usar la foto de una solicitud en la web', 'la foto que mando una persona va a la biblioteca'],
    a: 'No: los archivos de la gente nunca son públicos. Se quedan en el caso, en «Atención», en privado, con «Descargar» y, las fotos, «Ver la foto»; nunca se reenvían ni se suben a la «Biblioteca» de «Web», que es pública.',
  },
  {
    id: 'atencion-evidencia',
    roles: ['boss', 'admin'],
    q: ['que archivos sube el equipo como evidencia', 'la persona ve la evidencia que sube el equipo', 'que es subir evidencia en un caso', 'como comparte el equipo la foto del despues'],
    a: {
      boss: 'La suben la coordinación y los responsables (tú solo la ves), en «Subir evidencia»: una foto o un documento de la atención (JPG, PNG o PDF, hasta 4 MB); a las fotos se les quitan los datos de ubicación. La casilla «Que la vea la persona en su consulta» viene marcada; después se cambia con «Compartir con la persona» o «Dejar de compartir».',
      admin: 'La suben la coordinación y los responsables (tú no subes evidencias), en «Subir evidencia»: una foto o un documento de la atención (JPG, PNG o PDF, hasta 4 MB); a las fotos se les quitan los datos de ubicación. La casilla «Que la vea la persona en su consulta» viene marcada; después se cambia con «Compartir con la persona» o «Dejar de compartir».',
    },
  },
  {
    id: 'atencion-asignar-estado-solo',
    roles: ['boss', 'admin'],
    q: ['cuando asignan un caso cambia de estado solo', 'al asignar un caso pasa solo a asignado', 'que estados cambian solos en un caso'],
    a: 'Sí: al asignarlo, un caso «Recibido» o «En revisión» pasa solo a «Asignado». También cambian solos: cuando la persona responde un pedido de información vuelve a «En revisión», y su «No, todavía no» lo pasa a «En atención».',
  },
  // ── The practice version of the desk (MANUAL-ATENCION 22, 23) ──
  {
    id: 'atencion-limites-prueba',
    roles: ['boss', 'admin'],
    q: ['que no hace todavia la version de prueba de atencion', 'que limites tiene la atencion en la prueba', 'que le falta a la atencion para abrir', 'que limites tiene la atencion'],
    a: 'La versión de prueba todavía no envía correos ni les pasa el antivirus a los archivos. Además: cada archivo va hasta 4 MB, el tablero muestra 12 por estado y no arrastra tarjetas, no guarda filtros y la exportación trae hasta 5.000. La web todavía no da los contactos de las autoridades ni un número de emergencias.',
  },
  {
    id: 'atencion-comprobantes-prueba',
    roles: ['boss', 'admin'],
    q: ['que caso es cada comprobante de prueba', 'para que son los comprobantes de prueba y que es cada uno', 'que trae cada comprobante de prueba para practicar', 'donde se abren los comprobantes de prueba'],
    a: 'Son tres, para practicar la consulta en «Consultar mi solicitud», sin entrar al panel: un reporte de un hueco «En atención», con tres apoyos y un repetido unido; uno ya resuelto, que dice «Resuelta» y pregunta «¿Se resolvió el problema?»; y uno que «Requiere información». Sus códigos y claves están en la guía de atención: yo no los digo.',
    go: '/ayuda/atencion',
  },
  {
    id: 'atencion-numero-del-medio',
    roles: ['boss', 'admin'],
    q: ['que es el numero que va en medio de los codigos', 'para que es el numero largo que va despues del ac en los codigos', 'que significa el numero del medio del codigo de una solicitud'],
    a: 'Es el año en curso: el número del medio de cada código de solicitud es el año. Yo no doy ni pido códigos ni claves.',
  },
  {
    id: 'atencion-admin-practicar',
    roles: ['admin'],
    q: ['que pruebo yo como administracion en la demo', 'que hago yo en la version de prueba de atencion', 'con que rol pruebo yo la atencion'],
    a: 'Con «Administración» abres «Áreas y plazos» y el «Registro de atención», nunca un caso. Para ver un caso por dentro, entra con uno de los roles de «La web y la atención ciudadana», en «Acceso del personal». Lo que cambies se borra de vez en cuando.',
    go: '/admin/atencion/areas',
  },
  {
    id: 'atencion-jefe-practicar',
    roles: ['boss'],
    q: ['en la demo que entro a ver yo como jefe', 'que pruebo yo como jefe en la demo de atencion', 'con que rol pruebo yo la atencion'],
    a: 'Con «El jefe» lees las solicitudes y ves las «Cifras», sin contactos ni denuncias, y en «Web» haces lo mismo que el aprobador. Para atender un caso de práctica, entra con «Coordinador de atención», en «Acceso del personal».',
  },
  // ── The guide itself (MANUAL-ATENCION opening, FLUJOS-WEB) ──
  {
    id: 'atencion-guia-comillas',
    roles: ['boss', 'admin'],
    q: [
      'en la guia de atencion lo que va entre comillas es lo de la pantalla',
      'lo que sale entre comillas en la guia de atencion que es',
      'que significan las comillas en el manual de atencion',
      'en la guia de la web que quiere decir lo que va entre comillas',
    ],
    a: 'Lo que va entre comillas, «así», es el texto exacto que sale en la pantalla, tal como sale: por ejemplo «Consultar mi solicitud» o «Guardar borrador». Lo buscas tal cual en la web o en el panel.',
  },
  {
    id: 'atencion-flujos-donde',
    roles: ['boss', 'admin'],
    q: ['donde estan los flujos de atencion dibujados', 'donde veo los flujos de atencion', 'hay diagramas de los flujos de atencion', 'donde esta el camino de un caso dibujado'],
    a: 'En «Ayuda y guías» → «Atención ciudadana»: cada flujo de la atención va dibujado en un diagrama, con lo que hay que saber debajo. Los de la web están en «La web».',
    go: '/ayuda/atencion',
  },
];
