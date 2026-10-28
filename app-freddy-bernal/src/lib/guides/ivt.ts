// The IVT's guide (R3, design §7.2, §7.3): each obra ready before the boss's visit.
import type { RoleGuide } from './types';
import { ACCOUNT, OFF_MENU, TOP, accountFor, eventSection, everyoneSections, menuGroup, messagesSections, obrasSections } from './sections';

const g = (label: string) => menuGroup('ivt', label);

export const IVT_GUIDE: RoleGuide = {
  role: 'ivt',
  slug: 'ivt',
  label: 'IVT',
  account: accountFor('ivt', '/obras', true),
  job: {
    mission: 'Preparas cada obra antes de la visita del jefe: la ficha completa, las fotos y lo que el jefe va a decir.',
    responsibilities: [
      'Cargar la ficha de cada obra completa, con cada cifra y su fuente.',
      'Subir las fotos del antes y del avance, y los documentos de la obra.',
      'Armar el diálogo FAB con «Generar diálogo FAB», sin inventar cifras, y revisarlo.',
      'Mandarla con «Guardar y avisar al jefe» cuando está completa.',
      'Seguir tus visitas en «Mis visitas de obra».',
      'Mantener la ficha al día: «Editar», «Archivar» y la historia.',
    ],
    never: [
      'Inventar una cifra: si no la sabes, «Por confirmar».',
      'Poner teléfonos fuera de los contactos de la ficha.',
      'Escribir la fecha de la visita en un mensaje donde está Redes o política.',
    ],
    worksWith: [
      { role: 'boss', what: 'Visita tus obras y lee el diálogo FAB que armaste. Junto con el despacho, le pone fecha a la visita.' },
      { role: 'dispatch', what: 'Le pone fecha a tus fichas y arma la visita en la agenda.' },
      { role: 'social', what: 'Usa tu ficha para el storyboard y los copies («Usar como discurso»), sin ver los contactos ni los documentos.' },
    ],
    rhythm: [
      'Antes de cada visita: la ficha completa, las fotos y el diálogo FAB.',
      'Cuando una ficha ya tiene fecha: «Mis visitas de obra».',
      'Después de la visita: las fotos del avance y una nota en la historia.',
    ],
  },
  day: [
    'Abres la plataforma y caes en Obras.',
    'Revisas tus «Borradores» y los completas.',
    'En cada ficha, las fotos y el diálogo FAB.',
    'Lo que está completo, «Guardar y avisar al jefe».',
    'En la Agenda, «Mis visitas de obra»: las que ya tienen fecha.',
  ],
  tasks: [
    {
      id: 'nueva-obra',
      title: 'Cargar una ficha de obra',
      when: 'Antes de cada visita.',
      steps: [
        'Obras → «Nueva ficha de obra» (o «Crear» → «Ficha de obra»).',
        'Llena los cinco grupos con respuestas breves. Lo que no va, «No aplica»; lo que falta saber, «Por confirmar».',
        'Los teléfonos solo van en los contactos.',
        'Si te falta algo, «Guardar borrador».',
        'Con todo respondido, «Guardar y avisar al jefe»: al jefe y al despacho les llega «Por ponerle fecha».',
      ],
      flow: 'obra',
      tour: 'nueva-obra',
    },
    {
      id: 'fotos',
      title: 'Subir las fotos y los documentos',
      when: 'Apenas guardas la ficha, y después de cada avance.',
      steps: ['Abre la ficha.', '«Subir fotos del antes», «Subir fotos del avance» y «Subir documentos».', 'Se suben por partes: si se va la señal, siguen solas cuando vuelve.'],
      flow: 'obra',
      tour: 'ficha-obra',
    },
    {
      id: 'fab',
      title: 'Armar lo que va a decir el jefe',
      when: 'Cuando la ficha tiene «Sobre la obra» y «Avance y entrega».',
      steps: [
        'En la ficha, «Lo que voy a decir» → «Generar diálogo FAB».',
        'Lee «Lo que la ficha no tiene (no se dice):»: eso no sale en el texto.',
        'Corrige lo que haga falta y toca «Guardar».',
        'Pruébalo en «Modo lectura».',
      ],
      flow: 'obra',
      tour: 'ficha-obra',
    },
    {
      id: 'visitas',
      title: 'Seguir tus visitas',
      when: 'Cuando la ficha ya tiene fecha.',
      steps: [
        'Agenda → «Mis visitas de obra».',
        'Con el doble factor ves la fecha, la hora y la dirección de cada visita.',
        'Si la cancelan o el jefe la rechaza, te avisamos y la ficha vuelve a «Por ponerle fecha».',
      ],
      flow: 'obra',
      tour: 'agenda-ivt',
    },
    {
      id: 'mantener',
      title: 'Mantener la ficha al día',
      when: 'Cuando algo cambia en la obra.',
      steps: ['«Editar» para corregir.', '«Archivar» si ya no va, con su motivo; «Sacar del archivo» si vuelve.', 'En «Historia», «Agregar una nota» y «Guardar nota».'],
      flow: 'obra',
    },
  ],
  sections: [
    ...obrasSections('ivt', g('Obras')),
    {
      screen: '/agenda',
      menu: g('Agenda'),
      title: 'Mis visitas de obra',
      tour: 'agenda-ivt',
      what: 'Las visitas del jefe a tus obras. La fecha la ponen el jefe o el despacho.',
      youDo: [
        'Con el doble factor ves la fecha y la dirección; sin él dice «La fecha se ve con el doble factor: entra con tu código.»',
        'Cada visita dice cómo va: la decisión del jefe o «Cancelada». Si el jefe la rechazó, dice «Sin fecha: el jefe la rechazó».',
        'Tocas una para ver la visita.',
      ],
    },
    eventSection('ivt', g('Agenda')),
    ...messagesSections('ivt'),
    ...everyoneSections('ivt').filter((x) => x.menu === TOP),
    ...everyoneSections('ivt').filter((x) => x.menu === ACCOUNT),
    {
      screen: '/hoy',
      menu: OFF_MENU,
      title: 'Hoy',
      what: 'Una versión corta: cuántas fichas tienes en borrador y por ponerle fecha. Tu inicio es Obras.',
      youDo: ['«Ver obras» te lleva a tu pantalla.'],
    },
  ],
  flows: ['obra', 'mensajes', 'ayuda'],
  faq: [
    { q: '¿Por qué no puedo ponerle fecha a mi obra?', a: 'Porque la fecha de la visita la ponen el jefe o el despacho. Tú ves la fecha de tus visitas con el doble factor.' },
    { q: '¿Qué ve Redes de mi ficha?', a: 'Ve la ficha de la obra en la pestaña del evento, cuando ya tiene fecha, sin los contactos ni los documentos.' },
    { q: '¿El diálogo FAB inventa datos?', a: 'No: usa solo las cifras de la ficha. Lo que la ficha no tiene, lo dice aparte y no sale en el texto.' },
    { q: '¿Qué pasa si se va la señal mientras subo fotos?', a: 'La subida sigue sola cuando vuelve. Lo que escribiste queda guardado en el teléfono hasta que guardes con señal.' },
  ],
};
