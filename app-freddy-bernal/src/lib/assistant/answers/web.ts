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
      'puedo exportar la lista de solicitudes',
      'puedo ver las cifras de atencion',
    ],
    a: 'No: tú no abres casos ni los atiendes, y no ves sus contactos ni sus cifras. Los atienden la coordinación y los responsables de área; exportar es de la coordinación y de auditoría. Tú armas «Áreas y plazos» y lees el «Registro de atención».',
    go: '/admin/atencion/areas',
  },
  {
    id: 'web-jefe-que-hago',
    roles: ['boss'],
    q: ['que hago yo en la web', 'que hago yo en web', 'que hago yo en el menu web', 'que hace el jefe en la web', 'que hago yo en la web y en atencion'],
    a: 'En «Web» haces lo mismo que quien aprueba la web: escribes, revisas, publicas, programas, devuelves con un comentario y archivas. El aviso de «Por aprobar» no te llega: lo ves en la lista. En «Atención» lees como auditoría: los casos menos las denuncias, sin contactos, y las «Cifras»; no exportas.',
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
      'puedo ver el telefono de la persona que mando una solicitud',
    ],
    a: 'El contacto de la persona lo ven solo quienes atienden su caso: la coordinación, el responsable de su área o a quien se lo asignen y, si es una denuncia, el operador de denuncias. La tarjeta avisa: «El contacto está cifrado. Al verlo queda registrado quién lo miró y cuándo.». Tú no lo ves, y auditoría tampoco.',
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
      'si un editor se mete en una pantalla de otro rol puede tocar todo',
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
    ],
    a: 'No: en Atención tú solo lees. Ves los casos, sin sus contactos y sin las denuncias (cuentan solo en los totales), y las «Cifras». Responden, asignan, cambian estados y publican en «Casos atendidos» la coordinación y los responsables de área; exportar es de la coordinación y de auditoría.',
    go: '/admin/atencion',
  },
  // ── The long tail of «Web» (WF-C, design §4(a)): what the boss and Administración ask that the guide's sections do not
  // answer by themselves. Written from docs/MANUAL-ADMIN-WEB.md and docs/GUIA-WEB.md parts 1, 3 and 4 (src/lib/guides/web):
  // what the guide does not say, an answer does not say either. The boss does what the web's approver does;
  // Administración reads everything and changes «Ajustes del sitio» and «Redirecciones», and never writes or publishes.
  // No client word: the program, the paper's full name and the official site are named the generic way.
  // Who does what in «Web» (GUIA-WEB 4, MANUAL-ADMIN-WEB 1).
  {
    id: 'web-roles',
    roles: ['boss', 'admin'],
    q: ['que roles hay para la web', 'que hacen el editor y el aprobador de la web', 'cuales son los roles de la web', 'que diferencia hay entre el editor y el aprobador de la web'],
    a: {
      boss: 'Dos: el «Editor de la web» escribe y envía a aprobación, pero nunca publica; el «Aprobador de la web» revisa, publica, programa, devuelve con un comentario y archiva, y cambia «Ajustes del sitio» y «Redirecciones». Tú haces lo mismo que el aprobador. Los roles los da Administración en «Ajustes» → «Equipo».',
      admin: 'Dos: el «Editor de la web» escribe y envía a aprobación, pero nunca publica; el «Aprobador de la web» revisa, publica, programa, devuelve con un comentario y archiva, y cambia «Ajustes del sitio» y «Redirecciones». El jefe hace lo mismo que el aprobador. Los roles los das tú en «Ajustes» → «Equipo».',
    },
  },
  {
    id: 'web-quien-hace-que',
    roles: ['boss', 'admin'],
    q: ['quien hace que en la web', 'quien escribe y quien publica en la web', 'quien publica en la web', 'quien escribe lo de la web'],
    a: {
      boss: 'El editor de la web escribe y envía a aprobación, y nunca publica. El aprobador de la web y tú (haces lo mismo que el aprobador) revisan y deciden: publicar, programar, devolver con un comentario o archivar. Administración lee todo, borradores incluidos, y cambia «Ajustes del sitio» y «Redirecciones», pero nunca escribe ni publica.',
      admin: 'El editor de la web escribe y envía a aprobación, y nunca publica. El aprobador de la web y el jefe revisan y deciden: publicar, programar, devolver con un comentario o archivar. Tú lees todo, borradores incluidos, y cambias «Ajustes del sitio» y «Redirecciones», pero nunca escribes ni publicas.',
    },
  },
  {
    id: 'web-editor-que-hace',
    roles: ['boss', 'admin'],
    q: ['que hace el editor de la web', 'que puede hacer el editor de la web', 'que no hace el editor de la web'],
    a: 'Escribe: crea el borrador («Nueva noticia» → «Crear borrador»), lo guarda con «Guardar borrador», sube fotos y PDF a la «Biblioteca» con su «Texto alternativo», mira la «Vista previa» y toca «Enviar a aprobación». Nunca publica, no entra a «Ajustes del sitio» ni a «Redirecciones» y no ve las solicitudes de la gente.',
  },
  {
    id: 'web-aprobador-que-hace',
    roles: ['boss', 'admin'],
    q: ['que hace el aprobador de la web', 'que puede hacer el aprobador de la web', 'que hace quien aprueba la web', 'y el aprobador que hace'],
    a: {
      boss: 'Todo lo del editor y, además, decide en «Por aprobar»: mira «Qué cambia si lo publicas» y toca «Publicar ahora», «Programar» o «Devolver con comentario». También archiva y desarchiva, cambia la dirección de lo ya publicado, «Ajustes del sitio» y «Redirecciones». Le llega el aviso «Hay contenido de la web por aprobar». Tú haces lo mismo, sin ese aviso.',
      admin: 'Todo lo del editor y, además, decide en «Por aprobar»: mira «Qué cambia si lo publicas» y toca «Publicar ahora», «Programar» o «Devolver con comentario». También archiva y desarchiva, cambia la dirección de lo ya publicado, «Ajustes del sitio» y «Redirecciones». Le llega el aviso «Hay contenido de la web por aprobar».',
    },
  },
  // Publishing, scheduling, returning and archiving (MANUAL-ADMIN-WEB 8 to 11 and 16).
  {
    id: 'web-publica-sola',
    roles: ['boss', 'admin'],
    q: ['la web publica sola', 'se publica solo lo que escribo en la web', 'algo sale en la web sin que lo aprueben', 'la web saca las noticias sola', 'lo que guarda el editor sale en la web'],
    a: {
      boss: 'No: nada sale sin que alguien lo publique, y guardar un borrador nunca cambia la web. Lo programado sí sale solo: tú o el aprobador lo dejan en «Programar», con «Día» y «Hora» de Venezuela, y a esa hora aparece. Al momento y sin aprobación solo sale lo que se guarda en «Ajustes del sitio».',
      admin: 'No: nada sale sin que alguien lo publique, y guardar un borrador nunca cambia la web. Lo programado sí sale solo: el aprobador o el jefe lo dejan en «Programar», con «Día» y «Hora» de Venezuela, y a esa hora aparece. Al momento y sin aprobación solo sale lo que se guarda en «Ajustes del sitio».',
    },
  },
  {
    id: 'web-borrar',
    roles: ['boss', 'admin'],
    q: ['se puede borrar una noticia de la web', 'como borro una noticia de la web', 'como elimino algo de la web', 'por que no se puede borrar en la web', 'hay boton de borrar en la web'],
    a: {
      boss: 'No: en la web nada se borra, lo que sobra se archiva. «Archivar» lo saca de la web al momento, y su historia y lo aprobado se quedan; «Desarchivar» lo vuelve a poner. Archivan el aprobador de la web y tú.',
      admin: 'No: en la web nada se borra, lo que sobra se archiva. «Archivar» lo saca de la web al momento, y su historia y lo aprobado se quedan; «Desarchivar» lo vuelve a poner. Archivan el aprobador de la web y el jefe; tú no.',
    },
  },
  {
    id: 'web-archivar-que-hace',
    roles: ['boss', 'admin'],
    q: ['que hace archivar en la web', 'que hace archivar en la web y quien lo hace', 'que pasa si archivo una noticia', 'que es desarchivar en la web'],
    a: {
      boss: '«Archivar» saca el contenido de la web al momento, sin borrar nada: su historia y lo aprobado se quedan, y no se cambia hasta desarchivarlo. «Desarchivar» vuelve a poner lo que estaba aprobado. Archivan el aprobador de la web y tú; no hay botón de borrar.',
      admin: '«Archivar» saca el contenido de la web al momento, sin borrar nada: su historia y lo aprobado se quedan, y no se cambia hasta desarchivarlo. «Desarchivar» vuelve a poner lo que estaba aprobado. Archivan el aprobador de la web y el jefe; tú no archivas.',
    },
  },
  {
    id: 'web-admin-archivar',
    roles: ['admin'],
    q: ['algo salio publicado por error lo puedo archivar yo', 'puedo archivar una noticia de la web', 'como archivo algo de la web', 'puedo sacar algo de la web'],
    a: 'No: tú no archivas. Archivan el aprobador de la web y el jefe: «Archivar» saca el contenido de la web al momento, sin borrar nada, y «Desarchivar» lo vuelve a poner.',
  },
  {
    id: 'web-devolver',
    roles: ['boss'],
    q: ['como devuelvo una noticia de la web con un comentario', 'como le pido cambios al editor de la web', 'como regreso algo de la web sin publicarlo', 'como devuelvo un contenido de la web'],
    a: 'En «Por aprobar», abre el contenido y, en «Decidir», escribe en «Qué hay que cambiar» y toca «Devolver con comentario». Vuelve a borrador, y quien lo envió lo lee en su aviso («Te devolvieron un contenido de la web») y arriba del editor.',
    go: '/admin/web/por-aprobar',
  },
  {
    id: 'web-programar',
    roles: ['boss', 'admin'],
    q: ['como funciona programar en la web', 'que pasa cuando algo queda programado', 'que pasa si programo con una hora que ya paso', 'quien programa lo de la web'],
    a: {
      boss: 'En «Por aprobar» → el contenido → «Decidir» → «Programar»: eliges «Día» y «Hora», en hora de Venezuela. A esa hora aparece sola en la web, en menos de un minuto, y hasta entonces nadie la ve. Una hora que ya pasó no se acepta. Lo que ya está en la web no se programa: sus cambios se publican ahora.',
      admin: 'Programan el aprobador de la web y el jefe, en «Decidir» → «Programar»: eligen «Día» y «Hora», en hora de Venezuela. A esa hora aparece sola en la web, en menos de un minuto, y hasta entonces nadie la ve. Una hora que ya pasó no se acepta. Tú no programas.',
    },
  },
  {
    id: 'web-programar-cambio',
    roles: ['boss', 'admin'],
    q: ['se puede programar un cambio de algo que ya esta publicado', 'como programo un cambio a una noticia publicada', 'por que no me deja programar algo que ya esta en la web'],
    a: 'No: lo que ya está en la web no se programa, sus cambios se publican ahora. La pantalla lo dice: «Ya está en la web: sus cambios se publican ahora. Para programarlo, archívalo antes.». Si un cambio debe salir a cierta hora, se guarda listo y quien aprueba le toca «Publicar ahora» a esa hora.',
  },
  {
    id: 'web-avisos-cuales',
    roles: ['boss', 'admin'],
    q: ['que avisos llegan cuando alguien manda o aprueba algo de la web', 'que avisos llegan cuando decido algo de la web', 'le llega aviso al editor cuando publican su noticia', 'que avisos tiene la web'],
    a: {
      boss: 'Al enviar, queda «En revisión» y al aprobador de la web le llega «Hay contenido de la web por aprobar»; a ti no: tú lo ves en la lista «Por aprobar». Al decidir, a quien lo envió le llega «Tu contenido ya está en la web», «Tu contenido de la web quedó programado» o «Te devolvieron un contenido de la web». Llegan en la campana y al teléfono, nunca por correo.',
      admin: 'Al enviar, al aprobador de la web le llega «Hay contenido de la web por aprobar» (al jefe no: lo ve en la lista). Al decidir, a quien lo envió le llega «Tu contenido ya está en la web», «Tu contenido de la web quedó programado» o «Te devolvieron un contenido de la web». Llegan en la campana y al teléfono, nunca por correo.',
    },
  },
  {
    id: 'web-jefe-aviso-no-llega',
    roles: ['boss'],
    q: ['por que no me llega el aviso de lo que hay por aprobar en la web', 'por que no me sale el aviso de la web', 'no me llegan los avisos de la web', 'como me entero de lo que espera aprobacion en la web'],
    a: 'Porque el aviso «Hay contenido de la web por aprobar» le llega solo al aprobador de la web. Tú lo ves en la lista: «Por aprobar» de «Web» dice cuántos esperan, lo más viejo primero.',
    go: '/admin/web/por-aprobar',
  },
  {
    id: 'web-revisar-que-muestra',
    roles: ['boss', 'admin'],
    q: ['cuando reviso algo de la web que me muestra', 'que ve quien aprueba cuando revisa algo de la web', 'que sale cuando abro algo en por aprobar de la web', 'que es que cambia si lo publicas'],
    a: {
      boss: 'Quién lo envió y su último cambio; «Ver la vista previa», «Abrir el editor», «Versiones» y «Verlo en la web»; «Le falta esto para publicarse», si falta algo; y «Qué cambia si lo publicas», campo por campo, con «Antes» y «Ahora». En «Decidir» eliges «Publicar ahora», «Programar» o «Devolver con comentario».',
      admin: 'Quién lo envió y su último cambio; «Ver la vista previa», «Abrir el editor», «Versiones» y «Verlo en la web»; «Le falta esto para publicarse», si falta algo; y «Qué cambia si lo publicas», campo por campo, con «Antes» y «Ahora». En «Decidir», el aprobador de la web y el jefe eligen «Publicar ahora», «Programar» o «Devolver con comentario»; tú lo lees.',
    },
    go: '/admin/web/por-aprobar',
  },
  {
    id: 'web-aprobar-saber',
    roles: ['boss', 'admin'],
    q: ['que hay que saber de la web al aprobar', 'que hay que saber cuando uno aprueba en la web', 'que cuidados hay al publicar en la web', 'que pasa si cambian el borrador mientras lo reviso'],
    a: {
      boss: 'Con «Le falta esto para publicarse», «Publicar ahora» no se puede tocar. Se publica exactamente lo que se revisó: si alguien cambió el borrador mientras tanto, la app no lo publica y pide abrirlo de nuevo. Lo que ya está en la web no se programa: sus cambios se publican ahora. El aviso de «Por aprobar» no te llega: lo ves en la lista.',
      admin: 'Con «Le falta esto para publicarse», «Publicar ahora» no se puede tocar. Se publica exactamente lo que se revisó: si alguien cambió el borrador mientras tanto, la app no lo publica y pide abrirlo de nuevo. Lo que ya está en la web no se programa: sus cambios se publican ahora.',
    },
  },
  {
    id: 'web-admin-aprobar-saber',
    roles: ['admin'],
    q: ['que hay que saber de aprobar en la web', 'que cuidados tiene el aprobador al publicar en la web', 'que revisa el aprobador antes de publicar en la web'],
    a: 'Con «Le falta esto para publicarse», «Publicar ahora» no se puede tocar. Se publica exactamente lo que se revisó: si alguien cambió el borrador mientras tanto, la app no lo publica y pide abrirlo de nuevo. Lo que ya está en la web no se programa: sus cambios se publican ahora. El aviso de «Por aprobar» le llega solo al aprobador; el jefe lo ve en la lista. Tú lo lees, pero no decides.',
    go: '/admin/web/por-aprobar',
  },
  {
    id: 'web-camino-revisar',
    roles: ['boss', 'admin'],
    q: ['como es el camino cuando me toca revisar algo de la web', 'como se revisa y se decide algo en la web', 'como apruebo algo de la web', 'como publico lo que me mando el editor'],
    a: {
      boss: 'En «Por aprobar» abres el contenido, miras «Qué cambia si lo publicas» y la vista previa, y en «Decidir» eliges: «Publicar ahora», «Programar» (día y hora de Venezuela) o «Devolver con comentario», escribiendo qué hay que cambiar. A quien lo envió le llega el aviso de lo que decidiste.',
      admin: 'Lo revisan el aprobador de la web y el jefe: en «Por aprobar» abren el contenido, miran «Qué cambia si lo publicas» y la vista previa, y en «Decidir» eligen «Publicar ahora», «Programar» o «Devolver con comentario». Tú lo lees, pero no decides.',
    },
    go: '/admin/web/por-aprobar',
  },
  {
    id: 'web-camino-noticia',
    roles: ['boss', 'admin'],
    q: ['como es el camino de una noticia hasta que sale en la web', 'como es el camino de una noticia desde que se escribe hasta que sale publicada', 'que pasos sigue una noticia hasta publicarse', 'como sale una noticia en la web'],
    a: 'El editor (o el jefe) la crea con «Crear borrador», la escribe y toca «Guardar borrador»; cada guardado queda en «Versiones». La mira en «Vista previa» y toca «Enviar a aprobación»: queda «En revisión». Quien aprueba la abre en «Por aprobar» y decide: «Publicar ahora», «Programar» o «Devolver con comentario».',
  },
  {
    id: 'web-escribir-saber',
    roles: ['boss', 'admin'],
    q: ['que hay que saber del flujo de escribir en la web', 'quien escribe lo de la web y que hay que saber de eso', 'que pasa si no guardo el borrador de la web', 'las paginas de la web se crean'],
    a: {
      boss: 'El editor de la web escribe y envía, pero nunca publica; tú y el aprobador también escriben. Las páginas no se crean: se editan, y la portada va por bloques. Lo que escribes y no guardas queda solo en ese teléfono o esa computadora: solo «Guardar borrador» lo sube. Administración lee todo, borradores también, y nunca escribe.',
      admin: 'El editor de la web escribe y envía, pero nunca publica; el aprobador y el jefe también escriben. Las páginas no se crean: se editan, y la portada va por bloques. Lo que se escribe y no se guarda queda solo en ese teléfono o esa computadora: solo «Guardar borrador» lo sube. Tú, Administración, lees todo, borradores también, y nunca escribes.',
    },
  },
  {
    id: 'web-editor-sin-guardar',
    roles: ['boss', 'admin'],
    q: ['se pierde lo que escribo en la web si se va la luz', 'que pasa si se va la señal mientras escribo una noticia', 'dos personas pueden editar la misma noticia a la vez', 'me salio que alguien guardo cambios mientras editaba'],
    a: {
      boss: 'Lo que escribes y no guardas se queda en ese teléfono o esa computadora: al volver dice «Recuperamos cambios que no se habían guardado en este teléfono o en esta computadora.», y «Descartarlos» los borra. Solo «Guardar borrador» lo guarda en el panel. Si otra persona guardó mientras escribías, sale un aviso: copia lo tuyo y vuelve a abrirlo.',
      admin: 'Lo que se escribe y no se guarda se queda en ese teléfono o esa computadora: al volver dice «Recuperamos cambios que no se habían guardado en este teléfono o en esta computadora.», y «Descartarlos» los borra. Solo «Guardar borrador» lo guarda en el panel. Si otra persona guardó mientras tanto, sale un aviso para copiar lo propio y volver a abrirlo.',
    },
  },
  {
    id: 'web-falta-esto',
    roles: ['boss'],
    q: ['no puedo publicar me dice falta esto', 'no me deja publicar la noticia', 'por que no puedo enviar a aprobacion', 'que significa para enviarlo a aprobacion falta esto'],
    a: 'Completa lo que dice la lista: en el editor, «Para enviarlo a aprobación falta esto», y al revisar, «Le falta esto para publicarse»; cuando está completo dice «Listo para enviar a aprobación». En lo traído de la web anterior, lo que falta suele ser el «Texto alternativo» de las fotos que dicen «Por escribir» y las marcas de datos quitados, como «correo retirado».',
  },
  {
    id: 'web-por-escribir',
    roles: ['boss', 'admin'],
    q: ['no me deja publicar la nota y la foto tiene un por escribir', 'que es por escribir en una foto', 'por que una foto dice por escribir'],
    a: {
      boss: 'Le falta su «Texto alternativo»: las fotos de la web anterior llegan marcadas «Por escribir», y la app no publica una nota con una foto así. Se escribe en la «Biblioteca», en esa foto, y después envías la nota otra vez.',
      admin: 'Le falta su «Texto alternativo»: las fotos de la web anterior llegan marcadas «Por escribir», y la app no publica una nota con una foto así. Lo escriben en la «Biblioteca» el editor de la web, el aprobador o el jefe.',
    },
  },
  {
    id: 'web-traido-revisar',
    roles: ['boss', 'admin'],
    q: ['que hay que revisar en cada nota traida de la web vieja', 'cuando pasemos las noticias de la web vieja que hay que revisar', 'que se revisa antes de enviar una nota traida', 'como se revisa lo que se trae de la web anterior'],
    a: 'Antes de enviar cada nota: el «Texto alternativo» de cada foto (llegan marcadas «Por escribir»), las marcas de datos quitados como «correo retirado», lo demás que diga el aviso «Traído de la web vieja», los nombres de personas que no son figuras públicas, menores y datos de salud, y el tipo, los temas, el municipio, la fecha y la foto principal. Lo que no se conserva se archiva: nada se borra.',
  },
  {
    id: 'web-limites',
    roles: ['boss', 'admin'],
    q: ['que limites tiene la web', 'que no hace todavia el panel de la web', 'que no puede hacer la web todavia'],
    a: {
      boss: 'La app no compara palabra por palabra ni programa un cambio a algo ya publicado. Solo acepta fotos JPG, PNG o WebP, y archivos de hasta 4 MB. Y no te avisa de lo que espera en «Por aprobar»: lo ves en la lista.',
      admin: 'La app no compara palabra por palabra ni programa un cambio a algo ya publicado. Solo acepta fotos JPG, PNG o WebP, y archivos de hasta 4 MB. Y al jefe no le avisa de lo que espera en «Por aprobar»: lo ve en la lista.',
    },
  },
  // The editor, the pages and the text (MANUAL-ADMIN-WEB 4 to 7).
  {
    id: 'web-noticia-que-lleva',
    roles: ['boss', 'admin'],
    q: ['que lleva una noticia que le tengo que llenar', 'que campos tiene una noticia de la web', 'que se llena en una noticia nueva', 'que pide una noticia para publicarla'],
    a: 'Título, resumen, fecha, el «Tipo» («Noticia», «Comunicado», «Opinión» o «Entrevista»), la firma, el municipio, la «Foto principal», el «Texto de la nota», la galería, el video de YouTube (su código), las fuentes y los temas. Lo que falte lo dice «Para enviarlo a aprobación falta esto».',
  },
  {
    id: 'web-tipos-contenido',
    roles: ['boss', 'admin'],
    q: ['que tipos de contenido tiene la web y que reglas tiene cada uno', 'que se puede crear en la web', 'que tipos de contenido hay en la web', 'cuales son los tipos de contenido de la web'],
    a: 'Noticias (con su «Tipo»), obras o acciones (nunca un monto ni un porcentaje sin su fuente), episodios del programa (sin el código del video no hay reproductor), documentos (todos salen en «Transparencia»), avisos de servicio (dejan de salir solos al vencer), preguntas frecuentes e indicadores (una cifra sin fuente nunca sale). Las páginas no se crean: se editan.',
  },
  {
    id: 'web-falta-foto',
    roles: ['boss', 'admin'],
    q: ['y si falta una foto que sale en la web en su lugar', 'que pasa si una noticia no tiene foto', 'que se ve en la web si falta un dato', 'que muestra la web cuando falta un video'],
    a: 'Nada: la web no muestra nada en su lugar, y la «Vista previa» avisa qué falta. Lo mismo con un video o un archivo que falta, y con un espacio «Por completar», que solo ve el equipo. El público nunca ve un espacio vacío.',
  },
  {
    id: 'web-por-completar',
    roles: ['boss', 'admin'],
    q: ['que es por completar en la web', 'para que sirve el por completar', 'puedo inventar el horario de una oficina mientras llega el dato', 'que pongo si me falta un dato de la web'],
    a: 'En la web nunca se inventa nada: ni biografía, ni fotos, ni teléfonos, ni correos, ni horarios, ni cuentas. Lo que falte se deja como espacio «Por completar» y se llena cuando el dato llegue confirmado. Ese espacio nunca sale en la web: solo lo ve el equipo en la «Vista previa».',
  },
  {
    id: 'web-telefono-sin-confirmar',
    roles: ['boss', 'admin'],
    q: ['puedo poner un telefono que me pasaron pero nadie ha confirmado', 'puedo poner en la web un correo sin verificar', 'se puede poner una cuenta que no se ha confirmado', 'que pasa si pongo un contacto sin verificar'],
    a: 'No: nunca va un teléfono, un correo o una cuenta que nadie del equipo confirmó, porque lo que se guarda en «Ajustes del sitio» sale en la web al momento. Un contacto sale solo marcado «Verificado», y una cuenta solo «Activa» y «Verificada».',
  },
  {
    id: 'web-editor-botones',
    roles: ['boss', 'admin'],
    q: ['que son los botones de arriba del editor de la web', 'que hace cada boton del editor de la web', 'para que es guardar borrador y enviar a aprobacion', 'que es retirar de revision'],
    a: {
      boss: '«Guardar borrador» guarda y deja una copia en «Versiones»; «Vista previa» lo muestra como saldrá; «Enviar a aprobación» lo manda a quien aprueba (mientras espera, «Retirar de revisión» lo devuelve a borrador); y «Revisar y publicar» es para ti, que apruebas. A la derecha dice «Cambios sin guardar» o «Todo guardado».',
      admin: '«Guardar borrador» guarda y deja una copia en «Versiones»; «Vista previa» lo muestra como saldrá; «Enviar a aprobación» lo manda a quien aprueba (mientras espera, «Retirar de revisión» lo devuelve a borrador); y «Revisar y publicar» es solo para quien aprueba. Tú lees el editor, pero no escribes.',
    },
  },
  {
    id: 'web-editor-avisos',
    roles: ['boss', 'admin'],
    q: ['que avisos salen en el editor de la web', 'que avisos me pueden salir arriba del editor', 'que significa esto ya esta en la web en el editor', 'cuales son los avisos del editor'],
    a: '«Te lo devolvieron con este comentario», «Esperando aprobación», «Esto ya está en la web» (los cambios salen solo cuando se publique de nuevo), «Programado: sale el …», «Traído de la web vieja» y «Archivado: no se ve en la web». Lo que no se guardó vuelve con «Recuperamos cambios que no se habían guardado en este teléfono o en esta computadora.». Abajo, «Para enviarlo a aprobación falta esto» dice lo que falta.',
  },
  {
    id: 'web-buscadores',
    roles: ['boss', 'admin'],
    q: ['que es buscadores y redes en el editor de la web', 'y si dejo vacio lo de buscadores que pasa', 'que pongo en titulo para buscadores', 'que es la direccion canonica'],
    a: 'En «Buscadores y redes» van «Título para buscadores» (unas 60 letras), «Descripción para buscadores» (unas 155) e «Imagen para redes», con la tarjeta «Así se ve al compartir el enlace». Vacíos, se usan el título, el resumen y la foto principal. La «Dirección canónica (opcional)» se deja vacía, y «Pedir a los buscadores que no la muestren» le pide a Google que no lo muestre.',
  },
  {
    id: 'web-version-vieja',
    roles: ['boss', 'admin'],
    q: ['como veo una version vieja en vista previa', 'como vuelvo a una version anterior de una noticia', 'publique un cambio que estaba malo como vuelvo a lo de antes', 'y para que salga en la web una version vieja que hay que hacer'],
    a: {
      boss: 'En el editor, «Versiones»: «Ver» abre una versión en la vista previa, y «Volver a esta versión» la copia al borrador como una versión nueva, sin perder nada. Para que salga en la web, hay que enviarla a aprobación y publicarla otra vez. El editor también puede volver a una versión.',
      admin: 'En el editor, «Versiones»: «Ver» abre una versión en la vista previa, y «Volver a esta versión» la copia al borrador como una versión nueva. Para que salga, se envía a aprobación y se publica otra vez. Lo hacen el editor de la web, el aprobador y el jefe; tú lees «Versiones».',
    },
  },
  {
    id: 'web-portada-bloques',
    roles: ['boss', 'admin'],
    q: ['como se arma la portada', 'como acomodo los bloques de la portada', 'que bloques puede tener una pagina de la web', 'como agrego un bloque a la portada'],
    a: {
      boss: 'Por bloques: en «Web» → «Páginas» → «Inicio», «Bloques de la página» trae cada bloque con «Editar», «Subir», «Bajar» y «Ocultar» o «Mostrar», y «Agregar un bloque» abre los 15 tipos, como «Portada con foto», «Texto», «Foto», «Galería» o «Video». Guarda el borrador y publica la página: el cambio sale cuando se publica.',
      admin: 'Por bloques: en «Web» → «Páginas» → «Inicio», «Bloques de la página» trae cada bloque con «Editar», «Subir», «Bajar» y «Ocultar» o «Mostrar», y «Agregar un bloque» abre los 15 tipos, como «Portada con foto», «Texto», «Foto», «Galería» o «Video». La arman el editor de la web, el aprobador y el jefe; tú no cambias las páginas.',
    },
  },
  {
    id: 'web-ocultar-bloque',
    roles: ['boss', 'admin'],
    q: ['como escondo un bloque de la portada', 'como oculto un bloque de la web', 'como vuelvo a mostrar un bloque oculto', 'puedo ocultar un bloque de la portada'],
    a: {
      boss: 'En «Web» → «Páginas» → «Inicio», en «Bloques de la página», toca «Ocultar» en el bloque: queda con la etiqueta «Oculto» y no sale en la web; «Mostrar» lo vuelve a poner. Se queda en el borrador: el cambio sale cuando publicas la portada.',
      admin: 'No: tú no cambias las páginas. Ocultan o muestran un bloque el editor de la web, el aprobador y el jefe, con «Ocultar» o «Mostrar» en «Bloques de la página»; un bloque oculto lleva la etiqueta «Oculto» y no sale en la web.',
    },
  },
  {
    id: 'web-portada-ocultos',
    roles: ['boss', 'admin'],
    q: ['que bloques de la portada estan escondidos y por que', 'y los bloques escondidos de la portada', 'por que no sale gestion en cifras en la portada', 'que bloques estan ocultos en la portada'],
    a: 'Cuatro, con la marca «Oculto»: «Gestión en cifras», «Casos atendidos», «Gestión y obras» y «Avisos de servicio». Están ocultos porque todavía no hay contenido real para ellos. Con «Mostrar», en «Web» → «Páginas» → «Inicio», vuelven a salir cuando se publica la portada.',
  },
  {
    id: 'web-portada-de-donde',
    roles: ['boss', 'admin'],
    q: [
      'de donde sale lo de cada bloque de la portada',
      'lo que aparece dentro de los bloques de la portada de donde se saca',
      'de donde salen las ultimas publicaciones de la portada',
      'el semanario de la portada de donde sale',
      'gestion en cifras de donde saca los numeros',
    ],
    a: 'Cada bloque sale de su pantalla: «Últimas publicaciones» y «Opinión», de «Noticias y comunicados»; el Semanario, de «Documentos», con la categoría «Semanario»; «Canales oficiales», de «Ajustes del sitio»; «Gestión en cifras», de «Indicadores»; «Gestión y obras», de «Obras y acciones»; y «Casos atendidos», de la coordinación, desde cada caso.',
  },
  {
    id: 'web-titulo-portada',
    roles: ['boss', 'admin'],
    q: ['el titular grande de la portada se cambia en ajustes del sitio', 'donde cambio el titulo grande de la portada', 'si no hay foto como sale el titulo grande de la portada', 'como le pongo foto a la portada'],
    a: {
      boss: 'En su bloque «Portada con foto», en «Web» → «Páginas» → «Inicio»: no sale de «Ajustes del sitio». Sin foto, la portada sale solo con el texto, a lo ancho, y la vista previa muestra «Foto por subir desde el administrador». Lo cambias ahí y publicas la portada.',
      admin: 'En su bloque «Portada con foto», en «Web» → «Páginas» → «Inicio»: no sale de «Ajustes del sitio». Sin foto, la portada sale solo con el texto, a lo ancho. Lo cambian el editor de la web, el aprobador o el jefe; tú no.',
    },
  },
  {
    id: 'web-bloque-video',
    roles: ['boss', 'admin'],
    q: ['el bloque de video como hago para que salga el ultimo episodio', 'como funcionan los bloques de video documentos y llamado a la accion', 'como pongo el episodio mas reciente en la portada', 'que es el bloque llamado a la accion'],
    a: 'En «Video», «Mostrar el episodio más reciente» cambia solo cada vez que se publica un episodio. En «Documentos», «Preguntas frecuentes» y «Obras y gestión» salen los que marques, en ese orden; sin marcar ninguno, los últimos. «Llamado a la acción» trae su «Enlace del botón» listo hacia el formulario «Nueva solicitud».',
  },
  {
    id: 'web-texto-partes',
    roles: ['boss', 'admin'],
    q: ['que partes tiene el texto de una pagina', 'como subo o bajo una parte del texto', 'como quito una parte del texto de la web', 'como agrego un titulo dentro del texto de la web'],
    a: 'El texto se arma en partes, cada una en su cuadro: «Párrafo», «Título», «Subtítulo», «Lista», «Lista numerada», «Cita» y «Por completar». Los botones con un «+» agregan partes, el tipo de cada una se cambia en su lista, las flechas las suben o las bajan y la papelera las quita.',
  },
  {
    id: 'web-texto-formato',
    roles: ['boss', 'admin'],
    q: ['como le pongo negritas a un texto de la web', 'como pongo un enlace en el texto de la web', 'como funcionan las negritas y los enlaces', 'como pongo cursiva en una noticia'],
    a: 'Selecciona las palabras y toca el botón de negrita (la B), el de cursiva (la I) o el de enlace (la cadena); para un enlace, pon el enlace en «Dirección del enlace» y toca «Poner el enlace». En el cuadro quedan entre signos («Los botones lo escriben por ti.») y en la web salen sin ellos. Lo que se pega llega como texto simple.',
  },
  {
    id: 'web-texto-asterisco',
    roles: ['boss', 'admin'],
    q: ['se me desaparece un asterisco del texto que escribi', 'por que se borra un corchete del texto de la web', 'como escribo un asterisco en una noticia'],
    a: 'Escribe antes una barra inclinada hacia atrás: así el asterisco o el corchete sale tal cual, y no como negrita, cursiva o enlace. Míralo en «Así se ve en la web», debajo del texto.',
  },
  // What Administración asks to do in «Web» and cannot (the «¿puedo…?» the guide's lists miss).
  {
    id: 'web-admin-bloques',
    roles: ['admin'],
    q: ['puedo agregar un bloque a una pagina', 'puedo cambiar la portada de la web', 'puedo editar una pagina de la web', 'puedo cambiar el orden de los bloques'],
    a: 'No: tú no cambias las páginas. La portada y las páginas las arman el editor de la web, el aprobador y el jefe, por bloques: «Agregar un bloque», «Subir», «Bajar» y «Ocultar» o «Mostrar». Tú las lees, también en su «Vista previa».',
    go: '/admin/web',
  },
  {
    id: 'web-admin-aviso-servicio',
    roles: ['admin'],
    q: ['puedo poner un aviso de servicio de un corte de luz', 'como pongo un aviso de servicio en la web', 'puedo publicar un aviso de corte de agua'],
    a: 'No: tú no escribes en la web. Un aviso de servicio lo crean el editor de la web, el aprobador o el jefe, en «Avisos de servicio» → «Nuevo aviso», y sale cuando se publica. Al vencer, deja de salir solo.',
    go: '/admin/web',
  },
  {
    id: 'web-admin-biblioteca',
    roles: ['admin'],
    q: ['puedo subir algo a la biblioteca de la web', 'puedo subir fotos a la web', 'puedo subir un pdf a la web', 'como subo una foto a la biblioteca de la web'],
    a: 'No: tú no subes a la «Biblioteca». Suben el editor de la web, el aprobador y el jefe, con «Subir una foto» o «Subir un PDF». Tú la lees, y si se subió algo que no debía ser público, pides aparte borrarlo del todo.',
    go: '/admin/web/biblioteca',
  },
  {
    id: 'web-admin-mandar-aprobacion',
    roles: ['admin'],
    q: ['como mando algo a aprobacion', 'como envio algo a aprobacion', 'puedo enviar a aprobacion algo de la web'],
    a: 'No: tú no mandas nada a aprobación. En la web envían el editor de la web y el jefe, con «Enviar a aprobación», y deciden el aprobador de la web y el jefe.',
  },
  {
    id: 'web-admin-aprobar',
    roles: ['admin'],
    q: ['puedo aprobar una noticia de la web', 'puedo decidir lo que espera en por aprobar de la web', 'puedo publicar ahora algo de la web'],
    a: 'No: en la web tú no apruebas ni publicas. Deciden el aprobador de la web y el jefe, en «Por aprobar» → «Decidir»: «Publicar ahora», «Programar» o «Devolver con comentario». Tú lo lees.',
    go: '/admin/web/por-aprobar',
  },
  {
    id: 'web-admin-versiones',
    roles: ['admin'],
    q: ['puedo volver una pagina a una version anterior', 'puedo usar volver a esta version', 'puedo recuperar una version vieja de una noticia'],
    a: 'No: «Volver a esta versión» lo tocan el editor de la web, el aprobador y el jefe. Tú lees «Versiones»: cada borrador guardado, con quién, cuándo y su nota.',
    go: '/admin/web',
  },
  // The library (MANUAL-ADMIN-WEB 12).
  {
    id: 'web-foto-palabras',
    roles: ['boss', 'admin'],
    q: ['que palabras lleva cada foto de la biblioteca', 'que se le escribe a una foto de la web', 'que es el pie de foto y el credito', 'como escribo el texto alternativo de una foto'],
    a: 'El «Texto alternativo», obligatorio: lo oyen las personas ciegas y lo usan los buscadores, así que describe lo que se ve en pocas palabras (quién, qué hace, dónde). El «Pie de foto» (lo que cuenta la foto, debajo de ella) y el «Crédito» (quién la tomó) son opcionales. Y el «Punto de interés»: lo que siempre debe verse cuando la web la recorta.',
  },
  {
    id: 'web-biblioteca-acepta',
    roles: ['boss'],
    q: ['puedo subir un iconito chiquito a la biblioteca', 'que fotos acepta la biblioteca de la web', 'por que no me acepta la foto en la biblioteca', 'que formato de foto acepta la web'],
    a: 'Sirve cualquier foto normal de teléfono o de cámara, en JPG, PNG o WebP y hasta 4 MB; una imagen diminuta, como un ícono, no se acepta. Una foto en otro formato hay que guardarla antes como JPG. Antes de subir, se achica y pierde la ubicación y los datos de la cámara.',
  },
  {
    id: 'web-foto-noticia',
    roles: ['boss', 'admin'],
    q: ['como le pongo una foto a una noticia', 'como le pongo un pdf a una noticia', 'como elijo una foto de la biblioteca', 'como subo una foto nueva desde el editor'],
    a: {
      boss: 'En el editor, «Elegir foto» (o «Agregar foto» en la galería) abre la biblioteca: elige una en «De la biblioteca» o sube otra con «Subir una nueva», siempre con su «Texto alternativo». Para un PDF, «Elegir PDF» y, si es nuevo, «Subir uno nuevo».',
      admin: 'Lo hacen el editor de la web, el aprobador y el jefe: en el editor, «Elegir foto» abre la biblioteca, con «De la biblioteca» y «Subir una nueva»; para un PDF, «Elegir PDF». Tú no escribes ni subes en la web.',
    },
  },
  {
    id: 'web-foto-archivada',
    roles: ['boss', 'admin'],
    q: ['si archivan una foto que pasa con las paginas que la usan', 'si archivo una foto de la biblioteca se cae de las noticias', 'que pasa si archivo una foto', 'como saco una foto del archivo de la biblioteca'],
    a: 'Lo publicado la sigue mostrando: «Archivar» la saca de la biblioteca, no de las páginas que ya la usan. Pero nadie puede elegirla, y un borrador que la use no se puede enviar hasta cambiarla. Cambiar sus textos tampoco toca lo publicado hasta que se publique de nuevo. «Devolver a la biblioteca» la saca del archivo.',
  },
  {
    id: 'web-biblioteca-privado',
    roles: ['boss', 'admin'],
    q: ['subi una foto que no debia ser publica', 'metieron en la biblioteca un documento privado por error', 'como borro una foto de la biblioteca de la web', 'se puede borrar un archivo de la biblioteca'],
    a: {
      boss: 'Archívalo y avísale enseguida a Administración: la app no borra archivos, y para borrarlo del todo lo pide aparte. Mientras tanto, cámbialo en cada contenido de «Dónde se usa» y vuelve a publicar cada uno, para que la web deje de mostrarlo.',
      admin: 'Lo archiva quien escribe o aprueba la web, y te avisa: la app no borra archivos, y para borrarlo del todo tú lo pides aparte. Mientras tanto, ellos lo cambian en cada contenido de «Dónde se usa» y publican cada uno de nuevo, para que la web deje de mostrarlo.',
    },
  },
  {
    id: 'web-camino-foto',
    roles: ['boss', 'admin'],
    q: ['como es el camino de una foto hasta la web', 'como es el camino de una foto desde que se sube hasta que sale en la web', 'como sale una foto en una noticia'],
    a: 'Se sube en «Biblioteca» → «Subir una foto»: se achica y pierde la ubicación y los datos de la cámara, se marca su «Punto de interés» y lleva su «Texto alternativo». En el editor se pone con «Elegir foto» → «De la biblioteca». Al publicar, cada foto queda con los textos que tenía en ese momento.',
  },
  // «Ajustes del sitio» (MANUAL-ADMIN-WEB 13).
  {
    id: 'web-ajustes-sin-aprobacion',
    roles: ['boss', 'admin'],
    q: ['cambie algo en ajustes del sitio hay que aprobarlo', 'lo de ajustes del sitio pasa por aprobacion', 'cuando sale en la web lo que guardo en ajustes del sitio'],
    a: 'No: lo que se guarda en «Ajustes del sitio» sale en la web al momento, sin aprobación, y la pantalla dice «Guardado. La web ya lo muestra.». Por eso nunca va un dato que nadie confirmó.',
    go: '/admin/web/ajustes',
  },
  {
    id: 'web-ajustes-secciones',
    roles: ['boss', 'admin'],
    q: ['que secciones tiene ajustes del sitio', 'que hay en ajustes del sitio', 'que se cambia en ajustes del sitio', 'que trae ajustes del sitio'],
    a: '«Navegación» (el menú), «Pie de página», «Contactos institucionales», «Cuentas en redes», «Canal de WhatsApp», «Portal institucional», «Canal de YouTube del programa», «Nombre de la web», «Datos estructurados», «Avisos legales» y «Aviso de la versión de prueba». Cada sección tiene su «Guardar», y lo guardado sale al momento.',
    go: '/admin/web/ajustes',
  },
  {
    id: 'web-ajustes-saber',
    roles: ['boss', 'admin'],
    q: ['que hay que saber de ajustes del sitio', 'como es el flujo de ajustes del sitio', 'quien puede tocar ajustes del sitio', 'el editor de la web entra a ajustes del sitio'],
    a: {
      boss: 'Lo cambian el aprobador de la web, tú y Administración; el editor de la web no entra. Lo guardado sale al momento, sin aprobación («Guardado. La web ya lo muestra.»). Un contacto sale solo «Verificado» y una cuenta solo «Activa» y «Verificada». Los «Avisos legales» se ven pero no se cambian ahí, y en la versión de prueba el nombre, las cuentas y los contactos no se guardan.',
      admin: 'Lo cambian el aprobador de la web y el jefe, y tú también; el editor de la web no entra. Lo guardado sale al momento, sin aprobación («Guardado. La web ya lo muestra.»). Un contacto sale solo «Verificado» y una cuenta solo «Activa» y «Verificada». Los «Avisos legales» se ven pero no se cambian ahí, y en la versión de prueba el nombre, las cuentas y los contactos no se guardan.',
    },
    go: '/admin/web/ajustes',
  },
  {
    id: 'web-ajustes-prueba',
    roles: ['boss', 'admin'],
    q: [
      'por que no me deja cambiar las cuentas en ajustes del sitio',
      'por que no se guardan las cuentas y los contactos que cambio en ajustes',
      'por que hay ajustes del sitio que no se dejan cambiar',
      'por que no se guarda el nombre de la web',
    ],
    a: 'Porque es la versión de prueba: el nombre, el cargo, las cuentas, los canales, los contactos y la franja no se cambian, y la pantalla lo dice al guardar. Así nadie puede hacerla pasar por la web oficial, porque cualquiera con el enlace puede entrar a la prueba. «Navegación» y «Pie de página» sí se cambian.',
    go: '/admin/web/ajustes',
  },
  {
    id: 'web-cuenta-redes',
    roles: ['boss', 'admin'],
    q: [
      'como agrego la cuenta de instagram de la gobernacion a la web',
      'como pongo una cuenta de redes en la web',
      'donde cambio las cuentas que salen en canales de la web',
      'el bloque de canales oficiales donde le cambio las cuentas',
      'como marco una cuenta de la web como verificada',
    ],
    a: 'En «Ajustes del sitio» → «Cuentas en redes» → «Agregar cuenta»: la red, el usuario y el enlace, con «Verificada» y «Activa» si alguien del equipo la confirmó, y «Guardar». Salen en el pie y en «Canales». Una cuenta abandonada se apaga quitándole «Activa». En la versión de prueba las cuentas no se guardan.',
    go: '/admin/web/ajustes',
  },
  {
    id: 'web-menu',
    roles: ['boss', 'admin'],
    q: ['como le cambio el menu a la web', 'como agrego una seccion al menu de la web', 'cuales son las secciones del menu de la web', 'por que gestion y obras no esta en el menu'],
    a: 'En «Ajustes del sitio» → «Navegación»: «Agregar enlace», con su «Nombre» y su «Dirección» (el final, el que empieza con «/»), y «Guardar»: sale en la web al momento. Hoy el menú trae «Inicio», «El gobernador», «Noticias», el programa, «Atención ciudadana», «Transparencia» y «Canales»; «Gestión y obras» se agrega cuando haya obras publicadas.',
    go: '/admin/web/ajustes',
  },
  {
    id: 'web-programa-canal',
    roles: ['boss', 'admin'],
    q: ['donde cambio el canal de youtube del programa', 'como cambio el canal de youtube de la web', 'donde se pone el canal del programa en la web'],
    a: 'En «Ajustes del sitio» → «Canal de YouTube del programa», con «La web lo muestra», «Verificado» y «Activo». En la versión de prueba ese ajuste no se guarda.',
    go: '/admin/web/ajustes',
  },
  {
    id: 'web-aviso-emergencias',
    roles: ['boss', 'admin'],
    q: ['puedo cambiar el aviso de emergencias de la web', 'se puede cambiar el aviso de emergencias del formulario', 'donde se cambian los avisos legales de la web', 'por que no puedo cambiar los avisos legales'],
    a: 'No: el aviso de emergencias es uno de los «Avisos legales», textos fijos que no se cambian desde el panel; si hace falta cambiar uno, se le avisa a quien instaló la app. Salen iguales en toda la web, los formularios, el comprobante y los correos. Cuando la Gobernación confirme el número oficial de emergencias, se agregará a ese aviso.',
  },
  // «Redirecciones» (MANUAL-ADMIN-WEB 14).
  {
    id: 'web-redireccion-como',
    roles: ['boss', 'admin'],
    q: ['como agrego una redireccion', 'como hago una redireccion', 'como llevo una direccion vieja a la nueva', 'como es el camino de una direccion vieja'],
    a: 'En «Redirecciones» → «Nueva redirección»: en «Dirección vieja», la dirección como estaba antes, y en «Lleva a», la página de esta web adonde debe llevar; en ambas, solo el final, el que empieza con «/». En «Tipo» deja «Para siempre (lo normal)» y toca «Agregar la redirección»: la vieja lleva a la nueva. Sin redirección, quien entra a la vieja ve «Esta página no existe».',
    go: '/admin/web/redirecciones',
  },
  {
    id: 'web-redireccion-mal',
    roles: ['boss', 'admin'],
    q: ['una direccion vieja esta llevando a donde no es', 'como corrijo una redireccion', 'como quito una redireccion', 'agregue una redireccion y todavia no funciona'],
    a: 'En «Redirecciones», «Buscar» la encuentra por parte de su dirección; cambia el destino y toca «Guardar», o «Quitar» la borra (pregunta antes: quien entre a esa dirección verá «Esta página no existe»). Un cambio se nota en la web en más o menos un minuto.',
    go: '/admin/web/redirecciones',
  },
  {
    id: 'web-direccion-cambiada',
    roles: ['boss', 'admin'],
    q: ['si el aprobador le cambia la direccion a una noticia publicada que pasa con la vieja', 'se puede cambiar la direccion de una noticia publicada', 'quien cambia la direccion en la web de un contenido'],
    a: {
      boss: 'La vieja sigue llevando a la nueva sola. Después de publicado, la «Dirección en la web» la cambian solo el aprobador de la web y tú. La dirección de una página no se cambia.',
      admin: 'La vieja sigue llevando a la nueva sola. Después de publicado, la «Dirección en la web» la cambian solo el aprobador de la web y el jefe: tú no la cambias. La dirección de una página no se cambia.',
    },
  },
  // The public site, what the person sees (GUIA-WEB part 1).
  {
    id: 'web-marco-paginas',
    roles: ['boss', 'admin'],
    q: ['que tienen todas las paginas de la web arriba y en el pie', 'que tiene la cabecera de la web', 'que tiene el pie de la web', 'donde esta el boton de consultar mi solicitud en la web'],
    a: 'Arriba, el nombre y el cargo del gobernador, con «Hacer un reporte» y «Consultar mi solicitud», y el menú. En el pie, los mismos dos botones, el aviso de que esto no es un servicio de emergencias, las secciones, «Canales oficiales», las páginas legales y «Acceso del personal».',
  },
  {
    id: 'web-noticias-vacio',
    roles: ['boss', 'admin'],
    q: ['que dice noticias si no hay nada o si la busqueda no encuentra', 'que dice la web si no hay noticias', 'que sale si busco algo que no esta en noticias'],
    a: 'Sin noticias dice «Aún no hay noticias publicadas.»; una búsqueda sin resultado, «No hay resultados para esa búsqueda.»; y sin ediciones del Semanario, «Aún no hay ediciones publicadas.». Los temas salen solo cuando hay más de uno.',
  },
  {
    id: 'web-noticia-pagina',
    roles: ['boss', 'admin'],
    q: ['que lleva cada noticia por dentro', 'que lleva cada nota cuando la abres', 'que sale al final de una noticia'],
    a: 'Cada nota lleva su fecha, su firma, su foto y su texto; al final, las «Fuentes», los temas y el botón «Enviar una observación», y debajo, «Noticias relacionadas». Una columna de «Opinión» dice «Observaciones sobre este artículo» y muestra «Otros artículos de opinión».',
  },
  {
    id: 'web-programa-pagina',
    roles: ['boss', 'admin'],
    q: ['que es la pagina del programa semanal en la web', 'que dice la pagina del programa si no hay emisiones', 'que trae la pagina del programa del gobernador'],
    a: 'Es la página del programa semanal del gobernador: la «Última emisión» y las «Emisiones anteriores», con el enlace al canal de YouTube. Cada emisión es un episodio, de «Web» → «Nuevo episodio». Sin emisiones, lleva al canal oficial de YouTube con «Ver las emisiones en YouTube», y sin canal dice «Aún no hay emisiones publicadas.». El canal sale de «Ajustes del sitio» → «Canal de YouTube del programa». Hoy todavía no hay emisiones publicadas.',
  },
  {
    id: 'web-obras-gestion',
    roles: ['boss', 'admin'],
    q: ['que es gestion y obras en la web', 'de donde salen las obras de la web', 'que va a ver la gente en gestion y obras', 'como se ven las obras en la web'],
    a: 'Es la página de las obras: «Obras», con tarjetas por estado («Anunciado», «En ejecución» o «Concluido») y los filtros «Municipio», «Categoría» y «Estado», con «Filtrar»; y «Línea de tiempo», por mes. Sale de «Web» → «Obras y acciones». La «Inversión» y el «Avance» salen solo con su fuente. Hoy no hay obras publicadas, por eso no está en el menú.',
  },
  {
    id: 'web-canales-pagina',
    roles: ['boss', 'admin'],
    q: ['que sale en la pagina canales de la web y de donde lo saca', 'que tiene la pagina de canales oficiales', 'que es como identificar las cuentas oficiales', 'que dice canales de la web si no hay cuentas'],
    a: '«Canales oficiales», una tarjeta por cuenta, con la marca «verificada» en las confirmadas, y «Cómo identificar las cuentas oficiales», con el aviso contra estafas. Sale de «Ajustes del sitio» («Cuentas en redes» y los canales). Sin cuentas dice «Las cuentas oficiales se publicarán próximamente.». En la versión de prueba salen también las que faltan por confirmar, con «Estas cuentas están en proceso de confirmación.».',
  },
  {
    id: 'web-transparencia',
    roles: ['boss', 'admin'],
    q: ['que hay en transparencia', 'que es la pagina de transparencia', 'de donde salen las cifras de transparencia'],
    a: '«Documentos y cifras»: los documentos de «Web» → «Documentos», de todas las categorías, cada uno con «Ver el PDF», y las «Estadísticas de atención ciudadana», que cuenta la app con las solicitudes: nadie las escribe. En la prueba salen de las solicitudes de ejemplo, y la página lo avisa. Las denuncias no cuentan por categoría ni por municipio.',
  },
  {
    id: 'web-paginas-legales',
    roles: ['boss', 'admin'],
    q: ['cuales son las paginas legales de la web y estan listas', 'donde se cambian las paginas legales', 'que dicen las paginas legales de la web'],
    a: 'Tres, en el pie: «Aviso de privacidad», «Condiciones de participación» y «Accesibilidad». Se cambian en «Web» → «Páginas», cada una por su nombre. Todas esperan la revisión jurídica: tienen espacios «Por completar», que no salen al público, y una página sin publicar dice «Página en preparación.».',
  },
  {
    id: 'web-direccion-no-existe',
    roles: ['boss', 'admin'],
    q: ['que pasa si alguien entra a una direccion que no existe en la web', 'que sale si una pagina de la web no carga', 'que ve la persona si entra a un enlace viejo de la web'],
    a: 'Ve «Esta página no existe», con «Ir al inicio», «Ver noticias» y «Consultar mi solicitud». Una dirección de la web oficial que tiene redirección lleva sola a su página nueva. Si una página no carga por una falla, dice «No se pudo cargar la página», con «Intentar de nuevo» e «Ir al inicio».',
  },
  // The guide of the web itself (GUIA-WEB opening and 8).
  {
    id: 'web-guia-que-trae',
    roles: ['boss', 'admin'],
    q: ['que trae la guia de la web', 'en la guia cada seccion de la web dice de donde sale', 'que dice la guia de la web', 'como se lee la guia de la web'],
    a: 'Qué tiene la web, sección por sección (qué ve la persona, de qué pantalla del panel sale y qué pasa cuando no hay datos), el recorrido del ciudadano, qué hace cada rol y la versión de prueba. Lo que va entre comillas es el texto exacto de la pantalla. El detalle está en el manual de la web y el de atención, y los flujos van dibujados.',
    go: '/ayuda/web',
  },
  {
    id: 'web-detalle-pantallas',
    roles: ['boss', 'admin'],
    q: ['donde esta el detalle de cada pantalla de web y atencion', 'donde esta el manual de la web', 'donde estan los flujos de la web dibujados', 'donde veo cada pantalla de la web paso a paso'],
    a: 'En «Ayuda y guías»: «La web» trae el manual de la web, cada pantalla de «Web» paso a paso, y «Atención ciudadana», el manual de atención. Los flujos van dibujados en ambas partes, con lo que hay que saber debajo.',
    go: '/ayuda/web',
  },
  // The practice version (GUIA-WEB 3, the PDF's part 7).
  {
    id: 'web-prueba-oficial',
    roles: ['boss', 'admin'],
    q: ['esto es la web oficial o que', 'la web ya esta abierta al publico', 'la web de prueba es la oficial', 'google muestra esta web'],
    a: 'No: es una versión de prueba, con su propio enlace, para conocer la app y practicar cada rol antes de abrir la web al público. Arriba de cada página dice «Versión de prueba en revisión. No es el sitio oficial.», y Google no la muestra. Las noticias son una copia de la web oficial.',
  },
  {
    id: 'web-prueba-noticias',
    roles: ['boss', 'admin'],
    q: ['las noticias que estan en la web de prueba son reales o inventadas', 'las noticias de la prueba de donde salen', 'por que no estan las noticias mas nuevas en la prueba', 'de donde salen las noticias de la web de prueba'],
    a: 'Son reales: una copia de las noticias y las columnas de opinión de la web oficial, con sus fotos. Cada una termina con «Publicado originalmente en …», y en el panel lleva el aviso «Traído de la web vieja». La copia se hace de nuevo de vez en cuando: lo más nuevo de la web oficial no sale aquí enseguida.',
  },
  {
    id: 'web-prueba-real-ejemplo',
    roles: ['boss', 'admin'],
    q: ['que es de verdad y que es de mentira en la web de prueba', 'que es real y que es de ejemplo en la prueba', 'que viene de la web oficial en la prueba', 'que hay que saber de la version de prueba'],
    a: 'Viene de la web oficial: el nombre, el cargo y la foto de la portada, la biografía, las noticias, las columnas de opinión y el último Semanario. Es de ejemplo: las personas del panel y las solicitudes de «Atención ciudadana», que llevan «(demo)» en el título. Siete preguntas frecuentes ya venían escritas en la app. Lo que no tiene contenido real todavía no sale.',
  },
  {
    id: 'web-prueba-se-borra',
    roles: ['boss', 'admin'],
    q: ['lo que cambio en la web de prueba se queda', 'lo que se cambia en la prueba se queda', 'cree una noticia y no la veo desde el otro telefono', 'practique con otro rol y no veo lo que hice', 'para practicar entre roles que uso'],
    a: 'No queda: lo que se crea o se cambia en la prueba se borra de vez en cuando, y la prueba vuelve a lo que traía al empezar. Lo recién hecho a veces no se ve desde otra cuenta u otro teléfono: pasa solo en la prueba. Para practicar entre roles, usa lo que ya viene cargado: las solicitudes de ejemplo y los tres comprobantes.',
  },
  {
    id: 'web-prueba-al-dia',
    roles: ['boss', 'admin'],
    q: ['por que dice al dia en por aprobar de la web', 'por que por aprobar de la web esta vacio', 'como practico la aprobacion en la prueba', 'no hay nada esperando aprobacion en la web'],
    a: 'Porque no hay nada esperando: dice «No hay nada esperando aprobación. ¡Al día!». En la prueba, «Por aprobar» empieza vacío: para practicar, el editor de la web envía una noticia y quien aprueba la busca ahí. Si no aparece, es un límite de la prueba.',
    go: '/admin/web/por-aprobar',
  },
  {
    id: 'web-prueba-entrar-roles',
    roles: ['boss', 'admin'],
    q: ['en la lista de la prueba con que empieza cada rol', 'en la lista de la prueba yo con que entro y administracion con que', 'con que roles practico la web en la prueba', 'como entro a la web de prueba con otro rol'],
    a: {
      boss: 'En «Acceso del personal» → «Versión de demostración», cada rol entra con un toque. Tú entras a tu «Inicio», con «Web» y «Atención» en el menú, y Administración a «Hoy», para empezar por «Ajustes» → «Equipo». El «Editor de la web» empieza en «Noticias y comunicados» → «Nueva noticia», el «Aprobador de la web» en «Por aprobar» y «Ajustes del sitio», y el «Coordinador de atención» en la «Bandeja».',
      admin: 'En «Acceso del personal» → «Versión de demostración», cada rol entra con un toque. Tú entras a «Hoy», para empezar por «Ajustes» → «Equipo», y el jefe a su «Inicio», con «Web» y «Atención». El «Editor de la web» empieza en «Noticias y comunicados» → «Nueva noticia», el «Aprobador de la web» en «Por aprobar» y «Ajustes del sitio», y el «Coordinador de atención» en la «Bandeja».',
    },
  },
  {
    id: 'web-prueba-despues',
    roles: ['boss', 'admin'],
    q: ['cuando la web abra al publico se sigue entrando con un toque', 'el equipo va a seguir entrando con un toque', 'el atajo de la prueba se queda cuando abra la web'],
    a: 'No: cuando la web abra al público, nadie entra con un toque. Cada persona entra con su correo, el código que le llega por correo y Google Authenticator. El atajo existe solo en la prueba.',
  },
  {
    id: 'web-franja',
    roles: ['boss', 'admin'],
    q: ['puedo cambiarle el texto a la franja de version de prueba', 'la franja de version de prueba de arriba se puede cerrar', 'se puede quitar la franja de la prueba', 'por que sale la franja de version de prueba'],
    a: 'No: la franja «Versión de prueba en revisión. No es el sitio oficial.» no se puede cerrar y no se cambia: dice siempre lo mismo, arriba de cada página y al final del pie, mientras la web sea de prueba. Los formularios de atención avisan aparte: «Versión de prueba. No escriba datos reales.».',
  },
  // Lost phones of the web's and the desk's people (Ajustes → Equipo).
  {
    id: 'web-roles-telefono-perdido',
    roles: ['admin'],
    q: [
      'a la coordinadora se le perdio el telefono y no puede entrar',
      'alguien de atencion perdio el telefono del doble factor',
      'la editora de la web perdio el telefono',
      'como le reinicio el doble factor a alguien de la web',
      'alguien de la web cambio de telefono y no puede entrar',
    ],
    a: 'Tú: en «Ajustes» → «Equipo», toca «Cambiar» en la fila de esa persona y después «Reiniciar doble factor». Así puede entrar de nuevo y activarlo en el teléfono nuevo.',
    go: '/ajustes/equipo',
  },
  {
    id: 'web-roles-telefono-perdido-jefe',
    roles: ['boss'],
    q: ['si alguien de la web pierde el telefono del doble factor quien lo ayuda', 'alguien de atencion perdio el telefono quien le ayuda', 'la editora de la web perdio el telefono quien la ayuda'],
    a: 'Administración: en «Ajustes» → «Equipo» toca «Cambiar» en la fila de esa persona y después «Reiniciar doble factor». Así puede entrar de nuevo y activarlo en el teléfono nuevo.',
  },
];
