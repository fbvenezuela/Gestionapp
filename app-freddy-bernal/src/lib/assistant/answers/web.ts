import type { Answer } from './types';

// What the boss and Administración do and never do in «Web» and in «Atención» (WF-C, design §4(d)): the scope of each
// one, as the screens let them (roles.ts, deskAccess(), the database's gates). The rest of the web's and Atención's
// guide comes from its own sections (src/lib/guides/web, engine.ts webEntries). A role that cannot do something is told
// «No» and who does it, also when it asks how («¿cómo publico la portada?»), never the steps.
export const WEB: Answer[] = [
  {
    id: 'web-admin-que-hago',
    roles: ['admin'],
    q: ['que hago yo en web', 'que hago yo en la web', 'que hace administracion en la web', 'para que entro yo a la web', 'que puedo hacer en la web', 'mi trabajo en la web'],
    a: 'En «Web», tú lees todo, borradores incluidos, y cambias «Ajustes del sitio» y «Redirecciones»: tu «Web» abre directo los ajustes. Nunca escribes ni publicas contenido: eso es del editor y del aprobador de la web, y del jefe.',
    go: '/admin/web/ajustes',
  },
  {
    id: 'web-admin-no-escribe',
    roles: ['admin'],
    q: [
      'como creo una noticia nueva',
      'como escribo una noticia en la web',
      'como publico la portada de la web',
      'como mando algo a aprobacion en la web',
      'como programo una nota en la web',
      'como devuelvo una noticia con un comentario',
      'puedo publicar en la web',
      'puedo escribir una noticia en la web',
      'puedo aprobar lo de la web',
      'puedo archivar algo de la web',
    ],
    a: 'No: en la web tú no escribes ni publicas. Escriben el editor de la web y el jefe; publica, programa, devuelve o archiva quien aprueba la web, o el jefe. Tú lees todo, borradores incluidos, y cambias «Ajustes del sitio» y «Redirecciones».',
    go: '/admin/web/ajustes',
  },
  {
    id: 'atencion-admin-que-hago',
    roles: ['admin'],
    q: ['que hago yo en atencion', 'y en atencion yo que hago', 'que hace administracion en atencion', 'para que entro yo a atencion', 'mi trabajo en atencion'],
    a: 'En «Atención», tú armas «Áreas y plazos»: las áreas, quién está en cada una, el área y los días de cada categoría y los plazos. También lees el «Registro de atención». Nunca abres un caso ni ves el contacto de nadie.',
    go: '/admin/atencion/areas',
  },
  {
    id: 'atencion-admin-no-casos',
    roles: ['admin'],
    q: [
      'como abro un caso de atencion',
      'como respondo una solicitud',
      'como asigno un caso',
      'como cambio el estado de un caso',
      'como veo el contacto de una persona',
      'puedo abrir un caso',
      'puedo responder una solicitud',
      'puedo ver las solicitudes de la gente',
      'puedo exportar las solicitudes',
      'puedo ver las cifras de atencion',
      'quien exporta la lista de solicitudes',
    ],
    a: 'No: tú no abres casos ni los atiendes, y no ves sus contactos ni sus cifras. Los atienden la coordinación y los responsables de área; exportar es de la coordinación y de auditoría. Tú armas «Áreas y plazos» y lees el «Registro de atención».',
    go: '/admin/atencion/areas',
  },
  {
    id: 'web-jefe-que-hago',
    roles: ['boss'],
    q: ['que hago yo en la web', 'que hago yo en web', 'que hace el jefe en la web', 'que hago yo en la web y en atencion'],
    a: 'En «Web» haces lo mismo que quien aprueba la web: escribes, revisas, publicas, programas, devuelves con un comentario y archivas. El aviso de «Por aprobar» no te llega: lo ves en la lista. En «Atención» lees los casos, sin contactos ni denuncias, y miras las «Cifras».',
    go: '/admin/web',
  },
  {
    id: 'web-jefe-publicar',
    roles: ['boss'],
    q: [
      'como publico una noticia en la web',
      'como se publica una noticia en la web',
      'como subo una noticia a la web',
      'como pongo una noticia en la web',
      'como hago una noticia para la web',
      'como escribo una noticia en la web',
      'como creo una noticia en la web',
      'como publico un comunicado en la web',
    ],
    a: 'En «Web», el tipo de contenido (por ejemplo «Noticias y comunicados») → «Nueva noticia» → escribe el «Título» → «Crear borrador». Escribes y tocas «Guardar borrador»; con «Vista previa» la ves como saldrá. Como tú apruebas, tocas «Revisar y publicar» y en «Decidir» eliges «Publicar ahora» o «Programar» (con día y hora de Venezuela).',
    go: '/admin/web',
  },
  {
    id: 'atencion-quien-ve-contacto',
    roles: ['boss', 'admin'],
    q: [
      'quien ve el contacto de la persona',
      'quien ve el contacto de una persona en un caso',
      'quien puede ver el contacto de un caso',
      'quien ve los contactos en atencion',
      'quien ve los datos de la gente que escribe por la web',
      'quien ve el telefono de la persona que reporto',
      'quien ve el correo de la persona que escribio por la web',
      'puedo ver el contacto de la persona',
    ],
    a: 'El contacto de la persona lo ven solo quienes atienden su caso: la coordinación, el responsable de su área o a quien se lo asignen y, si es una denuncia, el operador de denuncias. Al verlo queda registrado quién lo miró y cuándo. Tú no lo ves, y auditoría tampoco.',
  },
  // Where the two guides are, for whoever has them (a team role hears the fixed line of local.ts, step D2).
  {
    id: 'web-guia',
    roles: ['boss', 'admin'],
    q: ['web y atencion tienen su guia', 'la web tiene guia', 'hay una guia de la web', 'hay guia de la web', 'tiene manual la web', 'la web tiene su propia guia'],
    a: 'Sí: la web pública y la atención a la gente que escribe por ella tienen su propia guía, aparte de la tuya: la «Guía de la web» y la «Guía de atención ciudadana», en «Ayuda y guías».',
    go: '/ayuda/web',
  },
  {
    id: 'atencion-guia',
    roles: ['boss', 'admin'],
    q: ['hay una guia de atencion', 'hay guia de atencion', 'atencion tiene guia', 'atencion tiene su propia guia'],
    a: 'Sí: la atención a la gente que escribe por la web y la web pública tienen su propia guía, aparte de la tuya: la «Guía de atención ciudadana» y la «Guía de la web», en «Ayuda y guías».',
    go: '/ayuda/atencion',
  },
  // The web's and the desk's roles have no search box at the top (the panel's layout): it finds the team's work.
  {
    id: 'web-roles-sin-buscador',
    roles: ['boss', 'admin'],
    q: [
      'por que a los de la web no les sirve el buscador de arriba',
      'por que el buscador de arriba no les sirve a los de la web',
      'los de la web tienen el buscador de arriba',
      'por que los de atencion no tienen el buscador',
      'por que no le sale el buscador a los de la web',
    ],
    a: 'No: las personas de la web y de la atención no tienen el buscador de arriba. Busca lo del equipo, y ellas solo tienen «Web» o «Atención» en el menú; lo usan el equipo y Administración.',
  },
  // The chips of «Redirecciones» (APP-13): where each one came from.
  {
    id: 'web-redirecciones-origen',
    roles: ['boss', 'admin'],
    // (Asked by the chips named whole: «¿qué es una redirección?» is the guide's section, «una versión vieja» another.)
    q: [
      'que significa «De la web vieja»',
      'que quiere decir «De la web vieja»',
      'que diferencia hay entre «De la web vieja» y «A mano»',
      'que es «De la web vieja» y «A mano»',
      'por que unas dicen «De la web vieja» y otras «A mano»',
    ],
    a: 'En «Redirecciones», cada una dice de dónde viene: las «De la web vieja» se hicieron solas al traer lo de la web anterior, y las «A mano» las hizo alguien del equipo.',
    go: '/admin/web/redirecciones',
  },
  // The lines of «Registro de atención» that name no one (APP-12): the web or the app.
  {
    id: 'atencion-registro-la-web-la-app',
    roles: ['admin'],
    q: [
      'en el registro hay lineas que no dicen nombre sino la web o la app',
      'que es la web en el registro de atencion',
      'que significa la app en el registro de atencion',
      'por que el registro dice la web',
      'por que el registro dice la app',
      'quien es la web en el registro',
      'lineas del registro que dicen la web o la app',
    ],
    a: 'En «Registro de atención», una línea que empieza con «La web» es lo que una persona hizo desde la web: una solicitud nueva, un apoyo, un mensaje o un archivo suyo. Una que empieza con «La app» es algo que la app hizo sola, como las respuestas guardadas que trae o la revisión de un archivo.',
    go: '/admin/atencion/registro',
  },
  // The saved replies that come with the app speak to the person as «usted» (APP-21).
  {
    id: 'atencion-respuestas-de-usted',
    roles: ['boss', 'admin'],
    q: [
      'las respuestas guardadas que trae la app estan de tu o de usted',
      'las respuestas guardadas estan de usted',
      'las respuestas guardadas le hablan de tu a la persona',
      'hay que cambiar las respuestas guardadas a usted',
    ],
    a: 'Las respuestas guardadas que trae la app ya le hablan de usted a la persona, como todo lo que ella lee: no hay que cambiarlas. Las arma y las cambia la coordinación, en «Respuestas guardadas».',
  },
  // Administración and the roles of the web and the desk in one account (guard_role_mix: only the web's editor).
  {
    id: 'admin-rol-atencion-misma-cuenta',
    roles: ['admin'],
    q: [
      'puedo ser yo coordinadora de atencion con mi misma cuenta',
      'puedo tener un rol de atencion en mi cuenta',
      'puedo ser aprobador de la web con mi cuenta',
      'administracion puede tener un rol de la web o de atencion',
    ],
    a: 'No: en la misma cuenta, administración no puede tener un rol de atención ni ser aprobador de la web; de los roles de la web, solo puede ser editor. Para lo demás hace falta otra cuenta.',
  },
  // What the receipt is, without a code or a key (they are never said: design §4(e)).
  {
    id: 'atencion-comprobante',
    roles: ['boss', 'admin'],
    q: ['que es el comprobante', 'que es el comprobante de una solicitud', 'que trae el comprobante', 'para que sirve el comprobante', 'que recibe la persona cuando manda una solicitud'],
    a: 'El comprobante es lo que recibe la persona al enviar: un «Código» y una «Clave». Con los dos consulta su solicitud en «Consultar mi solicitud». La clave se muestra una sola vez y no se puede recuperar. Yo no doy ni pido códigos ni claves, tampoco los de prueba.',
  },
  // A person of the web or the desk on a screen that is not of their role (requireRole sends them home).
  {
    id: 'web-pantalla-de-otro-rol',
    roles: ['boss', 'admin'],
    q: [
      'si alguien de la web abre una pantalla que no es de su rol puede hacer cosas ahi',
      'que pasa si alguien de la web abre una pantalla que no es suya',
      'los de la web pueden entrar a otras pantallas',
      'si el editor de la web abre una pantalla que no es de su rol',
      'los de atencion pueden ver otras pantallas',
    ],
    a: 'No: si alguien de la web o de la atención abre una pantalla que no es de su rol, la app lo lleva a su inicio. Cada uno solo hace lo que le toca a su rol, aunque abra una pantalla por su dirección.',
  },
  {
    id: 'atencion-jefe-solo-lee',
    roles: ['boss'],
    q: [
      'como respondo una solicitud',
      'como le respondo a la persona que escribio',
      'como asigno un caso',
      'como cambio el estado de un caso',
      'como paso un caso a resuelto',
      'como publico un caso en casos atendidos',
      'como exporto la lista de solicitudes',
      'puedo responder una solicitud',
      'puedo asignar un caso',
      'puedo cambiar el estado de un caso',
      'puedo exportar la lista de solicitudes',
      'puedo ver el telefono de quien reporto',
      'puedo leer las denuncias',
    ],
    a: 'No: en Atención tú solo lees. Ves los casos, sin sus contactos y sin las denuncias (cuentan solo en los totales), y las «Cifras». Responden, asignan, cambian estados y publican en «Casos atendidos» la coordinación y los responsables de área; exportar es de la coordinación y de auditoría.',
    go: '/admin/atencion',
  },
];
