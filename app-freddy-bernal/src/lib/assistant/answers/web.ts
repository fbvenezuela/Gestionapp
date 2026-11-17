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
      'como publico algo en la web',
      'como publico la portada de la web',
      'como mando algo a aprobacion en la web',
      'como programo una nota en la web',
      'como devuelvo una noticia con un comentario',
      'como archivo algo de la web',
      'como subo una foto a la biblioteca de la web',
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
    ],
    a: 'No: tú no abres casos ni los atiendes, y no ves sus contactos ni sus cifras. Los atienden la coordinación y los responsables de área. Tú armas «Áreas y plazos» y lees el «Registro de atención».',
    go: '/admin/atencion/areas',
  },
  {
    id: 'web-jefe-que-hago',
    roles: ['boss'],
    q: ['que hago yo en la web', 'que hago yo en web', 'que hace el jefe en la web', 'que hace el jefe en web y en atencion', 'que hago yo en web y en atencion'],
    a: 'En «Web» haces lo mismo que quien aprueba la web: escribes, revisas, publicas, programas, devuelves con un comentario y archivas. El aviso de «Por aprobar» no te llega: lo ves en la lista. En «Atención» lees los casos, sin contactos ni denuncias, y miras las «Cifras».',
    go: '/admin/web',
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
