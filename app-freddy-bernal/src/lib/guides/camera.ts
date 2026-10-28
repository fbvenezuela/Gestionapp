// Grabación's guide (R3, design §7.2, §7.3): record what was assigned and hand over clean material.
import type { RoleGuide } from './types';
import { ACCOUNT, TOP, accountFor, eventSection, everyoneSections, menuGroup, messagesSections } from './sections';

const g = (label: string) => menuGroup('camera', label);

export const CAMERA_GUIDE: RoleGuide = {
  role: 'camera',
  slug: 'grabacion',
  label: 'Grabación',
  account: accountFor('camera', '/hoy', false),
  job: {
    mission: 'Grabas lo que te asignan y entregas el material limpio, con lo que Redes necesita para editar.',
    responsibilities: [
      'Leer la ficha técnica y el storyboard de Redes antes de grabar.',
      'Subir el material por casillas, ya limpio y en el archivo original.',
      'Dejar tu entrega: el storyboard con el que grabaste y una nota para quien edita.',
      'Marcar realizado el evento cuando ya empezó.',
      'Subir el material el mismo día: Hoy te avisa lo que falta.',
    ],
    never: [
      'Escribir fechas, horas, direcciones ni teléfonos en la nota para el editor: la lee Redes.',
      'Cambiar el storyboard de Redes: el tuyo va en tu entrega.',
      'Escribirle a Redes o a política la fecha o la hora de un evento: la plataforma no lo deja.',
    ],
    worksWith: [
      { role: 'dispatch', what: 'Te asigna los eventos en «Quién graba» y te deja la ficha técnica lista.' },
      { role: 'social', what: 'Te deja el storyboard antes de grabar y edita con lo que subes. Lee tu nota para el editor.' },
      { role: 'boss', what: 'Es a quien grabas. Ve tus notas nuevas en su botón Redes.' },
    ],
    rhythm: [
      'Antes de cada evento: la ficha, «Cómo se llega» y el storyboard.',
      'Después de grabar: subir el material el mismo día y dejar tu entrega.',
      'Cada día: Hoy, con «Sube el material» si quedó algo.',
    ],
  },
  day: [
    'Abres la plataforma y caes en Hoy.',
    'Si dice «Sube el material», ese evento ya pasó y todavía no tiene archivos.',
    'En la Agenda, «Mis eventos»: los que te tocan, con su fecha y su dirección.',
    'Antes de salir, abres el evento: la ficha y el storyboard.',
    'De vuelta, pestaña «Material»: subes cada parte y dejas tu entrega.',
  ],
  tasks: [
    {
      id: 'antes',
      title: 'Prepararte para un evento',
      when: 'Cuando te llega «Te asignaron un evento».',
      steps: [
        'Agenda → «Mis eventos» → el evento.',
        'Arriba, la fecha, la dirección, «Cómo se llega» y los «Contactos del sitio».',
        'Pestaña «Ficha»: de qué es y quién lo dirige.',
        'Pestaña «Storyboard»: el plan de Redes, para saber qué tomas hacen falta.',
      ],
      flow: 'entrega',
      tour: 'evento-grabacion',
    },
    {
      id: 'subir',
      title: 'Subir el material',
      when: 'El mismo día que grabas.',
      steps: [
        'Abre el evento: abre en la pestaña «Material».',
        'Cada parte en su casilla: lo del jefe hablando, el dron, las tomas de apoyo y lo demás, con el botón «Subir» de cada una.',
        'Sube el material ya limpio (sin tiempos ni tomas muertas), en el archivo original.',
        'Se sube por partes: si se va la señal, sigue sola cuando vuelve.',
      ],
      flow: 'entrega',
      tour: 'evento-grabacion-material',
    },
    {
      id: 'entrega',
      title: 'Dejar tu entrega',
      when: 'Después de subir.',
      steps: [
        'En «Entrega de Grabación», «Subir el storyboard (foto o PDF)» o «O escríbelo aquí» y «Guardar storyboard».',
        'En «Tu nota para el editor», qué toma sirve, qué falló y qué falta; después «Guardar nota».',
        'Sin hora, fecha, dirección ni teléfonos: la lee Redes. Si pones un teléfono, no se guarda.',
      ],
      flow: 'entrega',
      tour: 'evento-grabacion-material',
    },
    {
      id: 'realizado',
      title: 'Marcar realizado',
      when: 'Cuando el evento ya empezó.',
      steps: ['Abre el evento.', 'En la tarjeta de arriba, «Marcar realizado».', 'Su material pasa al registro por día.'],
      flow: 'evento',
    },
  ],
  sections: [
    {
      screen: '/hoy',
      menu: g('Hoy'),
      title: 'Hoy',
      tour: 'hoy-grabacion',
      what: 'Tu pantalla de inicio: lo que falta subir y tus eventos de hoy.',
      youDo: [
        '«Lo que espera por mí»: «Sube el material» en cada evento que ya pasó sin archivos.',
        'Los números: «Mis eventos» y «Material por subir».',
        '«Hoy en la agenda»: tus eventos de hoy, con su hora.',
      ],
    },
    {
      screen: '/agenda',
      menu: g('Agenda'),
      title: 'Mis eventos',
      tour: 'agenda-grabacion',
      what: 'Los eventos que te tocan grabar, con su fecha y su dirección.',
      youDo: ['Cada evento dice si ya tiene archivos subidos, «Falta el material» o «Cancelado».', 'Tocas uno para abrirlo.'],
    },
    eventSection('camera', g('Agenda')),
    {
      screen: '/eventos/[id]?tab=material',
      menu: g('Agenda'),
      title: 'Un evento: la pestaña Material',
      tour: 'evento-grabacion-material',
      what: 'Donde subes lo que grabaste y dejas tu entrega.',
      youDo: [
        'Arriba, el aviso: sube el material ya limpio, en el archivo original.',
        'Las casillas: cada una con su botón «Subir». Sigue sola si se va la señal.',
        '«Entrega de Grabación»: «Storyboard con el que se grabó» («Subir el storyboard (foto o PDF)» o «O escríbelo aquí», y «Guardar storyboard») y «Nota para el editor» («Tu nota para el editor» y «Guardar nota»).',
      ],
      cannot: ['Poner teléfonos en la nota: no se guarda. Una fecha o una hora te las marca antes.'],
    },
    ...messagesSections('camera'),
    ...everyoneSections('camera').filter((x) => x.menu === TOP),
    ...everyoneSections('camera').filter((x) => x.menu === ACCOUNT),
  ],
  flows: ['entrega', 'evento', 'obra', 'mensajes', 'ayuda'],
  faq: [
    { q: '¿Por qué no tengo el botón «Crear»?', a: 'Porque Grabación no crea eventos ni piezas: graba lo que te asignan y sube el material.' },
    { q: '¿Qué hago si se fue la señal subiendo?', a: 'Nada: la subida sigue sola cuando vuelve la señal. No cierres la app hasta que termine.' },
    { q: '¿Puedo ver los eventos de otro de Grabación?', a: 'No: solo ves los que te asignaron.' },
    { q: '¿Le puedo escribir a Redes un tiempo del video?', a: 'Sí. Si escribes un tiempo del video (los minutos y los segundos), la plataforma te pregunta si es del video: «Sí, es del video» o «Corregir». Una hora de la agenda no va.' },
  ],
};
