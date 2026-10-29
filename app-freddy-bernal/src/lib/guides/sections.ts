// «Cada pantalla» (R3, design §7.2): what each screen is for and what each role does there. The screens that several
// roles share are written once here, with what changes per role; each role's file (boss.ts…) picks its screens and
// groups them under its menu entries. «» only for what the screen says; no concrete dates, phones or demo names.
import { navFor, type TeamRole } from '../roles';
import { MSG_AGENDA, MSG_ENTER, MSG_FREE, MSG_LINKS, MSG_PHONES, MSG_RELATIVE, MSG_RULES, MSG_TO_BOSS } from './shared';
import { CHAT_NOTICE, CHAT_NOTICE_LINE, CHAT_COMPOSER_LINE } from '../domain/chat';
import type { RoleGuide, SectionGuide } from './types';

type S = SectionGuide;

/** The group of a menu entry, said for the phone too: «Obras (en el teléfono, en «Más»)». */
export function menuGroup(role: TeamRole, label: string): string {
  const { more } = navFor([role]);
  return more.some((n) => n.label === label) ? `${label} (en el teléfono, en «Más»)` : label;
}

// Groups that are not a menu entry.
export const TOP = 'Arriba, en todas las pantallas';
export const ACCOUNT = 'En «Mi cuenta»';
export const OFF_MENU = 'Fuera de tu menú';

/** What the account looks like for a role: read from the menus themselves (src/lib/roles.ts), so it never drifts. */
export function accountFor(role: TeamRole, home: string, twoFactor: boolean): RoleGuide['account'] {
  const { visible, mobile, more } = navFor([role]);
  const create = CREATE_LABELS[role];
  return {
    home,
    menu: visible.map((n) => n.label),
    phoneBar: more.length ? [...mobile.map((n) => n.label), 'Más'] : mobile.map((n) => n.label),
    more: more.map((n) => n.label),
    create,
    twoFactor,
  };
}

// The «Crear» entries of each role (src/lib/roles.ts CREATE_ITEMS), named here so the guide reads them in order.
const CREATE_LABELS: Record<TeamRole, string[]> = {
  boss: ['Nuevo evento', 'Visita de obra', 'Ficha de obra', 'Ficha comunitaria', 'Nueva pieza', 'Tweets de la semana', 'Nueva publicación'],
  dispatch: ['Nuevo evento', 'Visita de obra', 'Ficha de obra', 'Ficha comunitaria'],
  politics: ['Ficha comunitaria'],
  ivt: ['Ficha de obra'],
  camera: [],
  social: ['Nueva pieza', 'Tweets de la semana', 'Nueva publicación'],
};

const knows = (role: TeamRole) => role === 'boss' || role === 'dispatch' || role === 'ivt' || role === 'camera';

// ── For everyone ───────────────────────────────────────────────────────────────────────────────────────────────────

export function messagesSections(role: TeamRole): S[] {
  const agenda = knows(role) ? [MSG_AGENDA, MSG_RELATIVE] : [MSG_FREE];
  const list: S[] = [
    {
      screen: '/mensajes',
      menu: TOP,
      title: 'Mensajes',
      tour: 'mensajes',
      what: 'Tus conversaciones con el equipo: con una persona, en grupo y «Todo el equipo». Se abre con el sobre de arriba.',
      youDo: [
        'Arriba de la lista está siempre el aviso: ' + CHAT_NOTICE,
        'La primera vez aceptas ese aviso con «Entendido». Sin aceptarlo puedes leer, pero no escribir.',
        'La primera fila es «Todo el equipo»; debajo, tus conversaciones. En negrita, las que tienen algo nuevo.',
        'Para empezar una, toca «Escribirle a alguien».',
        ...(role === 'boss' ? ['Arriba tienes tres pestañas: «Mías», «Todas» y «Quién habla con quién».'] : []),
      ],
    },
    {
      screen: '/mensajes/nueva',
      menu: TOP,
      title: 'Escribirle a alguien',
      what: 'Para empezar una conversación con una persona o armar un grupo.',
      youDo: [
        '«Una persona»: tocas a quien le quieres escribir y se abre su conversación (si ya existía, la misma).',
        '«Un grupo»: marcas de 2 a 11 personas, le pones un «Nombre del grupo» y tocas «Crear grupo». Las personas del grupo quedan fijas: para sumar a alguien se arma otro.',
        'Si el jefe no permite mensajes entre tu rol y otro, esas personas no salen en la lista.',
        MSG_TO_BOSS,
      ],
      cannot: ['Poner teléfonos, fechas, horas o mapas en el nombre del grupo.'],
    },
    {
      screen: '/mensajes/[id]',
      menu: TOP,
      title: 'Una conversación',
      what: 'Los mensajes de una conversación, del más viejo al más nuevo. Abre donde dice «Mensajes nuevos» o al final.',
      youDo: [
        'Bajo el título dice: ' + CHAT_NOTICE_LINE,
        'Arriba, «Ver anteriores» trae los mensajes más viejos.',
        'Si todavía no aceptaste el aviso, no hay caja para escribir: tocas «Ver el aviso» y «Entendido».',
        `Escribes abajo, en la caja. Pegada a ella dice: ${CHAT_COMPOSER_LINE}.`,
        MSG_ENTER,
        'Tu mensaje sale al momento con “Enviando…”. Si se fue la señal, dice que no se envió y tocas «Reintentar».',
        MSG_PHONES,
        ...agenda,
        MSG_LINKS,
        'En el menú de los tres puntos: «Silenciar» (deja de sonar en tu teléfono) o «Quitar el silencio».',
        ...(role === 'boss' ? ['En un grupo o en «Todo el equipo», ese menú también tiene «Solo el jefe escribe»: los demás leen y solo tú escribes.'] : []),
        MSG_RULES,
      ],
      cannot: ['Editar ni borrar un mensaje: lo escrito queda.', 'Mandar fotos, audios o archivos: para eso están el material y las piezas.'],
    },
  ];
  if (role === 'boss') {
    list.push(
      {
        screen: '/mensajes/todas',
        menu: TOP,
        title: 'Todas las conversaciones',
        what: 'Todas las conversaciones del equipo, para leerlas. Todos saben que puedes: lo dice el aviso de Mensajes.',
        youDo: [
          'Abres la que quieras y la lees. En las que no eres parte no escribes, y tu lectura no las marca como leídas para nadie.',
          'Las que son tuyas llevan «Eres parte».',
        ],
      },
      {
        screen: '/mensajes/permisos',
        menu: TOP,
        title: 'Quién habla con quién',
        what: 'Decides qué roles pueden escribirse en Mensajes. Al principio todos hablan con todos.',
        youDo: [
          'Cada fila es una pareja de roles, con los nombres de las personas de cada uno. El interruptor dice «Pueden escribirse» o «No pueden».',
          'Al cerrar una pareja la plataforma te pregunta antes: lo que ya se escribieron se sigue leyendo, pero no podrán escribir más.',
          'Con dos roles gana la regla más cerrada: si una persona es de política y del IVT y cierras Redes con política, no le escribe a Redes.',
          'Un grupo solo se arma si todas las parejas del grupo pueden hablar.',
          'En «Todo el equipo» escriben todos; las parejas no cuentan ahí. Si quieres que solo escribas tú, prende «Solo el jefe escribe en Todo el equipo».',
          MSG_TO_BOSS,
        ],
        cannot: ['Cambiar las notas de trabajo (la nota de Grabación para el editor, los comentarios de una pieza): las reglas son solo para Mensajes.'],
      },
    );
  }
  return list;
}

export function everyoneSections(role: TeamRole): S[] {
  const twoFactor = role !== 'camera' && role !== 'social';
  return [
    {
      screen: '/avisos',
      menu: TOP,
      title: 'Avisos',
      what: 'Los avisos de tu trabajo. Se abren con la campana de arriba, que dice cuántos no has leído.',
      youDo: ['Tocas un aviso para ir a lo que dice.', '«Marcar todo como leído» deja la campana en cero.'],
    },
    {
      screen: '/buscar',
      menu: TOP,
      title: 'Buscar',
      what: 'Buscas un evento o una pieza por su nombre, su lugar o su municipio. Solo encuentras lo que tu rol puede ver.',
      youDo: ['En el teléfono, la lupa de arriba; en la computadora, «Buscar evento o pieza».', 'Escribes en «Evento, lugar, municipio o pieza» y tocas lo que quieres abrir.'],
    },
    {
      screen: '/perfil',
      menu: ACCOUNT,
      title: 'Mi perfil y avisos',
      tour: 'perfil',
      what: 'Tus datos y los avisos que te llegan a este teléfono.',
      youDo: [
        'En «Mis datos», tu nombre' + (twoFactor ? ' y cómo está tu doble factor.' : '.'),
        'En «Avisos en este teléfono», «Activar avisos» para que el teléfono te avise aunque la app esté cerrada; «Probar aviso» para ver que llega.',
        'En «Qué avisos quiero», marca los que quieres recibir. Los importantes llegan siempre.',
        'En «Horas de silencio», el teléfono no suena de noche: lo importante llega igual y todo queda en «Avisos».',
        'Toca «Guardar».',
      ],
    },
    {
      screen: '/ayuda',
      menu: ACCOUNT,
      title: 'Ayuda y guías',
      tour: 'ayuda',
      what: 'La guía de tu trabajo, lo que se hace en cada pantalla, cómo va el trabajo entre todos y los tutoriales de tus pantallas.',
      youDo: [
        '«Mi trabajo, paso a paso»: tu guía con «Tu trabajo», «Paso a paso» y «Cada pantalla».',
        '«Cómo va el trabajo entre todos»: los flujos de un rol a otro.',
        '«Tutoriales de mis pantallas»: cada uno te lleva a su pantalla y te la muestra paso a paso.',
        ...(role === 'boss' ? ['«La guía de cada persona»: la guía de los seis roles del equipo.'] : []),
      ],
    },
    {
      screen: '/ayuda/flujos',
      menu: ACCOUNT,
      title: 'Cómo va el trabajo entre todos',
      what: 'Cómo pasa el trabajo de un rol a otro, paso a paso: un evento, una obra, un reporte de la comunidad, los tweets, el semáforo, la entrega de Grabación, Mensajes y la ayuda.',
      youDo: ['Tocas un flujo para verlo. Los pasos que son tuyos dicen «tú».'],
    },
  ];
}

// ── The agenda and the event ───────────────────────────────────────────────────────────────────────────────────────

export function calendarSection(role: 'boss' | 'dispatch', menu: string): S {
  return {
    screen: '/agenda',
    menu,
    title: 'Agenda',
    tour: 'agenda-calendario',
    what: 'El calendario de la agenda, en hora del Táchira. La comparten el jefe y el despacho.',
    youDo: [
      'Arriba, los botones grandes: «Nuevo evento», «Visita de obra», «Por ponerle fecha» y «Por decidir»' +
        (role === 'boss' ? ' (te lleva a Política, para aceptar o rechazar).' : ' (te lleva a Hoy: lo que espera al jefe).'),
      '«Anterior», «Hoy» y «Siguiente» para moverte; «Día», «Semana» o «Mes» para ver más o menos.',
      'Tocas un evento para abrir su ficha.',
      'Los colores: «Aceptado», «Por decidir», «Rechazado» y «Cancelado» (tachado, no se borra).',
    ],
  };
}

export function newEventSection(role: 'boss' | 'dispatch', menu: string): S {
  return {
    screen: '/agenda/nuevo',
    menu,
    title: 'Nuevo evento o visita de obra',
    tour: 'nuevo-evento',
    what:
      role === 'boss'
        ? 'Para poner algo en tu agenda. Lo tuyo queda aceptado de una vez y el despacho se entera.'
        : 'Para poner algo en la agenda. Lo que crea el despacho llega al jefe «Por decidir».',
    youDo: [
      'Entras por «Crear» → «Nuevo evento» o «Visita de obra» (o por los botones grandes de la agenda).',
      '«El evento»: el título, «A dónde se va», el municipio, «De qué se trata», la categoría y la «Prioridad para el equipo».',
      '«Fecha, hora y lugar exacto»: la fecha, la «Hora (Táchira)», la duración, la «Dirección exacta», «Cómo se llega» y los «Contactos del sitio». Si choca con otro evento te avisa; si va igual, marca «Guardar aunque choque con otro evento».',
      '«Ficha técnica»: de qué es la obra o el acto, quién la dirige, quién es el encargado, qué se está logrando, los datos con su fuente, el protocolo y «Quién graba».',
      'Tocas «Guardar evento» (o «Guardar visita de obra»).',
    ],
    cannot: ['Poner la fecha, la hora o la dirección en el título o en «A dónde se va»: esos los ve todo el equipo, Redes también.'],
  };
}

export function toScheduleSection(role: 'boss' | 'dispatch', menu: string): S {
  return {
    screen: '/agenda/por-fecha',
    menu,
    title: 'Por ponerle fecha',
    tour: 'por-fecha',
    what: 'Las fichas del IVT y los reportes de política que esperan fecha y hora. Al ponérsela, pasan a la agenda.',
    youDo: [
      'Cada tarjeta dice si es «Obra del IVT» o «Reporte comunitario», de dónde es y cuánto lleva esperando.',
      '«Ver ficha» para leerla completa.',
      '«Ponerle fecha»: revisas el «Título del evento» y «A dónde se va» (los ve todo el equipo), pones la fecha, la hora, la dirección y cómo se llega, eliges «Quién graba» y tocas «Guardar la fecha».' +
        (role === 'boss' ? ' Lo tuyo queda aceptado.' : ' Llega al jefe «Por decidir».'),
      '«No va»: escribes «Por qué no va» y tocas «Guardar». La obra queda archivada; el reporte queda en el registro del municipio.',
    ],
  };
}

export function eventSection(role: TeamRole, menu: string): S {
  switch (role) {
    case 'boss':
      return {
        screen: '/eventos/[id]',
        menu,
        title: 'Un evento',
        tour: 'evento-jefe',
        what: 'Todo de un evento: de qué se trata, dónde y cuándo, la ficha técnica, el storyboard, el material y las piezas.',
        youDo: [
          'Arriba, los chips: el código, el tipo, cómo va, tu decisión y de dónde nació («Lo agregó el jefe», «Propuesto por Despacho»…).',
          '«Tu decisión»: la importancia de 1 a 10 y «Aceptar» o «Rechazar». Le avisamos a quien lo propuso y al despacho.',
          'La tarjeta de fecha y lugar: «Cambiar fecha o lugar» y, cuando ya empezó, «Marcar realizado».',
          '«Mover» (otra fecha u hora) y «Cancelar» (queda tachado; «Volver a la agenda» lo trae). El motivo, sin fecha, hora ni teléfono.',
          'Las pestañas: «Ficha» (ficha técnica, «¿En qué va?», «Quién graba» e «Historial»), «Ficha de obra» o «Reporte» si nació de una ficha, «Storyboard», «Material» y «Piezas».',
          '«Modo lectura» para leer lo que vas a decir.',
        ],
      };
    case 'dispatch':
      return {
        screen: '/eventos/[id]',
        menu,
        title: 'Un evento',
        tour: 'evento-despacho',
        what: 'Todo de un evento de la agenda: dónde y cuándo, la ficha técnica, quién graba y los archivos del storyboard de Grabación.',
        youDo: [
          'La tarjeta de fecha y lugar: «Cambiar fecha o lugar» y, cuando ya empezó, «Marcar realizado». Un evento realizado ya no cambia de fecha ni de lugar.',
          '«Mover» y «Cancelar», con su motivo sin fecha, hora ni teléfono.',
          'Pestaña «Ficha»: «Editar» la ficha técnica y «Guardar ficha»; «Editar datos del evento»; «Quién graba» (puede ser más de una persona); «Historial».',
          'Si el jefe cambió lo mismo que tú, te llega el aviso; gana lo último guardado y lo de antes queda en el «Historial».',
          'Pestaña «Ficha de obra» o «Reporte», con los contactos (con el doble factor).',
          '«Modo lectura» si el jefe va a hablar.',
        ],
        cannot: ['Decidir ni calificar el evento: eso es del jefe.', 'Subir material ni leer la nota para el editor: eso es de Grabación y de Redes.'],
      };
    case 'politics':
      return {
        screen: '/eventos/[id]',
        menu,
        title: 'Una actividad en la agenda',
        what: 'La vista corta de una actividad que nació de tu reporte: si ya tiene fecha, sin decir cuál.',
        youDo: [
          'Ves el código, «Actividad comunitaria» y la decisión del jefe.',
          'Si ya tiene fecha dice «Ya tiene fecha. La ven el jefe y el despacho en la agenda.»; si se canceló o el jefe la rechazó, la ficha vuelve a «Por ponerle fecha».',
          '«Volver» te lleva al reporte.',
        ],
        cannot: ['Ver la fecha, la hora ni la dirección: nunca son para política.'],
      };
    case 'ivt':
      return {
        screen: '/eventos/[id]',
        menu,
        title: 'Una visita de obra',
        what: 'La vista corta de una visita que nació de tu ficha de obra.',
        youDo: ['Con el doble factor ves la fecha, la hora y la dirección de la visita.', '«Mis visitas de obra» te devuelve a la lista.'],
        cannot: ['Poner ni cambiar la fecha: la ponen el jefe o el despacho.'],
      };
    case 'camera':
      return {
        screen: '/eventos/[id]',
        menu,
        title: 'Un evento que grabas',
        tour: 'evento-grabacion',
        what: 'Un evento que te asignaron. Abre en la pestaña «Material», donde subes lo grabado.',
        youDo: [
          'La tarjeta de arriba: la fecha, la dirección, «Cómo se llega» y los «Contactos del sitio». Cuando ya empezó, «Marcar realizado».',
          'Pestaña «Ficha»: la ficha técnica (de qué es, quién lo dirige) y «Quién graba».',
          'Pestaña «Storyboard»: el plan de Redes, para leerlo antes de grabar.',
          'Si es una visita de obra, la pestaña «Ficha de obra» (sin contactos).',
        ],
        cannot: ['Ver eventos que no te asignaron.', 'Cambiar el storyboard de Redes: el tuyo va en «Entrega de Grabación».'],
      };
    case 'social':
      return {
        screen: '/eventos/[id]',
        menu,
        title: 'Un evento',
        tour: 'evento-redes',
        what: 'De qué se trata un evento y qué le falta, sin fecha ni hora.',
        youDo: [
          'Pestaña «Ficha»: la ficha técnica para leer, «¿En qué va?» (lo cambias tú) y «Quién graba» (puedes asignar a Grabación).',
          'Pestaña «Ficha de obra» si es una visita de obra (sin contactos ni documentos).',
          'Pestaña «Storyboard»: el plan de lo que se graba.',
          'Pestaña «Material»: lo que subió Grabación y su nota para el editor.',
          'Pestaña «Piezas»: las piezas del evento y «Nueva pieza».',
        ],
        cannot: ['Ver la fecha, la hora o la dirección del evento.', 'Mover, cancelar o decidir el evento.'],
      };
  }
}

export function readingSection(role: 'boss' | 'dispatch', menu: string): S {
  return {
    screen: '/eventos/[id]/lectura',
    menu,
    title: 'Modo lectura',
    tour: 'lectura',
    what: 'Lo que va a decir el jefe, en letra grande, para leer en el iPad o en el teléfono.',
    youDo: [
      'Se abre con «Modo lectura» en el evento o con «Lo que voy a decir» en Política.',
      '«Letra más grande» y «Letra más pequeña»; «Desplazar solo» con la «Velocidad» que guste, y «Pausar».',
      role === 'boss'
        ? 'Arriba, «Antes de hablar»: quién reportó y lo que debes saber antes de tomar la palabra.'
        : 'Arriba, «Antes de hablar»: quién reportó y lo que el jefe debe saber. Lo ves tú y el jefe.',
      'Si la visita de obra no tiene discurso escrito, sale el diálogo FAB de la ficha del IVT.',
      '«Salir del modo lectura» al terminar.',
    ],
  };
}

// ── Obras ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export function obrasSections(role: 'boss' | 'dispatch' | 'ivt', menu: string): S[] {
  const ivt = role === 'ivt';
  return [
    {
      screen: '/obras',
      menu,
      title: 'Fichas de obra',
      tour: 'obras',
      what: 'La ficha de cada obra antes de la visita del jefe, sin fecha ni hora: esa la ponen el jefe o el despacho.',
      youDo: [
        '«Nueva ficha de obra» para cargar una.',
        'Los chips de arriba cuentan cuántas hay por etapa; los tocas para ver solo esas.',
        'Filtras por municipio y estado con «Filtrar»; «Quitar» lo limpia.',
        'Las secciones: «Por ponerle fecha», «Borradores», «Con fecha», «Visitas realizadas» y «Archivadas».',
      ],
    },
    {
      screen: '/obras/nueva',
      menu,
      title: 'Nueva ficha de obra',
      tour: 'nueva-obra',
      what: 'La ficha de una obra, por grupos que se abren y se cierran.',
      youDo: [
        'Cinco grupos: «Datos generales», «Sobre la obra», «Reporte de la comunidad», «Avance y entrega» y «Comunidad y seguimiento».',
        'Si una pregunta no va, marca «No aplica»; si todavía no lo sabes, «Por confirmar».',
        'Los teléfonos solo van en los contactos, y los contactos se ven con el doble factor.',
        '«Guardar borrador» si te falta algo: todavía no le llega al jefe.',
        'Con todo respondido, «Guardar y avisar al jefe»: al jefe y al despacho les llega «Por ponerle fecha».',
        'Las fotos y los documentos se suben después de guardar, en la ficha.',
      ],
      cannot: ['Inventar cifras: cada dato con su fuente, o «Por confirmar».', 'Poner la fecha de la visita: la ponen el jefe o el despacho.'],
    },
    {
      screen: '/obras/[id]',
      menu,
      title: 'Una ficha de obra',
      tour: 'ficha-obra',
      what: 'Todo de una obra: sus datos, la fecha de la visita, el diálogo para el jefe, las fotos y la historia.',
      youDo: [
        '«Editar» para corregirla; «Archivar» si ya no va (y «Sacar del archivo» si vuelve).',
        ivt
          ? '«Fecha de la visita»: cuando el jefe o el despacho la ponen, la ves con el doble factor.'
          : '«Fecha de la visita»: si está por ponerle fecha, ahí está «Ponerle fecha»; si ya tiene, «Ver la visita».',
        '«Lo que voy a decir»: «Generar diálogo FAB» arma qué es la obra, qué mejora y qué gana la gente, solo con las cifras de la ficha. Debajo dice «Lo que la ficha no tiene (no se dice):». Lo corriges, tocas «Guardar» y lo pruebas en «Modo lectura».',
        '«Fotos del antes y del avance»: «Subir fotos del antes», «Subir fotos del avance» y «Subir documentos». Siguen solas si se va la señal.',
        '«Historia»: quién hizo qué. «Agregar una nota» y «Guardar nota», sin teléfonos.',
      ],
      cannot: ivt ? ['Poner la fecha de la visita.'] : undefined,
    },
  ];
}

// ── Municipios and community reports ────────────────────────────────────────────────────────────────────────────────

export function municipiosSections(role: 'boss' | 'dispatch' | 'politics', menu: string): S[] {
  const politics = role === 'politics';
  return [
    {
      screen: '/municipios',
      menu,
      title: 'Municipios',
      tour: 'municipios',
      what: 'Los eventos, avances e incidencias de cada municipio, con lo vencido arriba.',
      youDo: [
        'Arriba, «Vencidas en los municipios»: las que pasaron su fecha de seguimiento y no están finalizadas ni suspendidas.',
        '«Nueva ficha comunitaria» para cargar un reporte.',
        'Los números: «Abiertas», «En ejecución», «Finalizadas» y «Vencidas».',
        'Filtras por municipio, parroquia, tipo, estado o prioridad, o «Solo las vencidas», y tocas «Filtrar»; «Quitar los filtros» lo limpia.',
        'Abajo, los municipios: tocas uno para ver todo en orden de fecha, por parroquia.' + (politics ? '' : ' También salen sus obras.'),
      ],
    },
    {
      screen: '/reportes/nuevo',
      menu,
      title: 'Nueva ficha comunitaria',
      tour: 'nueva-comunitaria',
      what: 'El reporte de una actividad o situación de la comunidad, por grupos.',
      youDo: [
        'Diez grupos, de «Persona que reporta» a «Evidencias y observaciones». Si una pregunta no va, «No aplica»; si falta saberlo, «Por confirmar».',
        '«¿Va a la agenda del jefe?»: prendido, el botón dice «Guardar y avisar al jefe» y le llega al jefe y al despacho «Por ponerle fecha». Apagado, «Guardar» y queda en el registro del municipio.',
        'Las fotos y los documentos se suben después de guardar, en la ficha.',
      ],
      cannot: ['Poner teléfonos fuera de los contactos.'],
    },
    {
      screen: '/reportes/[id]',
      menu,
      title: 'Una ficha comunitaria',
      tour: 'ficha-comunitaria',
      what: 'Todo de un reporte: sus datos, si va a la agenda del jefe, su estado, las evidencias y la historia.',
      youDo: [
        '«Editar» para corregirla.',
        politics
          ? '«Agenda del jefe»: si ya tiene fecha dice «Ya tiene fecha. La ven el jefe y el despacho en la agenda.» Nunca dice cuál.'
          : '«Agenda del jefe»: la fecha, o «Ponerle fecha» si va a la agenda y todavía no la tiene.',
        '«Estado»: eliges el «Nuevo estado», escribes el «Motivo o avance (opcional)» y tocas «Cambiar estado». Cada cambio queda en la historia.',
        '«Evidencias»: «Subir fotos del antes», «Subir fotos del después» y «Subir documentos». Los documentos los ven solo política, el jefe y el despacho.',
        '«Historia»: «Agregar una nota» y «Guardar nota», sin teléfonos ni nombres de quien reporta.',
        'Los contactos de «Persona que reporta» se ven con el doble factor.',
      ],
      cannot: politics ? ['Ponerle fecha: la ponen el jefe o el despacho.'] : undefined,
    },
  ];
}

// ── Redes' screens (Redes, and the boss who «tiene todo») ──────────────────────────────────────────────────────────

export function redesSections(role: 'boss' | 'social', group: (label: string) => string): S[] {
  const boss = role === 'boss';
  const list: S[] = [
    // Redes by format (R4, D-60): Paso 0 writes these short sections of the new screens; WP-E writes them in full with
    // the real labels of each screen.
    {
      screen: '/redes',
      menu: group('Redes'),
      title: 'Redes',
      tour: 'redes',
      what: boss
        ? 'Tu puerta a Redes: las secciones por formato, el feed y lo demás de Redes, con lo que espera en cada una.'
        : 'El tablero de Redes: las secciones por formato, el feed y lo demás de Redes, con lo que espera en cada una.',
      youDo: [
        'Arriba, la barra de secciones: «Tablero», «Reels», «Posts», «Carruseles», «Historias», «YouTube», «Fin de mes», «Feed» y «Tweets», y «Buscar en Redes».',
        'Una tarjeta por pantalla: Tweets, Publicar, Resultados y Biblioteca, con sus números.',
        'Abajo, «Crear en Redes»: «Nueva pieza», «Tweets de la semana» y «Nueva publicación».',
      ],
    },
    {
      screen: '/redes/[formato]',
      menu: group('Redes'),
      title: 'Una sección de Redes',
      tour: 'redes-seccion',
      what: 'Las piezas de un formato (reels, posts, carruseles, historias, videos de YouTube o fin de mes) en el mes que eliges.',
      youDo: ['Las pestañas de los meses y «+ Nuevo mes»: el mes que eliges sigue en las otras secciones y en el feed.'],
    },
    {
      screen: '/redes/feed',
      menu: group('Redes'),
      title: 'El feed del mes',
      what: 'Los espacios del feed del mes, en el orden en que se publican: el primero abajo a la derecha.',
      youDo: ['Se llega con «Feed», en la barra de secciones de Redes.'],
    },
    {
      screen: '/redes/buscar',
      menu: group('Redes'),
      title: 'Buscar en Redes',
      what: 'Para buscar en todo Redes: títulos, copies, avisos y tweets.',
      youDo: ['Se llega con «Buscar en Redes», en la barra de secciones.'],
    },
    {
      screen: '/piezas/nueva',
      menu: group('Redes'),
      title: 'Nueva pieza',
      what: 'Para crear una pieza.',
      youDo: ['Eliges el «Evento» (o «Sin evento»), el «Tipo», la «Categoría» y el «Título», y tocas «Crear pieza».'],
    },
    {
      screen: '/piezas/[id]',
      menu: group('Redes'),
      title: 'Una pieza',
      tour: 'pieza',
      what: 'El archivo final, los copies y la aprobación de una pieza.',
      youDo: [
        '«Archivo final»: «Subir video final (nueva versión)» o «Subir imagen final (nueva versión)», y «Subir portada». Si ya estaba aprobada, vuelve a revisión.',
        '«Copies»: eliges la «Fórmula», la «Voz» y el «Cierre» («Pregunta a la comunidad», una acción con destino o «Sin cierre»), y tocas «Escribir desde la ficha». Salen tres largos: solo con cifras de la ficha.',
        'Revisas cada copy, lo corriges, «Guardar» y «Copiar».',
        '«Nivel de aprobación»: verde (rutina), amarillo (normal) o rojo (sensible). Después, «Enviar a aprobación».',
        'Si el jefe pidió cambios, arriba sale «Pidieron cambios» con lo que dijo. Corriges y la envías otra vez.',
        '«Frases pedidas al jefe»: si hace falta su voz, aquí se sube con «Subir el audio del jefe».',
        '«Ver evento» te lleva al evento de la pieza.',
      ],
      cannot: ['Bajar el nivel que puso el jefe.', 'Publicar una pieza que no está aprobada.'],
    },
    {
      screen: '/tweets',
      menu: group('Tweets'),
      title: 'Tweets',
      tour: 'tweets',
      what: 'Los tweets de la semana, repartidos por día y hora.',
      youDo: [
        '«Tweets de la semana» para subir la tanda nueva.',
        '«Días cubiertos» y «Por salir»: si quedan pocos días, prepara la tanda siguiente.',
        'Tocas un tweet: «Copiar texto», lo pegas en X y, ya publicado, pegas el link en «Pega el link del tweet» y tocas «Ya lo publiqué». También «Cambiar día y hora», «Agregar imagen de referencia» o «Saltar este tweet».',
        'Abajo, «Tandas»: cada tanda con lo que tiene por aprobar y aprobado.',
      ],
    },
    {
      screen: '/tweets/nueva',
      menu: group('Tweets'),
      title: 'Tweets de la semana',
      tour: 'tweets-nueva',
      what: 'Para convertir el documento de la semana en tweets repartidos y mandarlos al jefe.',
      youDo: [
        '«Subir el documento (.docx, .txt o .md)» o pega el texto, y toca «Separar tweets».',
        'Ponle el «Nombre de la tanda». Revisa cada tweet: su categoría, «Partir», «Unir con el siguiente» o quitarlo. Si un link no abre, te lo dice.',
        'Toca «Repartir en la semana y enviar a aprobación»: quedan de 2 a 3 por día y le llegan al jefe.',
        '«Empezar de nuevo» borra lo separado; tu texto sigue ahí.',
      ],
    },
    {
      screen: '/tweets/[id]',
      menu: group('Tweets'),
      title: 'Una tanda de tweets',
      tour: 'tanda',
      what: 'Una tanda: cuántos están por aprobar, aprobados y programados.',
      youDo: [
        boss ? '«Aprobar los n» si ya los leíste todos.' : 'Esperas a que el jefe los apruebe.',
        'Con los aprobados, «Programar»: quedan en el tablero con «Copiar texto» y «Ya lo publiqué».',
        '«Repartir de nuevo» cambia las horas; «Editar textos» y «Guardar texto» los corrige. Si cambias uno aprobado, vuelve al jefe.',
      ],
    },
    {
      screen: '/publicar',
      menu: group('Publicar'),
      title: 'Publicar',
      tour: 'publicar',
      what: 'El calendario de publicaciones. Por ahora se publica a mano: descargas el paquete y marcas «Ya lo publiqué».',
      youDo: [
        '«Aprobadas y sin publicar»: las piezas listas, con el chip «Lista».',
        '«Nueva publicación» para programar una.',
        '«Lo que viene» y «Publicado (últimas 2 semanas)».',
        '«Registrar lo que publicó el jefe»: lo que el jefe sacó por su cuenta.',
      ],
    },
    {
      screen: '/publicar/nueva',
      menu: group('Publicar'),
      title: 'Nueva publicación',
      tour: 'publicar-nueva',
      what: 'Para programar una pieza aprobada en una o varias redes, revisando que cumpla con cada una.',
      youDo: [
        '«¿Qué pieza vas a publicar?»: eliges una aprobada.',
        'Eliges las redes: cada una dice «Todo bien», «Revisar» o «No pasa», y qué arreglar. «Ver el copy que va» muestra el texto.',
        'El «Día» y la «Hora (Táchira)»: si es mala hora, te avisa. Sin hora queda como borrador.',
        '«Colaboradores a invitar» y «¿Es una republicación?» si hace falta.',
        'Toca «Programar en n redes» (o «Guardar como borrador»). Si sale «Arregla lo marcado en rojo», corrige eso primero.',
      ],
      cannot: ['Publicar una pieza sin aprobar: sin aprobadas dice que el jefe tiene que aprobar antes.'],
    },
    {
      screen: '/publicar/[id]',
      menu: group('Publicar'),
      title: 'Una publicación',
      tour: 'publicacion',
      what: 'El paquete para subirlo a la red, la evidencia y los resultados.',
      youDo: [
        '«Paquete para publicar»: el «Video», la «Portada», el «Copy (.txt)» y «Copiar el copy».',
        'Publicas a mano en la red. Después, en «¿Ya lo publicaste?», pegas el «Link de la publicación», tocas «Subir captura» y «Ya lo publiqué».',
        'Si la red no lo aceptó: «No se pudo publicar», escribes «¿Qué pasó?» y «Marcar como fallida» (sale en «Trancado»).',
        'Ya publicada, «Cargar resultados»: vistas, alcance, me gusta, comentarios, compartidos y guardados, y «Guardar resultados». Se puede cargar varias veces.',
      ],
    },
    {
      screen: '/publicar/espontanea',
      menu: group('Publicar'),
      title: 'Lo que publicó el jefe',
      what: 'Para anotar lo que el jefe publicó por su cuenta, y que cuente en los resultados.',
      youDo: ['La red, el «Link de la publicación», de qué se trató, el día y la hora en que salió y una captura si la tienes; después «Registrar».'],
    },
    {
      screen: '/resultados',
      menu: group('Resultados'),
      title: 'Resultados',
      tour: 'resultados',
      what: 'Cómo le fue a cada publicación y a qué hora nos va mejor.',
      youDo: [
        'Eliges el período: «7 días», «30 días» o «90 días».',
        '«¿A qué hora nos va mejor?», por red. Con pocos datos dice «Todavía pocos datos».',
        '«Por publicación»: tocas el título para abrirla. Los números se cargan en cada publicación, con «Cargar resultados».',
        '«Cargar resultados desde un archivo (CSV)» y «Elegir archivo CSV» para cargar muchos de una vez.',
      ],
    },
  ];
  return list;
}

export function bibliotecaSection(role: 'boss' | 'dispatch' | 'social', menu: string): S {
  return {
    screen: '/biblioteca',
    menu,
    title: 'Biblioteca',
    tour: 'biblioteca',
    what: 'El material por día y por evento, como una carpeta compartida.',
    youDo: [
      '«Buscar por evento o lugar».',
      role === 'social'
        ? 'Cada evento ya realizado con sus archivos; lo que todavía no tiene día está en «En preparación (todavía sin día)».'
        : 'Los días con sus eventos y sus archivos; lo que todavía no tiene día está en «En preparación (todavía sin día)».',
      '«Descargar todo» de un evento baja su material a una carpeta, sin fechas en los nombres.',
    ],
  };
}

// ── The boss's screens ─────────────────────────────────────────────────────────────────────────────────────────────

export function approveSections(menu: string): S[] {
  return [
    {
      screen: '/aprobar',
      menu,
      title: 'Por aprobar',
      tour: 'aprobar',
      what: 'Todo lo que espera tu aprobación. Nada se publica sin ella.',
      youDo: [
        'Las pestañas «Piezas (n)» y «Tweets (n)».',
        '«Aprobar todas las verdes (n)»: las de rutina, de un toque.',
        'Las amarillas y las rojas, por color y con su plazo: amarillo en 60 minutos, rojo en 30. Tocas una para revisarla.',
        'Si vence el plazo, la pieza sigue sin aprobar y sale en «Trancado»: nunca sale sola.',
      ],
    },
    {
      screen: '/aprobar?tab=tweets',
      menu,
      title: 'Por aprobar: los tweets',
      tour: 'aprobar-tweets',
      what: 'Los tweets de la semana que mandó Redes.',
      youDo: ['Vienen todos marcados: desmarca los que no van.', 'Toca «Aprobar marcados». Si Redes cambia uno aprobado, vuelve aquí.'],
    },
    {
      screen: '/aprobar/[id]',
      menu,
      title: 'Revisar una pieza',
      tour: 'aprobar-pieza',
      what: 'Para mirar una pieza antes de aprobarla.',
      youDo: [
        'El video: si lo pausas, tu comentario queda en ese segundo.',
        '«Qué hay que cambiar (o un comentario)», o los motivos rápidos («Muy largo», «Revisar ortografía», «Dice fecha u hora»…).',
        '«Copies: cómo saldrá»: el texto de cada red.',
        '«Antes de aprobar»: «Cada cifra tiene su fuente», «No dice fecha ni hora del evento», «Se ve y se oye bien (subtítulos, sonido)» y «Los tres copies están revisados». Hasta marcarlas, «Aprobar» dice «Marca la lista para aprobar».',
        '«Aprobar», «Pedir cambios» (vuelve a Redes con tu comentario) o «Solo comentar».',
        '«Cambiar nivel» si el color no es el correcto.',
      ],
    },
  ];
}
