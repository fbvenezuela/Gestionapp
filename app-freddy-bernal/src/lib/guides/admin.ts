// Administración's own guide, apart from the team's (R3, D-43): /ayuda/administracion and docs/GUIA-ADMINISTRACION.md.
// The technical role: the settings, the team's accounts and 360's panel. It never reads Mensajes.
import { BOSS_GRANT_MESSAGE } from '../roles';
import type { AdminGuide } from './types';

export const ADMIN_GUIDE: AdminGuide = {
  mission:
    'Administración es el rol técnico: invita al equipo y le da sus roles, cuida los ajustes de la plataforma y el asistente 360. No decide, no aprueba y no escribe en la agenda.',
  sections: [
    {
      screen: '/ajustes/equipo',
      title: 'Equipo',
      what: 'Las personas del equipo, sus roles, su doble factor y sus sesiones. Cada persona tiene su usuario, aunque compartan el rol.',
      youDo: [
        '«Invitar a alguien»: el nombre, el correo y el rol, y «Enviar invitación». Le llega un correo y entra con un código.',
        '«Cambiar» los roles de una persona. Las casillas que no se pueden marcar dicen por qué.',
        '«Cerrar sus sesiones» si perdió el teléfono; «Reiniciar doble factor» para que lo active de nuevo.',
        '«Desactivar» a quien ya no trabaja (no se borra; «Activar» lo trae), y «Anular» una invitación sin aceptar.',
        'Cada rol del equipo que das le llega al jefe como aviso.',
      ],
      cannot: [
        'Darte tus propios roles: los da otra persona de administración.',
        'Ser también el jefe o el despacho en la misma cuenta: usa otra cuenta.',
        `Dar el rol de jefe: ${BOSS_GRANT_MESSAGE}`,
      ],
    },
    { screen: '/ajustes/categorias', title: 'Categorías', what: 'La lista de categorías del contenido (eventos, piezas y tweets).', youDo: ['Agregas, cambias el nombre o apagas una categoría.'] },
    { screen: '/ajustes/formulas', title: 'Fórmulas de copies', what: 'Las fórmulas con las que se escriben los copies (FAB, PAS, AIDA y las que agregues).', youDo: ['Agregas o corriges una fórmula; Redes la elige en cada pieza.'] },
    { screen: '/ajustes/horarios', title: 'Horarios de tweets', what: 'Las franjas del día y cuántos tweets salen por día, para repartir la tanda de la semana.', youDo: ['Cambias las franjas y el número por día.'] },
    { screen: '/ajustes/redes', title: 'Reglas por red', what: 'La duración, las medidas y el peso de video de cada red, con los que se revisa una publicación.', youDo: ['Cambias el número de una red cuando la red cambia sus reglas.'] },
    { screen: '/ajustes/marca', title: 'Marca', what: 'El nombre, los colores, los logos, el saludo, los cierres y los hashtags.', youDo: ['Cambias los textos de la marca que usan los copies.'] },
    {
      title: 'Google Drive',
      what: 'Dónde se guardan los videos, la conexión y una prueba. Solo sale en Ajustes cuando el material va a Drive.',
      youDo: ['Conectas la cuenta de Drive del cliente y pruebas que sube y baja.'],
    },
    {
      screen: '/ajustes/asistente',
      title: 'Asistente',
      what: 'Lo que sabe 360, cómo contesta y cómo le va.',
      youDo: [
        'Las pestañas: «Lo que sabe», «Cómo contesta», «Conversaciones», «Cómo va», «Lo que preguntan», «Por confirmar», «Lo que hizo» y «Ajustes».',
        'En «Conversaciones» lees lo que el equipo le pregunta a 360: tú sí lees esas conversaciones, y el panel de 360 se lo dice a cada persona.',
        'En «Por confirmar», los avisos que preparó 360 y que tú confirmas o descartas.',
        'Una pregunta a 360 sobre lo que dice un mensaje del equipo se guarda sin el texto.',
      ],
    },
    { screen: '/ajustes/buzon', title: 'Buzón de correos', what: 'Todos los correos que generó la plataforma. Mientras se prueba, ninguno sale: quedan aquí.', youDo: ['Revisas que el correo diga lo que tiene que decir, sin fecha ni hora de la agenda.'] },
    {
      screen: '/ajustes/registro',
      title: 'Registro de cambios',
      what: 'Quién cambió qué y cuándo, en toda la plataforma.',
      youDo: ['Buscas un cambio por tipo o por persona.', 'De Mensajes sale solo que hubo un mensaje, quién y cuándo: nunca el texto, el nombre del grupo ni quiénes son.'],
    },
    {
      title: 'Ver como',
      what: 'Para ver los menús de otro rol, arriba (en el teléfono, dentro de «Mi cuenta»). Tus permisos no cambian.',
      youDo: ['Eliges un rol o «Mi vista». Mientras miras, sale una franja que lo dice.', 'Los tutoriales también siguen «Ver como»; Mensajes no.'],
    },
    {
      screen: '/aprobar',
      title: 'Por aprobar',
      what: 'Ves lo que espera al jefe, pero no apruebas: todo lo aprueba el jefe.',
      youDo: ['En una pieza: «Cambiar nivel», comentar, o «Pedir frase al jefe» si hace falta su voz («Anotar pedido de frase»).'],
    },
    {
      screen: '/agenda',
      title: 'La agenda y las fichas',
      what: 'Lees la agenda, «Por ponerle fecha», las obras y los municipios.',
      youDo: ['Puedes crear y completar fichas de obra.', 'En el material de un evento, «Quitar» un archivo que no va.'],
      cannot: ['Crear eventos, ponerles fecha o decidirlos: eso es del jefe y del despacho.', 'Ver los contactos ni los documentos de un reporte comunitario.'],
    },
  ],
  notes: [
    'Mensajes no es para administración: no lees las conversaciones del equipo, y una cuenta con administración no entra a Mensajes aunque tenga otro rol.',
    'El rol de jefe no se da desde Equipo: se da con el comando de instalación (npm run db:first-admin con la opción --jefe). Cada rol del equipo que das le llega al jefe como aviso.',
    'Las guías del equipo no hablan de administración: esta guía es aparte.',
    'Nada sale hacia afuera mientras se prueba: los correos quedan en el «Buzón de correos» y nada se publica solo.',
  ],
  faq: [
    { q: 'Alguien perdió el teléfono, ¿qué hago?', a: 'En Equipo, «Cerrar sus sesiones» y «Reiniciar doble factor». La próxima vez que entre, lo activa de nuevo.' },
    { q: '¿Por qué no puedo marcar «Jefe» en Equipo?', a: BOSS_GRANT_MESSAGE + ' Así nadie arma otra cuenta que apruebe o lea todos los mensajes.' },
    { q: '¿Puedo leer los mensajes del equipo?', a: 'No. Mensajes no tiene entrada para administración, ni con «Ver como», ni en el registro de cambios.' },
    { q: '¿Qué ve el equipo de lo que hago?', a: 'Cada rol que das le llega al jefe como aviso. Las personas saben que lees lo que le preguntan a 360: el panel de 360 lo dice.' },
  ],
};
