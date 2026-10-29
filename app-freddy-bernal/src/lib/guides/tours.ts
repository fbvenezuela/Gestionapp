// The tutorials (R3, D-45, design §6.3): steps of «mira aquí» on the screen the person is on. The page stays still
// while one runs, so no step says «toca» as an order: «Aquí está «X»: lo tocas cuando cierres el tutorial».
// Texts ≤ 140 letters, in «tú», no concrete dates, no demo data; «» only for labels that exist on screen. A step on an
// anchor that says something different per role carries one text per role (U3). Each tutorial has 2 to 6 steps; the
// engine counts the ones on screen when it starts and does not offer one with fewer than 2 (tour-core.ts).
import type { Tour } from './types';
import { anchor } from './anchors';

// `screen` of a tutorial that runs on the person's own home (homeFor(roles)): the boss's Inicio, Obras, Municipios or Hoy.
export const HOME_SCREEN = '@home';
// `next` of `bienvenida`: the tutorial of the person's home, resolved per person by toursForRoles() (U2).
export const HOME_NEXT = '@home';

const TEAM: Tour['roles'] = ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'];
// The side menu on a computer, the bottom bar on the phone (only one of them is visible).
const MENU = ['nav[aria-label="Menú principal"]', 'nav[aria-label="Menú"]'];

export const TOURS: Tour[] = [
  // ── For everyone ──────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'bienvenida',
    screen: HOME_SCREEN,
    roles: TEAM,
    title: 'Bienvenida',
    next: HOME_NEXT,
    steps: [
      { target: MENU, title: 'Tus pantallas', body: 'Aquí están las pantallas de tu trabajo; en el teléfono, abajo. Lo que no cabe en la barra está en «Más».' },
      { target: [anchor('create')], title: 'Crear', body: 'En «Crear» está solo lo que tu rol puede crear.' },
      { target: [anchor('bell')], title: 'Avisos', body: 'La campana te avisa de lo que espera por ti en tu trabajo.' },
      { target: [anchor('messages')], title: 'Mensajes', body: 'Aquí le escribes al equipo. El jefe puede leer las conversaciones.' },
      { target: [anchor('account')], title: 'Tu cuenta', body: 'En «Mi cuenta» están tu perfil, el «Modo sol», «Ayuda y guías» y «Salir».' },
      // With `next`, the engine adds «Ahora tu pantalla de inicio» and the «Seguir» button to this last step.
      { target: ['[data-assistant-button]'], title: '360', body: 'Pregúntale a 360 lo que sea de la plataforma, cuando quieras.' },
    ],
  },
  {
    id: 'mensajes',
    screen: '/mensajes',
    roles: TEAM,
    title: 'Cómo se usa Mensajes',
    steps: [
      { target: [anchor('chat-notice')], title: 'Quién lee', body: 'El jefe puede leer todas las conversaciones; administración y 360 no. Lo escrito queda y no se borra.' },
      { target: [anchor('chat-team')], title: 'Todo el equipo', body: 'En «Todo el equipo» escriben todos y lo lee todo el equipo.' },
      { target: [anchor('chat-list')], title: 'Tus conversaciones', body: 'Aquí están tus conversaciones; en negrita, las que tienen algo nuevo.' },
      { target: [anchor('chat-new')], title: 'Escribir', body: 'Aquí está «Escribirle a alguien»: a una persona o a un grupo. Lo tocas cuando cierres el tutorial.' },
      { target: [anchor('messages')], title: 'El sobre', body: 'El número del sobre te dice cuántas conversaciones tienen algo nuevo.' },
    ],
  },
  {
    id: 'perfil',
    screen: '/perfil',
    roles: TEAM,
    title: 'Cómo se usa Mi perfil',
    steps: [
      { target: [anchor('push-on')], title: 'Avisos en el teléfono', body: 'Desde aquí activas los avisos en este teléfono: te llegan aunque la app esté cerrada.' },
      { target: [anchor('notify-prefs')], title: 'Qué avisos quieres', body: 'Elige qué avisos quieres recibir. Los importantes llegan siempre.' },
      { target: [anchor('quiet-hours')], title: 'Horas de silencio', body: 'De noche el teléfono no suena; lo importante llega igual y queda en «Avisos».' },
    ],
  },
  {
    id: 'ayuda',
    screen: '/ayuda',
    roles: TEAM,
    title: 'Cómo se usa Ayuda',
    steps: [
      { target: [anchor('help-mine')], title: 'Tu trabajo', body: 'La guía de tu trabajo: qué haces, tu día y cada tarea paso a paso.' },
      { target: [anchor('help-sections')], title: 'Cada pantalla', body: 'Qué se hace en cada pantalla de tu menú, con los botones que vas a ver.' },
      { target: [anchor('help-flows')], title: 'Entre todos', body: 'Cómo pasa el trabajo de un rol a otro, paso a paso.' },
      { target: [anchor('help-tours')], title: 'Tutoriales', body: 'Los tutoriales de tus pantallas: cada uno te lleva a su pantalla y te la muestra.' },
    ],
  },

  // ── The boss ──────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'jefe-inicio',
    screen: '/jefe',
    roles: ['boss'],
    title: 'Cómo se usa tu Inicio',
    steps: [
      { target: ['#overdue-title'], title: 'Vencidas', body: 'Lo de los municipios que pasó su fecha de seguimiento sin terminar. Va primero.' },
      { target: ['#approve-title'], title: 'Te toca aprobar', body: 'Lo que espera tu aprobación, por color y con su plazo. Nada sale sin ti.' },
      { target: [anchor('approve-green')], title: 'Las verdes', body: 'Las verdes son de rutina: con este botón las apruebas todas de una vez.' },
      { target: ['#tile-politica-title'], title: 'Política', body: 'Tu agenda: lo que espera tu decisión, lo que está por ponerle fecha y lo que vas a decir.' },
      { target: [anchor('grabacion-notes'), '#tile-redes-title'], title: 'Redes', body: 'Las piezas, los tweets y las notas nuevas que dejó Grabación para quien edita.' },
      { target: ['#tile-digital-title'], title: 'Digital', body: 'Lo publicado, lo que viene y cómo nos va.' },
    ],
  },
  {
    id: 'jefe-politica',
    screen: '/jefe/politica',
    roles: ['boss'],
    title: 'Cómo se usa Política',
    steps: [
      { target: ['nav[aria-label="Acciones de la agenda"]'], title: 'Los botones grandes', body: 'Desde aquí creas un evento o una visita de obra; lo tuyo queda aceptado de una vez.' },
      { target: [anchor('to-schedule')], title: 'Por ponerle fecha', body: 'Las fichas del IVT y de política que esperan fecha y hora.' },
      { target: [anchor('pending-decision')], title: 'Tu decisión', body: 'Lo que propuso el despacho: lo abres, lo calificas de 1 a 10 y aceptas o rechazas dentro del evento.' },
      { target: [anchor('next-days')], title: 'Lo que viene', body: 'Los eventos de los próximos días, con tu decisión y su importancia.' },
      { target: [anchor('read-speech')], title: 'Lo que vas a decir', body: 'Aquí está «Lo que voy a decir»: lo abres antes del acto, en letra grande.' },
    ],
  },
  {
    id: 'aprobar',
    screen: '/aprobar',
    roles: ['boss'],
    title: 'Cómo se usa Por aprobar',
    steps: [
      { target: [anchor('approve-tabs')], title: 'Piezas y tweets', body: 'Las piezas y los tweets van en pestañas, cada una con cuántos esperan.' },
      { target: [anchor('approve-green')], title: 'Las verdes', body: 'Las verdes, todas de un toque con este botón.' },
      { target: [anchor('level-card')], title: 'Por color', body: 'Las amarillas y las rojas, una por una y con su plazo: el rojo es el más corto.' },
    ],
  },
  {
    id: 'aprobar-tweets',
    screen: '/aprobar?tab=tweets',
    roles: ['boss'],
    title: 'Cómo se aprueban los tweets',
    steps: [
      { target: [anchor('approve-tabs')], title: 'Los tweets', body: 'Aquí están los tweets de la semana que mandó Redes.' },
      { target: [anchor('approve-tweets')], title: 'Aprobar marcados', body: 'Vienen marcados: desmarcas los que no van y apruebas el resto con este botón.' },
    ],
  },
  {
    id: 'aprobar-pieza',
    screen: '/aprobar/[id]',
    roles: ['boss'],
    title: 'Cómo se revisa una pieza',
    form: true,
    steps: [
      { target: [anchor('review-video')], title: 'El video', body: 'Si pausas el video, tu comentario queda en ese segundo.' },
      { target: ['[aria-labelledby="rv-reasons-hint"]'], title: 'Motivos rápidos', body: 'Los motivos de siempre, para no escribirlos: se suman al comentario.' },
      { target: [anchor('checklist')], title: 'Antes de aprobar', body: 'La lista «Antes de aprobar»: con todo marcado se prende «Aprobar».' },
      { target: [anchor('approve')], title: 'Aprobar', body: 'Aquí está «Aprobar»: lo tocas cuando revises todo.' },
      { target: [anchor('request-changes')], title: 'Pedir cambios', body: '«Pedir cambios» le devuelve la pieza a Redes con tu comentario.' },
      { target: ['select[aria-label="Cambiar nivel"]'], title: 'El nivel', body: 'Si el color no es el correcto, lo cambias aquí.' },
    ],
  },
  {
    id: 'evento-jefe',
    screen: '/eventos/[id]',
    roles: ['boss'],
    title: 'Cómo se usa un evento',
    steps: [
      { target: [anchor('event-chips')], title: 'Cómo va', body: 'Los chips dicen el tipo, cómo va, tu decisión y de dónde nació el evento.' },
      { target: [anchor('boss-decision')], title: 'Tu decisión', body: 'Lo calificas de 1 a 10 y lo aceptas o rechazas. Le avisamos a quien lo propuso.' },
      { target: [anchor('event-when')], title: 'Cuándo y dónde', body: 'La fecha, la dirección y cómo se llega. Desde aquí lo marcas realizado cuando ya empezó.' },
      { target: [anchor('move'), anchor('cancel')], title: 'Mover o cancelar', body: 'Para moverlo o cancelarlo. Cancelado queda tachado, no se borra.' },
      { target: ['nav[aria-label="Secciones del evento"]'], title: 'Las pestañas', body: 'La ficha técnica, el storyboard, el material y las piezas del evento.' },
      { target: [anchor('reading-mode')], title: 'Modo lectura', body: 'Lo que vas a decir, en letra grande.' },
    ],
  },
  {
    id: 'lectura',
    screen: '/eventos/[id]/lectura',
    roles: ['boss', 'dispatch'],
    title: 'Cómo se usa el modo lectura',
    steps: [
      { target: ['[aria-label="Letra más grande"]'], title: 'La letra', body: 'Desde aquí agrandas la letra hasta que se lea cómodo.' },
      { target: ['[aria-label="Desplazar solo"]'], title: 'Desplazar solo', body: 'El texto sube solo, y lo pausas cuando quieras.' },
      { target: ['[aria-label="Velocidad"]'], title: 'Velocidad', body: 'Qué tan rápido sube el texto: lento, medio o rápido.' },
      {
        target: ['#antes-de-hablar'],
        title: 'Antes de hablar',
        body: {
          boss: 'Lo que debes saber antes de tomar la palabra: quién reportó y lo que pidió.',
          dispatch: 'Lo que el jefe debe saber antes de hablar: quién reportó y lo que pidió. Lo ven el jefe y tú.',
        },
      },
      { target: ['[aria-label="Salir del modo lectura"]'], title: 'Salir', body: 'Para volver al evento.' },
    ],
  },
  {
    id: 'jefe-digital',
    screen: '/jefe/digital',
    roles: ['boss'],
    title: 'Cómo se usa Digital',
    steps: [
      { target: [anchor('see-results')], title: 'Resultados', body: 'Desde aquí vas a los números de cada publicación.' },
      { target: [anchor('digital-stats')], title: 'La semana', body: 'Lo publicado, las vistas y lo que está en revisión esta semana.' },
      { target: [anchor('digital-published')], title: 'Lo publicado', body: 'Cada publicación con su red y sus vistas.' },
      { target: [anchor('digital-upcoming')], title: 'Lo que viene', body: 'Lo que ya está programado.' },
    ],
  },
  // Redes by format (R4, design §6): `redes` and `redes-seccion` are provisional from Paso 0 (on what the screens show
  // today); WP-E writes them with the board's and the cards' anchors, and adds `feed`.
  {
    id: 'redes',
    screen: '/redes',
    roles: ['boss', 'social'],
    title: 'Cómo se usa Redes',
    steps: [
      { target: ['nav[aria-label="Secciones de Redes"]'], title: 'Las secciones', body: 'Cada formato tiene su sección: reels, posts, carruseles, historias, YouTube y fin de mes. Después, el feed y los tweets.' },
      { target: ['#hub-tweets-title'], title: 'Tweets', body: 'Cuántos días de tweets quedan y cuántos esperan aprobación.' },
      { target: ['#hub-publicar-title'], title: 'Publicar', body: 'Lo aprobado, listo para publicar a mano.' },
      { target: ['#hub-resultados-title'], title: 'Resultados', body: 'Cómo nos va, y lo que todavía no tiene sus números.' },
      { target: ['nav[aria-label="Crear en Redes"]'], title: 'Crear', body: 'Una pieza, los tweets de la semana o una publicación nueva.' },
    ],
  },

  // ── Despacho (and the boss) ───────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'hoy-despacho',
    screen: '/hoy',
    roles: ['dispatch'],
    title: 'Cómo se usa Hoy',
    steps: [
      { target: [anchor('waiting')], title: 'Lo que espera por ti', body: 'Primero «Por ponerle fecha»: cada una abre su ficha. Después, las fichas técnicas incompletas.' },
      { target: [anchor('today-stats')], title: 'Tus números', body: 'Cuántas fichas esperan fecha, cuántas están incompletas y cuántas esperan al jefe.' },
      { target: [anchor('today-agenda')], title: 'Hoy en la agenda', body: 'Los eventos de hoy, con su hora y su lugar.' },
      { target: [anchor('blocked')], title: 'Trancado', body: 'Lo que se paró y necesita una mano.' },
    ],
  },
  {
    id: 'agenda-calendario',
    screen: '/agenda',
    roles: ['boss', 'dispatch'],
    title: 'Cómo se usa la agenda',
    steps: [
      { target: ['nav[aria-label="Acciones de la agenda"]'], title: 'Los botones grandes', body: 'Nuevo evento, visita de obra, lo que está por ponerle fecha y lo que espera decisión.' },
      { target: ['a[aria-label="Anterior"]'], title: 'Moverte', body: 'Para ir atrás o adelante; «Hoy» te trae de vuelta.' },
      { target: ['[role=tablist][aria-label="Vista"]'], title: 'Día, semana o mes', body: 'Para ver más o menos días a la vez.' },
      { target: [anchor('calendar')], title: 'El calendario', body: 'Cada evento con su hora. Lo abres para ver su ficha.' },
      { target: [anchor('legend')], title: 'Los colores', body: 'Aceptado, por decidir, rechazado y cancelado (tachado: no se borra).' },
    ],
  },
  {
    id: 'nuevo-evento',
    screen: '/agenda/nuevo',
    roles: ['boss', 'dispatch'],
    title: 'Cómo se crea un evento',
    form: true,
    steps: [
      { target: [anchor('event-basics')], title: 'El evento', body: 'El título y a dónde se va los ve todo el equipo: sin fecha, hora ni dirección.' },
      { target: [anchor('event-schedule')], title: 'Fecha y lugar', body: 'La fecha, la hora y la dirección exacta. Si choca con otro, te avisa.' },
      { target: [anchor('event-brief')], title: 'Ficha técnica', body: 'De qué es, quién lo dirige, los datos con su fuente y «Quién graba».' },
      {
        target: [anchor('event-save')],
        title: 'Guardar',
        body: {
          boss: 'Aquí está «Guardar evento». Lo tuyo nace aceptado y el despacho se entera.',
          dispatch: 'Aquí está «Guardar evento». Le llega al jefe «Por decidir».',
        },
      },
    ],
  },
  {
    id: 'por-fecha',
    screen: '/agenda/por-fecha',
    roles: ['boss', 'dispatch'],
    title: 'Cómo se le pone fecha a una ficha',
    steps: [
      { target: [anchor('ficha-card')], title: 'Una ficha', body: 'Una obra del IVT o un reporte comunitario que espera fecha, y desde cuándo.' },
      {
        target: [anchor('schedule-ficha')],
        title: 'Ponerle fecha',
        body: {
          boss: 'Aquí está «Ponerle fecha»: fecha, hora, lugar y quién graba. Lo tuyo queda aceptado.',
          dispatch: 'Aquí está «Ponerle fecha»: fecha, hora, lugar y quién graba. Le llega al jefe «Por decidir».',
        },
      },
      { target: [anchor('see-ficha')], title: 'Ver la ficha', body: 'Para leer la ficha completa antes de decidir.' },
      { target: [anchor('dismiss')], title: 'No va', body: 'Si no va a la agenda, con su motivo. La obra queda archivada.' },
    ],
  },
  {
    id: 'evento-despacho',
    screen: '/eventos/[id]',
    roles: ['dispatch'],
    title: 'Cómo se usa un evento',
    steps: [
      { target: [anchor('event-chips')], title: 'Cómo va', body: 'Los chips dicen el tipo, cómo va y si el jefe ya decidió.' },
      { target: [anchor('who-records')], title: 'Quién graba', body: 'Quién de Grabación va a este evento; puede ser más de una persona.' },
      { target: [anchor('brief')], title: 'Ficha técnica', body: 'Desde aquí la completas con «Editar»: de qué es, quién lo dirige, qué se logra.' },
      { target: [anchor('move'), anchor('cancel')], title: 'Mover o cancelar', body: 'Con su motivo, sin fecha, hora ni teléfono. Cancelado queda tachado.' },
      { target: [anchor('mark-done')], title: 'Realizado', body: 'Cuando ya empezó, lo marcas realizado: su material pasa al registro por día.' },
      { target: ['nav[aria-label="Secciones del evento"]'], title: 'Las pestañas', body: 'La ficha, la de la obra o el reporte, el storyboard y el material.' },
    ],
  },
  {
    id: 'biblioteca',
    screen: '/biblioteca',
    roles: ['dispatch', 'social', 'boss'],
    title: 'Cómo se usa la Biblioteca',
    steps: [
      { target: ['[aria-label="Buscar en la biblioteca"]'], title: 'Buscar', body: 'Buscas un evento por su nombre o su lugar.' },
      { target: [anchor('download-day')], title: 'Descargar todo', body: 'Baja el material de un evento a una carpeta, sin fechas en los nombres.' },
    ],
  },

  // ── Política (and the boss and despacho) ──────────────────────────────────────────────────────────────────────────
  {
    id: 'municipios',
    screen: '/municipios',
    roles: ['boss', 'dispatch', 'politics'],
    title: 'Cómo se usa Municipios',
    steps: [
      { target: ['#overdue-title'], title: 'Vencidas', body: 'Lo que pasó su fecha de seguimiento sin terminar. Va primero.' },
      { target: [anchor('new-report')], title: 'Nueva ficha', body: 'Desde aquí cargas un reporte de la comunidad.' },
      { target: [anchor('mun-stats')], title: 'Los números', body: 'Cuántas están abiertas, en ejecución, finalizadas y vencidas.' },
      { target: [anchor('report-filter')], title: 'Filtrar', body: 'Por municipio, parroquia, tipo, estado o prioridad, o solo las vencidas.' },
      { target: ['#mun-title'], title: 'Los municipios', body: 'Cada municipio, con todo en orden de fecha y por parroquia.' },
    ],
  },
  {
    id: 'nueva-comunitaria',
    screen: '/reportes/nuevo',
    roles: ['boss', 'dispatch', 'politics'],
    title: 'Cómo se carga una ficha comunitaria',
    form: true,
    steps: [
      { target: [anchor('ficha-group')], title: 'Por grupos', body: 'La ficha va por grupos: cada uno se abre y se cierra.' },
      { target: ['[role=group][aria-label^="Otra respuesta"]'], title: 'No aplica', body: 'Si una pregunta no va, «No aplica»; si todavía no lo sabes, «Por confirmar».' },
      { target: [anchor('wants-agenda')], title: '¿Va a la agenda?', body: 'Prendido, le llega al jefe para ponerle fecha. Apagado, queda en el registro del municipio.' },
      { target: [anchor('save-notify')], title: 'Guardar', body: 'Las fotos y los documentos se suben después de guardar, en la ficha.' },
    ],
  },
  {
    id: 'ficha-comunitaria',
    screen: '/reportes/[id]',
    roles: ['boss', 'dispatch', 'politics'],
    title: 'Cómo se usa una ficha comunitaria',
    steps: [
      {
        target: [anchor('report-agenda')],
        title: 'Agenda del jefe',
        body: {
          boss: 'Aquí está la fecha, o «Ponerle fecha» si va a tu agenda y todavía no la tiene.',
          dispatch: 'Aquí está la fecha, o «Ponerle fecha» si va a la agenda del jefe y todavía no la tiene.',
          politics: 'Aquí ves si ya tiene fecha. La fecha no se muestra: la ven el jefe y el despacho.',
        },
      },
      { target: [anchor('report-status')], title: 'Estado', body: 'El estado con su motivo o avance. Cada cambio queda en la historia.' },
      { target: [anchor('photos')], title: 'Evidencias', body: 'Las fotos del antes y del después, y los documentos.' },
      { target: [anchor('history'), anchor('note')], title: 'Historia', body: 'Quién hizo qué. Las notas se agregan, no se borran; sin teléfonos.' },
    ],
  },

  // ── IVT (and the boss and despacho) ───────────────────────────────────────────────────────────────────────────────
  {
    id: 'obras',
    screen: '/obras',
    roles: ['boss', 'dispatch', 'ivt'],
    title: 'Cómo se usa Obras',
    steps: [
      { target: [anchor('new-obra')], title: 'Nueva ficha', body: 'Desde aquí cargas la ficha de una obra, sin fecha ni hora.' },
      { target: [anchor('obra-stages')], title: 'Por etapa', body: 'Cuántas hay en borrador, por ponerle fecha, con fecha y realizadas.' },
      { target: [anchor('obra-filter')], title: 'Filtrar', body: 'Por municipio y por estado.' },
      { target: [anchor('obra-sections')], title: 'Las fichas', body: 'Las fichas, agrupadas por etapa. Cada una abre su ficha completa.' },
    ],
  },
  {
    id: 'nueva-obra',
    screen: '/obras/nueva',
    roles: ['boss', 'dispatch', 'ivt'],
    title: 'Cómo se carga una ficha de obra',
    form: true,
    steps: [
      { target: [anchor('ficha-group')], title: 'Por grupos', body: 'Cinco grupos que se abren y se cierran. Las cifras, con su fuente.' },
      { target: ['[role=group][aria-label^="Otra respuesta"]'], title: 'No aplica', body: 'Si una pregunta no va, «No aplica»; si todavía no lo sabes, «Por confirmar».' },
      { target: [anchor('save-draft')], title: 'Borrador', body: 'Si te falta algo, «Guardar borrador»: todavía no le llega al jefe.' },
      { target: [anchor('save-notify')], title: 'Avisar al jefe', body: 'Con todo respondido, al jefe y al despacho les llega para ponerle fecha.' },
    ],
  },
  {
    id: 'ficha-obra',
    screen: '/obras/[id]',
    roles: ['boss', 'dispatch', 'ivt'],
    title: 'Cómo se usa una ficha de obra',
    steps: [
      {
        target: [anchor('visit-date')],
        title: 'Fecha de la visita',
        body: {
          boss: 'La fecha de tu visita. Si está por ponerle fecha, aquí está «Ponerle fecha».',
          dispatch: 'La fecha de la visita. Si está por ponerle fecha, aquí está «Ponerle fecha».',
          ivt: 'La fecha de la visita, cuando el jefe o el despacho la ponen. Se ve con el doble factor.',
        },
      },
      { target: [anchor('photos')], title: 'Fotos', body: 'Las fotos del antes y del avance, y los documentos. Siguen solas si se va la señal.' },
      { target: [anchor('fab')], title: 'Lo que voy a decir', body: 'El diálogo FAB, armado solo con las cifras de la ficha. Lo que falta, no se dice.' },
      { target: [anchor('edit-ficha')], title: 'Editar', body: 'Para corregir la ficha.' },
      { target: [anchor('history'), anchor('note')], title: 'Historia', body: 'Quién hizo qué. Las notas se agregan, no se borran.' },
    ],
  },
  {
    id: 'agenda-ivt',
    screen: '/agenda',
    roles: ['ivt'],
    title: 'Cómo se usan tus visitas',
    steps: [
      { target: [anchor('my-visits')], title: 'Mis visitas de obra', body: 'Las visitas del jefe a tus obras. La fecha se ve con el doble factor.' },
      { target: [anchor('bell')], title: 'Si cambia', body: 'Si la cancelan o el jefe la rechaza, te avisamos aquí y la ficha vuelve a esperar fecha.' },
    ],
  },

  // ── Grabación ─────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'hoy-grabacion',
    screen: '/hoy',
    roles: ['camera'],
    title: 'Cómo se usa Hoy',
    steps: [
      { target: [anchor('waiting')], title: 'Lo que espera por ti', body: 'Los eventos que ya pasaron y todavía no tienen material: «Sube el material».' },
      { target: [anchor('today-stats')], title: 'Tus números', body: 'Tus eventos y cuánto material falta por subir.' },
      { target: [anchor('today-agenda')], title: 'Hoy en la agenda', body: 'Tus eventos de hoy, con su hora.' },
    ],
  },
  {
    id: 'agenda-grabacion',
    screen: '/agenda',
    roles: ['camera'],
    title: 'Cómo se usan tus eventos',
    steps: [
      { target: [anchor('my-events')], title: 'Mis eventos', body: 'Solo los eventos que te tocan grabar, con su fecha y su dirección.' },
      { target: [anchor('bell')], title: 'Te asignaron', body: 'Cuando te asignan un evento, te llega el aviso aquí.' },
    ],
  },
  {
    id: 'evento-grabacion',
    screen: '/eventos/[id]',
    roles: ['camera'],
    title: 'Cómo se usa un evento',
    steps: [
      { target: [anchor('event-when')], title: 'Cuándo y dónde', body: 'La fecha, la dirección, cómo se llega y los contactos del sitio.' },
      { target: [anchor('brief')], title: 'Ficha técnica', body: 'De qué es el evento y quién lo dirige. Léela antes de grabar.' },
      { target: ['nav[aria-label="Secciones del evento"]'], title: 'Las pestañas', body: 'Storyboard: el plan de Redes, solo para leer. Material: donde subes lo que grabaste.' },
      { target: [anchor('mark-done')], title: 'Realizado', body: 'Cuando ya empezó, lo marcas realizado.' },
    ],
  },
  {
    id: 'evento-grabacion-material',
    screen: '/eventos/[id]?tab=material',
    roles: ['camera'],
    title: 'Cómo se sube el material',
    steps: [
      { target: [anchor('raw-boxes')], title: 'Por casillas', body: 'Cada parte en su casilla. Se sube por partes y sigue sola si se va la señal.' },
      { target: ['section[aria-label="Entrega de Grabación"]'], title: 'Tu entrega', body: 'El storyboard con el que grabaste y tu nota para quien edita.' },
      { target: [anchor('editor-note')], title: 'Nota para el editor', body: 'Qué toma sirve, qué falló, qué falta. Sin hora, fecha, dirección ni teléfonos.' },
    ],
  },

  // ── Redes (and the boss) ──────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'hoy-redes',
    screen: '/hoy',
    roles: ['social'],
    title: 'Cómo se usa Hoy',
    steps: [
      { target: [anchor('waiting')], title: 'Lo que espera por ti', body: 'En «Lo que espera por mí» está lo tuyo: cambios pedidos, storyboards, material nuevo y lo que falta publicar.' },
      { target: [anchor('blocked')], title: 'Trancado', body: 'En «Trancado» está lo que se paró y necesita una mano.' },
      { target: [anchor('today-stats')], title: 'Tus números', body: 'Los números de arriba te dicen cuántos cambios, piezas listas y días de tweets tienes.' },
    ],
  },
  {
    id: 'agenda-redes',
    screen: '/agenda',
    roles: ['social'],
    title: 'Cómo se usa la lista de eventos',
    steps: [
      { target: [anchor('team-events')], title: 'Los eventos', body: 'Sin fecha ni hora: ordenados por lo que hace falta. Cada uno dice si tiene storyboard y material.' },
      { target: [anchor('nav-more'), 'nav[aria-label="Menú principal"]'], title: 'Lo ya realizado', body: 'Lo ya realizado no sale aquí: está en «Biblioteca» y en cada pieza, con «Ver evento».' },
    ],
  },
  {
    id: 'evento-redes',
    screen: '/eventos/[id]',
    roles: ['social'],
    title: 'Cómo se usa un evento',
    steps: [
      { target: ['nav[aria-label="Secciones del evento"]'], title: 'Las pestañas', body: 'La ficha, el storyboard, el material y las piezas del evento.' },
      { target: ['#ws'], title: '¿En qué va?', body: 'Cómo va el trabajo del evento. Lo cambias tú cuando avanza.' },
      { target: [anchor('who-records')], title: 'Quién graba', body: 'Quién de Grabación va. Tú también puedes asignarlo.' },
      { target: [anchor('brief')], title: 'Ficha técnica', body: 'De qué es, quién lo dirige y los datos con su fuente: la base de los copies.' },
    ],
  },
  {
    id: 'evento-redes-storyboard',
    screen: '/eventos/[id]?tab=storyboard',
    roles: ['social'],
    title: 'Cómo se arma el storyboard',
    steps: [
      { target: [anchor('add-block')], title: 'Los bloques', body: 'Cada bloque: el plano, el ángulo, lo que dice el jefe, las tomas de apoyo y el dato con su fuente.' },
      { target: [anchor('save-storyboard')], title: 'Guardar', body: 'Aquí está «Guardar storyboard». Grabación lo lee antes de grabar.' },
    ],
  },
  {
    id: 'evento-redes-material',
    screen: '/eventos/[id]?tab=material',
    roles: ['social'],
    title: 'Cómo se usa el material',
    steps: [
      { target: ['section[aria-label="Entrega de Grabación"]'], title: 'La entrega', body: 'La nota para el editor y el storyboard con el que grabó Grabación. Léelos primero.' },
      { target: [anchor('download-all')], title: 'Descargar todo', body: 'Baja todo el material a una carpeta para editar.' },
    ],
  },
  {
    id: 'redes-seccion',
    screen: '/redes/[formato]',
    roles: ['social', 'boss'],
    title: 'Cómo se usa una sección de Redes',
    steps: [
      { target: [anchor('month-tabs')], title: 'Los meses', body: 'Cada mes con sus piezas. El mes que eliges sigue en las otras secciones y en el feed.' },
      { target: [anchor('month-new')], title: 'Nuevo mes', body: 'Aquí está «+ Nuevo mes», para empezar el mes que sigue.' },
      { target: [anchor('new-piece')], title: 'Una pieza nueva', body: 'Desde aquí empiezas una pieza de esta sección.' },
      { target: [anchor('piece-card')], title: 'Cada tarjeta', body: 'Cada pieza es una tarjeta: su archivo, sus campos y cómo va.' },
    ],
  },
  {
    id: 'pieza',
    screen: '/piezas/[id]',
    roles: ['social', 'boss'],
    title: 'Cómo se usa una pieza',
    steps: [
      { target: [anchor('final-file')], title: 'Archivo final', body: 'El video o la imagen final y la portada. Cada archivo nuevo es otra versión.' },
      { target: [anchor('copies')], title: 'Copies', body: 'La fórmula, la voz y el cierre: tres largos, solo con cifras de la ficha.' },
      { target: [anchor('write-copies')], title: 'Escribir desde la ficha', body: 'Arma los tres copies con la ficha técnica. Después los revisas uno por uno.' },
      { target: ['select[aria-label="Nivel de aprobación"]'], title: 'El nivel', body: 'Verde, amarillo o rojo: el color dice qué tan rápido la mira el jefe.' },
      { target: [anchor('send-review')], title: 'Enviar', body: 'Aquí está «Enviar a aprobación»: le llega al jefe.' },
    ],
  },
  {
    id: 'tweets',
    screen: '/tweets',
    roles: ['social', 'boss'],
    title: 'Cómo se usa Tweets',
    steps: [
      { target: [anchor('new-batch')], title: 'La semana', body: 'Desde aquí subes los tweets de la semana.' },
      { target: [anchor('tweet-board')], title: 'El tablero', body: 'Cada tweet tiene «Copiar texto»: lo pegas en X y después «Ya lo publiqué».' },
      { target: [anchor('batches')], title: 'Las tandas', body: 'Cada tanda, con lo que falta por aprobar y lo programado.' },
    ],
  },
  {
    id: 'tweets-nueva',
    screen: '/tweets/nueva',
    roles: ['social', 'boss'],
    title: 'Cómo se suben los tweets',
    form: true,
    steps: [
      { target: [anchor('tweets-upload')], title: 'El documento', body: 'Subes el documento de la semana (.docx, .txt o .md).' },
      { target: ['[aria-label="Texto con los tweets"]'], title: 'O el texto', body: 'O lo pegas aquí.' },
      { target: [anchor('tweets-split')], title: 'Separar', body: 'Aquí está «Separar tweets»: arma un tweet por idea, para revisarlos.' },
      { target: [anchor('tweets-distribute')], title: 'Repartir', body: 'Los reparte en la semana y se los manda al jefe para aprobar.' },
    ],
  },
  {
    id: 'tanda',
    screen: '/tweets/[id]',
    roles: ['social', 'boss'],
    title: 'Cómo se usa una tanda',
    steps: [
      { target: [], title: 'La tanda', placement: 'center', body: 'Una tanda: cuántos están por aprobar, aprobados y programados. Si cambias uno aprobado, vuelve al jefe.' },
      { target: [anchor('tweets-schedule')], title: 'Programar', body: 'Cuando el jefe aprobó, aquí está «Programar»: quedan en el tablero.' },
    ],
  },
  {
    id: 'publicar',
    screen: '/publicar',
    roles: ['social', 'boss'],
    title: 'Cómo se usa Publicar',
    steps: [
      { target: [anchor('approved-unpublished')], title: 'Listas', body: 'Las piezas aprobadas que todavía no se publicaron.' },
      { target: [anchor('new-publication')], title: 'Nueva publicación', body: 'Desde aquí programas una pieza en una o varias redes.' },
      { target: [anchor('register-boss')], title: 'Lo del jefe', body: 'Para anotar lo que el jefe publicó por su cuenta.' },
    ],
  },
  {
    id: 'publicar-nueva',
    screen: '/publicar/nueva',
    roles: ['social', 'boss'],
    title: 'Cómo se programa una publicación',
    form: true,
    steps: [
      // The networks show up once a piece is chosen: before that, only this step is on screen and it is not offered.
      { target: [], title: 'La pieza', placement: 'center', body: 'Primero eliges una pieza aprobada; después salen las redes, el día y la hora.' },
      { target: [anchor('networks')], title: 'Las redes', body: 'Cada red dice si la pieza cumple. Arregla lo rojo antes de programar.' },
      { target: [anchor('schedule-publication')], title: 'Programar', body: 'Con el día y la hora puestos, la programas en las redes que elegiste.' },
    ],
  },
  {
    id: 'publicacion',
    screen: '/publicar/[id]',
    roles: ['social', 'boss'],
    title: 'Cómo se publica',
    steps: [
      { target: [anchor('package')], title: 'El paquete', body: 'El video, la portada y el copy para subirlo a mano a la red.' },
      { target: [anchor('mark-published')], title: 'Ya lo publiqué', body: 'Ya publicada, pegas el link, subes una captura y marcas «Ya lo publiqué».' },
      { target: [anchor('load-metrics')], title: 'Resultados', body: 'Los números de la red: vistas, alcance, me gusta y más. Se cargan varias veces.' },
    ],
  },
  {
    id: 'resultados',
    screen: '/resultados',
    roles: ['social', 'boss'],
    title: 'Cómo se usa Resultados',
    steps: [
      { target: [anchor('period')], title: 'El período', body: 'Una semana, un mes o tres meses.' },
      { target: [anchor('best-hours')], title: 'La mejor hora', body: 'A qué hora nos va mejor en cada red, con lo que ya se publicó.' },
      { target: [anchor('by-publication')], title: 'Por publicación', body: 'Cada publicación con sus números; los que faltan se cargan en la publicación.' },
      { target: [anchor('csv')], title: 'Desde un archivo', body: 'Para cargar muchos resultados de una vez, desde un CSV.' },
    ],
  },
];
