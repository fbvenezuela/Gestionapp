// Política's guide (R3, design §7.2, §7.3): the record of each municipality and what the community asks for.
import type { RoleGuide } from './types';
import { ACCOUNT, OFF_MENU, TOP, accountFor, eventSection, everyoneSections, menuGroup, messagesSections, municipiosSections } from './sections';

const g = (label: string) => menuGroup('politics', label);

export const POLITICS_GUIDE: RoleGuide = {
  role: 'politics',
  slug: 'politica',
  label: 'Política',
  account: accountFor('politics', '/municipios', true),
  job: {
    mission: 'Llevas el registro de cada municipio y de lo que pide la comunidad, y decides qué va a la agenda del jefe.',
    responsibilities: [
      'Cargar una ficha comunitaria completa por cada actividad o situación.',
      'Decidir si va a la agenda del jefe («¿Va a la agenda del jefe?»).',
      'Hacer el seguimiento: el estado con su motivo, las notas y las evidencias.',
      'Atender primero lo vencido: lo que pasó su fecha de seguimiento sin terminar.',
      'Subir las fotos del antes y del después, y los documentos del reporte.',
    ],
    never: [
      'Pedir ni escribir la fecha o la hora de la agenda del jefe: no son para política.',
      'Poner teléfonos o nombres de quien reporta en las notas: van en «Persona que reporta», con el doble factor.',
    ],
    worksWith: [
      { role: 'boss', what: 'Le mandas lo que va a su agenda con «Guardar y avisar al jefe». Lo vencido sale también en su Inicio.' },
      { role: 'dispatch', what: 'Le pone fecha a tu reporte junto con el jefe. Tú solo ves que ya la tiene.' },
    ],
    rhythm: [
      'Cada día: «Vencidas en los municipios», lo primero.',
      'Después de cada visita o llamada: el estado y una nota en la ficha.',
      'Cuando llega algo nuevo de la comunidad: la ficha ese mismo día.',
    ],
  },
  day: [
    'Abres la plataforma y caes en Municipios.',
    'Arriba, «Vencidas en los municipios»: abres cada una y le das seguimiento.',
    'En la ficha, «Cambiar estado» con su motivo, o «Agregar una nota».',
    'Lo nuevo, con «Nueva ficha comunitaria».',
    'Si va a la agenda del jefe, «Guardar y avisar al jefe».',
  ],
  tasks: [
    {
      id: 'nueva-ficha',
      title: 'Cargar una ficha comunitaria',
      when: 'Cuando llega algo nuevo de la comunidad.',
      steps: [
        '«Nueva ficha comunitaria» en Municipios (o desde un municipio, que ya lo trae puesto, o «Crear» → «Ficha comunitaria»).',
        'Llena los diez grupos. Lo que no va, «No aplica»; lo que falta saber, «Por confirmar».',
        '«¿Va a la agenda del jefe?»: prendido si es algo para la agenda (sale prendido si el tipo es un evento).',
        'Toca «Guardar y avisar al jefe» (o «Guardar» si no va a la agenda).',
        'Ya guardada, en «Evidencias»: «Subir fotos del antes», «Subir fotos del después» y «Subir documentos».',
      ],
      flow: 'comunitario',
      tour: 'nueva-comunitaria',
    },
    {
      id: 'seguimiento',
      title: 'Darle seguimiento a una ficha',
      when: 'Después de cada visita o noticia.',
      steps: [
        'Abre la ficha desde Municipios.',
        'En «Estado», elige el «Nuevo estado», escribe el «Motivo o avance (opcional)» y toca «Cambiar estado».',
        'O en «Historia», «Agregar una nota» y «Guardar nota», sin teléfonos.',
        'Cada cambio queda en la historia, que solo se agrega: no se borra.',
      ],
      flow: 'comunitario',
      tour: 'ficha-comunitaria',
    },
    {
      id: 'vencidas',
      title: 'Atender lo vencido',
      when: 'Cada día, lo primero.',
      steps: ['Municipios → «Vencidas en los municipios», o el filtro «Solo las vencidas» y «Filtrar».', 'Abre cada una y cambia su estado o agrega una nota.'],
      flow: 'comunitario',
      tour: 'municipios',
    },
    {
      id: 'saber-fecha',
      title: 'Saber si tu reporte ya está en la agenda',
      when: 'Después de «Guardar y avisar al jefe».',
      steps: [
        'Abre la ficha: en «Agenda del jefe» dice si va y si ya tiene fecha.',
        'Cuando la tiene, te llega el aviso y la ficha dice «Ya tiene fecha. La ven el jefe y el despacho en la agenda.» La fecha nunca se muestra.',
        'Si se cancela o el jefe la rechaza, la ficha vuelve a «Por ponerle fecha» y te avisamos.',
      ],
      flow: 'comunitario',
    },
  ],
  sections: [
    ...municipiosSections('politics', g('Municipios')),
    eventSection('politics', g('Municipios')),
    ...messagesSections('politics'),
    ...everyoneSections('politics').filter((x) => x.menu === TOP),
    ...everyoneSections('politics').filter((x) => x.menu === ACCOUNT),
    {
      screen: '/hoy',
      menu: OFF_MENU,
      title: 'Hoy',
      what: 'Una versión corta de tu inicio: lo vencido y un botón a los municipios. Tu inicio es Municipios.',
      youDo: ['«Vencidas en los municipios».', '«Ver municipios» te lleva a tu pantalla.'],
    },
  ],
  flows: ['comunitario', 'mensajes', 'ayuda'],
  faq: [
    { q: '¿Por qué no veo la fecha de mi actividad?', a: 'Porque la fecha de la agenda del jefe es información de seguridad. Solo ves que ya la tiene; la ven el jefe y el despacho.' },
    { q: '¿Quién ve los documentos del reporte?', a: 'Solo política, el jefe y el despacho. Redes y Grabación nunca ven un reporte.' },
    { q: '¿Puedo borrar una nota?', a: 'No: la historia solo se agrega. Si te equivocaste, agrega otra nota que lo corrija.' },
    { q: '¿Qué es una ficha vencida?', a: 'Una que pasó su fecha de seguimiento y no está finalizada ni suspendida. Sale arriba en Municipios y en el Inicio del jefe.' },
  ],
};
