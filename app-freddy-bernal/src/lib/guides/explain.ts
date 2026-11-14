// «Explicado fácil» (design §4(c), 12/11; Juan: «asegúrate que el bot sepa todo … y cómo poder explicarlo»): what 360
// says when someone asks it to explain a task, a screen, a flow, a topic of «Para todos» or a word of «Palabras de la
// app». `easy`: the same thing said more simply (≤ 220 letters, plain words, at most the one label to tap). `example`: a
// made-up case with the guide's labels (no dates, hours, names of real people, phones or codes). `why`: the reason, only
// where the guide gives it. One source for 360 (src/lib/assistant/explain.ts) and, later, /ayuda («Explicado fácil»),
// apart from the role guides so the explain work never touches their text.
//
// Keyed by the ids of 360's answer index (src/lib/assistant/answers/engine.ts): tasks `<guía>:paso-a-paso:<tarea>`;
// screens `<guía>:pantalla:<n>`, administración's `admin:pantalla:<n>` and `admin:todos:<n>` (built below from each
// guide's screens by their address, so a new screen in the middle of a guide does not move the facets of the others);
// flows `flujo:<flujo>`; «Para todos» `todos:<tema>`; the words `palabra:<palabra>`; each role's job `<guía>:trabajo`.
// Data only. The rules of the help content hold (check.ts, tests/unit/assistant-explain.test.ts): «» only around what the
// screen shows, «tú», no date, hour, phone or demo name, nothing internal.
import type { Role } from '../roles';
import { ADMIN_GUIDE } from './admin';
import { allGuides } from './index';
import { everyoneSections } from './sections';

/** One text for everyone, or one per role (`default` for the rest), as 360's answers are written. */
export type FacetText = string | (Partial<Record<Role, string>> & { default?: string });
export type Facets = { easy?: FacetText; example?: FacetText; why?: FacetText };

// The reason the guide gives for the date rule («La regla de la fecha»), said where a screen or a task leans on it.
const DATE_WHY = 'Porque la fecha, la hora y la dirección de la agenda del jefe son información de seguridad: Redes y política nunca las ven.';
const NOTICE_WHY = 'El aviso va sin la fecha porque la fecha, la hora y la dirección de la agenda son información de seguridad: quien graba la ve en el evento.';
const TITLE_WHY = 'Porque el título y «A dónde se va» los ve todo el equipo, Redes también: la fecha, la hora y la dirección van solo en «Fecha, hora y lugar exacto».';
const TWO_FACTOR_WHY = 'Porque la fecha, la hora y la dirección de la agenda son información de seguridad: por eso solo se ven si entraste con el doble factor.';

// ── Tasks («Paso a paso» of each role) ─────────────────────────────────────────────────────────────────────────────

const TASKS: Record<string, Facets> = {
  // El jefe
  'jefe:paso-a-paso:aprobar-verdes': {
    easy: 'Las verdes son las piezas de rutina: no hace falta abrirlas una por una. Con «Aprobar todas las verdes (2)» las apruebas todas de un toque.',
    example: 'Por ejemplo: Redes mandó dos historias en verde. Abres tu Inicio, ves «Te toca aprobar» y tocas «Aprobar todas las verdes (2)»: ambas quedan aprobadas.',
    why: 'Porque el verde es rutina: así las marca Redes al mandarlas, y por eso van todas juntas, en el día. Las que tienen avisos de cumplimiento abiertos se saltan: esas las abres una por una.',
  },
  'jefe:paso-a-paso:aprobar-pieza': {
    easy: 'Abres la pieza, la miras con calma, marcas la lista de lo que hay que revisar y, si está bien, tocas «Aprobar». Si no, pides cambios y le vuelve a Redes.',
    example: 'Por ejemplo: Redes manda un post en amarillo. Lo abres en «Por aprobar», miras la imagen, revisas «Copies: cómo saldrá», marcas «Antes de aprobar» y tocas «Aprobar». Si el texto es muy largo, tocas «Muy largo» y «Pedir cambios».',
    why: 'Porque nada se publica sin tu aprobación: la lista «Antes de aprobar» es lo que se revisa antes, y hasta que la marcas toda, «Aprobar» no se prende.',
  },
  'jefe:paso-a-paso:aprobar-tweets': {
    easy: 'Redes te manda los tweets de la semana todos juntos y ya marcados. Le quitas la marca a los que no van y apruebas el resto de un toque con «Aprobar marcados».',
    example: 'Por ejemplo: llegan 15 tweets de la semana. Desmarcas los dos que no van y tocas «Aprobar marcados»: se aprueban los otros 13 y los dos desmarcados no salen.',
  },
  'jefe:paso-a-paso:decidir': {
    easy: 'Cuando el despacho propone un evento, tú decides si va: lo abres y, en «Tu decisión», le pones de 1 a 10 qué tan importante es y lo aceptas o lo rechazas.',
    example: 'Por ejemplo: el despacho propone un evento nuevo. En Política tocas «Esperan tu decisión (2)», lo abres, le pones 8 de importancia y tocas «Aceptar». Al despacho le llega el aviso.',
    why: 'Porque mientras no decides, el equipo no arranca: lo que propone el despacho se queda «Por decidir» hasta que lo aceptas o lo rechazas.',
  },
  'jefe:paso-a-paso:poner-fecha': {
    easy: 'Las fichas del IVT y de política llegan sin fecha. Con «Ponerle fecha» les pones el día, la hora y el lugar, y pasan a tu agenda ya aceptadas.',
    example: 'Por ejemplo: llega la ficha de una obra del IVT. Tocas «Ponerle fecha», revisas el «Título del evento», pones el día, la hora y la «Dirección exacta», eliges «Quién graba» y tocas «Guardar la fecha».',
    why: 'Porque el «Título del evento» y «A dónde se va» los ve todo el equipo, Redes también: por eso van sin fecha ni hora. Y como la pones tú, queda aceptado de una vez.',
  },
  'jefe:paso-a-paso:nuevo-evento': {
    easy: 'Con «Nuevo evento» pones algo en tu agenda: de qué se trata, cuándo y dónde. Como lo pones tú, queda aceptado y el despacho se entera.',
    example: 'Por ejemplo: te invitan a un acto. Tocas «Crear» → «Nuevo evento», escribes el título sin fecha, pones la fecha y la «Dirección exacta» en «Fecha, hora y lugar exacto», eliges «Quién graba» y tocas «Guardar evento».',
    why: TITLE_WHY,
  },
  'jefe:paso-a-paso:cambiar-evento': {
    easy: 'Si cambia el plan, abres el evento y eliges: cambiar solo el día o la hora, cambiar todo junto (también el lugar) o cancelarlo. Cancelado queda tachado: no se borra.',
    example: 'Por ejemplo: un evento pasa a otra hora el mismo día. Lo abres, tocas «Mover», eliges la hora nueva y «Guardar la nueva fecha». A quien graba le llega un aviso, sin la fecha.',
    why: NOTICE_WHY,
  },
  'jefe:paso-a-paso:leer': {
    easy: 'Antes de un acto abres lo que vas a decir, en letra grande. La agrandas con el +, el botón verde hace correr el texto solo y la X de arriba te saca.',
    example: 'Por ejemplo: vas saliendo a una visita de obra. En Política tocas «Lo que voy a decir», agrandas la letra con el +, lees «Antes de hablar» y tocas el botón verde en «Lento» para que corra solo.',
  },
  'jefe:paso-a-paso:digital': {
    easy: 'En el botón Digital ves lo que ya salió, lo que viene y cómo nos va. Para los números, tocas «Ver resultados».',
    example: 'Por ejemplo: cada semana abres Digital, miras «Lo publicado» y «Lo que viene», y en «Ver resultados» revisas «¿A qué hora nos va mejor?» para saber qué hora conviene.',
  },
  'jefe:paso-a-paso:redes': {
    easy: 'En Redes ves cómo va el mes por formato, y puedes hacer todo lo que hace Redes: piezas, copies, el feed, los tweets y publicar a mano.',
    example: 'Por ejemplo: en el tablero ves que a Posts le faltan piezas para su cupo. Tocas el número, se abre la tarjeta de esa pieza en su sección y la completas tú mismo.',
  },
  'jefe:paso-a-paso:resumen-mes': {
    easy: 'Al cierre del mes, el resumen te dice por formato cuánto se hizo de su cupo, cuánto se aprobó y cuánto salió. Está en tu botón Redes.',
    example: 'Por ejemplo: al cierre tocas «Resumen del mes · Mes 1» y ves que en Reels se hicieron 6 de 8, se aprobaron 5 y salieron 4, con la receptividad media debajo.',
  },
  'jefe:paso-a-paso:diseno': {
    easy: 'Si no te gusta cómo se ve una pieza, marcas que el diseño no va y dices qué no te gustó. Si ya estaba aprobada, no sale hasta que la vuelvas a aprobar.',
    example: 'Por ejemplo: un post aprobado tiene la letra muy pequeña. Tocas «Diseño desaprobado», lo escribes en «¿Qué no le gustó del diseño?», tocas «Guardar nota» y eliges «Sí, pedir cambios» para que Redes lo corrija.',
  },
  'jefe:paso-a-paso:eliminar-pieza': {
    easy: 'Si una pieza ya no va, la eliminas desde los tres puntos de su tarjeta. Solo tú puedes, con el doble factor, y si fue un error, administración la recupera.',
    example: 'Por ejemplo: un reel quedó repetido. En su tarjeta tocas los tres puntos → «Eliminar» y confirmas: sale de su sección y del feed.',
  },
  'jefe:paso-a-paso:armar-canal': {
    easy: 'Un canal es un grupo de Mensajes para un trabajo. Lo creas con «Nuevo canal», le pones nombre y marcas quiénes van. Tú estás en todos.',
    example: 'Por ejemplo: abres los globitos, tocas «Nuevo canal», lo llamas “Material y piezas”, marcas a Redes y a Grabación y tocas «Crear canal».',
  },
  'jefe:paso-a-paso:miembros-canal': {
    easy: 'Si alguien entra o sale de un trabajo, cambias quién está en su canal con «Editar canal». Quien entra ve lo ya escrito; quien sale deja de verlo.',
    example: 'Por ejemplo: llega una persona nueva a Grabación. Abres el canal, tocas los tres puntos → «Editar canal», la marcas y tocas «Guardar»: ya ve los mensajes de antes.',
  },
  'jefe:paso-a-paso:fichas': {
    easy: 'Las fichas de obra son del IVT y las comunitarias, de política. Las ves en Obras y en Municipios, y si hace falta creas una tú con «Crear».',
    example: 'Por ejemplo: te cuentan de un problema en una comunidad. Tocas «Crear» → «Ficha comunitaria», llenas los grupos y la guardas; o abres una que espera fecha y tocas «Ponerle fecha».',
  },

  // El despacho
  'despacho:paso-a-paso:poner-fecha': {
    easy: 'Las fichas del IVT y de política llegan sin fecha. Con «Ponerle fecha» les pones el día, la hora y el lugar, y le llegan al jefe para que decida.',
    example: 'Por ejemplo: en Hoy ves una «Obra del IVT» por ponerle fecha. Tocas «Ponerle fecha», revisas el título, pones el día, la hora y la «Dirección exacta», eliges «Quién graba» y tocas «Guardar la fecha».',
    why: 'Porque el «Título del evento» y «A dónde se va» los ve todo el equipo, Redes también: por eso van sin fecha ni hora. Y le llega al jefe «Por decidir» porque lo que crea el despacho lo decide el jefe.',
  },
  'despacho:paso-a-paso:nuevo-evento': {
    easy: 'Cuando llega algo nuevo para la agenda, lo cargas con «Nuevo evento»: de qué se trata, cuándo y dónde. Le llega al jefe para que lo acepte o lo rechace.',
    example: 'Por ejemplo: invitan al jefe a un acto. Tocas «Crear» → «Nuevo evento», escribes el título sin fecha, pones la fecha y la dirección en «Fecha, hora y lugar exacto», eliges «Quién graba» y tocas «Guardar evento».',
    why: TITLE_WHY,
  },
  'despacho:paso-a-paso:ficha-tecnica': {
    easy: 'La ficha técnica es lo que se sabe de un evento antes de ir. Cuando Hoy dice que está incompleta, la abres, la llenas y la guardas.',
    example: 'Por ejemplo: Hoy dice «Ficha técnica incompleta». Abres el evento, pestaña «Ficha», tocas «Editar», escribes quién lo dirige y los datos con su fuente, y tocas «Guardar ficha».',
    why: 'Porque Redes escribe los copies solo con las cifras de la ficha: un dato que no está en la ficha no sale en lo que se publica.',
  },
  'despacho:paso-a-paso:quien-graba': {
    easy: 'Le dices a la app qué persona de Grabación va a ese evento. A esa persona le llega un aviso de que le asignaron el evento, sin la fecha.',
    example: 'Por ejemplo: un evento ya tiene fecha. Lo abres, pestaña «Ficha», y en «Quién graba» marcas a dos personas de Grabación: a ambas les llega «Te asignaron un evento».',
    why: NOTICE_WHY,
  },
  'despacho:paso-a-paso:cambiar': {
    easy: 'Si cambia el plan, abres el evento y eliges: cambiar solo el día o la hora, cambiar todo junto (también el lugar) o cancelarlo. Cancelado queda tachado: no se borra.',
    example: 'Por ejemplo: cambian el sitio de un evento. Lo abres, tocas «Cambiar fecha o lugar», pones la dirección nueva y «Cómo se llega», y guardas. Si el jefe cambió lo mismo, se queda el último cambio guardado.',
    why: NOTICE_WHY,
  },
  'despacho:paso-a-paso:realizado': {
    easy: 'Cuando el evento ya empezó o terminó, lo marcas como realizado. Su material pasa a la Biblioteca y ya no cambia de fecha ni de lugar.',
    example: 'Por ejemplo: termina una visita de obra. Abres el evento y, en la tarjeta de fecha y lugar, tocas «Marcar realizado»: lo grabado queda en la Biblioteca.',
  },
  'despacho:paso-a-paso:fichas': {
    easy: 'Tú también puedes cargar una ficha de obra o una comunitaria con «Crear». Llenas sus grupos y, al final, la guardas y le avisas al jefe.',
    example: 'Por ejemplo: te pasan los datos de una obra. Tocas «Crear» → «Ficha de obra», llenas los grupos, en lo que no sabes pones «Por confirmar» y tocas «Guardar y avisar al jefe».',
  },

  // Política
  'politica:paso-a-paso:nueva-ficha': {
    easy: 'Cuando pasa algo en una comunidad, lo cargas en una ficha comunitaria. Si es para la agenda del jefe, lo marcas y le llega al jefe para ponerle fecha.',
    example: 'Por ejemplo: una comunidad pide que el jefe la visite. En Municipios tocas «Nueva ficha comunitaria», llenas los grupos, prendes «¿Va a la agenda del jefe?» y tocas «Guardar y avisar al jefe».',
  },
  'politica:paso-a-paso:seguimiento': {
    easy: 'Después de cada visita o noticia, le cuentas a la ficha cómo va: le cambias el estado o le agregas una nota. Todo queda en su historia.',
    example: 'Por ejemplo: empezó el arreglo que pidió una comunidad. Abres su ficha, en «Estado» eliges «En ejecución», escribes el avance en «Motivo o avance (opcional)» y tocas «Cambiar estado».',
  },
  'politica:paso-a-paso:vencidas': {
    easy: 'Una ficha vencida es la que pasó su fecha de seguimiento sin terminar. Cada día las revisas arriba en Municipios y les cambias el estado o les pones una nota.',
    example: 'Por ejemplo: arriba, en «Vencidas en los municipios», sale un reporte que pasó su fecha de seguimiento. Lo abres y le cambias el estado o le agregas una nota con lo que pasó.',
    why: 'Porque una vencida sale arriba en Municipios y también en el Inicio del jefe, hasta que queda finalizada o suspendida.',
  },
  'politica:paso-a-paso:saber-fecha': {
    easy: 'Tu ficha te dice si ya tiene fecha en la agenda del jefe, pero nunca cuál es. Cuando la tiene, te llega un aviso.',
    example: 'Por ejemplo: guardaste un reporte con «Guardar y avisar al jefe». Cuando el jefe o el despacho le ponen fecha, te llega el aviso y la ficha dice «Ya tiene fecha. La ven el jefe y el despacho en la agenda.»',
    why: DATE_WHY,
  },

  // El IVT
  'ivt:paso-a-paso:nueva-obra': {
    easy: 'Antes de cada visita del jefe, cargas la ficha de la obra con lo que sabes. Si te falta algo, la guardas como borrador; completa, le avisas al jefe.',
    example: 'Por ejemplo: el jefe va a visitar una obra. En Obras tocas «Nueva ficha de obra», llenas los cinco grupos, en lo que falta saber pones «Por confirmar» y tocas «Guardar y avisar al jefe».',
    why: 'Porque lo que va a decir el jefe sale solo de las cifras de la ficha: por eso cada dato lleva su fuente, y lo que no sabes va «Por confirmar».',
  },
  'ivt:paso-a-paso:fotos': {
    easy: 'Después de guardar la ficha, le subes las fotos del antes y del avance, y los documentos. Si se va la señal, la subida sigue sola.',
    example: 'Por ejemplo: vas a la obra y tomas fotos de cómo va. Abres su ficha, tocas «Subir fotos del avance» y eliges las fotos; si se cae la señal, siguen subiendo cuando vuelve.',
  },
  'ivt:paso-a-paso:fab': {
    easy: 'La app te arma lo que va a decir el jefe en la obra, en tres partes: qué es, qué mejora y qué gana la gente. Tú lo revisas, lo corriges y lo guardas.',
    example: 'Por ejemplo: en la ficha tocas «Generar diálogo FAB». Abajo, en «Lo que la ficha no tiene (no se dice):», ves que falta cuántas familias se benefician: eso no sale en el texto. Corriges y tocas «Guardar».',
    why: 'Porque el jefe solo dice lo que está en la ficha: el diálogo usa solo sus cifras, y lo que la ficha no tiene no sale en el texto, para no inventar nada.',
  },
  'ivt:paso-a-paso:visitas': {
    easy: 'En «Mis visitas de obra» ves las visitas del jefe a tus obras. La fecha, la hora y la dirección las ves si entraste con el doble factor.',
    example: 'Por ejemplo: entras con el código de tu aplicación, abres Agenda → «Mis visitas de obra» y ves la visita de tu obra con su fecha. Si la cancelan, te llega un aviso y la ficha vuelve a «Por ponerle fecha».',
    why: TWO_FACTOR_WHY,
  },
  'ivt:paso-a-paso:mantener': {
    easy: 'Si algo cambia en la obra, corriges su ficha con «Editar». Si la visita ya no va, la archivas, y si vuelve, la sacas del archivo.',
    example: 'Por ejemplo: la obra cambió de contratista. Abres la ficha, tocas «Editar» y lo corriges; en «Historia» tocas «Agregar una nota», escribes qué cambió y tocas «Guardar nota».',
  },

  // Grabación
  'grabacion:paso-a-paso:antes': {
    easy: 'Cuando te asignan un evento, lo abres antes de ir: arriba están la fecha, la dirección y cómo se llega, y en la pestaña «Storyboard», las tomas que hacen falta.',
    example: 'Por ejemplo: te llega «Te asignaron un evento». Vas a Agenda → «Mis eventos», lo abres, lees «Cómo se llega» y en la pestaña «Storyboard» ves que Redes pide una toma del jefe hablando.',
  },
  'grabacion:paso-a-paso:subir': {
    easy: 'El mismo día que grabas, subes lo grabado en el evento: cada parte en su casilla, ya limpio y tal como sale de la cámara.',
    example: 'Por ejemplo: grabaste al jefe hablando y unas tomas con el dron. Abres el evento, en «Material» tocas «Subir» en la casilla del jefe y luego en la del dron, con los archivos sin pasar por WhatsApp.',
  },
  'grabacion:paso-a-paso:entrega': {
    easy: 'Después de subir, le dejas a Redes tu entrega: el storyboard con el que grabaste y una nota para quien edita, con qué sirve, qué falló y qué falta.',
    example: 'Por ejemplo: en «Tu nota para el editor» escribes “La toma del dron del final es la mejor; el audio del inicio tiene viento; faltó la gente aplaudiendo” y tocas «Guardar nota».',
    why: 'Porque la nota la lee Redes, y Redes nunca ve la fecha, la hora ni la dirección: por eso va sin eso, y con un teléfono la nota no se guarda.',
  },
  'grabacion:paso-a-paso:realizado': {
    easy: 'Cuando el evento ya empezó, lo marcas como realizado en la tarjeta de arriba. Su material pasa al registro por día.',
    example: 'Por ejemplo: llegas al evento y ya empezó. Lo abres, tocas «Marcar realizado» en la tarjeta de arriba y sigues grabando; después subes el material.',
  },

  // Redes
  'redes:paso-a-paso:storyboard': {
    easy: 'El storyboard es el plan de lo que se graba. En el evento escribes lo que va a decir el jefe y agregas un bloque por cada toma; Grabación lo lee antes de ir.',
    example: 'Por ejemplo: en la pestaña «Storyboard» escribes el saludo del jefe en «Lo que va a decir», tocas «Agregar bloque» para una toma de la gente y otra del jefe hablando, y tocas «Guardar storyboard».',
  },
  'redes:paso-a-paso:material': {
    easy: 'Cuando Grabación sube lo grabado, abres el evento, lees su nota para el editor y bajas todo el material a una carpeta para editar.',
    example: 'Por ejemplo: Hoy dice «Material». Abres el evento, pestaña «Material», lees la «Nota para el editor» y tocas «Descargar todo el material».',
  },
  'redes:paso-a-paso:pieza': {
    easy: 'Una pieza es cada publicación. La creas en la sección de su formato, llenas su tarjeta, subes el archivo y la app te escribe los copies desde la ficha.',
    example: 'Por ejemplo: en Reels tocas «Nuevo reel», le pones título, subes el video y la portada, y en «Generar copies» tocas «Escribir desde la ficha»: revisas los tres textos y tocas «Guardar».',
    why: 'Los copies salen de la ficha para no inventar cifras: la app escribe solo con las cifras que la ficha tiene.',
  },
  'redes:paso-a-paso:enviar': {
    easy: 'Cuando la pieza está lista, se la mandas al jefe con «Enviar a aprobación». Si falta algo, la tarjeta te dice qué. Después espera al jefe.',
    example: 'Por ejemplo: terminaste un post y tocas «Enviar a aprobación». Si está apagado y dice «Falta para enviarla:» y la imagen, subes la imagen y lo envías: pasa a «En revisión».',
    why: 'Porque nada se publica sin la aprobación del jefe: sin ella, la tarjeta dice «Falta la aprobación del jefe» y no puedes marcar «Ya lo publiqué».',
  },
  'redes:paso-a-paso:cambios': {
    easy: 'Si el jefe pidió cambios, la pieza te vuelve con su comentario. La corriges y se la mandas otra vez con «Enviar a aprobación».',
    example: 'Por ejemplo: Hoy dice «Cambios». Abres la tarjeta, lees lo que pidió el jefe, acortas el copy que estaba muy largo y tocas «Enviar a aprobación».',
  },
  'redes:paso-a-paso:editar-aprobada': {
    easy: 'Lo que sale de una pieza aprobada queda fijo. Si hay que cambiarlo, tocas «Editar (vuelve al jefe)» y el jefe la revisa otra vez. Lo demás se cambia libre.',
    example: 'Por ejemplo: en un reel aprobado hay un error en el copy. Tocas «Editar (vuelve al jefe)», confirmas, lo corriges y la pieza vuelve a «En revisión». Cambiar el pilar o las notas no la devuelve.',
    why: 'Porque el jefe aprobó lo que sale (el copy, el archivo, el título, las láminas, el texto en pantalla y el sticker): si cambia, vuelve a él. Lo demás se cambia sin que vuelva.',
  },
  'redes:paso-a-paso:feed': {
    easy: 'El feed es cómo se ven juntas las publicaciones del mes, en 24 espacios. Eliges qué pieza va en cada uno; el #1, abajo a la derecha, es el primero que sale.',
    example: 'Por ejemplo: en Redes → «Feed» tocas el espacio #1 («Elegir publicación»), eliges Reels y el reel del mes: ese es el primero que sale. Si lo quieres después, lo tocas y eliges «Publicar después (#2)».',
  },
  'redes:paso-a-paso:mes': {
    easy: 'Cada mes de contenido junta sus piezas. Con «+ Nuevo mes» empiezas el que sigue, y una pieza puede pasar de un mes a otro sin perderse.',
    example: 'Por ejemplo: un post no salió y va para el mes que sigue. En su tarjeta tocas los tres puntos → «Mover a otro mes» y eliges el mes: su espacio en el feed se va con él.',
  },
  'redes:paso-a-paso:diseno': {
    easy: 'Marcas si el arte de la pieza quedó bien o no y, si no, dices qué no gustó. No es la aprobación: la pieza sigue en su estado.',
    example: 'Por ejemplo: revisas un carrusel y la portada quedó oscura. Tocas «Diseño desaprobado», lo escribes en «¿Qué no le gustó del diseño?» y tocas «Guardar nota»; cuando la corrigen, marcas «Diseño aprobado».',
  },
  'redes:paso-a-paso:aviso': {
    easy: 'Un aviso de cumplimiento es una nota de cuidado que el jefe lee antes de aprobar, como un testimonio o un dato por verificar. Lo pones con «Agregar aviso».',
    example: 'Por ejemplo: un reel trae el testimonio de una vecina. Tocas «Agregar aviso», eliges «Tono de testimonio» en «Tipo de aviso», escribes en «Qué hay que cuidar» que firmó la autorización y tocas «Guardar aviso».',
  },
  'redes:paso-a-paso:publicado': {
    easy: 'Cuando ya publicaste a mano una pieza aprobada, lo marcas en su tarjeta con «Ya lo publiqué» y el link de cada red. La tarjeta se pone verde.',
    example: 'Por ejemplo: subiste el reel a Instagram y a TikTok. En la tarjeta tocas «Ya lo publiqué», marcas Instagram y TikTok, pegas cada link y tocas «Guardar»: dice «Publicado».',
  },
  'redes:paso-a-paso:publicar': {
    easy: 'La app no publica sola: programas la pieza, bajas su paquete y la subes tú a la red. Después marcas «Ya lo publiqué».',
    example: 'Por ejemplo: en Publicar tocas «Nueva publicación», eliges el reel aprobado, Instagram y TikTok, pones el «Día» y la «Hora (Táchira)» y tocas «Programar en 2 redes»; a esa hora bajas el «Video» y tocas «Copiar el copy».',
  },
  'redes:paso-a-paso:resultados': {
    easy: 'Unos días después de publicar, anotas cómo le fue: vistas, alcance, me gusta y lo demás. Con eso la app te dice a qué hora nos va mejor.',
    example: 'Por ejemplo: abres la publicación del reel, tocas «Cargar resultados», escribes las vistas y los me gusta que dice Instagram y tocas «Guardar resultados».',
  },
  'redes:paso-a-paso:tweets': {
    easy: 'Cada semana subes el documento con los tweets: la app los separa, los reparte de 2 a 3 por día y se los manda al jefe. Aprobados, los programas y los publicas a mano.',
    example: 'Por ejemplo: pegas el documento en «Tweets de la semana», tocas «Separar tweets», partes uno muy largo con «Partir» y tocas «Repartir en la semana y enviar a aprobación».',
  },
  'redes:paso-a-paso:jefe-publico': {
    easy: 'Si el jefe publica algo por su cuenta, lo anotas para que cuente en los resultados: la red, el link y de qué se trató.',
    example: 'Por ejemplo: el jefe subió un video a su Instagram. En Publicar tocas «Registrar lo que publicó el jefe», eliges la red, pegas el link, escribes de qué se trató y tocas «Registrar».',
  },
  'redes:paso-a-paso:quien-graba': {
    easy: 'En el evento le dices a la app quién de Grabación va, y vas cambiando en qué va el trabajo.',
    example: 'Por ejemplo: abres el evento, pestaña «Ficha», marcas a la persona de Grabación en «Quién graba» y cambias «¿En qué va?» cuando avanza el trabajo.',
  },
};

// ── Each role's job («Tu trabajo») ────────────────────────────────────────────────────────────────────────────────

const JOBS: Record<string, Facets> = {
  'jefe:trabajo': { easy: 'Tú decides la agenda y apruebas todo lo que sale: nada se publica sin ti. También miras cómo nos va y armas los canales de Mensajes.' },
  'despacho:trabajo': { easy: 'Tú armas la agenda con el jefe: cargas los eventos, les pones fecha a las fichas y dices quién graba. Lo que pones le llega al jefe para que decida.' },
  'politica:trabajo': { easy: 'Tú cuentas lo que pasa en cada municipio: cargas las fichas comunitarias, les das seguimiento y dices cuáles van a la agenda del jefe.' },
  'ivt:trabajo': { easy: 'Tú preparas cada obra antes de la visita del jefe: la ficha, las fotos y lo que él va a decir.' },
  'grabacion:trabajo': { easy: 'Tú grabas los eventos que te asignan, subes lo grabado y le dejas a Redes tu nota para el editor.' },
  'redes:trabajo': { easy: 'Tú haces las piezas de cada mes, se las mandas al jefe, las publicas a mano cuando él las aprueba y anotas cómo nos fue.' },
  'admin:trabajo': { easy: 'Tú manejas la parte técnica: invitas a cada persona, le das sus roles, ayudas con el doble factor y cuidas los ajustes. No decides ni apruebas.' },
};

// ── Screens («Cada pantalla»): by address, with the roles that see that version ───────────────────────────────────

type ScreenFacets = Facets & { screen?: string; title?: string; roles?: Role[] };

const SCREENS: ScreenFacets[] = [
  {
    screen: '/jefe',
    easy: 'Es tu pantalla de inicio: arriba lo vencido y lo que te toca aprobar, y abajo cuatro botones grandes: Política, Obras, Redes y Digital.',
    example: 'Por ejemplo: abres la app y ves dos verdes en «Te toca aprobar»; las apruebas de un toque y luego tocas el botón Política para ver tu agenda.',
  },
  {
    screen: '/jefe/politica',
    easy: 'Es tu agenda, la que compartes con el despacho: lo que espera tu decisión, lo que falta por ponerle fecha y lo que viene en los próximos días.',
    example: 'Por ejemplo: tocas «Esperan tu decisión (2)», abres un evento del despacho y lo aceptas; después, en «Los próximos 7 días», abres «Lo que voy a decir» del acto que viene.',
  },
  // /agenda is another screen for each role.
  {
    screen: '/agenda',
    roles: ['camera'],
    easy: 'Son los eventos que te toca grabar, con su fecha y su dirección. Cada uno te dice si ya tiene el material o si falta.',
    example: 'Por ejemplo: ves un evento con «Falta el material»: lo abres y subes lo que grabaste en la pestaña «Material».',
  },
  {
    screen: '/agenda',
    roles: ['social'],
    easy: 'Son los eventos, sin fecha ni hora, ordenados por lo que hace falta. Cada uno te dice si ya tiene storyboard y material.',
    example: 'Por ejemplo: ves un evento con «Falta storyboard». Lo abres, vas a la pestaña «Storyboard» y lo armas.',
    why: DATE_WHY,
  },
  {
    screen: '/agenda',
    roles: ['ivt'],
    easy: 'Son las visitas del jefe a tus obras. Si entraste con el doble factor, ves su fecha y su dirección.',
    example: 'Por ejemplo: una visita dice «Sin fecha: el jefe la rechazó». Esa ficha vuelve a «Por ponerle fecha» y te llega un aviso.',
    why: TWO_FACTOR_WHY,
  },
  {
    screen: '/agenda',
    roles: ['admin'],
    easy: 'Lees la agenda, lo que espera fecha, las obras y los municipios. Puedes crear y completar fichas de obra, pero no creas eventos ni les pones fecha.',
    example: 'Por ejemplo: el IVT te pide ayuda con una ficha de obra: la abres, la completas y la guardas. Ponerle fecha se lo dejas al jefe o al despacho.',
  },
  {
    screen: '/agenda',
    easy: 'Es el calendario de la agenda, en hora del Táchira. Lo ves por día, por semana o por mes, y tocas un evento para abrir su ficha.',
    example: 'Por ejemplo: tocas «Semana», pasas a la siguiente con la flecha › y tocas un evento para abrirlo. Los cancelados salen tachados.',
  },
  {
    screen: '/agenda/nuevo',
    easy: {
      boss: 'Es para poner algo en tu agenda: de qué se trata, cuándo, dónde y quién graba. Como lo pones tú, queda aceptado de una vez.',
      default: 'Es para poner algo en la agenda: de qué se trata, cuándo, dónde y quién graba. Lo que pones le llega al jefe «Por decidir».',
    },
    example: 'Por ejemplo: en «El evento» escribes un título sin fecha, en «Fecha, hora y lugar exacto» pones la fecha y la dirección, en «Ficha técnica» eliges «Quién graba» y tocas «Guardar evento».',
    why: TITLE_WHY,
  },
  {
    screen: '/agenda/por-fecha',
    easy: 'Aquí esperan las fichas del IVT y de política que todavía no tienen fecha. Al ponérsela, pasan a la agenda.',
    example: 'Por ejemplo: una tarjeta dice «Reporte comunitario». Tocas «Ver ficha» para leerla y luego «Ponerle fecha»; si no va, tocas «No va» y escribes «Por qué no va».',
  },
  // An event is another screen for each role.
  {
    screen: '/eventos/[id]',
    roles: ['politics'],
    easy: 'Es la vista corta de una actividad que salió de tu reporte. Te dice si ya tiene fecha, pero nunca cuál.',
    example: 'Por ejemplo: abres la actividad y dice «Ya tiene fecha. La ven el jefe y el despacho en la agenda.» Con «Volver» regresas a tu reporte.',
    why: DATE_WHY,
  },
  {
    screen: '/eventos/[id]',
    roles: ['ivt'],
    easy: 'Es la vista corta de una visita que salió de tu ficha de obra. Si entraste con el doble factor, ves su fecha, su hora y su dirección.',
    example: 'Por ejemplo: abres la visita desde tu lista y ves su fecha; con «Mis visitas de obra» vuelves a la lista.',
    why: TWO_FACTOR_WHY,
  },
  {
    screen: '/eventos/[id]',
    roles: ['camera'],
    easy: 'Es un evento que te asignaron. Arriba, la fecha, la dirección y cómo se llega; abajo, la pestaña donde subes lo que grabaste.',
    example: 'Por ejemplo: antes de ir lees la pestaña «Storyboard» para saber qué tomas pide Redes; después vuelves a «Material» y subes lo grabado.',
  },
  {
    screen: '/eventos/[id]',
    roles: ['social'],
    easy: 'Es de qué se trata un evento y qué le falta, sin fecha ni hora: la ficha, el storyboard, el material y sus piezas.',
    example: 'Por ejemplo: abres un evento, lees la pestaña «Ficha», armas la pestaña «Storyboard» y, cuando llega el material, creas la pieza en la pestaña «Piezas» con «Nueva pieza».',
    why: DATE_WHY,
  },
  {
    screen: '/eventos/[id]',
    roles: ['dispatch'],
    easy: 'Es todo de un evento de la agenda: cuándo y dónde, la ficha técnica y quién graba. Aquí lo mueves, lo cambias o lo cancelas.',
    example: 'Por ejemplo: abres un evento, pestaña «Ficha», tocas «Editar», completas la ficha técnica y tocas «Guardar ficha».',
  },
  {
    screen: '/eventos/[id]',
    easy: 'Es todo de un evento: de qué se trata, cuándo y dónde, el plan de grabación, el material y las piezas. Aquí también lo decides.',
    example: 'Por ejemplo: abres un evento «Por decidir», en «Tu decisión» le pones 7 y tocas «Aceptar»; luego, en la pestaña «Ficha», revisas «Quién graba».',
  },
  {
    screen: '/eventos/[id]?tab=storyboard',
    easy: 'Es el plan de lo que se graba y de lo que va a decir el jefe, toma por toma.',
    example: 'Por ejemplo: en una visita de obra tocas «Usar como discurso» y el diálogo FAB de la ficha pasa a «Lo que va a decir».',
  },
  {
    screen: '/eventos/[id]?tab=material',
    roles: ['camera'],
    easy: 'Es donde subes lo que grabaste, cada parte en su casilla, y dejas tu entrega para Redes.',
    example: 'Por ejemplo: subes el video del jefe en su casilla, luego la foto de tu storyboard con «Subir el storyboard (foto o PDF)» y escribes tu nota para el editor.',
    why: 'Porque tu nota la lee Redes: por eso va sin fecha, hora ni dirección, y si tiene un teléfono no se guarda.',
  },
  {
    screen: '/eventos/[id]?tab=material',
    easy: 'Es lo que subió Grabación, con su nota para el editor. Bajas todo de una vez a una carpeta.',
    example: 'Por ejemplo: lees la «Nota para el editor», ves que la mejor toma es la del final y tocas «Descargar todo el material».',
  },
  {
    screen: '/eventos/[id]/lectura',
    easy: {
      boss: 'Es lo que vas a decir, en letra grande, para leer en el iPad o en el teléfono. La agrandas con el + y el botón verde lo hace correr solo.',
      default: 'Es lo que va a decir el jefe, en letra grande, para leer en el iPad o en el teléfono. La agrandas con el + y el botón verde lo hace correr solo.',
    },
    example: 'Por ejemplo: antes de hablar abres el modo lectura, agrandas la letra con el +, eliges «Medio» y tocas el botón verde; otro toque lo para y la X te saca.',
  },
  {
    screen: '/aprobar',
    roles: ['admin'],
    easy: 'Ves lo que espera al jefe, pero no apruebas: todo lo aprueba el jefe. En una pieza puedes comentar o pedirle una frase.',
    example: 'Por ejemplo: una pieza necesita la voz del jefe: tocas «Pedir frase al jefe» y anotas qué hace falta.',
  },
  {
    screen: '/aprobar',
    easy: 'Es todo lo que espera tu aprobación, por color: las verdes de un toque y las amarillas y las rojas una por una. Nada se publica sin ti.',
    example: 'Por ejemplo: entras y ves dos rojas y una amarilla: abres primero las rojas, que tienen 30 minutos, y después la amarilla, que tiene 60.',
    why: 'Porque nada se publica sin tu aprobación: si vence el plazo, la pieza sigue sin aprobar y sale en «Trancado».',
  },
  {
    screen: '/aprobar?tab=tweets',
    easy: 'Son los tweets de la semana que mandó Redes, todos marcados. Le quitas la marca a los que no van y apruebas el resto.',
    example: 'Por ejemplo: desmarcas uno que repite lo de otro y tocas «Aprobar marcados»: el desmarcado no sale.',
  },
  {
    screen: '/aprobar/[id]',
    easy: 'Es donde miras una pieza antes de aprobarla: el video o la imagen, sus textos y la lista que tienes que marcar. Con la lista marcada, se prende «Aprobar».',
    example: 'Por ejemplo: pausas el video donde se ve un error y escribes el comentario: queda en ese segundo. Marcas «Antes de aprobar» y, como falta corregir, tocas «Pedir cambios».',
    why: 'Porque falta marcar la lista «Antes de aprobar»: hasta que la marcas toda, «Aprobar» no se prende.',
  },
  {
    screen: '/redes',
    roles: ['admin'],
    easy: 'Puedes hacer lo de Redes: crear y editar piezas, armar el feed y los tweets. No apruebas ni eliminas: eso es del jefe.',
    example: 'Por ejemplo: creas un post en su sección y lo mandas con «Enviar a aprobación»; si el jefe elimina una pieza por error, la recuperas en «Cupo y pilares».',
  },
  {
    screen: '/redes',
    easy: 'Es el tablero del mes: cuánto lleva cada formato de su cupo y lo que falta, como copies o imágenes. Cada número te lleva a esa pieza.',
    example: 'Por ejemplo: en «Estado del contenido» ves un 2 en «Copy faltante» de Posts. Lo tocas y se abre la primera pieza sin copy; lo tocas otra vez y se abre la siguiente.',
  },
  {
    screen: '/redes/[formato]',
    easy: 'Es la lista de piezas de un formato en el mes que eliges. Cada pieza es una tarjeta que se edita ahí mismo y se guarda sola.',
    example: 'Por ejemplo: en Carruseles tocas «Nuevo carrusel», escribes el título, agregas tres láminas con «Agregar lámina» y lo mandas con «Enviar a aprobación».',
  },
  {
    screen: '/redes/feed',
    easy: 'Son los 24 espacios del feed del mes, como se ven en el perfil. El #1, abajo a la derecha, sale primero, y una pieza nunca está en dos espacios.',
    example: 'Por ejemplo: tocas un espacio que dice «Elegir publicación», eliges Posts y el post: queda puesto. Si está en el #21 y lo quieres antes, lo tocas y eliges «Publicar antes (#20)».',
  },
  {
    screen: '/redes/buscar',
    easy: 'Es para buscar en todo Redes: títulos, lo escrito en las tarjetas, copies, avisos y tweets. Escribes dos letras o más y tocas «Buscar».',
    example: 'Por ejemplo: buscas “agua” y salen los posts y el tweet que lo dicen; tocas uno y se abre su tarjeta, en su sección y en su mes.',
  },
  {
    screen: '/piezas/nueva',
    easy: 'Es para crear una pieza a partir de un evento: eliges el formato, el mes y el título. Desde Redes es más rápido con el botón de cada sección.',
    example: 'Por ejemplo: en la pestaña «Piezas» de un evento tocas «Nueva pieza», eliges el «Formato», el «Mes» y un título sin fecha, y tocas «Crear pieza».',
    why: 'El título va sin fecha ni hora porque lo lee Redes, y Redes no ve la agenda.',
  },
  {
    screen: '/piezas/[id]',
    easy: 'Es la tarjeta de la pieza en grande, con sus copies, su archivo final, sus versiones y su historial. Aquí eliges el nivel de aprobación.',
    example: 'Por ejemplo: abres la pieza con «Abrir la pieza», eliges «Amarillo: normal» en su cajita, escribes los copies con «Escribir desde la ficha» y tocas «Enviar a aprobación».',
  },
  {
    screen: '/tweets',
    easy: 'Son los tweets de la semana, repartidos por día y hora. Cada día copias el texto, lo pegas en X y marcas que ya salió.',
    example: 'Por ejemplo: tocas el tweet del día, «Copiar texto», lo pegas en X y, ya publicado, pegas su link en «Pega el link del tweet» y tocas «Ya lo publiqué».',
  },
  {
    screen: '/tweets/nueva',
    easy: {
      boss: 'Es para convertir el documento de la semana en tweets: la app los separa, los reparte de 2 a 3 por día y te los manda a aprobar.',
      default: 'Es para convertir el documento de la semana en tweets: la app los separa, los reparte de 2 a 3 por día y se los manda al jefe.',
    },
    example: 'Por ejemplo: subes el documento de Word, tocas «Separar tweets», unes dos que quedaron cortados con «Unir con el siguiente» y tocas «Repartir en la semana y enviar a aprobación».',
  },
  {
    screen: '/tweets/[id]',
    easy: 'Es una tanda: cuántos tweets esperan al jefe, cuántos están aprobados sin día y cuántos ya tienen su día y su hora.',
    example: {
      boss: 'Por ejemplo: ya los leíste todos y tocas «Aprobar los 3»; después Redes los programa con «Programar».',
      default: 'Por ejemplo: el jefe aprobó la tanda: tocas «Programar» y quedan en el tablero con «Copiar texto» y «Ya lo publiqué».',
    },
  },
  {
    screen: '/publicar',
    easy: 'Aquí ves qué sale y cuándo. La app no publica sola: la publicación se sube a mano en cada red y después se marca.',
    example: 'Por ejemplo: en «Aprobadas y sin publicar» ves un reel con la etiqueta «Lista»; tocas «Nueva publicación» para programarlo.',
  },
  {
    screen: '/publicar/nueva',
    easy: 'Es para apartarle el día y la hora a una pieza aprobada en una o varias redes. La app revisa que cumpla con cada red y te dice qué arreglar.',
    example: 'Por ejemplo: eliges un reel y marcas Instagram y TikTok; una sale en rojo y debajo dice qué arreglar. Lo arreglas, pones el «Día» y la «Hora (Táchira)» y tocas «Programar en 2 redes».',
  },
  {
    screen: '/publicar/[id]',
    easy: 'Es el paquete para subir la pieza a la red: el video, la portada y el copy. Después pegas el link y, más adelante, sus resultados.',
    example: 'Por ejemplo: bajas el «Video», tocas «Copiar el copy», lo publicas en Instagram, vuelves, pegas el «Link de la publicación» y tocas «Ya lo publiqué».',
  },
  {
    screen: '/publicar/espontanea',
    easy: 'Es para anotar lo que el jefe publicó por su cuenta, para que cuente en los resultados.',
    example: 'Por ejemplo: el jefe subió una foto a su Facebook; eliges la red, pegas el link, escribes de qué se trató y tocas «Registrar».',
  },
  {
    screen: '/resultados',
    easy: 'Es cómo le fue a cada publicación y a qué hora nos va mejor en cada red. Los números se cargan en cada publicación.',
    example: 'Por ejemplo: eliges «30 días» y miras «¿A qué hora nos va mejor?» en Instagram; si dice «Todavía pocos datos», faltan resultados por cargar.',
  },
  {
    screen: '/biblioteca',
    easy: 'Es el material de los eventos, por día y por evento, como una carpeta compartida. Puedes bajar todo lo de un evento de una vez.',
    example: 'Por ejemplo: buscas el evento en «Buscar por evento o lugar» y tocas «Descargar todo»: baja su material a una carpeta, sin fechas en los nombres.',
  },
  {
    screen: '/obras',
    easy: 'Es la lista de fichas de obra, cada una antes de la visita del jefe. Las ves según en qué van y por municipio.',
    example: 'Por ejemplo: en «Estado» eliges «Por ponerle fecha» y tocas «Filtrar»: salen solo las que esperan fecha.',
  },
  {
    screen: '/obras/nueva',
    easy: 'Es la ficha de una obra, en cinco grupos que se abren y se cierran. Lo que todavía no sabes lo marcas «Por confirmar»; las fotos se suben después.',
    example: 'Por ejemplo: llenas «Datos generales» y «Sobre la obra», en lo que no sabes marcas «Por confirmar» y tocas «Guardar borrador»; cuando la completas, «Guardar y avisar al jefe».',
    why: 'Porque no se inventan cifras: lo que va a decir el jefe sale de la ficha, así que cada dato lleva su fuente o queda «Por confirmar».',
  },
  {
    screen: '/obras/[id]',
    easy: 'Es todo de una obra: sus datos, la fecha de la visita, lo que va a decir el jefe, las fotos y su historia.',
    example: 'Por ejemplo: tocas «Generar diálogo FAB», lo corriges, tocas «Guardar» y lo pruebas en «Modo lectura».',
  },
  {
    screen: '/municipios',
    easy: 'Son los reportes de cada municipio, con lo vencido arriba. Puedes filtrar por municipio, parroquia, tipo o estado.',
    example: 'Por ejemplo: marcas «Solo las vencidas» y tocas «Filtrar»: salen las que pasaron su fecha de seguimiento sin terminar.',
  },
  {
    screen: '/reportes/nuevo',
    easy: 'Es el reporte de algo que pasa en una comunidad, en diez grupos. Si es para la agenda del jefe, lo marcas y le llega para ponerle fecha.',
    example: 'Por ejemplo: llenas «Persona que reporta» y los demás grupos, prendes «¿Va a la agenda del jefe?» y tocas «Guardar y avisar al jefe».',
  },
  {
    screen: '/reportes/[id]',
    roles: ['politics'],
    easy: 'Es todo de un reporte: sus datos, si va a la agenda del jefe, en qué va, las fotos y su historia. La fecha de la agenda nunca sale aquí.',
    example: 'Por ejemplo: subes las fotos del arreglo con «Subir fotos del después» y en «Estado» lo pasas a «Finalizado».',
    why: DATE_WHY,
  },
  {
    screen: '/reportes/[id]',
    easy: 'Es todo de un reporte: sus datos, si va a la agenda del jefe, en qué va, las fotos y su historia.',
    example: 'Por ejemplo: un reporte va a la agenda y todavía no tiene fecha: tocas «Ponerle fecha» en «Agenda del jefe».',
  },
  {
    screen: '/jefe/digital',
    easy: 'Es lo publicado, lo que viene y cómo nos va. Arriba está la oficina, el trabajo dibujado por salas.',
    example: 'Por ejemplo: miras «Vistas esta semana» y tocas «Ver resultados» para ver qué publicación le gustó más a la gente.',
  },
  {
    screen: '/mensajes',
    easy: {
      boss: 'Son tus canales con el equipo, más «Todo el equipo». Tú armas los canales y estás en todos.',
      default: 'Son tus canales con el equipo, más «Todo el equipo». Los canales los arma el jefe.',
    },
    example: {
      boss: 'Por ejemplo: ves en negrita un canal con algo nuevo y lo abres; si hace falta otro canal, tocas «Nuevo canal».',
      default: 'Por ejemplo: ves en negrita un canal con algo nuevo y lo abres; si te hace falta un canal, se lo pides al jefe.',
    },
  },
  {
    screen: '/mensajes/[id]',
    roles: ['politics', 'social'],
    easy: 'Son los mensajes de un canal, del más viejo al más nuevo. Escribes abajo y tocas el avioncito para enviar.',
    example: 'Por ejemplo: ves un mensaje oculto: tenía una fecha o una hora de la agenda, y no es para ti.',
    why: 'Porque la fecha y la hora de la agenda del jefe son información de seguridad: un mensaje que las tenía no se muestra a Redes ni a política.',
  },
  {
    screen: '/mensajes/[id]',
    easy: 'Son los mensajes de un canal, del más viejo al más nuevo. Escribes abajo y tocas el avioncito para enviar.',
    example: 'Por ejemplo: escribes “eso queda para mañana” en un canal donde está Redes: la app te pregunta antes de enviarlo, con «Enviar igual» o «Corregir».',
    why: 'Porque la fecha, la hora y el lugar de la agenda del jefe son información de seguridad: donde está Redes o política, la app no deja escribirlos.',
  },
  {
    screen: '/mensajes/canales/nuevo',
    easy: 'Es para armar un canal: le pones nombre, para qué es y marcas quiénes van. Tú ya estás marcado.',
    example: 'Por ejemplo: escribes “Obras” en «Nombre del canal», marcas al IVT y al despacho y tocas «Crear canal».',
  },
  {
    screen: '/mensajes/[id]/editar',
    easy: 'Es para cambiarle el nombre a un canal, cambiar quiénes están en él o archivarlo. Todo se guarda junto.',
    example: 'Por ejemplo: quitas a alguien que ya no está en ese trabajo y tocas «Guardar»: la app te pregunta antes de guardar.',
  },
  {
    screen: '/avisos',
    easy: 'Son los avisos de tu trabajo. Los abres con la campana de arriba, que dice cuántos no has leído.',
    example: 'Por ejemplo: la campana dice 3; la tocas, tocas un aviso y te lleva a lo que dice. Con «Marcar todo como leído» queda en cero.',
  },
  {
    screen: '/buscar',
    easy: 'Es para buscar un evento o una pieza por su nombre, su lugar o su municipio. Solo encuentras lo que tu rol puede ver.',
    example: 'Por ejemplo: tocas la lupa de arriba, escribes el nombre de un municipio y tocas lo que quieres abrir.',
  },
  {
    screen: '/perfil',
    easy: 'Son tus datos y los avisos que te llegan a este teléfono: cuáles quieres y a qué horas no suena.',
    example: 'Por ejemplo: tocas «Activar avisos», luego «Probar aviso» para ver que llega, y en «Horas de silencio» pones que no suene de noche. Al final tocas «Guardar».',
  },
  {
    screen: '/ayuda',
    easy: 'Es la guía de tu trabajo: qué haces, cada pantalla, cómo pasa el trabajo entre todos y los tutoriales de tus pantallas.',
    example: 'Por ejemplo: abres «Tutoriales de mis pantallas» y tocas uno: te lleva a esa pantalla y te la muestra paso a paso.',
  },
  {
    screen: '/ayuda/flujos',
    easy: 'Es cómo pasa el trabajo de un rol a otro, paso a paso. Tocas un flujo para verlo, y los pasos que son tuyos dicen «tú».',
    example: 'Por ejemplo: tocas el flujo de un evento y ves quién hace qué, desde que se crea hasta que se publica.',
  },
  // Hoy is another screen for each role.
  {
    screen: '/hoy',
    roles: ['boss'],
    easy: 'Es lo mismo que Redes ve en su Hoy, más lo que espera tu aprobación. Llegas desde tu botón Redes.',
    example: 'Por ejemplo: en «Lo que espera por mí» ves dos piezas por aprobar y una nota nueva de Grabación.',
  },
  {
    screen: '/hoy',
    roles: ['dispatch'],
    easy: 'Es tu inicio: primero lo que espera por ti, como las fichas por ponerle fecha, y después la agenda del día.',
    example: 'Por ejemplo: en «Lo que espera por mí» tocas una «Obra del IVT» y le pones fecha; después revisas «Hoy en la agenda».',
  },
  {
    screen: '/hoy',
    roles: ['camera'],
    easy: 'Es tu inicio: lo que te falta subir y tus eventos del día.',
    example: 'Por ejemplo: en «Lo que espera por mí» sale «Sube el material» de un evento que ya pasó: lo abres y subes lo grabado.',
  },
  {
    screen: '/hoy',
    easy: 'Es tu inicio: lo que espera por ti, en orden (cambios, storyboard, material, publicar), y lo que está trancado.',
    example: 'Por ejemplo: sale «Cambios»: el jefe pidió cambios en una pieza. La abres, la corriges y la envías otra vez.',
  },
  // Administración's own screens (its guide, apart).
  {
    screen: '/ajustes/equipo',
    easy: 'Son las personas del equipo y sus roles. Invitas a alguien nuevo, le cambias sus roles o cierras sus sesiones si perdió el teléfono.',
    example: 'Por ejemplo: llega alguien nuevo a Redes. Tocas «Invitar a alguien», escribes su nombre y su correo, eliges Redes y tocas «Enviar invitación».',
  },
  {
    screen: '/ajustes/categorias',
    easy: 'Es la lista de categorías del contenido: de los eventos, las piezas y los tweets. Agregas una, le cambias el nombre o la apagas.',
    example: 'Por ejemplo: el equipo empieza a cubrir un tema nuevo: agregas su categoría y ya sale para elegir.',
  },
  {
    screen: '/ajustes/formulas',
    easy: 'Son las fórmulas con las que la app escribe los copies, como FAB o AIDA. Redes elige una en cada pieza.',
    example: 'Por ejemplo: agregas una fórmula nueva y Redes ya la puede elegir en «Fórmula», en los copies de una pieza.',
  },
  {
    screen: '/ajustes/horarios',
    easy: 'Son las franjas del día y cuántos tweets salen por día, para repartir la tanda de la semana.',
    example: 'Por ejemplo: si quieren tres tweets por día en vez de dos, cambias el número por día y la próxima tanda se reparte así.',
  },
  {
    screen: '/ajustes/redes',
    easy: 'Es cuánto puede durar, medir y pesar lo que se publica en cada red. Con eso se revisa cada publicación.',
    example: 'Por ejemplo: si una red cambia cuánto puede durar un video, cambias ese número y la app revisa las publicaciones con la regla nueva.',
  },
  {
    screen: '/ajustes/marca',
    easy: 'Son los textos de la marca: el nombre de la app para 360, los colores, el saludo, los cierres y los hashtags que usan los copies.',
    example: 'Por ejemplo: cambia un hashtag del equipo; lo corriges aquí y los copies nuevos ya lo traen.',
  },
  {
    screen: '/ajustes/contenido',
    easy: 'Es cuántas piezas de cada formato se planean por mes, los temas fijos del contenido y las piezas que eliminó el jefe, para recuperarlas.',
    example: 'Por ejemplo: el jefe eliminó un reel por error. En «Piezas eliminadas» tocas «Recuperar» y vuelve a su mes, sin espacio en el feed.',
  },
  {
    title: 'Google Drive',
    easy: 'Es dónde se guardan los videos: conectas la cuenta de Drive del equipo y pruebas que sube y baja. Solo sale cuando el material va a Drive.',
    example: 'Por ejemplo: conectas la cuenta de Drive del equipo y haces la prueba para ver que un archivo sube y baja bien.',
  },
  {
    screen: '/ajustes/asistente',
    easy: 'Es lo que sabe 360, cómo contesta y cómo le va. Aquí lees lo que el equipo le pregunta y confirmas los avisos que preparó.',
    example: 'Por ejemplo: en «Por confirmar» ves un aviso que 360 preparó para el equipo; lo lees y lo confirmas o lo descartas.',
  },
  {
    screen: '/ajustes/buzon',
    easy: 'Son todos los correos que generó la app. Mientras se prueba, ninguno sale: quedan aquí para revisarlos.',
    example: 'Por ejemplo: abres la invitación que se mandó a alguien nuevo y revisas que diga lo que tiene que decir, sin fecha ni hora de la agenda.',
  },
  {
    screen: '/ajustes/registro',
    easy: 'Es quién cambió qué y cuándo, en toda la app, del más nuevo al más viejo. De Mensajes solo sale que hubo un cambio, nunca el texto.',
    example: 'Por ejemplo: alguien pregunta quién movió un evento: buscas ese cambio en la lista y ves quién fue. Lo que hizo la app sola dice «La app».',
  },
  {
    title: 'Ver como',
    easy: 'Es para ver los menús de otro rol sin cambiar tus permisos. Mientras miras, una franja te lo recuerda.',
    example: 'Por ejemplo: para ayudar a Grabación, eliges Grabación en «Ver como» y ves su menú; con «Mi vista» vuelves al tuyo.',
  },
];

// ── Flows («Cómo va el trabajo entre todos»): `flujo:<id>` ─────────────────────────────────────────────────────────

const FLOWS: Record<string, Facets> = {
  'flujo:evento': {
    easy: 'Un evento pasa por varias manos: el jefe o el despacho lo crean, el jefe lo acepta, Grabación lo graba, Redes hace la pieza, el jefe la aprueba y Redes la publica.',
    example: 'Por ejemplo: el despacho crea un evento y al jefe le llega «Por decidir»; lo acepta, eligen quién graba, Redes arma el storyboard, Grabación sube lo grabado y Redes hace la pieza para aprobar.',
  },
  'flujo:obra': {
    easy: 'El IVT hace la ficha de la obra, el jefe o el despacho le ponen fecha, Redes prepara lo que va a decir el jefe y, después de la visita, se marca realizada.',
    example: 'Por ejemplo: el IVT carga la ficha y toca «Guardar y avisar al jefe»; el despacho le pone fecha; Redes toca «Usar como discurso» y el jefe lo lee en el «Modo lectura» en la visita.',
  },
  'flujo:comunitario': {
    easy: 'Política carga lo que pasa en una comunidad. Si es para la agenda, el jefe o el despacho le ponen fecha; si no, política le da seguimiento hasta que termina.',
    example: 'Por ejemplo: política carga un reporte con «¿Va a la agenda del jefe?» prendido; el despacho le pone fecha y a política le sale «Ya tiene fecha», sin saber cuál.',
    why: DATE_WHY,
  },
  'flujo:tweets': {
    easy: 'Redes sube el documento de la semana, la app lo separa en tweets, el jefe los aprueba y Redes los publica cada día, a mano.',
    example: 'Por ejemplo: Redes pega el documento, toca «Separar tweets» y los manda; el jefe desmarca dos y toca «Aprobar marcados»; Redes toca «Programar» y cada día los pega en X.',
  },
  'flujo:aprobacion': {
    easy: 'Redes manda cada pieza con un color: verde es rutina y el jefe las aprueba todas juntas; las amarillas y las rojas las revisa una por una, en 60 y en 30 minutos.',
    example: 'Por ejemplo: Redes manda un reel en rojo porque es una aclaratoria; el jefe lo abre, marca «Antes de aprobar» y toca «Aprobar»: a Redes le llega «Aprobada: lista para publicar».',
    why: 'Porque el rojo es lo sensible, como política, una crisis o una aclaratoria: por eso el jefe lo revisa primero, en 30 minutos; el amarillo es normal y el verde, rutina.',
  },
  'flujo:mes-redes': {
    easy: 'Cada mes, Redes crea las piezas por formato, arma el feed y las manda al jefe; aprobadas, las publica a mano, y al cierre sale el resumen del mes.',
    example: 'Por ejemplo: Redes toca «+ Nuevo mes», crea los posts y los reels, los pone en el «Feed» y los envía; el jefe los aprueba y Redes marca «Ya lo publiqué» en cada tarjeta.',
  },
  'flujo:entrega': {
    easy: 'Grabación graba, sube lo grabado y deja su nota para el editor; a Redes y al jefe les sale que hay notas nuevas, y Redes baja todo para editar.',
    example: 'Por ejemplo: Grabación sube el material, escribe en su nota que la mejor toma es la del final y toca «Guardar nota»; Redes ve «Notas de Grabación nuevas» y toca «Descargar todo el material».',
  },
  'flujo:mensajes': {
    easy: 'El jefe arma los canales y decide quién va. Cada quien escribe en los suyos, y quien conoce la agenda no puede escribir fechas ni horas donde está Redes o política.',
    example: 'Por ejemplo: el despacho escribe en un canal con Redes “nos vemos el día del evento”: se envía, porque no dice la fecha ni la hora.',
    why: 'Porque la fecha, la hora y el lugar de la agenda del jefe son información de seguridad: Redes y política nunca los ven.',
  },
  'flujo:ayuda': {
    easy: '360 a veces te ofrece mostrarte la pantalla; si dices que sí, te enseña un tutorial ahí mismo. Y cuando quieras, le escribes a 360 o abres «Ayuda y guías».',
    example: 'Por ejemplo: te sale «¿Te muestro esta pantalla?», tocas «Sí, muéstrame» y el tutorial te señala cada parte; al final tocas «Terminar».',
  },
};

// ── «Para todos»: `todos:<id>` ────────────────────────────────────────────────────────────────────────────────────

const TOPICS: Record<string, Facets> = {
  'todos:entrar': {
    easy: 'Entras con tu correo: te llega un código, lo escribes y listo, sin contraseñas. Algunos roles usan además una segunda clave que da una aplicación del teléfono.',
    example: 'Por ejemplo: en «Entrar» escribes tu correo y tocas «Mandarme el código»; copias el código que te llegó en «Código del correo» y tocas «Entrar». Esa aplicación de códigos puede ser Google Authenticator.',
  },
  'todos:arriba': {
    easy: {
      admin: 'Arriba, en todas las pantallas, están «Crear», la campana de tus avisos, la lupa para buscar y el muñequito de tu cuenta.',
      default: 'Arriba, en todas las pantallas, están «Crear», los globitos de Mensajes, la campana de tus avisos, la lupa para buscar y el muñequito de tu cuenta.',
    },
    example: 'Por ejemplo: la campana dice 2; la tocas y ves tus dos avisos. El muñequito te abre «Mi perfil y avisos» y «Ayuda y guías».',
  },
  'todos:telefono': {
    easy: 'En el teléfono, tus pantallas están en la barra de abajo; si no caben todas, el resto está en «Más».',
    example: 'Por ejemplo: si una pantalla de tu menú no está en la barra de abajo, tocas «Más» y ahí la encuentras.',
  },
  'todos:sin-senal': {
    easy: 'Si se va la señal o la luz, lo que escribes queda guardado en el teléfono y se envía cuando vuelve. Las subidas siguen solas.',
    example: 'Por ejemplo: estás en la obra sin señal y llenas la ficha; arriba sale el aviso de que no hay señal. Cuando vuelve, tocas «Guardar» y se envía.',
  },
  'todos:fecha': {
    easy: 'La fecha, la hora y el lugar de los eventos del jefe no se escriben donde los lean Redes o política. Por eso se dice “el día del evento” en vez de la fecha.',
    example: 'Por ejemplo: en una nota no escribes la fecha de un evento: escribes “lo antes posible” o “el día del evento”.',
    why: 'Porque la fecha, la hora y la dirección de la agenda del jefe son información de seguridad: los títulos, las notas y los mensajes los lee gente que no debe saberlas.',
  },
  'todos:mensajes': {
    easy: 'Mensajes son canales de trabajo: el jefe los arma y decide quién va. Entras por los globitos de arriba y ves solo los canales donde estás.',
    example: 'Por ejemplo: para hablar de una pieza, copias el enlace de su pantalla y lo pegas en el canal: sale como una tarjetita con su título.',
    why: 'Los teléfonos no van en los mensajes porque van en los contactos de la ficha, y esos solo se ven si entraste con el doble factor.',
  },
  'todos:360': {
    easy: '360 es el asistente: el botón redondo de abajo a la derecha. Le preguntas lo que sea de la app y te muestra las pantallas.',
    example: 'Por ejemplo: le escribes “¿dónde apruebo?” y te dice dónde, con un botón para ir; o “muéstrame esta pantalla” y te enseña su tutorial.',
  },
  'todos:ayuda': {
    easy: 'En tu cuenta, «Ayuda y guías» tiene tu guía, cada pantalla, cómo va el trabajo entre todos y los tutoriales de tus pantallas.',
    example: 'Por ejemplo: en una pantalla que no conoces abres Mi cuenta → «Ver el tutorial de esta pantalla» y te la muestra paso a paso.',
  },
};

// ── «Palabras de la app»: `palabra:<id>` ──────────────────────────────────────────────────────────────────────────

const WORDS: Record<string, Facets> = {
  'palabra:pieza': {
    easy: 'Es cada publicación que se prepara, sea un video, una foto o varias fotos. Cada una tiene su tarjeta en Redes.',
    example: 'Por ejemplo: el video corto de un evento es una pieza, y el post con la foto del jefe es otra.',
  },
  'palabra:reel-y-short': {
    easy: 'Es un video cortico y parado, como se ve en el teléfono. En Instagram le dicen reel y en YouTube, Short.',
    example: 'Por ejemplo: un video vertical del jefe saludando es un reel en Instagram; el mismo video en YouTube es un Short.',
  },
  'palabra:carrusel-y-lamina': {
    easy: 'Es un post con varias imágenes que se pasan de lado. Cada imagen se llama lámina.',
    example: 'Por ejemplo: un post con cinco imágenes de una obra, de la portada al CTA, es un carrusel de cinco láminas.',
  },
  'palabra:historia-y-sticker': {
    easy: 'La historia es lo que se ve un día en el perfil y después se va. El sticker es lo que se le pega encima, como una encuesta.',
    example: 'Por ejemplo: una historia con la foto de un evento y un sticker de pregunta que dice “¿Qué te pareció?”.',
  },
  'palabra:copy': {
    easy: 'Es el texto que va con la publicación. Cada pieza lleva tres: uno largo, uno medio y uno corto, según la red.',
    example: 'Por ejemplo: en un reel, el copy largo va en Instagram, el medio en Threads y el corto en X.',
  },
  'palabra:caption': {
    easy: 'Es el texto que sale debajo de la foto o del video. Es lo mismo que el copy largo.',
    example: 'Por ejemplo: en Instagram, lo que se lee debajo de un post es su caption.',
  },
  'palabra:hook-y-cta': {
    easy: 'El hook es la primera frase, la que hace que la gente se quede. El CTA es lo que se le pide al final, como comentar.',
    example: 'Por ejemplo: “¿Sabías que esta obra cambia tu calle?” es un hook, y “Cuéntanos en los comentarios” es un CTA.',
  },
  'palabra:texto-del-arte': {
    easy: 'Es lo que va escrito dentro de la imagen de un post, como el título grande y la línea chica de arriba.',
    example: 'Por ejemplo: en un post, el «Antetítulo» puede decir “Obras”, el «Titular» “Llegó el agua” y un sello “Tres tips”.',
  },
  'palabra:feed': {
    easy: 'Es la vista del perfil con todas las publicaciones juntas, en cuadritos. En la app ordenas las del mes en 24 espacios.',
    example: 'Por ejemplo: cuando abres el Instagram del jefe, la cuadrícula de fotos y videos es el feed.',
  },
  'palabra:mes-cupo-y-pilar': {
    easy: 'El mes junta las piezas de un mes, el cupo dice cuántas de cada formato tocan y el pilar es el tema fijo de cada una.',
    example: 'Por ejemplo: si el cupo del mes dice 8 posts, ese mes se planean 8 posts, y cada uno lleva su pilar.',
  },
  'palabra:storyboard': {
    easy: 'Es el plan de lo que se va a grabar, toma por toma, para que Grabación sepa qué hacer y qué se dice.',
    example: 'Por ejemplo: toma 1, la gente llegando; toma 2, el jefe hablando, con lo que dice; toma 3, un detalle de la obra.',
  },
  'palabra:ficha-tecnica': {
    easy: 'Es lo que hay que saber de un evento antes de ir: de qué es, quién lo dirige y los datos, cada uno con su fuente.',
    example: 'Por ejemplo: un dato como “200 familias beneficiadas” va en la ficha técnica con su fuente, como el informe de la obra.',
  },
  'palabra:dialogo-fab': {
    easy: 'Es lo que el jefe dice en una obra, en tres partes cortas: qué es, qué mejora y qué gana la gente con ella.',
    example: 'Por ejemplo: “Esta es la tubería nueva; ya no se va el agua; las familias tienen agua todos los días.”',
  },
  'palabra:nota-para-el-editor': {
    easy: 'Es un mensaje corto de quien grabó a quien edita, para que sepa qué toma usar y qué salió mal.',
    example: 'Por ejemplo: “La mejor toma es la del final; la del inicio tiene viento; faltó la gente aplaudiendo.”',
  },
  'palabra:semaforo': {
    easy: 'Es el color de cada pieza, que le dice al jefe qué tan rápido revisarla: verde es rutina, amarillo es normal y rojo es lo delicado, que va primero.',
    example: 'Por ejemplo: un post de saludo va en verde, uno de una obra en amarillo y una aclaratoria en rojo.',
    why: 'Porque el color dice cuánto apura: el verde se aprueba con las demás verdes en el día, el amarillo en 60 minutos y el rojo, lo sensible, en 30.',
  },
  'palabra:motivos-rapidos': {
    easy: 'Son motivos ya escritos que el jefe toca para pedir un cambio sin tener que escribirlo.',
    example: 'Por ejemplo: el jefe toca «Muy largo» en un copy, y a Redes le llega ese motivo con la pieza.',
  },
  'palabra:avisos-de-cumplimiento': {
    easy: 'Es una alerta de cuidado en una pieza antes de publicarla, como cuando lleva un testimonio o un dato que hay que verificar.',
    example: 'Por ejemplo: un post usa una cifra nueva; Redes le pone «Verificar la fuente y la fecha del dato» y el jefe lo ve antes de aprobar.',
  },
  'palabra:receptividad': {
    easy: 'Es una nota de 1 a 10 de cómo le cayó una pieza a la gente en redes. No mide si apoyan al jefe.',
    example: 'Por ejemplo: un reel con muchos comentarios buenos puede llevar 9; uno que casi nadie comentó, 3.',
  },
  'palabra:programar': {
    easy: 'Es apartar el día y la hora en que sale una publicación. La app no la sube sola: a esa hora alguien la publica a mano.',
    example: {
      social: 'Por ejemplo: programas un reel en Instagram; cuando llega la hora, lo subes tú y marcas «Ya lo publiqué».',
      boss: 'Por ejemplo: programas un reel en Instagram; cuando llega la hora, lo subes tú y marcas «Ya lo publiqué».',
      admin: 'Por ejemplo: programas un reel en Instagram; cuando llega la hora, lo subes tú y marcas «Ya lo publiqué».',
      default: 'Por ejemplo: Redes programa un reel en Instagram; cuando llega la hora, lo sube a mano y marca «Ya lo publiqué».',
    },
  },
  'palabra:tanda': {
    easy: 'Son los tweets de una semana, que se suben todos juntos desde un documento.',
    example: 'Por ejemplo: Redes sube el documento con los 15 tweets de la semana: esa es la tanda.',
  },
  'palabra:trancado': {
    easy: 'Es algo que se paró y necesita que alguien lo mueva, como una publicación que falló.',
    example: 'Por ejemplo: una pieza venció sin aprobar y sale en «Trancado» hasta que alguien la atiende.',
  },
  'palabra:etiquetas': {
    easy: 'Son los recuadritos de color que dicen cómo va algo, como si ya se aceptó o si todavía espera.',
    example: 'Por ejemplo: un evento que espera al jefe tiene la etiqueta «Por decidir», y cuando lo acepta, «Aceptado».',
  },
  'palabra:campos': {
    easy: 'Son los espacios donde escribes en una tarjeta o en un formulario.',
    example: 'Por ejemplo: en un reel, el título es un campo y la portada es otro.',
  },
  'palabra:numeros-y-medidas': {
    easy: 'Son los números que salen junto a un texto o un archivo: cuántas letras lleva, si es vertical u horizontal y cuánto pesa.',
    example: 'Por ejemplo: “85/280” junto a un tweet quiere decir que lleva 85 letras de las 280 que caben.',
  },
  'palabra:csv': {
    easy: 'Es un archivo de tabla, como los de Excel, que sirve para cargar muchos resultados de una sola vez.',
    example: 'Por ejemplo: guardas los resultados en Excel como CSV y los subes en Resultados con «Elegir archivo CSV».',
  },
  'palabra:oficina': {
    easy: {
      politics: 'Es un dibujo del trabajo como una oficina de diez salas. No está en tu menú: la abren el jefe, el despacho, Redes, Grabación y administración.',
      ivt: 'Es un dibujo del trabajo como una oficina de diez salas. No está en tu menú: la abren el jefe, el despacho, Redes, Grabación y administración.',
      default: 'Es un dibujo del trabajo como una oficina de diez salas: cada actividad del jefe está en la sala donde va su trabajo.',
    },
    example: {
      politics: 'Por ejemplo: el jefe la ve arriba de Digital, con «Ver todas las salas».',
      ivt: 'Por ejemplo: el jefe la ve arriba de Digital, con «Ver todas las salas».',
      default: 'Por ejemplo: tocas una sala y ves las actividades que están ahí; el jefe también la ve arriba de Digital.',
    },
  },
  'palabra:web-y-atencion': {
    easy: {
      boss: 'Son la página web pública y la atención a la gente que escribe por ella. Están en tu menú y tienen su propia guía.',
      admin: 'Son la página web pública y la atención a la gente que escribe por ella. Están en tu menú y tienen su propia guía.',
      default: 'Son la página web pública y la atención a la gente que escribe por ella. No están en tu menú: las manejan el jefe, administración y las personas de la web y de la atención.',
    },
    example: 'Por ejemplo: en la web la gente puede mandar una solicitud, y en Atención las personas que atienden la responden.',
  },
  'palabra:administracion': {
    easy: 'Son las personas que ven la parte técnica de la app: invitan a la gente, ayudan con el doble factor y recuperan lo eliminado.',
    example: 'Por ejemplo: si cambias de teléfono y ya no te llega el código de tu aplicación, administración te ayuda a activarlo de nuevo.',
  },
};

// ── The index of facets, by entry id ──────────────────────────────────────────────────────────────────────────────

type Section = { screen?: string; title: string };

// A text for this role: its own, or the one for everyone else.
const forRole = (t: FacetText | undefined, role: Role): string | undefined => (typeof t === 'string' || t === undefined ? t : (t[role] ?? t.default));

/** The facets of one screen of a guide, for the role whose guide it is: the first one written for its address and role. */
function screenSpec(role: Role, s: Section): Facets | null {
  const spec = SCREENS.find((x) => (x.screen ? x.screen === s.screen : x.title === s.title) && (!x.roles || x.roles.includes(role)));
  if (!spec) return null;
  const facets: Facets = {};
  for (const k of ['easy', 'example', 'why'] as const) {
    const t = forRole(spec[k], role);
    if (t) facets[k] = t;
  }
  return facets;
}

function screenFacets(): Record<string, Facets> {
  const out: Record<string, Facets> = {};
  const put = (id: string, role: Role, s: Section) => {
    const f = screenSpec(role, s);
    if (f) out[id] = f;
  };
  for (const g of allGuides()) g.sections.forEach((s, k) => put(`${g.slug}:pantalla:${k}`, g.role, s));
  // Administración's: the three screens it shares with everyone (answers/engine.ts adminEntries) and its own guide.
  everyoneSections('dispatch')
    .filter((x) => x.screen === '/avisos' || x.screen === '/buscar' || x.screen === '/perfil')
    .forEach((s, k) => put(`admin:todos:${k}`, 'admin', s));
  ADMIN_GUIDE.sections.forEach((s, k) => put(`admin:pantalla:${k}`, 'admin', s));
  return out;
}

let BUILT: Record<string, Facets> | null = null;

/** Every facet, by the id of the index entry it explains (built once: the guides do not change while the app runs). */
export function explainFacets(): Record<string, Facets> {
  BUILT ??= { ...TASKS, ...JOBS, ...screenFacets(), ...FLOWS, ...TOPICS, ...WORDS };
  return BUILT;
}

/** The facets of one entry id, or undefined. */
export function facetsOf(id: string): Facets | undefined {
  return explainFacets()[id];
}

/** The ids of the facets of the flows: `flujo:<id>` (the whole flow; its steps are `flujo:<id>:<paso>`). */
export const FLOW_FACET_IDS = Object.keys(FLOWS);
