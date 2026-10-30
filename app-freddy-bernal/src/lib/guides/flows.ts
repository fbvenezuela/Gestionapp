// The flows between roles (R3, D-44, design §7.4): how the work passes from one role to the next. One source for the
// app (/ayuda/flujos, a list of cards with «tú» on the reader's steps) and the repo (docs/FLUJOS.md, in Mermaid).
// Steps in order; a step without branches goes on to the next one; a branch without `to` ends there. No dates.
import type { Flow, FlowId } from './types';

export const FLOWS: Flow[] = [
  {
    id: 'evento',
    title: 'Un evento, de la agenda a la publicación',
    roles: ['boss', 'dispatch', 'social', 'camera'],
    steps: [
      {
        id: 'crear',
        roles: ['boss', 'dispatch'],
        text: '«Crear» → «Nuevo evento», con su ficha técnica, y «Guardar evento».',
        href: '/agenda/nuevo',
        question: '¿Lo creó el jefe?',
        branches: [
          { label: 'Sí', text: 'Nace «Aceptado».', to: 'graba' },
          { label: 'No', text: 'Le llega al jefe «Por decidir».', to: 'decide' },
        ],
      },
      {
        id: 'decide',
        roles: ['boss'],
        text: 'En el evento, «Tu decisión»: la importancia de 1 a 10.',
        href: '/jefe/politica',
        question: '¿Lo acepta?',
        branches: [
          { label: 'Sí', text: '«Aceptar».', to: 'graba' },
          { label: 'No', text: '«Rechazar»: sale de la lista de Redes y le avisamos a quien lo propuso.' },
        ],
      },
      { id: 'graba', roles: ['dispatch', 'boss', 'social'], text: '«Quién graba»: eligen a la persona de Grabación, y le llega el aviso.' },
      { id: 'storyboard', roles: ['social'], text: 'Pestaña «Storyboard»: el plan de lo que se graba, y «Guardar storyboard».', href: '/agenda' },
      { id: 'material', roles: ['camera'], text: 'Graba, sube el material por casillas y deja su «Entrega de Grabación». Cuando ya empezó, «Marcar realizado».', href: '/agenda' },
      { id: 'pieza', roles: ['social'], text: '«Nueva pieza»: el archivo final, la portada y los copies con «Escribir desde la ficha».', href: '/piezas/nueva' },
      { id: 'aprueba', roles: ['boss'], text: 'La aprobación, con el semáforo: tiene su propio flujo.', href: '/aprobar' },
      { id: 'publica', roles: ['social'], text: '«Nueva publicación» → «Programar en n redes» → publica a mano → «Ya lo publiqué».', href: '/publicar' },
      { id: 'resultados', roles: ['social'], text: 'En la publicación, «Cargar resultados».', href: '/resultados' },
      { id: 'digital', roles: ['boss'], text: 'Ve cómo nos va en Digital.', href: '/jefe/digital' },
    ],
  },
  {
    id: 'obra',
    title: 'Una obra, de la ficha a la visita',
    roles: ['ivt', 'boss', 'dispatch', 'social', 'camera'],
    steps: [
      {
        id: 'ficha',
        roles: ['ivt'],
        text: '«Nueva ficha de obra»: los cinco grupos, las cifras con su fuente.',
        href: '/obras/nueva',
        question: '¿Está completa?',
        branches: [
          { label: 'No', text: '«Guardar borrador»: todavía no le llega al jefe.', to: 'ficha' },
          { label: 'Sí', text: '«Guardar y avisar al jefe».', to: 'fotos' },
        ],
      },
      { id: 'fotos', roles: ['ivt'], text: 'En la ficha: las fotos del antes y del avance, y «Generar diálogo FAB».', href: '/obras' },
      {
        id: 'fecha',
        roles: ['boss', 'dispatch'],
        text: '«Por ponerle fecha» → «Ponerle fecha»: nace la «Visita de obra».',
        href: '/agenda/por-fecha',
        question: '¿Va a la agenda?',
        branches: [
          { label: 'Sí', text: '«Guardar la fecha». Si la puso el despacho, al jefe le llega «Por decidir».', to: 'visitas' },
          { label: 'No', text: '«No va»: la ficha queda «Archivada».' },
        ],
      },
      { id: 'visitas', roles: ['ivt'], text: 'Ve la fecha en «Mis visitas de obra», con el doble factor.', href: '/agenda' },
      { id: 'discurso', roles: ['social'], text: 'Ve la pestaña «Ficha de obra» (sin contactos) y, en el storyboard, toca «Usar como discurso».' },
      { id: 'lee', roles: ['boss'], text: 'Lee lo que va a decir en el «Modo lectura».' },
      {
        id: 'hecho',
        roles: ['boss', 'dispatch', 'camera'],
        text: 'Después de la visita, «Marcar realizado»: la ficha pasa a «Visitas realizadas».',
        question: '¿Se canceló o el jefe la rechazó?',
        branches: [
          { label: 'Sí', text: 'La ficha vuelve sola a «Por ponerle fecha» y le avisamos al IVT.', to: 'fecha' },
          { label: 'No', text: 'Listo.' },
        ],
      },
    ],
  },
  {
    id: 'comunitario',
    title: 'Un reporte de la comunidad',
    roles: ['politics', 'boss', 'dispatch'],
    steps: [
      {
        id: 'reporte',
        roles: ['politics'],
        text: '«Nueva ficha comunitaria»: los diez grupos.',
        href: '/reportes/nuevo',
        question: '¿Va a la agenda del jefe?',
        branches: [
          { label: 'No', text: '«Guardar»: queda en el registro del municipio.', to: 'seguimiento' },
          { label: 'Sí', text: '«Guardar y avisar al jefe».', to: 'fecha' },
        ],
      },
      { id: 'fecha', roles: ['boss', 'dispatch'], text: '«Por ponerle fecha» → «Ponerle fecha»: nace la actividad en la agenda.', href: '/agenda/por-fecha' },
      { id: 'ya', roles: ['politics'], text: 'Ve “ya tiene fecha” en «Agenda del jefe», nunca la fecha.' },
      { id: 'seguimiento', roles: ['politics'], text: 'El seguimiento: «Cambiar estado» con su motivo, las evidencias y «Guardar nota».', href: '/municipios' },
      {
        id: 'vencida',
        roles: ['politics', 'boss'],
        text: 'Si pasa su fecha de seguimiento sin terminar, sale arriba en Municipios y en el Inicio del jefe.',
        question: '¿Está finalizada?',
        branches: [
          { label: 'No', text: 'Sigue el seguimiento.', to: 'seguimiento' },
          { label: 'Sí', text: 'Queda en la historia del municipio.' },
        ],
      },
    ],
  },
  {
    id: 'tweets',
    title: 'Tweets de la semana',
    roles: ['social', 'boss'],
    steps: [
      { id: 'sube', roles: ['social'], text: '«Tweets de la semana»: sube el documento o pega el texto, y «Separar tweets».', href: '/tweets/nueva' },
      { id: 'reparte', roles: ['social'], text: 'Revisa cada tweet y «Repartir en la semana y enviar a aprobación».' },
      {
        id: 'aprueba',
        roles: ['boss'],
        text: '«Por aprobar» → «Tweets (n)»: desmarca los que no van.',
        href: '/aprobar',
        question: '¿Los aprueba?',
        branches: [
          { label: 'Sí', text: '«Aprobar marcados».', to: 'programa' },
          { label: 'No', text: 'Los desmarcados no salen.' },
        ],
      },
      { id: 'programa', roles: ['social'], text: 'En la tanda, «Programar».', href: '/tweets' },
      { id: 'publica', roles: ['social'], text: 'Cada día, en el tablero: «Copiar texto» → lo pegas en X → «Ya lo publiqué». Si editas uno aprobado, vuelve al jefe.' },
    ],
  },
  {
    id: 'aprobacion',
    title: 'El semáforo',
    roles: ['social', 'boss'],
    steps: [
      {
        id: 'envia',
        roles: ['social'],
        text: 'En la pieza, «Nivel de aprobación» y «Enviar a aprobación».',
        href: '/redes',
        question: '¿De qué color es?',
        branches: [
          { label: 'Verde', text: 'Rutina: el jefe las aprueba todas de un toque, en el día.', to: 'aprobada' },
          { label: 'Amarillo o rojo', text: 'Amarillo en 60 minutos, rojo en 30.', to: 'revisa' },
        ],
      },
      {
        id: 'revisa',
        roles: ['boss'],
        text: 'Abre la pieza, la mira y marca «Antes de aprobar».',
        href: '/aprobar',
        question: '¿La aprueba?',
        branches: [
          { label: 'Sí', text: '«Aprobar».', to: 'aprobada' },
          { label: 'No', text: '«Pedir cambios»: a Redes le llega «Cambios», corrige y la envía otra vez.', to: 'envia' },
        ],
      },
      { id: 'aprobada', roles: ['social'], text: 'Le llega «Aprobada: lista para publicar». Si vence el plazo sin respuesta, sigue sin aprobar y sale en «Trancado».', href: '/publicar' },
    ],
  },
  {
    id: 'entrega',
    title: 'La entrega de Grabación',
    roles: ['camera', 'social', 'boss'],
    steps: [
      { id: 'graba', roles: ['camera'], text: 'Lee la ficha y el storyboard de Redes, y graba.', href: '/agenda' },
      { id: 'sube', roles: ['camera'], text: 'En «Material», sube cada parte en su casilla. Si se va la señal, sigue sola.' },
      { id: 'entrega', roles: ['camera'], text: '«Entrega de Grabación»: el storyboard con el que grabó («Guardar storyboard») y la nota para el editor («Guardar nota»).' },
      { id: 'avisa', roles: ['social', 'boss'], text: 'Les sale «Notas de Grabación nuevas».', href: '/hoy' },
      { id: 'baja', roles: ['social'], text: 'Lee la nota y toca «Descargar todo el material» para editar.' },
    ],
  },
  {
    id: 'mensajes',
    title: 'Cómo se habla en Mensajes',
    roles: ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'],
    steps: [
      { id: 'arma', roles: ['boss'], text: 'Arma un canal con «Nuevo canal»: nombre, para qué es y quiénes van. Él está en todos.', href: '/mensajes/canales/nuevo' },
      { id: 'entra', roles: ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'], text: 'El canal le sale en Mensajes a cada persona que está en él, con la lista de quiénes están.', href: '/mensajes' },
      { id: 'escribe', roles: ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'], text: 'Escribe en el canal.' },
      {
        id: 'revisa',
        roles: ['boss', 'dispatch', 'ivt', 'camera'],
        text: 'Si conoces la agenda y en el canal está Redes o política, la plataforma revisa el texto.',
        question: '¿Lleva una fecha, una hora, un mapa o un teléfono?',
        branches: [
          { label: 'Sí', text: 'No lo deja enviar y dice cómo decirlo sin eso.', to: 'escribe' },
          { label: 'No', text: 'Sale.', to: 'llega' },
        ],
      },
      { id: 'llega', roles: ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'], text: 'Les llega al teléfono “Mensaje nuevo”, sin el texto, a los que están en el canal.' },
      { id: 'miembros', roles: ['boss'], text: 'Si hace falta, cambia quién está en «Editar canal», o lo archiva cuando ya no se usa.' },
    ],
  },
  {
    id: 'ayuda',
    title: 'Cómo pedir ayuda',
    roles: ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'],
    steps: [
      {
        id: 'ofrece',
        roles: ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'],
        text: '360 te ofrece en una línea “¿Te muestro esta pantalla?”.',
        question: '¿Quieres verla?',
        branches: [
          { label: 'Sí', text: 'Un tutorial paso a paso, en esa misma pantalla.', to: 'cuando' },
          { label: 'No', text: 'La cierras con la X. Tras dos veces, 360 deja de ofrecer.', to: 'cuando' },
        ],
      },
      {
        id: 'cuando',
        roles: ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'],
        text: 'Cuando quieras: le escribes a 360, o «Mi cuenta» → «Ayuda y guías»: tu guía, cada pantalla, los flujos y «Ver el tutorial de esta pantalla».',
        href: '/ayuda',
      },
    ],
  },
];

export function flowById(id: FlowId | string): Flow | null {
  return FLOWS.find((f) => f.id === id) ?? null;
}
