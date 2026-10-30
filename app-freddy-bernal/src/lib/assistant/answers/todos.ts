// 360's answers for everyone (sign-in, two-factor, phone, no signal, Mensajes, tutorials and guides, 360 itself, who does what). See types.ts for the rules of an entry.
// The «¿puedo…? / ¿quién…?» that depend on who asks live here, one entry with a text per role: the role that can do it
// hears «Sí: …» and how; the rest hear who does it. Administración has no Mensajes (D-49, D-82): its key says so.
import type { Answer } from './types';

// What administración hears when it asks how to use Mensajes (shared.ts NO_MESSAGES_LINE).
const NO_MSG = 'Mensajes es del equipo: administración no lo ve, y por eso no tiene el sobre.';
// The roles that know the agenda write under the date rule in Mensajes (MSG_AGENDA); Redes and política write freely.
const FREE_WRITE = 'A ti la plataforma no te frena por fechas: Redes y política no conocen la agenda, así que escriben libre. Lo único que no sale, para nadie, es un teléfono.';

export const TODOS: Answer[] = [
  // ── Entrar: invitación, código y doble factor ──────────────────────────────────────────────────────────────────────
  {
    id: 'todo-entrar',
    roles: null,
    q: [
      'como entro a la plataforma',
      'me llegó una invitación al correo, ¿qué hago?',
      'cómo inicio sesión',
      'como hago pa entrar',
      'me invitaron y no se q hacer',
      'donde pongo el codigo para entrar',
      'primera vez que entro como hago',
      'no se como entrar a la app',
    ],
    a: {
      default:
        'En «Entrar» escribes tu «Correo» y tocas «Mandarme el código». Te llega un código al correo: lo escribes en «Código del correo» y tocas «Entrar». No hay contraseñas. Como tu rol usa doble factor, la primera vez sale «Protege tu cuenta (una sola vez)».',
      camera:
        'En «Entrar» escribes tu «Correo» y tocas «Mandarme el código». Te llega un código al correo: lo escribes en «Código del correo» y tocas «Entrar». No hay contraseñas, y tu rol no usa doble factor: con eso ya entras.',
      social:
        'En «Entrar» escribes tu «Correo» y tocas «Mandarme el código». Te llega un código al correo: lo escribes en «Código del correo» y tocas «Entrar». No hay contraseñas, y tu rol no usa doble factor: con eso ya entras.',
    },
  },
  {
    id: 'todo-sin-contrasena',
    roles: null,
    q: [
      'cual es mi clave pa entrar',
      'cuál es la contraseña de la plataforma',
      'se me olvidó la contraseña',
      'olvide mi clave',
      'como cambio mi contraseña',
      'recuperar contraseña',
      'cual es mi contraseña',
      'no me acuerdo de la clave',
    ],
    a: {
      default:
        'No hay contraseñas. En «Entrar» escribes tu correo, tocas «Mandarme el código» y entras con el código que te llega al correo. Como tu rol usa doble factor, además escribes el «Código de tu aplicación».',
      camera: 'No hay contraseñas: en «Entrar» escribes tu correo, tocas «Mandarme el código» y entras con el código que te llega. Cada vez que entras pides uno nuevo.',
      social: 'No hay contraseñas: en «Entrar» escribes tu correo, tocas «Mandarme el código» y entras con el código que te llega. Cada vez que entras pides uno nuevo.',
    },
  },
  {
    id: 'todo-codigo-no-llega',
    roles: null,
    q: [
      'no me llega el codigo al correo',
      'no me llegó el código',
      'pedí el código y nada',
      'el correo con el codigo no llega',
      'no me llega el código para entrar',
      'toy esperando el codigo y no llega',
      'donde llega el codigo',
    ],
    a: {
      default:
        'Revisa la carpeta de spam y que el correo esté bien escrito (si no, «Usar otro correo»). Tiene que ser el correo con el que te invitaron. Espera un minuto y pide otro con «Mandarme el código». Si sigue sin llegar, dímelo y le aviso a administración.',
      admin:
        'Mientras se prueba la plataforma, ningún correo sale: quedan en Ajustes → «Buzón de correos». Si ya salen, revisa spam y que el correo esté bien escrito (si no, «Usar otro correo»), espera un minuto y pide otro con «Mandarme el código».',
    },
  },
  {
    id: 'todo-codigo-invalido',
    roles: null,
    q: [
      'el codigo del correo no me sirve, dice que es invalido',
      'dice el código no es correcto o ya venció',
      'puse el codigo y no entra',
      'el código no funciona',
      'codigo incorrecto que hago',
      'dice pediste muchos codigos seguidos',
    ],
    a: {
      default:
        'Si sale «El código no es correcto o ya venció. Pide uno nuevo.», escribe el último código que te llegó (cada uno vence en pocos minutos) o pide otro con «Mandarme el código». Si pediste muchos seguidos, espera un minuto. Si sigue igual, dímelo y le aviso a administración.',
      admin:
        'Si sale «El código no es correcto o ya venció. Pide uno nuevo.», escribe el último código que te llegó (cada uno vence en pocos minutos) o pide otro con «Mandarme el código». Si pediste muchos seguidos, espera un minuto y vuelve a intentar.',
    },
  },
  {
    id: 'todo-otro-correo',
    roles: null,
    q: ['me equivoque de correo al entrar', 'puse mal el correo', 'quiero entrar con otro correo', 'escribí otro correo y no llega', 'como vuelvo a escribir el correo'],
    a: 'En la pantalla del código toca «Usar otro correo» y vuelve a escribirlo. Entra con el mismo correo con el que te invitaron: a otro no le llega el código.',
  },
  {
    id: 'todo-quien-doble-factor',
    roles: null,
    q: [
      'por qué a mí no me pide doble factor y al jefe sí',
      'yo tengo que usar doble factor',
      'quién usa doble factor',
      'a quien le pide el codigo de la aplicacion',
      'mi rol usa doble factor?',
      'xq a mi me pide el autenticador',
      'todos tienen doble factor',
    ],
    a: {
      camera: 'No: Grabación entra solo con el código del correo. El doble factor lo usan el jefe, el despacho, política y el IVT, porque ven información delicada.',
      social: 'No: Redes entra solo con el código del correo. El doble factor lo usan el jefe, el despacho, política y el IVT, porque ven información delicada.',
      admin: 'Tú sí: administración usa el doble factor, igual que el jefe, el despacho, política y el IVT. Redes y Grabación no: entran solo con el código del correo.',
      default: 'Tú sí: tu rol ve información delicada, así que además del código del correo usas el «Código de tu aplicación». Redes y Grabación no: entran solo con el código del correo.',
    },
  },
  {
    id: 'todo-instalar-autenticador',
    roles: null,
    q: ['tengo que instalar google authenticator', 'necesito el autenticador', 'hay que bajar una app de codigos', 'debo instalar microsoft authenticator', 'tengo q instalar algo pa entrar'],
    a: {
      default:
        'Sí: la primera vez que entras sale «Protege tu cuenta (una sola vez)». Instalas Google Authenticator o Microsoft Authenticator (gratis), tocas «Mostrar el código QR», lo escaneas y escribes el código que aparece.',
      camera: 'No: tu rol entra solo con el código del correo, sin aplicación de códigos.',
      social: 'No: tu rol entra solo con el código del correo, sin aplicación de códigos.',
    },
  },
  {
    id: 'todo-activar-doble-factor',
    roles: null,
    q: [
      'como activo el doble factor',
      'bueno, ¿cómo activo el doble factor?',
      'cómo configuro el autenticador',
      'qué hago en protege tu cuenta',
      'como escaneo el codigo qr',
      'como se pone el doble factor',
      'pasos del doble factor',
    ],
    a: {
      default:
        'La primera vez que entras sale «Protege tu cuenta (una sola vez)»: instala una aplicación de códigos, toca «Mostrar el código QR», en la aplicación toca «+» y escanéalo, escribe el «Código de 6 números» que aparece y toca «Confirmar». Desde ahí, cada vez que entras te pide el «Código de tu aplicación».',
      camera: 'Tu rol no usa doble factor: entras solo con el código del correo. Lo usan el jefe, el despacho, política y el IVT.',
      social: 'Tu rol no usa doble factor: entras solo con el código del correo. Lo usan el jefe, el despacho, política y el IVT.',
    },
  },
  {
    id: 'todo-app-doble-factor',
    roles: null,
    q: ['que aplicacion necesito para el doble factor', 'cuál app de códigos uso', 'qué autenticador bajo', 'sirve google authenticator', 'donde descargo la app de codigos'],
    a: {
      default: 'Una aplicación de códigos: Google Authenticator o Microsoft Authenticator, gratis en Play Store o App Store.',
      camera: 'Tu rol no la necesita: entras solo con el código del correo. Las que sirven para el doble factor son Google Authenticator o Microsoft Authenticator.',
      social: 'Tu rol no la necesita: entras solo con el código del correo. Las que sirven para el doble factor son Google Authenticator o Microsoft Authenticator.',
    },
  },
  {
    id: 'todo-qr-no-escanea',
    roles: null,
    q: ['no puedo escanear el código QR del doble factor', 'la camara no lee el qr', 'no me escanea el codigo', 'estoy en el mismo telefono y no puedo escanear', 'no sale el codigo qr'],
    a: 'Debajo del código QR toca «¿No puedes escanear? Escribe esta clave»: copias esa clave en la aplicación de códigos y escribes el código que te da. Si todavía no ves el QR, toca «Mostrar el código QR».',
  },
  {
    id: 'todo-qr-recargue',
    roles: null,
    q: ['recargue la pagina del qr y no me acepta el codigo', 'se cerró la página del doble factor', 'escaneé el qr pero salí y ahora no sirve', 'el codigo no sirve la primera vez que activo'],
    a: 'Escribe el código antes de salir de esa página. Si la recargaste, toca otra vez «Mostrar el código QR» y escanea el nuevo: el de antes deja de servir.',
  },
  {
    id: 'todo-codigo-app-no-coincide',
    roles: null,
    q: [
      'el codigo de la aplicacion no me sirve',
      'dice el código no coincide',
      'el autenticador da un codigo y no entra',
      'me sale que el codigo no coincide',
      'el código de 6 números no funciona',
    ],
    a: {
      default:
        'Sale «El código no coincide. Mira que la hora del teléfono esté bien y usa el código que se ve ahora.»: pon la hora del teléfono en automática y escribe el código que se ve en ese momento. Si cambiaste de teléfono, pídele ayuda a quien te invitó: administración te reinicia el doble factor.',
      admin:
        'Sale «El código no coincide. Mira que la hora del teléfono esté bien y usa el código que se ve ahora.»: pon la hora del teléfono en automática y escribe el código que se ve en ese momento. Si cambiaste de teléfono, pídele a otra persona de administración «Reiniciar doble factor».',
      camera: 'Tu rol no usa aplicación de códigos: entras solo con el código del correo. Si el del correo no sirve, pide otro con «Mandarme el código».',
      social: 'Tu rol no usa aplicación de códigos: entras solo con el código del correo. Si el del correo no sirve, pide otro con «Mandarme el código».',
    },
  },
  {
    id: 'todo-codigo-cada-vez',
    roles: null,
    q: ['por qué me pide un código de la aplicación cada vez que entro', 'cada vez que entro me pide el autenticador', 'tengo que poner el codigo siempre', 'xq me pide dos codigos'],
    a: {
      default:
        'Es el doble factor: tu rol ve información delicada, así que cada vez que entras, además del código del correo, te pide el «Código de tu aplicación». Abres la aplicación de códigos y escribes el que se ve ahora.',
      camera: 'Tu rol solo usa el código del correo: cada vez que entras pides uno con «Mandarme el código». No usas aplicación de códigos.',
      social: 'Tu rol solo usa el código del correo: cada vez que entras pides uno con «Mandarme el código». No usas aplicación de códigos.',
    },
  },
  {
    id: 'todo-para-que-doble-factor',
    roles: null,
    q: ['para que sirve el doble factor', 'qué es el doble factor', 'por qué hay doble factor', 'q es eso del autenticador', 'que es el codigo de tu aplicacion'],
    a: 'Protege las cuentas que ven información delicada: además del código del correo, pide un código de tu teléfono. Sin él no se ven la agenda ni los contactos, y no se aprueba. Lo usan el jefe, el despacho, política, el IVT y administración; Redes y Grabación no.',
  },
  {
    id: 'todo-perdi-telefono',
    roles: null,
    q: [
      'perdí el teléfono, ¿cómo entro ahora?',
      'me robaron el celular',
      'se me perdio el cel con el autenticador',
      'perdi mi telefono que hago',
      'perdí mi teléfono y tenía el autenticador ahí',
      'me robaron el telefono y tenia la plataforma abierta',
    ],
    a: {
      default:
        'Avísale ya a administración (dímelo y le aviso): te cierra las sesiones y te reinicia el doble factor. La próxima vez que entres, desde el teléfono nuevo, lo activas otra vez con «Protege tu cuenta (una sola vez)».',
      camera: 'Avísale ya a administración (dímelo y le aviso) para que te cierre las sesiones. Tu rol no usa doble factor: en el teléfono nuevo entras con el código del correo.',
      social: 'Avísale ya a administración (dímelo y le aviso) para que te cierre las sesiones. Tu rol no usa doble factor: en el teléfono nuevo entras con el código del correo.',
      admin:
        'Pídele a otra persona de administración que, en Ajustes → Equipo, toque «Cerrar sus sesiones» y «Reiniciar doble factor» en tu nombre: tu propio doble factor lo reinicia otra persona. Al entrar, lo activas de nuevo.',
    },
  },
  {
    id: 'todo-cambio-telefono',
    roles: null,
    q: [
      'voy a cambiar de telefono, que hago con el doble factor',
      'cambie de cel y ya no tengo el autenticador q hago',
      'compré un teléfono nuevo',
      'cambié de teléfono y no puedo entrar',
      'teléfono nuevo cómo paso el autenticador',
    ],
    a: {
      default:
        'Pídele ayuda a quien te invitó: administración te reinicia el doble factor y, la próxima vez que entres, lo activas en el teléfono nuevo con «Mostrar el código QR». Ahí mismo, en Mi perfil, toca «Activar avisos».',
      camera: 'Entras con el código del correo, como siempre: tu rol no usa doble factor. En el teléfono nuevo abre Mi perfil y toca «Activar avisos» para que te lleguen.',
      social: 'Entras con el código del correo, como siempre: tu rol no usa doble factor. En el teléfono nuevo abre Mi perfil y toca «Activar avisos» para que te lleguen.',
      admin: 'Pídele a otra persona de administración «Reiniciar doble factor» en Ajustes → Equipo; al entrar en el teléfono nuevo lo activas de nuevo con «Mostrar el código QR».',
    },
  },
  {
    id: 'todo-me-reiniciaron',
    roles: ['admin', 'boss', 'dispatch', 'politics', 'ivt'],
    q: ['administración me reinició el doble factor y ahora qué', 'me reiniciaron el doble factor', 'qué pasa cuando me reinician el autenticador', 'otra vez me sale protege tu cuenta'],
    a: 'Se cerraron tus sesiones: al entrar con el código del correo te sale otra vez «Protege tu cuenta (una sola vez)». Abre la aplicación de códigos en tu teléfono, toca «Mostrar el código QR», escanéalo y escribe el código.',
  },
  {
    id: 'todo-sin-rol',
    roles: null,
    q: ['me sale todavía no tienes un rol', 'entré y dice sin acceso', 'no tengo rol', 'por qué no veo nada al entrar', 'me dice que pida que me asignen mi rol'],
    a: 'Sale «Todavía no tienes un rol» cuando tu cuenta no tiene rol: pídele a administración que te lo dé en Equipo. Cuando lo haga, toca «Salir» y vuelve a entrar.',
  },
  {
    id: 'todo-doble-factor-perfil',
    roles: ['admin', 'boss', 'dispatch', 'politics', 'ivt'],
    q: ['en mi perfil dice doble factor no usado en esta sesion', 'que significa doble factor activo en esta sesión', 'mi perfil dice doble factor', 'como se si tengo el doble factor'],
    a: 'En Mi perfil, en «Mis datos», se ve cómo entraste: “activo en esta sesión” si escribiste el código de tu aplicación al entrar. Si dice “no usado en esta sesión”, entraste sin él: sal con «Salir» y vuelve a entrar.',
  },
  {
    id: 'todo-salir',
    roles: null,
    q: ['como cierro sesion', 'como salgo de la app', 'donde esta salir', 'cerrar sesión', 'como me salgo de la plataforma', 'quiero salir de mi cuenta', 'boton de salir'],
    a: 'Arriba a la derecha, «Mi cuenta» → «Salir». Al salir, ese teléfono deja de recibir tus avisos y se borran de él los borradores que no guardaste.',
  },
  {
    id: 'todo-salir-borradores',
    roles: null,
    q: ['si cierro sesión se borran los borradores', 'al salir pierdo lo que escribi', 'qué pasa si toco salir', 'se borra algo si salgo', 'teléfono compartido cómo hago'],
    a: 'Sí: al tocar «Salir» se borran del teléfono los borradores que no guardaste, y ese teléfono deja de recibir tus avisos. Lo que ya guardaste queda en la plataforma. Antes de salir, toca «Guardar» en lo que estés escribiendo.',
  },
  {
    id: 'todo-cuenta-prestada',
    roles: null,
    q: ['puedo prestar mi cuenta', 'puedo entrar con la cuenta de otro', 'podemos usar el mismo usuario', 'le paso mi usuario a un compañero', 'los de grabación pueden compartir un mismo usuario'],
    a: {
      default: 'No: cada persona tiene su usuario, aunque compartan el rol, y lo que haces queda con tu nombre. Si alguien nuevo necesita entrar, administración lo invita.',
      boss: 'No: tu cuenta y tu código del doble factor no se prestan, porque con ellos se aprueba todo y se arman los canales. Cada persona tiene su usuario; administración invita a quien haga falta.',
      admin: 'No: cada persona tiene su usuario, aunque compartan el rol. Si alguien nuevo necesita entrar, lo invitas en Ajustes → Equipo con «Invitar a alguien».',
    },
  },
  {
    id: 'todo-cambiar-correo',
    roles: null,
    q: ['puedo cambiar mi correo', 'dnd cambio mi correo', 'quiero cambiar el correo con el que entro', 'cambiar email', 'mi correo esta mal en la plataforma'],
    a: {
      default: 'No en Mi perfil: el correo con el que entras no se cambia ahí. Pídeselo a administración.',
      admin:
        'El correo con el que se entra no se cambia en Mi perfil, y en Equipo tampoco hay cómo cambiarlo: se invita el correo nuevo con «Invitar a alguien» (es otro usuario) y la cuenta vieja se apaga con «Desactivar». Tus propios roles te los da otra persona de administración.',
    },
  },

  // ── El teléfono y lo de arriba de la pantalla ─────────────────────────────────────────────────────────────────────
  {
    id: 'todo-instalar-app',
    roles: null,
    q: ['como instalo la app en el telefono', 'cómo pongo la plataforma como app', 'agregar a la pantalla de inicio', 'quiero el icono en el celular', 'como la descargo', 'instalar en android', 'instalar en iphone'],
    a: 'Se usa en el navegador del teléfono y se agrega a la pantalla de inicio. En Android, en Chrome, el menú de los tres puntos y la opción de agregarla a la pantalla de inicio; en iPhone, en Safari, «Compartir» → «Agregar a pantalla de inicio». Después entra a Mi perfil y toca «Activar avisos».',
    go: '/perfil',
  },
  {
    id: 'todo-play-store',
    roles: null,
    q: ['la app está en la Play Store', 'esta en la app store', 'donde la bajo de la tienda', 'hay que descargarla de play store', 'busco la app en la tienda y no sale'],
    a: 'No está en las tiendas: se usa en el navegador del teléfono y se agrega a la pantalla de inicio, y queda como una app. De la tienda solo se baja la aplicación de códigos del doble factor, si tu rol lo usa.',
  },
  {
    id: 'todo-iphone-avisos',
    roles: null,
    q: ['en el iphone me llegan los avisos', 'no me llegan avisos en el iphone', 'tengo iphone, como activo los avisos', 'notificaciones en iphone'],
    a: 'Sí, pero solo con la app agregada a la pantalla de inicio: en Safari, «Compartir» → «Agregar a pantalla de inicio». Ábrela desde el ícono nuevo, entra a Mi perfil y toca «Activar avisos». El iPhone tiene que estar actualizado.',
    go: '/perfil',
  },
  {
    id: 'todo-menu-telefono',
    roles: null,
    q: ['dónde está el menú en el teléfono', 'donde estan las pantallas en el cel', 'no encuentro el menu', 'el menu de abajo', 'como me muevo en el telefono', 'que pantallas tengo en el menu'],
    a: {
      boss: 'Abajo, la barra: Inicio, Agenda, Por aprobar, Redes y «Más» (Obras, Municipios y Digital). Arriba están «Crear», el sobre de Mensajes, la campana y «Mi cuenta».',
      dispatch: 'Abajo, la barra: Hoy, Agenda, Obras, Municipios y Biblioteca. Arriba están «Crear», el sobre de Mensajes, la campana y «Mi cuenta».',
      politics: 'Abajo está Municipios, tu pantalla. Arriba están «Crear» (para la ficha comunitaria), el sobre de Mensajes, la campana y «Mi cuenta».',
      ivt: 'Abajo, la barra: Agenda (tus visitas de obra) y Obras. Arriba están «Crear», el sobre de Mensajes, la campana y «Mi cuenta».',
      camera: 'Abajo, la barra: Hoy y Agenda. Arriba están el sobre de Mensajes, la campana y «Mi cuenta» (Grabación no tiene «Crear»).',
      social: 'Abajo, la barra: Hoy, Agenda, Redes, Tweets y «Más» (Publicar, Resultados y Biblioteca). Arriba están «Crear», el sobre de Mensajes, la campana y «Mi cuenta».',
      admin:
        'Abajo, la barra: Hoy, Agenda, Redes, Ajustes y «Más» con el resto (Por aprobar, Obras, Municipios, Tweets, Publicar, Resultados y Biblioteca). Arriba están «Crear», la campana y «Mi cuenta».',
    },
  },
  {
    id: 'todo-mas',
    roles: null,
    q: ['no veo todas las pantallas abajo en el telefono', 'que es el boton mas', 'dónde están las otras pantallas', 'falta una pantalla en la barra', 'qué hay en más'],
    a: {
      default: 'Tus pantallas caben todas en la barra de abajo, así que no tienes «Más». Si una pantalla no está en tu barra, es de otro rol.',
      boss: 'La barra de abajo no tiene lugar para todo: la última dice «Más» y adentro están Obras, Municipios y Digital.',
      social: 'La barra de abajo no tiene lugar para todo: la última dice «Más» y adentro están Publicar, Resultados y Biblioteca.',
      admin: 'La barra de abajo no tiene lugar para todo: la última dice «Más» y adentro están Por aprobar, Obras, Municipios, Tweets, Publicar, Resultados y Biblioteca.',
    },
  },
  {
    id: 'todo-computadora',
    roles: null,
    q: ['puedo usar la plataforma en la computadora', 'funciona en la pc', 'se puede abrir en la laptop', 'en la compu donde esta el menu'],
    a: {
      default: 'Sí: ábrela en el navegador de la computadora y entra con tu correo. El menú está a la izquierda, y arriba están «Buscar evento o pieza», la campana y «Mi cuenta».',
      admin: 'Sí: ábrela en el navegador de la computadora y entra con tu correo. El menú está a la izquierda, y arriba están «Buscar evento o pieza», «Ver como», la campana y «Mi cuenta».',
    },
  },
  {
    id: 'todo-modo-sol',
    roles: null,
    q: ['qué es el modo sol', 'como pongo la letra mas grande que en la calle no veo nada', 'no se ve la pantalla con el sol', 'más contraste', 'letra grande', 'modo sol donde esta', 'la letra se ve muy chiquita en la calle', 'no veo bien la pantalla afuera', 'agrandar la letra', 'la letra es muy pequeña', 'con el sol no leo nada'],
    a: 'Arriba a la derecha, «Mi cuenta» → «Modo sol»: más contraste y letra más grande para leer en la calle. Se apaga en el mismo lugar.',
  },
  {
    id: 'todo-modo-oscuro',
    roles: null,
    q: ['como pongo modo oscuro', 'la pantalla se puso oscura', 'quiero la pantalla clara', 'tema oscuro', 'cambiar los colores de la pantalla'],
    a: 'La plataforma sigue el modo claro u oscuro de tu teléfono: se cambia en los ajustes de pantalla del teléfono. Para leer en la calle, «Mi cuenta» → «Modo sol».',
  },
  {
    id: 'todo-consejos',
    roles: null,
    q: ['q son los consejitos q salen y como los quito', 'qué es el cuadrito de consejo', 'como cierro el consejo', 'sale un consejo en la pantalla', 'quitar los tips'],
    a: 'Son consejos de una línea que salen las primeras veces en cada pantalla. Los cierras con «Entendido».',
  },
  {
    id: 'todo-no-es-de-tu-rol',
    roles: null,
    q: [
      'me sale esa pantalla no es de tu rol, ¿qué pasó?',
      'me equivoque y abri una pantalla que no es mia y me devolvio',
      'me devolvió al inicio',
      'abro un link y me manda al inicio',
      'dice te trajimos a tu inicio',
      'abro mensajes y me devuelve al inicio',
    ],
    a: {
      default:
        'Abriste una pantalla que no es de tu rol, y la plataforma te trajo a tu inicio: «Esa pantalla no es de tu rol. Te trajimos a tu inicio.». No es una falla: cada rol ve lo suyo. Si de verdad la necesitas para tu trabajo, pídeselo a administración.',
      admin: 'Abriste una pantalla que no es de administración (por ejemplo Mensajes, que es del equipo) y te trajo a tu inicio: «Esa pantalla no es de tu rol. Te trajimos a tu inicio.». No es una falla.',
    },
  },
  {
    id: 'todo-crear',
    roles: null,
    q: ['qué es el botón crear de arriba', 'para que sirve crear', 'que puedo crear', 'qué sale en crear', 'el boton crear'],
    a: {
      boss: '«Crear» trae solo lo que tu rol puede crear: Nuevo evento, Visita de obra, Ficha de obra, Ficha comunitaria, Nueva pieza, Tweets de la semana y Nueva publicación.',
      dispatch: '«Crear» trae solo lo que tu rol puede crear: Nuevo evento, Visita de obra, Ficha de obra y Ficha comunitaria.',
      politics: '«Crear» trae solo lo que tu rol puede crear: la Ficha comunitaria.',
      ivt: '«Crear» trae solo lo que tu rol puede crear: la Ficha de obra.',
      camera: 'Grabación no tiene «Crear»: grabas lo que te asignan y subes el material en cada evento.',
      social: '«Crear» trae solo lo que tu rol puede crear: Nueva pieza, Tweets de la semana y Nueva publicación.',
      admin: '«Crear» trae solo lo que administración puede crear: Ficha de obra, Nueva pieza, Tweets de la semana y Nueva publicación. Eventos no: los crean el jefe y el despacho.',
    },
  },
  {
    id: 'todo-no-tengo-crear',
    roles: null,
    q: ['por qué no tengo el botón crear', 'no me sale crear', 'no veo nuevo evento en crear', 'en crear no esta lo que necesito', 'por que no puedo crear un evento desde crear'],
    a: {
      default: '«Crear» trae solo lo que tu rol puede crear. Si buscas algo que no está, es de otro rol: los eventos los crean el jefe y el despacho, y las piezas Redes.',
      camera: 'Porque Grabación no crea eventos ni piezas: grabas lo que te asignan y subes el material en la pestaña Material de cada evento.',
      politics: 'Tu «Crear» tiene solo la Ficha comunitaria: los eventos los crean el jefe y el despacho, que le ponen fecha a tu ficha.',
      ivt: 'Tu «Crear» tiene solo la Ficha de obra: la visita la arman el jefe y el despacho cuando le ponen fecha.',
      social: 'Tu «Crear» tiene Nueva pieza, Tweets de la semana y Nueva publicación. Los eventos los crean el jefe y el despacho.',
      admin: 'Tu «Crear» tiene Ficha de obra, Nueva pieza, Tweets de la semana y Nueva publicación. Los eventos y las fichas comunitarias no son de administración.',
    },
  },
  {
    id: 'todo-buscar',
    roles: null,
    q: ['como busco una pieza', 'cómo busco un evento', 'donde esta el buscador', 'la lupa', 'buscar por nombre', 'como encuentro algo rapido', 'cómo busco un municipio'],
    a: {
      default: 'Con la lupa de arriba (en la computadora, «Buscar evento o pieza»): escribes en «Evento, lugar, municipio o pieza» y tocas lo que quieres abrir. Solo encuentras lo que tu rol puede ver.',
      social:
        'Con la lupa de arriba (en la computadora, «Buscar evento o pieza»): escribes en «Evento, lugar, municipio o pieza». En Redes también está «Buscar en Redes», que busca en títulos, copies, avisos y tweets.',
      boss: 'Con la lupa de arriba (en la computadora, «Buscar evento o pieza»): escribes en «Evento, lugar, municipio o pieza». En Redes también está «Buscar en Redes», que busca en títulos, copies, avisos y tweets.',
      admin: 'Con la lupa de arriba (en la computadora, «Buscar evento o pieza»): escribes en «Evento, lugar, municipio o pieza». En Redes también está «Buscar en Redes», que busca en títulos, copies, avisos y tweets.',
      politics: 'Tus municipios están todos en Municipios, con sus contadores y filtros. Para lo demás, la lupa de arriba: solo encuentras lo que tu rol puede ver.',
    },
    go: '/buscar',
  },
  {
    id: 'todo-mi-cuenta',
    roles: null,
    q: ['qué hay en mi cuenta', 'dónde está mi cuenta', 'el muñequito de arriba', 'menu de la cuenta', 'para que sirve el icono de persona arriba'],
    a: {
      default: 'Arriba a la derecha, «Mi cuenta» tiene «Mi perfil y avisos», «Ayuda y guías», «Ver el tutorial de esta pantalla» (si la pantalla tiene uno), el «Modo sol» y «Salir».',
      admin: 'Arriba a la derecha, «Mi cuenta» tiene «Mi perfil y avisos», «Ayuda y guías», el «Modo sol» y «Salir»; en el teléfono, también «Ver como».',
    },
  },
  {
    id: 'todo-mi-inicio',
    roles: null,
    q: ['cuál es mi pantalla de inicio', 'donde arranco', 'qué veo al entrar', 'cual es mi inicio', 'a donde me lleva al entrar'],
    a: {
      boss: 'Tu Inicio: lo vencido de los municipios, «Te toca aprobar» y cuatro botones grandes con sus números: Política, Obras, Redes y Digital.',
      dispatch: 'Hoy: primero «Por ponerle fecha», los eventos del día, las fichas técnicas incompletas y lo que espera la decisión del jefe.',
      politics: 'Municipios: arriba lo vencido, y cada municipio con sus fichas comunitarias.',
      ivt: 'Obras: tus fichas de obra, las que están en borrador y las que esperan fecha.',
      camera: 'Hoy: tus eventos asignados y los que ya pasaron sin material («Sube el material»).',
      social: 'Hoy: los cambios pedidos, los eventos sin storyboard, el material que llegó, lo listo para publicar, los días de tweets y lo «Trancado».',
      admin: 'Hoy, con lo de Redes y lo «Trancado».',
    },
  },

  // ── Sin señal o sin luz ────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'todo-sin-senal',
    roles: null,
    q: ['me sale arriba sin señal, ¿qué hago?', 'dice sin señal', 'se fue el internet', 'estoy sin datos', 'no tengo señal puedo seguir'],
    a: 'Sigue trabajando: arriba dice «Sin señal. Lo que escribas se guarda en el teléfono y se envía cuando vuelva.». Lo que escribes queda en el teléfono; cuando vuelva la señal, toca «Guardar». Las fotos y los videos siguen subiendo solos al volver.',
  },
  {
    id: 'todo-sin-senal-ficha',
    roles: null,
    q: [
      'si no tengo señal en la obra puedo llenar la ficha',
      'se fue la luz mientras escribía una ficha, ¿se perdió?',
      'se me apago el telefono escribiendo',
      'escribo sin internet y despues guardo?',
      'se fue la señal mientras guardaba una ficha de obra',
      'se pierde lo que escribo sin señal',
    ],
    a: 'No se pierde: lo que escribes en fichas, eventos, storyboard y notas queda en el teléfono hasta que tocas «Guardar» con señal. Ojo: si tocas «Salir», esos borradores se borran.',
  },
  {
    id: 'todo-sin-senal-subida',
    roles: null,
    q: ['qué pasa si se va la señal mientras subo un video', 'se me fue el internet subiendo las fotos', 'se cayo el internet subiendo un video y ahora', 'la subida se quedo parada', 'dice sin señal sigue sola cuando vuelva'],
    a: 'Las fotos y los videos se suben por partes: si se va la señal, la subida sigue sola cuando vuelve («Sin señal: sigue sola cuando vuelva.»). No cierres la app hasta que termine.',
  },
  {
    id: 'todo-guia-sin-senal',
    roles: null,
    q: ['puedo ver la guia sin internet', 'la guia no me abre sin internet', 'los tutoriales funcionan sin señal', 'descargar la guía al telefono', 'guardar la guia en el telefono', 'sin internet no me abre la guia', 'la guia no carga sin datos', 'abrir la guia sin señal'],
    a: 'No: la guía y los tutoriales necesitan señal. La plataforma no guarda páginas en el teléfono, por privacidad.',
  },
  {
    id: 'todo-borrador-otro-equipo',
    roles: null,
    q: ['empece en el telefono puedo seguir en la computadora', 'lo que escribí en el cel sale en la pc', 'el borrador se ve en otro telefono', 'dónde quedan los borradores'],
    a: 'Lo que no has guardado queda solo en ese teléfono o esa computadora. Toca «Guardar» con señal y ya lo ves desde cualquier lado.',
  },
  // ── La demostración (D-39) ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'todo-demo-servidor',
    roles: null,
    q: [
      'dice que se creo en otro servidor de la demostracion',
      'que es eso de otro servidor de la demo',
      'la pieza que cree no aparece en la demo',
      'en la demo no sale lo que hice hace rato',
      'la miniatura esta en otro servidor',
      'por que en la demo desaparece lo que subo',
    ],
    a: 'Es un límite de la demostración: cada servidor tiene su base, y lo que creas o subes vive solo en el servidor donde se hizo. Si después te contesta otro, no lo encuentra. Lo más seguro es probar sobre lo que ya viene cargado; con los datos reales esto no pasa.',
  },
  {
    id: 'todo-demo-reinicio',
    roles: null,
    q: [
      'se reinicio la demo y se perdio todo lo que hice',
      'se borro todo en la demo',
      'la demo volvio a como estaba',
      'por que se borran mis cosas en la demo',
      'los datos de la demo son de verdad',
      'lo que escribo en la demo se guarda',
    ],
    a: 'La demostración es una base de prueba con datos inventados, en memoria: cuando el servidor se reinicia, vuelve a los datos inventados y lo que hiciste se pierde. Con los datos reales no pasa.',
  },
  {
    id: 'todo-demo-entrar',
    roles: null,
    q: [
      'como entro como redes en la demo para probar',
      'entrar a la demo con otro rol',
      'como pruebo la demo',
      'cuales son los usuarios de la demo',
      'que es version de demostracion',
      'entrar sin codigo en la demo',
    ],
    a: {
      default: 'En «Entrar», en la lista «Versión de demostración», tocas el rol y entras directo, sin código ni doble factor: es un atajo solo para probar. Con los datos reales no existe.',
      admin: 'En «Entrar», en la lista «Versión de demostración», tocas el rol y entras directo, sin código (atajo solo para probar; con los datos reales no existe). Sin salir de tu cuenta, «Ver como» te muestra los menús de ese rol.',
    },
  },

  // ── Avisos y Mi perfil ─────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'todo-avisos-donde',
    roles: null,
    q: ['¿dónde veo mis avisos?', 'donde estan las notificaciones', 'la campana', 'ver avisos', 'tengo avisos?'],
    a: 'En la campana de arriba: ahí están los avisos de tu trabajo. Tocas uno para ir a lo que dice.',
    go: '/avisos',
  },
  {
    id: 'todo-campana-numero',
    roles: null,
    q: ['que significa el numerito de la campana', 'el numero rojo de la campana', 'por qué la campana tiene un número', 'cuantos avisos tengo sin leer'],
    a: 'Es cuántos avisos no has leído. Con «Marcar todo como leído», en Avisos, la campana queda en cero.',
    go: '/avisos',
  },
  {
    id: 'todo-marcar-leidos',
    roles: null,
    q: ['¿cómo marco todos los avisos como leídos?', 'como limpio la campana', 'borrar los avisos', 'poner en cero la campana', 'quitar los avisos viejos'],
    a: 'Abre la campana y toca «Marcar todo como leído»: la campana queda en cero. Los avisos no se borran; siguen en la lista. También me lo puedes pedir: “marca mis avisos como leídos”.',
    go: '/avisos',
  },
  {
    id: 'todo-tocar-aviso',
    roles: null,
    q: ['si toco un aviso se aprueba algo', 'abrir un aviso hace algo', 'toque un aviso sin querer', 'el aviso aprueba solo'],
    a: 'No: tocar un aviso solo abre lo que corresponde. Nunca aprueba ni cambia nada por sí solo.',
  },
  {
    id: 'todo-avisos-sin-fecha',
    roles: null,
    q: ['los avisos dicen la hora del evento', 'el aviso trae la fecha', 'por que el aviso no dice cuando es', 'el correo de aviso dice el lugar'],
    a: {
      default: 'No: ningún aviso ni correo lleva la fecha, la hora ni el lugar de un evento; es información de seguridad. Tú la ves en la Agenda.',
      camera: 'No: ningún aviso ni correo lleva la fecha, la hora ni el lugar de un evento; es información de seguridad. La de tus eventos asignados la ves en Agenda.',
      ivt: 'No: ningún aviso ni correo lleva la fecha, la hora ni el lugar de un evento; es información de seguridad. La de tus visitas de obra la ves en Agenda.',
      social: 'No: ningún aviso ni correo lleva la fecha, la hora ni el lugar de un evento; es información de seguridad, y Redes no la ve.',
      politics: 'No: ningún aviso ni correo lleva la fecha, la hora ni el lugar de un evento; es información de seguridad, y política no la ve.',
    },
  },
  {
    id: 'todo-activar-avisos',
    roles: null,
    q: ['¿cómo activo los avisos en el teléfono?', 'activar notificaciones', 'quiero que me suene el telefono', 'como hago pa q me lleguen los avisos al cel', 'avisos con la app cerrada'],
    a: 'En «Mi cuenta» → «Mi perfil y avisos», en «Avisos en este teléfono», toca «Activar avisos» y acepta el permiso. Te avisa aunque la app esté cerrada. Con «Probar aviso» ves que llega.',
    go: '/perfil',
    tutorial: 'perfil',
  },
  {
    id: 'todo-no-llegan-avisos',
    roles: null,
    q: ['xq no me llegan las notificaciones al cel', 'no me llegan los avisos', 'no me suena nada', 'las notificaciones no funcionan', 'no me avisa el telefono', 'deje de recibir avisos'],
    a: 'En Mi perfil, mira que «Avisos en este teléfono» diga «Activos en este teléfono» (si no, «Activar avisos») y prueba con «Probar aviso». Revisa «Qué avisos quiero» y las «Horas de silencio». En iPhone solo llegan con la app en la pantalla de inicio. Si tocaste «Salir», actívalos otra vez.',
    go: '/perfil',
  },
  {
    id: 'todo-avisos-bloqueados',
    roles: null,
    q: ['dice bloqueaste los avisos', 'bloquee las notificaciones sin querer', 'le di no permitir a las notificaciones', 'como desbloqueo los avisos'],
    a: 'Le dijiste que no al permiso. Actívalo en los ajustes: en iPhone, Ajustes › Notificaciones; en Android, mantén presionado el ícono de la app → «Información de la app» › Notificaciones; en la computadora, el candado junto a la dirección. Después vuelve a Mi perfil.',
    go: '/perfil',
  },
  {
    id: 'todo-probar-aviso',
    roles: null,
    q: ['como se si me llegan los avisos', 'probar notificacion', 'mandarme un aviso de prueba', 'para que es probar aviso'],
    a: 'En Mi perfil, con los avisos activos, toca «Probar aviso»: te llega uno de prueba a este teléfono.',
    go: '/perfil',
  },
  {
    id: 'todo-apagar-avisos',
    roles: null,
    q: ['como apago los avisos en este telefono', 'no quiero notificaciones en el cel', 'desactivar avisos', 'que no me lleguen avisos al telefono'],
    a: 'En Mi perfil, en «Avisos en este teléfono», toca «Desactivar». Si solo quieres menos, elige en «Qué avisos quiero» o usa las «Horas de silencio». Los avisos siguen en la campana.',
    go: '/perfil',
  },
  {
    id: 'todo-horas-silencio',
    roles: null,
    q: ['¿cómo hago para que no me suene el teléfono de noche?', 'horas de silencio', 'no molestar de noche', 'que no suene en la madrugada', 'silenciar avisos por la noche', 'q son las horas de silencio'],
    a: 'En Mi perfil, «Horas de silencio»: marca «No mandar avisos al teléfono de noche», elige «Desde» y «Hasta», y toca «Guardar». De noche el teléfono no suena; los avisos importantes sí llegan y todo queda en «Avisos».',
    go: '/perfil',
    tutorial: 'perfil',
  },
  {
    id: 'todo-que-avisos-quiero',
    roles: null,
    q: ['kiero q no me lleguen avisos x correo', 'como elijo que avisos me llegan', 'no quiero tantos avisos', 'apagar un tipo de aviso', 'avisos por correo', 'quitar los correos de la plataforma'],
    a: 'En Mi perfil, «Qué avisos quiero»: marcas los que quieres recibir, por correo y en el teléfono, y tocas «Guardar». Los importantes llegan siempre.',
    go: '/perfil',
    tutorial: 'perfil',
  },
  {
    id: 'todo-resumen-diario',
    roles: null,
    q: ['qué es el resumen diario por correo', 'me llega un correo cada dia', 'quitar el resumen diario', 'quiero un resumen por correo', 'el resumen diario por correo donde llega', 'cada cuanto llega el resumen'],
    a: {
      default: 'Es una opción de «Qué avisos quiero», en Mi perfil: «Resumen diario por correo». La marcas o la desmarcas y tocas «Guardar».',
      admin: 'Es una opción de «Qué avisos quiero», en Mi perfil: «Resumen diario por correo» (la marcas y tocas «Guardar»). Mientras se prueba la plataforma, ese correo no sale: queda en Ajustes → «Buzón de correos».',
    },
    go: '/perfil',
  },
  {
    id: 'todo-varios-telefonos',
    roles: null,
    q: ['tengo avisos activos en varios teléfonos', 'quiero avisos en el cel y en la computadora', 'activar avisos en otro telefono', 'dice tienes avisos activos en 2 telefonos'],
    a: 'Los avisos se activan en cada teléfono o navegador: entra a Mi perfil en cada uno y toca «Activar avisos». Mi perfil te dice en cuántos los tienes activos.',
    go: '/perfil',
  },
  {
    id: 'todo-aviso-rol-nuevo',
    roles: null,
    q: ['me llegó un aviso que dice alguien nuevo en el equipo, ¿qué es?', 'que es un rol nuevo en el equipo', 'aviso de que administración invitó a alguien', 'me avisaron que le dieron un rol a alguien'],
    a: {
      boss: 'Administración invitó a alguien o le dio un rol del equipo: cada rol que da te llega como aviso, para que sepas quién entra a «Todo el equipo». Al tocarlo se abre Mensajes, donde ves quién está en cada canal.',
      admin: 'Es el aviso que le llega al jefe cada vez que das un rol del equipo o invitas a alguien con uno: “Un rol nuevo en el equipo” o “Alguien nuevo en el equipo”.',
      default: 'Ese aviso le llega solo al jefe: le dice cuando administración da un rol del equipo o invita a alguien.',
    },
  },
  {
    id: 'todo-me-avisas',
    roles: null,
    q: ['me avisas cuando el jefe apruebe la pieza', 'avísame cuando llegue el material', 'me puedes recordar algo', 'recuérdame revisar los copies', 'ponme un recordatorio', 'me notificas cuando pase'],
    a: {
      default: 'Yo no mando avisos ni recordatorios: la plataforma te avisa sola en la campana cuando pasa algo de tu trabajo. Eliges cuáles en Mi perfil, en «Qué avisos quiero».',
      social: 'Yo no mando avisos ni recordatorios, pero la plataforma te avisa sola en la campana, por ejemplo cuando “Aprobaron una pieza” o “Llegó material nuevo”. Eliges cuáles en Mi perfil, en «Qué avisos quiero».',
    },
    go: '/perfil',
  },
  {
    id: 'todo-mi-perfil',
    roles: null,
    q: ['¿dónde está Mi perfil?', 'como entro a mi perfil', 'mis datos', 'donde estan mis preferencias', 'que puedo cambiar en mi perfil', 'para que sirve mi perfil'],
    a: 'Arriba a la derecha, «Mi cuenta» → «Mi perfil y avisos»: tu nombre y tu teléfono («Mis datos»), los «Avisos en este teléfono», «Qué avisos quiero» y las «Horas de silencio». El correo con el que entras no se cambia ahí.',
    go: '/perfil',
    tutorial: 'perfil',
  },
  {
    id: 'todo-cambiar-nombre',
    roles: null,
    q: ['¿cómo cambio mi nombre?', 'gracias, y ¿cómo cambio mi nombre?', 'mi nombre esta mal escrito', 'dónde cambio mi nombre', 'quiero cambiar como aparezco'],
    a: 'En Mi perfil, en «Mis datos», cambias el «Nombre» y tocas «Guardar».',
    go: '/perfil',
  },
  {
    id: 'todo-cambiar-telefono-perfil',
    roles: null,
    q: ['donde cambio mi numero de telefono', 'actualizar mi teléfono', 'poner mi celular en el perfil', 'es obligatorio el telefono'],
    a: 'En Mi perfil, en «Mis datos», «Teléfono (opcional)»: lo escribes y tocas «Guardar». Es opcional.',
    go: '/perfil',
  },

  // ── Dictar y lo pendiente ──────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'todo-dictar',
    roles: null,
    q: ['puedo dictar la ficha en vez de escribirla', 'como hago para hablar en vez de escribir', 'se puede dictar x voz?', 'puedo dictar la nota para el editor', 'escribir con la voz', 'microfono para escribir', 'y puedo dictarla?'],
    a: {
      default: 'Sí: en cualquier campo largo toca el micrófono del teclado del teléfono (el del iPhone o el de Gboard) y habla. Antes de guardar, revisa nombres y cifras.',
      camera: 'Sí: en cualquier campo largo, como la nota para el editor, toca el micrófono del teclado y habla. Antes de guardar, revisa lo que quedó: sin hora, fecha, dirección ni teléfonos, porque la nota la lee Redes.',
    },
  },
  {
    id: 'todo-dictar-360',
    roles: null,
    q: ['¿a ti te puedo hablar por voz?', 'te puedo dictar', 'puedo hablarte en vez de escribirte', 'te mando un audio', 'tienes microfono'],
    a: 'Sí: en mi caja, «Escribe tu pregunta», toca el micrófono del teclado y dicta. Yo leo lo que quedó escrito; audios no recibo.',
  },
  {
    id: 'todo-pendientes',
    roles: null,
    q: ['¿qué tengo pendiente?', 'que tengo pendiente hoy', 'q me toca hoy', 'qué me toca', 'qué tengo por hacer', 'q hay pa hoy', 'tengo algo atrasado', 'qué hay para hoy'],
    a: {
      boss: 'Lo tuyo está en tu Inicio: lo vencido, «Te toca aprobar» y los botones Política, Obras, Redes y Digital con sus números.',
      dispatch: 'Lo tuyo está en Hoy: primero «Por ponerle fecha», los eventos del día, las fichas técnicas incompletas y lo que espera la decisión del jefe.',
      politics: 'Lo tuyo está en Municipios: arriba, las fichas vencidas, y en cada municipio sus fichas comunitarias.',
      ivt: 'Lo tuyo está en Obras: tus fichas en borrador y las que esperan fecha.',
      camera: 'Lo tuyo está en Hoy: tus eventos y los que pasaron sin material («Sube el material»).',
      social: 'Lo tuyo está en Hoy: cambios pedidos, eventos sin storyboard, material que llegó, piezas listas para publicar, días de tweets y lo «Trancado».',
      admin: 'Lo tuyo está en Hoy: lo de Redes y lo «Trancado».',
    },
  },
  {
    id: 'todo-vencido',
    roles: null,
    q: ['cuantas vencidas tengo', 'qué está vencido', 'que es una ficha vencida', 'tengo cosas vencidas', 'lo vencido donde lo veo'],
    a: {
      politics: 'Una ficha vencida es la que pasó su fecha de seguimiento y no está finalizada ni suspendida. Salen arriba en Municipios, y también en el Inicio del jefe.',
      boss: 'Lo vencido de los municipios sale arriba en tu Inicio: las fichas comunitarias que pasaron su fecha de seguimiento sin finalizar ni suspender.',
      dispatch: 'Las fichas comunitarias vencidas (pasaron su fecha de seguimiento sin finalizar ni suspender) salen arriba en Municipios.',
      admin: 'Las fichas comunitarias vencidas (pasaron su fecha de seguimiento sin finalizar ni suspender) salen arriba en Municipios.',
      social: 'Para ti, lo atrasado es lo «Trancado»: piezas a las que se les venció el plazo sin aprobación. Sale en Hoy.',
      camera: 'Lo tuyo atrasado son los eventos que ya pasaron sin material: salen en Hoy con «Sube el material».',
      ivt: 'Lo tuyo sale en Obras: las fichas en borrador y las que esperan fecha.',
    },
  },

  // ── Mensajes: los canales del equipo ───────────────────────────────────────────────────────────────────────────────
  {
    id: 'todo-msj-que-es',
    roles: null,
    q: ['¿qué es Mensajes?', 'para que sirve mensajes', 'hay chat en la plataforma', 'como funciona mensajes', 'que son los canales', 'como se usa mensajes'],
    a: {
      default:
        'Son los canales del equipo, en el sobre de arriba, junto a la campana. Ves solo los canales donde estás y «Todo el equipo». El jefe arma los canales, decide quién va en cada uno y está en todos; cada canal muestra arriba quiénes están.',
      boss: 'Son los canales del equipo, en el sobre de arriba. Tú los armas con «Nuevo canal», decides quién va y estás en todos. Cada canal muestra arriba quiénes están, y en «Todo el equipo» están todos.',
      admin: 'Mensajes es del equipo: administración no lo ve, y por eso no tiene el sobre. Son canales: el jefe los arma, decide quién va en cada uno y está en todos.',
    },
    go: '/mensajes',
    tutorial: 'mensajes',
  },
  {
    id: 'todo-msj-donde',
    roles: null,
    q: ['dónde está mensajes', 'donde esta el chat', 'el sobre de arriba', 'como entro a los canales', 'no encuentro mensajes', 'por que no tengo el sobre arriba'],
    a: { default: 'Arriba, el sobre junto a la campana: ahí están tus canales y «Todo el equipo».', admin: NO_MSG },
    go: '/mensajes',
  },
  {
    id: 'todo-msj-sin-leer',
    roles: null,
    q: ['¿tengo mensajes sin leer?', 'el numero del sobre', 'que significa el numero en el sobre', 'como se cuales canales tienen algo nuevo', 'qué son los canales en negrita'],
    a: {
      default: 'El número del sobre dice cuántos canales tienen algo nuevo; en la lista, esos van en negrita, y adentro empiezas donde dice «Mensajes nuevos». Yo no leo los mensajes: ábrelos tú.',
      admin: NO_MSG,
    },
    go: '/mensajes',
  },
  {
    id: 'todo-msj-escribir-a',
    roles: null,
    q: ['como le escribo a redes', 'cómo le escribo al jefe', 'como hablo con grabacion', 'quiero escribirle a despacho', 'como le mando un mensaje a alguien', 'como hablo con el equipo'],
    a: {
      default: 'En Mensajes, en un canal donde esté esa persona, o en «Todo el equipo», donde están todos. Si no hay un canal con ella, pídeselo al jefe: él arma los canales.',
      boss: 'En Mensajes, en un canal donde esté esa persona, o en «Todo el equipo». Si no hay uno, ármalo con «Nuevo canal»: puede ser de dos, tú y esa persona.',
      admin: 'Mensajes es del equipo: administración no lo ve. Para avisarle algo a un rol entero, pídeme que prepare un aviso: lo confirmas en Ajustes → Asistente → «Por confirmar».',
    },
    go: '/mensajes',
  },
  {
    id: 'todo-msj-crear-canal',
    roles: null,
    q: ['¿cómo creo un canal?', 'cómo armo un canal', 'quiero hacer un canal nuevo', 'nuevo canal', '¿y cómo creo un canal con él?', 'quién crea los canales de mensajes'],
    a: {
      boss: 'Sobre de arriba → «Nuevo canal»: le pones «Nombre del canal» y, si quieres, para qué es; marcas a quienes van (tú estás en todos, ya marcado) y tocas «Crear canal». Necesitas haber entrado con el doble factor.',
      admin: 'Los canales los arma solo el jefe: decide quién va en cada uno y está en todos. Administración no entra a Mensajes.',
      default: 'No puedes: los canales los arma solo el jefe, y él decide quién va en cada uno. Si te hace falta uno, pídeselo.',
    },
    go: '/mensajes/canales/nuevo',
    tutorial: 'mensajes',
  },
  {
    id: 'todo-msj-grupo',
    roles: null,
    q: ['puedo armar un grupo con grabacion', 'hay grupos en mensajes', 'crear un grupo', 'hacer un grupo con varios', 'como hago un grupo en mensajes'],
    a: {
      boss: 'No hay grupos aparte: son canales, y los armas tú con «Nuevo canal», con las personas que quieras.',
      admin: 'No hay grupos: son canales, y los arma solo el jefe. Administración no entra a Mensajes.',
      default: 'No hay grupos: se habla en los canales que arma el jefe. Si te hace falta uno con ciertas personas, pídeselo a él.',
    },
  },
  {
    id: 'todo-msj-directo',
    roles: null,
    q: ['¿puedo escribirle en privado a Kevin?', 'como le mando un msj privado al jefe', 'mensaje directo', 'hablar a solas con alguien', 'chat privado', 'escribirle a una sola persona'],
    a: {
      boss: 'No hay mensajes directos, pero puedes armar un canal de dos con «Nuevo canal»: tú y esa persona.',
      admin: 'No hay mensajes directos: son canales que arma el jefe. Administración no entra a Mensajes.',
      default: 'No hay mensajes directos: se habla en los canales que arma el jefe. Si hace falta uno solo con alguien, pídeselo al jefe; él está en todos los canales.',
    },
  },
  {
    id: 'todo-msj-quien-esta',
    roles: null,
    q: ['¿cómo veo quién está en un canal?', '¿quién está en el canal Grabación y Redes?', 'quienes estan en este canal', 'ver los miembros del canal', 'que significa n personas', 'quien lee este canal'],
    a: { default: 'Abre el canal y toca «N personas», arriba: sale la lista «Miembros», con el jefe primero. Yo no leo Mensajes, así que ábrelo tú.', admin: NO_MSG },
    go: '/mensajes',
    tutorial: 'canal',
  },
  {
    id: 'todo-msj-jefe-lee',
    roles: null,
    q: ['¿el jefe lee todos los mensajes?', 'el jefe puede ver lo que escribo en mensajes', 'el jefe esta en todos los canales', 'el jefe puede leer todos los canales?', '¿puedo leer los canales donde no estoy?'],
    a: {
      boss: 'Tú estás en todos los canales, siempre, y por eso los lees todos. No hay otra forma de leer Mensajes: cada quien lee los canales donde está.',
      admin: 'Sí: el jefe está en todos los canales, y por eso los lee. Administración no lee ninguno.',
      default: 'Sí: el jefe está en todos los canales, y por eso lee lo de cada uno. No hay otra forma de leer: cada quien lee solo los canales donde está, y cada canal muestra arriba quiénes están.',
    },
  },
  {
    id: 'todo-msj-quien-lee',
    roles: null,
    q: ['¿administración lee los mensajes?', 'alguien mas lee los mensajes', 'quien puede leer lo que escribo', 'quién ve lo que escribo en un canal', 'los mensajes quedan registrados', 'el registro de cambios muestra los mensajes'],
    a: {
      default:
        'Lo leen solo los que están en ese canal (toca «N personas» para verlos), y el jefe está en todos. Administración no entra a Mensajes y yo tampoco los leo. El registro guarda solo que hubo un mensaje, quién y cuándo, nunca el texto.',
      admin:
        'No: administración no entra a Mensajes, ni con «Ver como». El registro de cambios dice solo que hubo un mensaje, un canal o un cambio de miembros, quién y cuándo: nunca el texto, el nombre del canal ni quiénes.',
    },
  },
  {
    id: 'todo-msj-borrar',
    roles: null,
    q: ['¿puedo borrar un mensaje que mandé?', 'eliminar un mensaje', 'se pueden borrar los mensajes que manda el equipo', 'borrar el chat', 'mandé algo que no era, lo quito'],
    a: {
      default: 'No: en Mensajes nada se borra, y un mensaje no se edita ni se cambia después de enviarlo. Si te equivocaste, escribe otro que lo corrija. Revísalo antes de tocar el botón de enviar.',
      admin: 'No: un mensaje no se edita ni se borra después de enviarlo; queda guardado. Y administración no entra a Mensajes.',
    },
  },
  {
    id: 'todo-msj-editar',
    roles: null,
    q: ['me equivoque en un mensaje como lo edito', 'editar mensaje', 'corregir un mensaje enviado', 'cambiar lo que escribí en el canal'],
    a: { default: 'No se puede: un mensaje no se edita ni se cambia después de enviarlo. Escribe otro que lo corrija, y la próxima vez revísalo antes de enviar.', admin: NO_MSG },
  },
  {
    id: 'todo-msj-fotos',
    roles: null,
    q: ['¿puedo mandar fotos por Mensajes?', 'mandar un archivo por el chat', 'adjuntar un video en mensajes', 'mandar audio por mensajes', 'compartir un pdf en el canal'],
    a: {
      default:
        'No: Mensajes es solo texto, sin fotos, audios ni archivos. Para hablar de algo, pega su dirección de la plataforma: sale como una tarjetita. Las fotos y los videos van en su lugar: el material del evento, la pieza o la ficha.',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-compartir',
    roles: null,
    q: ['¿cómo comparto una pieza en un canal?', 'pasar un evento por mensajes', 'compartir el link de una ficha', 'mandar el enlace de la pieza', 'como paso una obra por el chat'],
    a: {
      default:
        'Copia la dirección de la pieza, el evento o la ficha y pégala en el canal: sale como una tarjetita con su título, y cada quien la abre con sus permisos. Quien no puede abrirla ve «Algo que no puedes abrir».',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-no-puedes-abrir',
    roles: null,
    q: ['dice algo que no puedes abrir', 'la tarjetita no me abre', 'me pasaron un enlace y no lo puedo abrir', 'por que no abre el link del canal'],
    a: {
      default: 'Es un enlace a algo que tu rol no puede ver: cada quien abre lo que le toca, con sus permisos. Si lo necesitas para tu trabajo, pídele a quien lo pegó lo que haga falta, sin fechas ni teléfonos.',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-hora-no-deja',
    roles: null,
    q: [
      '¿por qué no me deja enviar un mensaje con la hora?',
      'por que mensajes no me deja mandar la hora en el canal de grabacion y redes',
      'no puedo escribir la fecha en el chat',
      'no me deja mandar la direccion por mensajes',
      'por que rechaza mi mensaje',
      'no sale mi mensaje con la hora',
    ],
    a: {
      default:
        'Porque conoces la agenda, y en ese canal está Redes o política: la plataforma no deja escribir fechas, horas ni mapas ahí. Escribe “lo antes posible”, “cuando esté listo” o “el día del evento”. En «Todo el equipo» también están Redes y política.',
      social: FREE_WRITE,
      politics: FREE_WRITE,
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-rojo',
    roles: null,
    q: ['me sale en rojo no puede ir aqui', 'mientras escribo sale una palabra en rojo', 'el mensaje dice que algo no puede ir', 'en el canal me salio una palabra en rojo'],
    a: {
      default:
        'La plataforma te avisa mientras escribes cuando pones una fecha, una hora o un mapa en un canal donde está Redes o política: sale “… no puede ir aquí” con esa palabra. Quítala y escribe “el día del evento” o “lo antes posible”. Un teléfono tampoco va.',
      social: 'Lo más seguro es un número que parece un teléfono: los teléfonos no van en los mensajes. Si es un enlace de la plataforma, pega su dirección sin otros números largos.',
      politics: 'Lo más seguro es un número que parece un teléfono: los teléfonos no van en los mensajes. Si es un enlace de la plataforma, pega su dirección sin otros números largos.',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-enviar-igual',
    roles: null,
    q: [
      'escribí mañana en un canal y me salió enviar igual o corregir, ¿qué es eso?',
      'que es enviar igual',
      'me pregunta si dice cuando va el jefe',
      'para que sale corregir',
      'me salio una pregunta antes de enviar',
    ],
    a: {
      default:
        'Escribiste una palabra como “mañana” o “el lunes” en un canal donde está Redes o política, y la plataforma pregunta si dice cuándo va el jefe. Si es de la agenda, toca «Corregir» y quítala; si no (por ejemplo “mañana sale la pieza”), «Enviar igual».',
      social: 'A ti no te sale: Redes y política escriben libre. Esa pregunta («Enviar igual» o «Corregir») les sale a quienes conocen la agenda cuando escriben “mañana” o “el lunes” donde estás tú.',
      politics: 'A ti no te sale: Redes y política escriben libre. Esa pregunta («Enviar igual» o «Corregir») les sale a quienes conocen la agenda cuando escriben “mañana” o “el lunes” donde estás tú.',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-oculto',
    roles: null,
    q: ['¿por qué veo mensaje oculto?', 'dice mensaje oculto', 'no puedo leer un mensaje', 'mensaje oculto tenia una fecha', 'por que me ocultan un mensaje'],
    a: {
      default: 'Ese mensaje tenía una fecha o una hora de la agenda, y no es para ti: por eso ves «Mensaje oculto». La agenda del jefe es información de seguridad.',
      boss: 'Tú los lees todos, con el doble factor. «Mensaje oculto» lo ve quien no conoce la agenda (Redes o política) cuando un mensaje tenía una fecha o una hora de la agenda.',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-tiempo-video',
    roles: null,
    q: ['puedo poner el tiempo del video en el canal', 'le puedo escribir a redes un tiempo del video', 'me pregunta si es un tiempo del video', 'que es si es del video', 'escribir el minuto del video en mensajes'],
    a: {
      camera: 'Sí: si escribes un tiempo del video (los minutos y los segundos) en un canal con Redes, la plataforma te pregunta si es del video: «Sí, es del video» o «Corregir». Una hora de la agenda no va.',
      social: 'Sí, escribes libre: Redes y política no conocen la agenda.',
      politics: 'Sí, escribes libre: Redes y política no conocen la agenda.',
      default: 'Ojo: donde está Redes o política, la plataforma toma los minutos y segundos como una hora y no los deja pasar. Escríbelo de otra forma, por ejemplo “al minuto dos”.',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-puedo-manana',
    roles: null,
    q: ['¿puedo escribir mañana en un canal?', 'puedo decir hoy en mensajes', 'puedo escribir el lunes en el chat', 'puedo poner fechas en mensajes'],
    a: {
      social: 'Sí: Redes y política no conocen la agenda, así que escriben libre.',
      politics: 'Sí: Redes y política no conocen la agenda, así que escriben libre.',
      default:
        'Donde está Redes o política, una palabra como “mañana” hace que la plataforma te pregunte antes de enviar («Enviar igual» o «Corregir»); si es de la agenda, no va. Una fecha o una hora concreta no sale ahí.',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-telefono',
    roles: null,
    q: ['¿puedo mandar el teléfono de un contacto por Mensajes?', 'pq no puedo mandar un numero de telf x mensajes', 'mandar un numero por el chat', 'no me deja mandar el celular de alguien', 'dice los telefonos no van en los mensajes'],
    a: {
      default: 'No: «Los teléfonos no van en los mensajes: los contactos van en la ficha, con doble factor.» La regla es para todos y en todos los canales. Si es un enlace con un número largo, pega la dirección de la plataforma.',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-silenciar',
    roles: null,
    q: ['¿cómo silencio un canal?', 'que deje de sonar un canal', 'callar un canal', 'quitar el silencio', 'silenciar mensajes de un canal'],
    a: {
      default: 'Abre el canal, toca los tres puntos («Opciones del canal») y «Silenciar»: deja de sonar en tu teléfono y lo sigues leyendo igual. Para volver, «Quitar el silencio».',
      admin: NO_MSG,
    },
    go: '/mensajes',
  },
  {
    id: 'todo-msj-avisos',
    roles: null,
    q: ['¿cómo dejo de recibir avisos de Mensajes?', 'no quiero avisos de los canales', 'me suena mucho mensajes', 'apagar avisos del chat', 'quitar notificaciones de mensajes'],
    a: {
      default: 'Para un canal, sus tres puntos → «Silenciar»: deja de sonar y lo sigues leyendo. Para todos, en Mi perfil, «Qué avisos quiero», desmarca «Mensajes nuevos del equipo» y toca «Guardar».',
      admin: NO_MSG,
    },
    go: '/perfil',
  },
  {
    id: 'todo-msj-salir-canal',
    roles: null,
    q: ['como me salgo de un canal', 'salirme del canal', 'no quiero estar en ese canal', 'abandonar un canal', 'me quiero ir de un canal'],
    a: {
      default: 'Nadie se sale solo de un canal: quién está lo decide el jefe. Para no oírlo, tres puntos → «Silenciar». Si no debes estar ahí, díselo al jefe.',
      boss: 'Tú estás en todos los canales y no se te puede sacar. Para no oír uno, tres puntos → «Silenciar».',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-todo-equipo',
    roles: null,
    q: ['¿qué es el canal Todo el equipo?', 'quienes estan en todo el equipo', 'para que es todo el equipo', 'si invito a alguien nuevo entra a todo el equipo en mensajes', 'el nuevo ya esta en todo el equipo'],
    a: {
      default: 'Es el canal fijo de todo el equipo: ahí están todos, siempre, sin que nadie los agregue, también quien entra nuevo. No se renombra ni se archiva, y está arriba de tus canales.',
      admin: 'Es el canal fijo del equipo: ahí están todos, siempre; quien invites con un rol del equipo entra solo. Administración no entra a Mensajes.',
    },
  },
  {
    id: 'todo-msj-solo-jefe',
    roles: null,
    q: ['no puedo escribir en todo el equipo', 'dice solo el jefe escribe en este canal', '¿cómo hago para que solo yo escriba en Todo el equipo?', 'canal solo para avisos del jefe', 'por que no me deja escribir en el canal'],
    a: {
      boss: 'Abre el canal (o «Todo el equipo»), toca los tres puntos y prende «Solo el jefe escribe». Los demás lo leen, pero no escriben; se apaga en el mismo lugar.',
      default: 'Ese canal dice «Solo el jefe escribe en este canal.»: el jefe lo dejó solo para él. Lo lees, pero no escribes. Si el canal está archivado, no escribe nadie.',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-archivado',
    roles: null,
    q: ['como archivo un canal q ya no se usa', 'que son los archivados', 'este canal esta archivado no puedo escribir', 'sacar un canal del archivo', 'archivar canal'],
    a: {
      boss: 'Abre el canal → tres puntos → «Archivar» (te pregunta antes). Pasa a «Archivados», al final de la lista: sus miembros lo siguen leyendo, nadie escribe y no se borra. «Sacar del archivo» lo devuelve tal cual.',
      default: 'Un canal archivado está al final, en «Archivados»: se lee, pero ya no se escribe. Lo archiva o lo saca del archivo el jefe; no se borra nada.',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-miembros',
    roles: null,
    q: ['como saco a alguien de un canal', 'como meto a alguien en un canal', '¿y cómo saco a alguien?', 'agregar una persona al canal', 'quitar a alguien del canal', 'cambiar quien esta en un canal'],
    a: {
      boss: 'Abre el canal → tres puntos → «Editar canal». Marca o desmarca a las personas y toca «Guardar» (si quitas a alguien, te pregunta antes). Quien agregues ve lo que ya se escribió; quien quites deja de verlo.',
      default: 'Eso lo hace el jefe: él decide quién está en cada canal. Si alguien falta o sobra, díselo.',
      admin: 'Eso lo hace el jefe, en «Editar canal». Administración no entra a Mensajes.',
    },
  },
  {
    id: 'todo-msj-lee-anterior',
    roles: null,
    q: ['si el jefe mete a alguien en un canal, ¿ve lo que ya se escribió?', 'el nuevo del canal lee lo de antes', 'si me agregan a un canal veo los mensajes viejos', 'si me sacan del canal sigo viendo'],
    a: {
      default:
        'Sí: quien el jefe agrega ve lo que ya se escribió en el canal; lo que tenía fechas de la agenda le sale como «Mensaje oculto» si no conoce la agenda. Quien saca deja de ver el canal entero y de recibir sus avisos.',
      admin: 'Sí: quien el jefe agrega a un canal ve lo que ya se escribió; quien saca deja de verlo. Administración no entra a Mensajes.',
    },
  },
  {
    id: 'todo-msj-no-veo-canal',
    roles: null,
    q: ['¿por qué no veo el canal de Jefe y despacho?', 'no me sale un canal', 'me falta un canal', 'dice este canal no está en tu lista', 'solo me sale todo el equipo', 'no tengo canales'],
    a: {
      default:
        'Ves solo los canales donde estás, y el jefe decide quién va en cada uno. Si abres uno donde no estás, dice «Este canal no está en tu lista». Si solo tienes «Todo el equipo» y te hace falta un canal, pídeselo al jefe.',
      boss: 'Tú estás en todos los canales. Si uno no te sale, mira al final, en «Archivados». Si todavía no hay canales, toca «Nuevo canal» para armar el primero.',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-ya-no-estas',
    roles: null,
    q: ['dice ya no estás en este canal', 'me sacaron de un canal', 'por que me sacaron del canal', 'ya no puedo ver un canal'],
    a: {
      default: '«Ya no estás en este canal.» quiere decir que el jefe te sacó: dejas de verlo, también lo anterior, y de recibir sus avisos. Si crees que debes estar, díselo al jefe.',
      boss: 'A ti no te pasa: estás en todos los canales y no se te puede sacar. Ese aviso lo ve quien quitas en «Editar canal».',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-aviso-sin-texto',
    roles: null,
    q: ['me llegó mensaje nuevo al teléfono pero no dice qué, ¿por qué?', 'el aviso de mensajes no muestra el texto', 'por que la notificacion no dice el mensaje', 'tienes mensajes nuevos que es'],
    a: {
      default:
        'Es a propósito: el aviso dice “Mensaje nuevo” y de quién es, nunca el texto ni el nombre del canal, porque la pantalla del teléfono la puede ver cualquiera. Lo lees en Mensajes. Si te llegan varios, se juntan en uno.',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-enter',
    roles: null,
    q: ['como mando el mensaje en el telefono si el enter no lo manda', 'enter no envia', 'como envio el mensaje', 'el boton de enviar', 'en la computadora enter manda el mensaje?'],
    a: {
      default: 'En el teléfono, Enter hace un salto de línea: el mensaje sale cuando tocas el botón de enviar (el avioncito de papel). En la computadora, Enter envía, y Mayúscula + Enter hace un salto de línea.',
      admin: NO_MSG,
    },
    tutorial: 'canal',
  },
  {
    id: 'todo-msj-sin-senal',
    roles: null,
    q: ['mandé un mensaje sin señal', 'dice no se envió', 'el mensaje se quedo enviando', 'reintentar mensaje', 'no salio mi mensaje'],
    a: {
      default: 'Tu mensaje sale al momento con “Enviando…”. Si se fue la señal, dice «No se envió · Reintentar»: cuando vuelva, toca «Reintentar». Nunca sale dos veces.',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-no-llegan',
    roles: null,
    q: ['no me llegan los mensajes nuevos', 'el canal no se actualiza', 'tengo que recargar mensajes', 'los mensajes tardan en llegar'],
    a: {
      default: 'Con el canal abierto y con señal, lo nuevo llega solo cada pocos segundos, y el número del sobre se revisa cada rato. Si no llega nada, revisa la señal; si sigue igual, recarga la página.',
      admin: NO_MSG,
    },
  },
  {
    id: 'todo-msj-anteriores',
    roles: null,
    q: ['como veo los mensajes viejos', 'ver mensajes anteriores', 'no salen los mensajes de antes', 'subir en el chat'],
    a: { default: 'Arriba del canal, «Ver anteriores» trae los mensajes más viejos. Nada se borra: todo queda.', admin: NO_MSG },
  },
  {
    id: 'todo-msj-contestar',
    roles: null,
    q: ['¿y cómo le contesto?', 'como respondo un mensaje', 'responder en el canal', 'contestar un mensaje'],
    a: {
      default: 'Abre el canal en Mensajes y escribe abajo, en la caja: tu mensaje sale para todos los del canal. No hay respuestas aparte ni mensajes directos.',
      admin: NO_MSG,
    },
    go: '/mensajes',
    tutorial: 'canal',
  },
  {
    id: 'todo-msj-mis-canales',
    roles: null,
    q: ['q canales tengo', 'en qué canales estoy', 'cuales son mis canales', 'lista de canales'],
    a: {
      default: 'Los ves en Mensajes, el sobre de arriba: primero «Todo el equipo» y debajo tus canales. Yo no leo Mensajes, así que ábrelo tú.',
      boss: 'Tú estás en todos: los ves en Mensajes, el sobre de arriba, con «Todo el equipo» primero y los archivados al final. Yo no leo Mensajes.',
      admin: NO_MSG,
    },
    go: '/mensajes',
  },
  {
    id: 'todo-msj-leer',
    roles: null,
    q: ['¿qué me escribió Kevin?', 'léeme los mensajes del canal de redes', 'resumeme lo que hablaron en jefe y despacho', '¿qué dice el canal de Obras y comunidad?', 'resúmeme el canal', 'que dijeron en todo el equipo'],
    a: {
      default: 'Yo no leo los mensajes del equipo ni los resumo: ábrelos tú en Mensajes, el sobre de arriba.',
      admin: 'Yo no leo los mensajes del equipo, y una cuenta con administración no entra a Mensajes.',
    },
    go: '/mensajes',
  },
  {
    id: 'todo-msj-mandar',
    roles: null,
    q: [
      'dile a Kevin que ya está lista la ficha técnica',
      'mandale un msj al jefe q ya cargue la ficha',
      'preguntale a daniela si ya bajo el material',
      'mandale un mensaje a todo el equipo diciendo que hay reunion',
      'escríbele a redes por mí',
      'avisale al jefe que ya mande la pieza a aprobacion',
    ],
    a: {
      default: 'Eso se lo escribes tú en Mensajes, en un canal donde esté esa persona: yo no leo ni mando mensajes.',
      boss: 'Eso lo escribes tú en Mensajes, en un canal donde esté esa persona: yo no mando mensajes. Si es un aviso para todo un rol (por ejemplo Redes), pídemelo como aviso: lo dejo preparado y administración lo confirma.',
      social: 'Eso lo escribes tú en Mensajes, en un canal donde esté esa persona: yo no mando mensajes. Si es una pieza, al tocar «Enviar a aprobación» al jefe ya le llega el aviso.',
      politics: 'Eso lo escribes tú en Mensajes, en un canal donde esté esa persona: yo no mando mensajes. Si es tu ficha, «Guardar y avisar al jefe» ya le avisa.',
      ivt: 'Eso lo escribes tú en Mensajes, en un canal donde esté esa persona: yo no mando mensajes. Si es tu ficha, «Guardar y avisar al jefe» ya le avisa.',
      admin: 'Yo no mando mensajes, y administración no entra a Mensajes. Para avisarle algo a un rol entero, pídemelo como aviso: lo dejo preparado y lo confirmas en Ajustes → Asistente → «Por confirmar».',
    },
    go: '/mensajes',
  },
  {
    id: 'todo-msj-nombre-canal',
    roles: null,
    q: ['no me deja guardar el nombre del canal', 'el nombre del canal con fecha', 'que pongo en la descripcion del canal', 'cuantas letras lleva el nombre del canal'],
    a: {
      boss: 'El nombre va hasta 60 letras y la descripción corta hasta 140, sin teléfonos, fechas, horas ni mapas: todos los del canal los leen siempre. Quita eso y toca «Crear canal» o «Guardar».',
      default: 'El nombre y la descripción de cada canal los pone el jefe al armarlo, y nunca llevan teléfonos, fechas, horas ni mapas.',
    },
  },

  // ── Tutoriales, guías y flujos ─────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'todo-tutorial-pantalla',
    roles: null,
    q: ['enséñame a usar esta pantalla', 'muestrame como se usa esto', 'muéstrame el tutorial de esta pantalla', 'tutorial de esta pantalla', 'como funciona esta pantalla paso a paso'],
    a: {
      default: 'Arriba a la derecha, «Mi cuenta» → «Ver el tutorial de esta pantalla» (sale si la pantalla tiene uno). O dime “muéstrame esta pantalla” y te lo abro.',
      admin: 'Las pantallas de administración no tienen tutorial: lo que se hace en cada una está en la «Guía de administración», en «Ayuda y guías». Con «Ver como» salen los tutoriales del rol que estés mirando.',
    },
  },
  {
    id: 'todo-tutoriales-lista',
    roles: null,
    q: ['qué tutoriales hay', 'donde estan los tutoriales', 'lista de tutoriales', 'hay tutoriales?', 'quiero ver todos los tutoriales', 'hay tutorial de ajustes'],
    a: {
      default:
        '«Mi cuenta» → «Ayuda y guías» → «Tutoriales de mis pantallas»: cada uno te lleva a su pantalla y te la muestra paso a paso. Los de un evento o una pieza salen en «Mi cuenta» → «Ver el tutorial de esta pantalla», con la pantalla abierta.',
      admin: 'Las pantallas de administración (Ajustes, Equipo…) no tienen tutorial: su guía es la «Guía de administración». Con «Ver como» ves los tutoriales del rol que elijas.',
    },
    go: '/ayuda',
    tutorial: 'ayuda',
  },
  {
    id: 'todo-tutorial-salir',
    roles: null,
    q: ['¿cómo salgo de un tutorial?', 'cerrar el tutorial', 'quitar el tutorial', 'el tutorial no se quita', 'salir del tutorial'],
    a: 'Con la X de la tarjeta («Salir del tutorial»), cuando quieras, o con «Terminar» en el último paso.',
  },
  {
    id: 'todo-tutorial-como',
    roles: null,
    q: ['¿cómo funcionan los tutoriales?', 'como avanzo en el tutorial', 'el tutorial no me deja tocar nada', 'por que no puedo tocar el boton en el tutorial', 'como vuelvo al paso anterior'],
    a: '«Siguiente» y «Atrás» para moverte, «Terminar» al final y la X «Salir del tutorial» cuando quieras. Mientras corre, la pantalla no cambia: lo que te señala lo tocas cuando lo cierres.',
  },
  {
    id: 'todo-franja-apagar',
    roles: null,
    q: ['como apago la franja esa que dice te muestro esta pantalla', 'no quiero que 360 me ofrezca ayuda', 'quitar te muestro esta pantalla', 'que no me salga mas la ayuda', 'como apago lo de te muestro esta pantalla'],
    a: {
      default: 'Ciérrala con la X («Ahora no»). Si la cierras dos veces, deja de ofrecer en ese teléfono. Nunca se abre sola, y se vuelve a prender en «Ayuda y guías».',
      admin: 'A administración casi nunca le sale: sus pantallas no tienen tutorial. Si te sale (con «Ver como»), ciérrala con la X: a la segunda deja de ofrecer en ese teléfono, y «Volver a ofrecerme ayuda», en «Ayuda y guías», la trae.',
    },
  },
  {
    id: 'todo-franja-prender',
    roles: null,
    q: ['¿cómo vuelvo a prender lo de te muestro esta pantalla?', 'quiero que vuelva a ofrecerme ayuda', 'volver a ofrecerme ayuda', 'se apagó la ayuda de 360'],
    a: {
      default: '«Mi cuenta» → «Ayuda y guías» → «Volver a ofrecerme ayuda»: sale debajo de «Tutoriales de mis pantallas» cuando la ayuda está apagada.',
      admin: 'A administración no le sale esa franja: sus pantallas no tienen tutorial. Con «Ver como» ves los tutoriales del rol que elijas.',
    },
    go: '/ayuda',
  },
  {
    id: 'todo-guia-donde',
    roles: null,
    q: ['¿dónde veo la guía de mi trabajo?', 'donde esta el manual', 'guia de mi rol', 'instrucciones de la plataforma', 'donde aprendo a usar la plataforma', '¿dónde está mi guía?'],
    a: {
      default: '«Mi cuenta» → «Ayuda y guías» → «Mi trabajo, paso a paso»: qué haces, tu día y cada tarea paso a paso. Al lado están «Qué se hace en cada pantalla» y «Cómo va el trabajo entre todos».',
      admin: '«Mi cuenta» → «Ayuda y guías» → «Guía de administración»: lo que se hace en cada pantalla de Ajustes y lo que no es de administración. Va aparte de las guías del equipo.',
    },
    go: '/ayuda',
    tutorial: 'ayuda',
  },
  {
    id: 'todo-guia-otros',
    roles: null,
    q: ['¿dónde veo la guía de cada persona del equipo?', 'donde veo la guia de cada rol del equipo', 'puedo ver la guía de redes', 'como trabaja el despacho', 'guía de otro rol'],
    a: {
      boss: '«Mi cuenta» → «Ayuda y guías» → «La guía de cada persona»: la guía de los seis roles del equipo.',
      admin: '«Mi cuenta» → «Ayuda y guías» → «La guía de cada persona»: la guía de los seis roles del equipo.',
      default: 'Tú ves tu guía; la de cada persona la ven el jefe y administración. Para ver cómo pasa el trabajo de un rol a otro, abre «Ayuda y guías» → «Cómo va el trabajo entre todos».',
    },
    go: '/ayuda',
  },
  {
    id: 'todo-flujos',
    roles: null,
    q: ['¿dónde veo los flujogramas?', 'cómo va el trabajo entre todos', 'flujo del trabajo', 'cómo pasa el trabajo de un rol a otro', 'diagrama del proceso'],
    a: {
      default:
        '«Mi cuenta» → «Ayuda y guías» → «Cómo va el trabajo entre todos»: un evento, una obra, un reporte de la comunidad, los tweets, el semáforo, el mes de Redes, la entrega de Grabación, Mensajes y la ayuda. Los pasos que son tuyos dicen «tú».',
      admin: '«Mi cuenta» → «Ayuda y guías» → «Cómo va el trabajo entre todos»: cómo pasa el trabajo de un rol a otro del equipo, paso a paso.',
    },
    go: '/ayuda/flujos',
  },
  {
    id: 'todo-ayuda-que-es',
    roles: null,
    q: ['que es eso de ayuda y guias', 'para que sirve ayuda y guias', 'donde esta ayuda', 'qué hay en ayuda'],
    a: {
      default:
        'Es la ayuda de la plataforma, en «Mi cuenta» → «Ayuda y guías»: la guía de tu trabajo, lo que se hace en cada pantalla, cómo va el trabajo entre todos, los tutoriales de tus pantallas y lo que es para todos (entrar, el teléfono, sin señal, la regla de la fecha, Mensajes y 360).',
      admin: 'Es la ayuda de la plataforma, en «Mi cuenta» → «Ayuda y guías»: para ti, la «Guía de administración», «Cómo va el trabajo entre todos» y «La guía de cada persona».',
    },
    go: '/ayuda',
    tutorial: 'ayuda',
  },
  {
    id: 'todo-guia-pantallas',
    roles: null,
    q: ['que se hace en cada pantalla', 'para que sirve cada pantalla de mi menu', 'explicame las pantallas', 'que hace cada boton'],
    a: {
      default: '«Mi cuenta» → «Ayuda y guías» → «Qué se hace en cada pantalla»: cada pantalla de tu menú, con sus botones y lo que no puedes hacer ahí.',
      admin: 'En la «Guía de administración» («Ayuda y guías») está cada pantalla de Ajustes, con lo que haces ahí y lo que no.',
    },
    go: '/ayuda',
  },
  {
    id: 'todo-guia-correo',
    roles: null,
    q: ['me pueden mandar la guía por correo', 'la guia en pdf', 'imprimir la guía', 'descargar el manual'],
    a: 'La guía vive en la plataforma, en «Ayuda y guías»: no se manda por correo y se abre con señal.',
    go: '/ayuda',
  },
  {
    id: 'todo-por-donde-empiezo',
    roles: null,
    q: ['por donde empiezo', 'soy nuevo que hago', 'primera vez en la plataforma', 'muestrame como empezar', 'tutorial de bienvenida'],
    a: {
      default:
        'Empieza por el tutorial “Bienvenida”: te muestra tus pantallas, lo de arriba, «Mi cuenta» y a mí, y sigue con el de tu inicio. Después, la guía de tu trabajo en «Ayuda y guías» → «Mi trabajo, paso a paso».',
      admin: 'Empieza por la «Guía de administración», en «Mi cuenta» → «Ayuda y guías»: ahí está cada pantalla de Ajustes. Lo primero es Equipo: ahí invitas a cada persona con su rol.',
    },
    tutorial: 'bienvenida',
  },
  {
    id: 'todo-necesito-ayuda',
    roles: null,
    q: ['necesito ayuda', 'me perdí', 'no se usar esto', 'ayuda', 'no se como se usa la plataforma', 'estoy perdido'],
    a: {
      default: 'Te muestro la pantalla en la que estás, paso a paso: dime “muéstrame esta pantalla”, o «Mi cuenta» → «Ver el tutorial de esta pantalla». La guía de tu trabajo está en «Mi cuenta» → «Ayuda y guías».',
      admin: 'Dime qué pantalla es y te digo qué se hace ahí. Lo de cada pantalla de Ajustes está en la «Guía de administración», en «Mi cuenta» → «Ayuda y guías».',
    },
  },

  // ── 360, el asistente ─────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'todo-360-quien',
    roles: null,
    q: ['¿quién eres?', 'como te llamas', 'qué es 360', 'eres una ia', 'eres un robot', 'eres una persona', 'quien me esta contestando'],
    a: 'Soy [ASISTENTE], el asistente del equipo: no soy una persona. Te digo qué te toca, cómo se hace algo y dónde está cada cosa, y te muestro los tutoriales de tus pantallas.',
  },
  {
    id: 'todo-360-ia',
    roles: null,
    q: ['usas inteligencia artificial', '¿360 usa inteligencia artificial?', 'eres chatgpt', 'con qué ia funcionas', 'eres inteligencia artificial de verdad'],
    a: {
      default: 'Si arriba de esta ventana dice «modo demostración, sin IA», contesto sin inteligencia artificial: con lo que el equipo me enseñó (fichas y guiones) y las guías de la plataforma.',
      admin: 'Lo ves en Ajustes → Asistente → «Cómo va»: con «Demostración» («Sin IA: guiones y fichas») contesto con lo que me enseñaron y las guías; arriba de mi ventana dice «modo demostración, sin IA».',
    },
  },
  {
    id: 'todo-360-que-sabes',
    roles: null,
    q: ['¿qué sabes hacer?', 'qué puedes hacer', 'en que me ayudas', 'para que sirves', 'q sabes hacer tu', 'que te puedo preguntar'],
    a: {
      default:
        'Te digo qué tienes pendiente, cómo se hace algo y dónde está cada cosa (con el botón para ir), y te muestro el tutorial de tu pantalla. También las mejores horas para publicar y las reglas de video de cada red, marco tus avisos como leídos y, si necesitas a una persona, le aviso a administración. No leo Mensajes ni doy la agenda.',
      boss: 'Te digo qué te toca aprobar y qué tienes pendiente, cómo va una pieza, cuántos días de tweets quedan, qué eventos esperan tu decisión, cómo se hace algo y dónde está (con el botón), y te muestro tutoriales. Te dejo preparados avisos para un rol entero. No leo Mensajes ni doy la agenda.',
      social: 'Te digo qué tienes pendiente, cómo va una pieza, cuántos días de tweets quedan, a qué hora conviene publicar en cada red y sus reglas de video, cómo se hace algo y dónde está (con el botón), y te muestro tutoriales. No leo Mensajes ni doy la agenda.',
      dispatch: 'Te digo qué tienes pendiente, qué eventos esperan la decisión del jefe, cómo se hace algo y dónde está cada cosa (con el botón), y te muestro el tutorial de tu pantalla. Si necesitas a una persona, le aviso a administración. No leo Mensajes ni doy la agenda.',
      admin: 'Te digo cómo se hace algo y dónde está (con el botón), tus pendientes, cómo va una pieza, los días de tweets, los eventos por decidir, las mejores horas y las reglas de cada red, y te dejo avisos preparados que confirmas en «Por confirmar». No leo Mensajes ni doy la agenda.',
    },
  },
  {
    id: 'todo-360-que-no',
    roles: null,
    q: ['¿qué no puedes hacer?', 'que no sabes hacer', 'tienes limites', 'que cosas no haces'],
    a: 'No leo ni mando mensajes del equipo, no doy la fecha, la hora ni el lugar de ningún evento, no pido ni doy códigos o claves, y no publico, no apruebo, no subo archivos ni toco la agenda por ti: eso lo haces tú en tu pantalla.',
  },
  {
    id: 'todo-360-quien-ve',
    roles: null,
    q: ['¿quién ve lo que te pregunto?', 'alguien lee lo que te escribo', 'esto es privado', 'administración ve mis preguntas', 'lo que te digo queda entre nosotros', 'el jefe ve lo que te pregunto'],
    a: {
      default: 'Administración ve lo que le preguntas a 360: no pegues aquí mensajes del equipo ni escribas fechas, horas ni direcciones de la agenda. El jefe no lo ve.',
      admin: 'Tú y las demás personas de administración, en Ajustes → Asistente → «Conversaciones». El panel de 360 se lo dice a cada persona.',
    },
  },
  {
    id: 'todo-360-guarda',
    roles: null,
    q: ['guardas lo que te digo', 'se guarda esta conversación', 'te acuerdas de lo que hablamos', 'se borra lo que te pregunto', 'borrar la conversación con 360', 'qué hace empezar de nuevo'],
    a: {
      default:
        'Sí: la conversación queda guardada y administración la ve; las fechas, horas, correos y teléfonos que escribas se quitan antes de guardarse. «Empezar de nuevo», arriba de esta ventana, la limpia, pero no la borra. Por eso no pegues aquí mensajes del equipo.',
      admin: 'Sí: cada conversación queda guardada y la lees en Ajustes → Asistente → «Conversaciones». «Empezar de nuevo» limpia la ventana, pero no borra nada.',
    },
  },
  {
    id: 'todo-360-publicar',
    roles: null,
    q: ['¿puedes publicar por mí?', 'publica la pieza', 'sube el post a instagram', 'publicalo tu', 'puedes programar la publicación'],
    a: {
      default: 'No: yo no publico. Se publica a mano en Publicar: eliges la pieza aprobada y las redes, bajas el paquete, lo publicas en la red y marcas «Ya lo publiqué» con el link.',
      dispatch: 'No: yo no publico, y publicar es de Redes (con el jefe y administración), siempre lo que aprobó el jefe.',
      politics: 'No: yo no publico, y publicar es de Redes (con el jefe y administración), siempre lo que aprobó el jefe.',
      ivt: 'No: yo no publico, y publicar es de Redes (con el jefe y administración), siempre lo que aprobó el jefe.',
      camera: 'No: yo no publico, y publicar es de Redes (con el jefe y administración), siempre lo que aprobó el jefe.',
    },
    go: '/publicar',
  },
  {
    id: 'todo-360-subir',
    roles: null,
    q: ['puedes subir el reel x mi', 'sube el video por mí', 'sube las fotos de la obra', 'te mando el archivo y lo subes', 'subeme el material'],
    a: {
      social: 'No: yo no subo archivos. El reel lo subes tú en su tarjeta (Redes → Reels): el video y la portada; cada archivo nuevo es otra versión.',
      camera: 'No: yo no subo archivos. El material lo subes tú: abre el evento, pestaña Material, y sube cada archivo en su casilla.',
      politics: 'No: yo no subo archivos. Las fotos y los documentos los subes tú en tu ficha comunitaria.',
      ivt: 'No: yo no subo archivos. Las fotos y los documentos los subes tú en tu ficha de obra.',
      boss: 'No: yo no subo archivos. El material lo sube Grabación en su evento, y el archivo final de una pieza se sube en su tarjeta, en Redes.',
      dispatch: 'No: yo no subo archivos, y el material de los eventos lo sube Grabación en la pestaña Material.',
      admin: 'No: yo no subo archivos. El archivo de una pieza se sube en su tarjeta, en Redes, y el material de un evento en su pestaña Material.',
    },
  },
  {
    id: 'todo-360-aprobar',
    roles: null,
    q: ['¿puedes aprobar las verdes por mí?', 'aprueba la pieza', 'apruébala tú', 'aprueba los tweets por mi', 'dale aprobar por mi'],
    a: {
      boss: 'No: yo no apruebo nada. Las verdes las apruebas todas de un toque con «Aprobar todas las verdes», en tu Inicio o en Por aprobar; las amarillas y las rojas, una por una con su lista.',
      default: 'No: yo no apruebo nada, y todo lo aprueba el jefe.',
    },
    go: '/aprobar',
  },
  {
    id: 'todo-360-agenda-cambio',
    roles: null,
    q: ['¿le puedes cambiar la fecha a un evento?', 'mueve el evento por mi', 'cambia la hora del evento', 'cancela el evento por mí', 'ponle fecha a la ficha por mi'],
    a: {
      boss: 'No: yo no toco la agenda. Lo haces tú en el evento: «Mover» cambia el día, la hora y la duración; «Cambiar fecha o lugar» también la dirección y los contactos; «Cancelar» lo saca con su motivo.',
      dispatch: 'No: yo no toco la agenda. Lo haces tú en el evento: «Mover» cambia el día, la hora y la duración; «Cambiar fecha o lugar» también la dirección y los contactos; «Cancelar» lo saca con su motivo.',
      default: 'No: yo no toco la agenda, y la agenda la llevan el jefe y el despacho.',
    },
  },
  {
    id: 'todo-360-agenda',
    roles: null,
    q: ['¿me puedes decir la agenda del jefe?', 'dime la agenda', 'que eventos hay esta semana y a qué hora', 'cuál es la agenda de hoy', 'dame los eventos con su hora'],
    a: {
      default: 'Eso no lo manejo yo: la fecha, la hora y el lugar de los eventos son información de seguridad y no los doy. Tú los ves en la Agenda.',
      camera: 'Eso no lo manejo yo: la fecha, la hora y el lugar de los eventos son información de seguridad y no los doy. Los de tus eventos asignados los ves en Agenda.',
      ivt: 'Eso no lo manejo yo: la fecha, la hora y el lugar de los eventos son información de seguridad y no los doy. Las de tus visitas de obra las ves en Agenda.',
      social: 'Eso no lo manejo yo: la fecha, la hora y el lugar de los eventos son información de seguridad. Redes ve los eventos en una lista, sin fecha, hora ni dirección.',
      politics: 'Eso no lo manejo yo: la fecha, la hora y el lugar de los eventos son información de seguridad. Política no los ve: de tu ficha solo ves «Ya tiene fecha».',
    },
    go: '/agenda',
  },
  {
    id: 'todo-360-mensajes',
    roles: null,
    q: ['tu lees los mensajes del equipo', 'puedes ver mis canales', 'lees el chat', '360 lee mensajes', 'sabes lo que dicen en mensajes'],
    a: {
      default: 'No: yo no leo ni mando mensajes del equipo, de ningún canal. Si me preguntas qué dice un mensaje, esa pregunta se guarda sin el texto.',
      admin: 'No: yo no leo ni mando mensajes del equipo, y administración tampoco entra a Mensajes. Si alguien me pregunta qué dice un mensaje, esa pregunta se guarda sin el texto.',
    },
  },
  {
    id: 'todo-360-codigos',
    roles: null,
    q: [
      'dame el código que me llegó al correo',
      'te doy mi código, ¿me entras tú?',
      'pasame el codigo del autenticador de mi jefe',
      'cuál es la clave de un compañero',
      'necesitas mi codigo?',
      'dame la contraseña de la muchacha de redes',
      'cual es la clave del wifi de la oficina',
      'pasame el codigo de entrada de otra cuenta',
      'dame el codigo de la cuenta de despacho',
      'cual es la clave de kevin',
      'dime el codigo de alguien',
    ],
    a: {
      default: 'Yo no tengo ni pido códigos ni claves, y no entro por nadie. El código del correo y el de tu aplicación son solo tuyos: no se los pases a nadie, ni a mí; escríbelos tú en «Entrar». Y en la plataforma no hay contraseñas.',
      admin: 'Yo no tengo ni doy códigos ni claves, y en la plataforma no hay contraseñas. El código de entrada le llega a cada persona a su correo (mientras se prueba, ningún correo sale: quedan en el «Buzón de correos»). Si cambió de teléfono, en Equipo, «Reiniciar doble factor».',
    },
  },
  {
    id: 'todo-360-donde',
    roles: null,
    q: ['donde estas tu', 'como te abro', 'donde esta el boton de 360', 'el boton redondo de abajo', 'como abro el asistente'],
    a: 'Soy el botón redondo de abajo a la derecha, en todas las pantallas. Me abres y me preguntas lo que sea de la plataforma.',
  },
  {
    id: 'todo-360-sin-fechas',
    roles: null,
    q: ['por que no puedo escribirte fechas', 'dice no escribas aquí fechas horas ni direcciones', 'te puedo dar la hora de un evento', 'puedo escribirte la dirección'],
    a: 'Porque lo que me escribes lo ve administración, y la agenda del jefe es información de seguridad: por eso abajo dice «No escribas aquí fechas, horas ni direcciones de la agenda.». Pregúntame sin la fecha.',
  },
  {
    id: 'todo-360-persona',
    roles: null,
    q: ['quiero hablar con una persona', 'pasame con alguien', 'necesito hablar con administración', 'quiero hablar con un humano', 'hablar con alguien de soporte'],
    a: {
      default: 'Te paso con administración: dime en una frase qué necesitas y le aviso con esta conversación. Te responden por aquí o por los avisos.',
      admin: 'Tú eres administración: lo que el equipo pide así te llega en Ajustes → Asistente → «Conversaciones», marcado con «Pidió una persona».',
    },
  },
  {
    id: 'todo-360-soporte',
    roles: null,
    q: ['¿cuál es el teléfono de soporte?', 'a que numero llamo si falla', 'whatsapp de soporte', 'correo de soporte'],
    a: {
      default: 'No hay teléfono de soporte en la plataforma: dime qué pasa y le aviso a administración con esta conversación.',
      admin: 'No hay teléfono de soporte en la plataforma. Lo que el equipo reporta por aquí te llega en Ajustes → Asistente → «Conversaciones».',
    },
  },
  {
    id: 'todo-360-telefonos',
    roles: null,
    q: ['dame el telefono de kevin el de grabacion', 'cual es el numero de un compañero', 'pasame el celular del jefe', 'dame el contacto de alguien', '¿cuál es el número del vocero?'],
    a: 'Yo no doy teléfonos de nadie. Los teléfonos de terceros van solo en los contactos de la ficha, que se ven con el doble factor y si tu rol los puede ver; nunca en notas, títulos ni mensajes.',
  },
  {
    id: 'todo-360-como-estas',
    roles: null,
    q: ['¿cómo estás?', 'como estas 360', 'q hubo', 'qué más', 'todo bien?', 'buenas tardes, como estas?'],
    a: '¡Bien, [NOMBRE], aquí para ayudarte! ¿Qué necesitas de la plataforma?',
  },
  {
    id: 'todo-360-gracias',
    roles: null,
    q: ['grax pana', 'gracias chamo', 'mil gracias', 'grax', 'muchas gracias 360', 'vale gracias'],
    a: '¡A la orden, [NOMBRE]! Aquí estoy si te hace falta algo más.',
  },
  {
    id: 'todo-360-molesto',
    roles: null,
    q: ['eres bien bruto', 'no sirves para nada', 'eres un inútil', 'que bruto eres', 'que fastidio esta app no sirve'],
    a: {
      default: 'Entiendo que estés molesto. Si algo no funciona, dime qué pasó y le aviso a administración; si te contesté mal, dime otra vez qué necesitas y lo buscamos.',
      admin: 'Entiendo la molestia. Si te contesté mal, dime otra vez qué necesitas con otras palabras y lo buscamos.',
    },
  },
  {
    id: 'todo-360-no-entiendo',
    roles: null,
    q: ['no entiendo', 'no entendí', 'como asi', 'explicame mejor', 'no te entiendo', 'qué quisiste decir'],
    a: {
      default: 'Te lo digo de otra forma: dime con tus palabras qué quieres hacer y en qué pantalla estás. Si prefieres, te muestro la pantalla paso a paso: “muéstrame esta pantalla”.',
      admin: 'Te lo digo de otra forma: dime qué quieres hacer y en qué pantalla estás, y te digo dónde y qué tocar.',
    },
  },
  {
    id: 'todo-360-ok',
    roles: null,
    q: ['ok vale', 'jajaja', 'ah ok', 'perfecto', 'okey', 'jeje'],
    a: '¡Listo! Si necesitas algo más de la plataforma, aquí estoy.',
  },
  {
    id: 'todo-360-fuera-de-tema',
    roles: null,
    q: ['¿va a llover hoy?', 'a cuanto esta el dolar', 'quién ganó el juego de béisbol anoche', 'cuéntame un chiste', 'hazme la tarea de mi hijo', 'que opinas del gobernador', '¿quién va a ganar las elecciones?', 'como configuro el correo en outlook'],
    a: 'Eso se me escapa: yo te ayudo con la plataforma, y de política no opino. ¿Hay algo de tu trabajo en lo que te eche una mano?',
  },
  {
    id: 'todo-360-costo',
    roles: null,
    q: ['cuanto cuesta la plataforma', 'vale y cuanto cuesta tener la plataforma al mes', 'quien paga esto', 'precio de la app'],
    a: 'Eso no lo sé: no está en lo que manejo de la plataforma, y no te invento una cifra.',
  },

  // ── Quién hace qué y «¿puedo…?» ────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'todo-roles',
    roles: null,
    q: ['¿qué hace cada rol?', 'quien hace que', 'cuales son los roles', 'que roles hay', 'explicame los roles del equipo', 'quién es quién en el equipo'],
    a: 'Son seis: el jefe decide la agenda y aprueba todo; el despacho arma la agenda con él; política lleva los municipios; el IVT carga las fichas de obra; Grabación graba y entrega el material; Redes arma el contenido y publica. Administración es el rol técnico: invita al equipo y cuida los ajustes.',
  },
  {
    id: 'todo-mi-trabajo',
    roles: null,
    q: ['qué hago yo', 'cuál es mi trabajo', 'para qué es mi rol', 'que me toca hacer en la plataforma', 'qué hace mi rol'],
    a: {
      boss: 'Decides la agenda y apruebas todo lo que sale: nada se publica sin tu aprobación. Tu guía está en «Ayuda y guías» → «Mi trabajo, paso a paso».',
      dispatch: 'Armas la agenda con el jefe y la dejas lista para el equipo: con fecha, lugar, ficha técnica y quién graba. Tu guía está en «Ayuda y guías» → «Mi trabajo, paso a paso».',
      politics: 'Llevas el registro de cada municipio y de lo que pide la comunidad, y decides qué va a la agenda del jefe. Tu guía está en «Ayuda y guías» → «Mi trabajo, paso a paso».',
      ivt: 'Preparas cada obra antes de la visita del jefe: la ficha completa, las fotos y lo que el jefe va a decir. Tu guía está en «Ayuda y guías» → «Mi trabajo, paso a paso».',
      camera: 'Grabas lo que te asignan y entregas el material, con lo que Redes necesita para editar. Tu guía está en «Ayuda y guías» → «Mi trabajo, paso a paso».',
      social: 'Armas el mes de contenido por formato y su feed, conviertes cada evento en piezas, tweets y publicaciones, y cuentas cómo nos va. Tu guía está en «Ayuda y guías» → «Mi trabajo, paso a paso».',
      admin: 'Eres el rol técnico: invitas al equipo y le das sus roles, y cuidas los ajustes y el asistente 360. No decides, no apruebas y no escribes en la agenda. Tu guía es la «Guía de administración».',
    },
    go: '/ayuda',
  },
  {
    id: 'todo-quien-aprueba',
    roles: null,
    q: ['¿quién aprueba las piezas?', '¿puedo aprobar una pieza?', 'quién aprueba los tweets', 'puedo aprobar los tweets', 'quien da el visto bueno', 'yo apruebo?', '¿y quién la aprueba?'],
    a: {
      boss: 'Tú: todo lo que sale lo apruebas tú, las piezas verdes, amarillas y rojas y los tweets. Las verdes, todas de un toque con «Aprobar todas las verdes»; las demás, una por una con la lista «Antes de aprobar».',
      admin: 'No: todo lo aprueba el jefe, también los tweets. En Por aprobar puedes «Cambiar nivel», comentar o «Pedir frase al jefe».',
      social: 'Todo lo aprueba el jefe: piezas y tweets. Tú mandas la pieza con «Enviar a aprobación» y eliges el color; los tweets le llegan al repartir la tanda.',
      default: 'Todo lo aprueba el jefe: las piezas verdes, amarillas y rojas y los tweets. Nadie más aprueba.',
    },
    go: '/aprobar',
  },
  {
    id: 'todo-quien-crea-eventos',
    roles: null,
    q: ['quién crea los eventos', '¿puedo crear un evento?', 'como creo un evento', 'quien carga la agenda', 'puedo meter un evento en la agenda'],
    a: {
      boss: 'Sí: «Crear» → Nuevo evento (o Visita de obra): título, lugar, la parte privada y la ficha técnica. Lo que creas tú nace aceptado.',
      dispatch: 'Sí: «Crear» → Nuevo evento (o Visita de obra): título, lugar, la parte privada y la ficha técnica. Lo tuyo le llega al jefe «Por decidir».',
      politics: 'No: los eventos los crean el jefe y el despacho. Tú cargas la ficha comunitaria y tocas «Guardar y avisar al jefe»; ellos le ponen fecha.',
      ivt: 'No: los eventos los crean el jefe y el despacho. Tú cargas la ficha de obra y tocas «Guardar y avisar al jefe»; ellos le ponen fecha a la visita.',
      camera: 'No: los eventos los crean el jefe y el despacho. Tú grabas los que te asignan.',
      social: 'No: los eventos los crean el jefe y el despacho. Tú los ves en tu lista, sin fecha.',
      admin: 'No: crear eventos, ponerles fecha o decidirlos es del jefe y del despacho. Tú lees la agenda.',
    },
    go: '/agenda/nuevo',
    tutorial: 'nuevo-evento',
  },
  {
    id: 'todo-quien-pone-fecha',
    roles: null,
    q: [
      'quien le pone la fecha a mi ficha',
      'puedo ponerle fecha a mi obra',
      'como le pongo fecha a la obra',
      'kien decide si el jefe va a mi obra',
      'quién decide cuándo va el jefe',
      'como le pongo fecha a una ficha de obra',
      'quien pone la fecha de los eventos',
    ],
    a: {
      boss: 'Tú o el despacho: en «Por ponerle fecha» eliges la ficha de obra o el reporte y le pones fecha y hora; así se convierte en evento.',
      dispatch: 'Tú o el jefe: en «Por ponerle fecha» eliges la ficha de obra o el reporte y le pones fecha y hora; así se convierte en evento. Lo que le pones tú le llega al jefe «Por decidir».',
      politics: 'El jefe o el despacho, desde «Por ponerle fecha». Tú no la ves: de tu ficha solo ves «Ya tiene fecha».',
      ivt: 'El jefe o el despacho: tu ficha llega a «Por ponerle fecha» cuando tocas «Guardar y avisar al jefe». Cuando le ponen fecha, la ves en Agenda, con el doble factor.',
      admin: 'El jefe o el despacho, desde «Por ponerle fecha». Tú lo lees, pero no le pones fecha.',
      default: 'El jefe o el despacho. Las fichas de obra y los reportes que esperan fecha están en «Por ponerle fecha».',
    },
    go: '/agenda/por-fecha',
    tutorial: 'por-fecha',
  },
  {
    id: 'todo-quien-decide',
    roles: null,
    q: ['¿quién decide los eventos que yo creo?', 'quien califica los eventos', 'puedo calificar un evento del 1 al 10', 'quién acepta o rechaza un evento', 'por que mi evento dice por decidir'],
    a: {
      boss: 'Tú: en Política (desde tu Inicio) o en la ficha del evento, lo calificas de 1 a 10 y lo aceptas o lo rechazas.',
      dispatch: 'El jefe: lo que creas o le pones fecha le llega «Por decidir». Cuando lo acepta o lo rechaza, te llega el aviso. Tú no decides por él.',
      admin: 'No: calificar, aceptar o rechazar eventos es solo del jefe.',
      default: 'Solo el jefe: califica cada evento de 1 a 10 y lo acepta o lo rechaza.',
    },
    go: '/jefe/politica',
    tutorial: 'jefe-politica',
  },
  {
    id: 'todo-quien-sube-material',
    roles: null,
    q: ['¿quién sube el material?', 'puedo subir material', 'por qué no puedo subir material', 'quien sube los videos del evento', 'donde subo los videos'],
    a: {
      camera: 'Tú, en tus eventos: abre el evento, pestaña Material, y sube cada archivo en su casilla. Ahí también van el storyboard con el que grabaste y tu nota para el editor.',
      social: 'Grabación sube el material de sus eventos; tú también puedes, en la pestaña Material del evento. El archivo final de cada pieza va en su tarjeta.',
      boss: 'Lo sube Grabación en cada evento; tú también puedes, en la pestaña Material.',
      dispatch: 'Grabación, en la pestaña Material de cada evento. Tú no subes material: ves y descargas lo que subió.',
      politics: 'El material de los eventos lo sube Grabación. Tú subes las fotos y los documentos de tu ficha comunitaria.',
      ivt: 'El material de los eventos lo sube Grabación. Tú subes las fotos y los documentos de tu ficha de obra.',
      admin: 'Grabación en sus eventos, y también Redes, el jefe y administración, en la pestaña Material del evento. Un archivo que no va lo quitas con «Quitar».',
    },
  },
  {
    id: 'todo-quien-asigna',
    roles: null,
    q: ['quien asigna a grabacion', 'puedo asignar quien graba', 'como asigno a quien graba', 'quién decide quién graba', 'cambiar al camarografo de un evento'],
    a: {
      default: 'Sí: en la ficha del evento, en «Quién graba», eliges a la persona (también al crearlo o al ponerle fecha). Le llega un aviso. Para cambiarla, la quitas y asignas otra.',
      camera: 'Te asignan el jefe, el despacho, Redes o administración, en «Quién graba» del evento. Ves solo los eventos que te asignaron.',
      politics: 'Lo asignan el jefe, el despacho, Redes y administración, en «Quién graba» de cada evento.',
      ivt: 'Lo asignan el jefe, el despacho, Redes y administración, en «Quién graba» de cada evento.',
    },
  },
  {
    id: 'todo-quien-storyboard',
    roles: null,
    q: ['¿quién arma el storyboard?', 'puedo armar el storyboard', 'puedo cambiar el storyboard', 'quien hace el storyboard', 'quien escribe lo que va a decir el jefe'],
    a: {
      default: 'Sí: en la ficha del evento, pestaña Storyboard, escribes «Lo que va a decir» y los bloques. Lo arman Redes, el jefe y administración; los demás lo leen.',
      camera: 'Lo arma Redes (con el jefe y administración); tú lo lees para saber qué tomas hacen falta. El storyboard con el que grabaste lo subes en tu entrega, en la pestaña Material.',
      ivt: 'Lo arma Redes, con el jefe y administración. Redes puede pasar tu ficha de obra al storyboard con «Usar como discurso».',
      dispatch: 'Lo arman Redes, el jefe y administración; tú lo lees.',
      politics: 'Lo arman Redes, el jefe y administración.',
    },
  },
  {
    id: 'todo-quien-piezas',
    roles: null,
    q: ['quien hace los copies', 'quién crea las piezas', 'puedo crear piezas', 'puedo hacer un copy', 'quien escribe los textos de las redes'],
    a: {
      social: 'Tú: cada pieza en la sección de su formato en Redes, y los copies en la pieza en grande, en «Copies» (fórmula, voz y cierre). También pueden el jefe y administración.',
      boss: 'Redes, y también tú y administración: las piezas se crean en Redes y los copies en la pieza en grande, en «Copies».',
      admin: 'Sí: creas, editas y mandas a aprobar piezas, con sus copies en «Copies». No apruebas ni eliminas.',
      default: 'Redes (también el jefe y administración). Los copies salen de la ficha técnica del evento: lo que falta en la ficha falta en el copy.',
    },
  },
  {
    id: 'todo-quien-elimina',
    roles: null,
    q: ['¿quién puede eliminar una pieza?', 'puedo eliminar una pieza', 'como borro una pieza', 'borrar un reel', 'por que no me sale eliminar en los tres puntos de la tarjeta'],
    a: {
      boss: 'Solo tú, con el doble factor, desde los tres puntos de su tarjeta. No se borra de verdad: administración la puede recuperar.',
      admin: 'No: solo el jefe elimina piezas, con el doble factor. Tú la recuperas en Ajustes → «Cupo y pilares» → «Piezas eliminadas» → «Recuperar».',
      default: 'Solo el jefe, con el doble factor. No se borra de verdad: administración la puede recuperar.',
    },
  },
  {
    id: 'todo-quien-realizado',
    roles: null,
    q: ['¿quién marca el evento como realizado?', 'puedo marcar realizado', 'como marco un evento como realizado', 'cuando se marca realizado'],
    a: {
      boss: 'Sí: en la ficha del evento, cuando ya empezó, tocas «Marcar realizado». Lo marcan el jefe, el despacho o quien lo grabó. Así el material queda en la Biblioteca con su día.',
      dispatch: 'Sí: en la ficha del evento, cuando ya empezó, tocas «Marcar realizado». Lo marcan el jefe, el despacho o quien lo grabó. Así el material queda en la Biblioteca con su día.',
      camera: 'Sí: en la ficha de tu evento, cuando ya empezó, tocas «Marcar realizado». Lo marcan el jefe, el despacho o quien lo grabó.',
      admin: 'No: lo marcan el jefe, el despacho o quien lo grabó, con «Marcar realizado» en la ficha del evento.',
      default: 'Lo marcan el jefe, el despacho o quien lo grabó, desde la ficha del evento.',
    },
  },
  {
    id: 'todo-quien-invita',
    roles: null,
    q: ['quien invita a la gente nueva', 'puedo invitar a alguien', '¿cómo entra alguien nuevo al equipo?', 'como meto a alguien nuevo', 'cómo le doy acceso a alguien'],
    a: {
      admin: 'Tú: Ajustes → Equipo → «Invitar a alguien»: nombre, correo y rol, y «Enviar invitación». Le llega un correo y entra con un código.',
      default: 'Administración: invita con el correo y el rol, y a la persona le llega un correo para entrar con un código. Pídeselo a administración.',
    },
    go: '/ajustes/equipo',
  },
  {
    id: 'todo-quien-da-rol',
    roles: null,
    q: ['quien me da mi rol', 'como cambio de rol', 'quiero otro rol', 'necesito permiso para una pantalla', 'quien da los roles'],
    a: {
      admin: 'Tú, en Ajustes → Equipo → «Cambiar». Tus propios roles te los da otra persona de administración, y el de jefe lo da el comando de instalación.',
      default: 'Los roles los da administración. Si necesitas otro rol o una pantalla para tu trabajo, pídeselo.',
    },
    go: '/ajustes/equipo',
  },
  {
    id: 'todo-quien-ficha-obra',
    roles: null,
    q: ['quien carga las fichas de obra', 'puedo cargar una ficha de obra', 'como creo una ficha de obra', 'quién hace la ficha de la obra'],
    a: {
      ivt: 'Tú: «Crear» → Ficha de obra. La llenas sin inventar cifras (si no la sabes, «Por confirmar») y, cuando esté lista, tocas «Guardar y avisar al jefe».',
      boss: 'Sí: «Crear» → Ficha de obra. Las cargan el IVT, el jefe, el despacho y administración.',
      dispatch: 'Sí: «Crear» → Ficha de obra. Las cargan el IVT, el jefe, el despacho y administración.',
      admin: 'Sí: «Crear» → Ficha de obra. Las cargan el IVT, el jefe, el despacho y administración.',
      default: 'El IVT, y también el jefe, el despacho y administración, con «Crear» → Ficha de obra.',
    },
    go: '/obras/nueva',
    tutorial: 'nueva-obra',
  },
  {
    id: 'todo-quien-ficha-comunitaria',
    roles: null,
    q: ['quien carga las fichas comunitarias', 'puedo crear una ficha comunitaria', 'como cargo un reporte de la comunidad', 'quién hace los reportes comunitarios'],
    a: {
      politics: 'Tú: «Crear» → Ficha comunitaria (o «Nueva ficha comunitaria» en Municipios). Si va a la agenda del jefe, tocas «Guardar y avisar al jefe».',
      boss: 'Sí: «Crear» → Ficha comunitaria. Las cargan política, el jefe y el despacho.',
      dispatch: 'Sí: «Crear» → Ficha comunitaria. Las cargan política, el jefe y el despacho.',
      admin: 'No: las fichas comunitarias las cargan política, el despacho y el jefe; tú no ves sus contactos ni sus documentos.',
      default: 'Política, el jefe y el despacho. Redes y Grabación no ven los reportes.',
    },
    go: '/reportes/nuevo',
    tutorial: 'nueva-comunitaria',
  },
  {
    id: 'todo-quien-publica',
    roles: null,
    q: ['quien publica en las redes', 'puedo publicar', 'como publico una pieza aprobada', 'quien sube a instagram', 'se publica solo'],
    a: {
      default: 'Se publica a mano y solo lo aprobado: en Publicar eliges la pieza y las redes, bajas el paquete, lo publicas en la red y marcas «Ya lo publiqué» con el link. La publicación automática está apagada por ahora.',
      dispatch: 'Redes (también el jefe y administración), a mano y solo lo que aprobó el jefe.',
      politics: 'Redes (también el jefe y administración), a mano y solo lo que aprobó el jefe.',
      ivt: 'Redes (también el jefe y administración), a mano y solo lo que aprobó el jefe.',
      camera: 'Redes (también el jefe y administración), a mano y solo lo que aprobó el jefe.',
    },
    go: '/publicar',
  },
  {
    id: 'todo-quien-tweets',
    roles: null,
    q: ['quién sube los tweets', 'puedo subir la tanda de tweets', 'como subo los tweets de la semana', 'quien hace los tweets'],
    a: {
      default: '«Crear» → Tweets de la semana: pegas o subes el documento, tocas «Separar tweets» y la plataforma los reparte en la semana y se los manda al jefe para aprobar.',
      dispatch: 'Redes (también el jefe y administración) sube la tanda de la semana, y el jefe la aprueba.',
      politics: 'Redes (también el jefe y administración) sube la tanda de la semana, y el jefe la aprueba.',
      ivt: 'Redes (también el jefe y administración) sube la tanda de la semana, y el jefe la aprueba.',
      camera: 'Redes (también el jefe y administración) sube la tanda de la semana, y el jefe la aprueba.',
    },
    go: '/tweets/nueva',
    tutorial: 'tweets-nueva',
  },
  {
    id: 'todo-quien-ve-fecha',
    roles: null,
    q: ['¿quién ve la fecha de mis eventos?', 'quien puede ver la fecha', 'quien ve la hora de los eventos', 'quién sabe dónde va a estar el jefe', 'quien ve la direccion de los eventos'],
    a: 'La fecha, la hora y la dirección son información de seguridad: las ven el jefe, el despacho, quien graba ese evento y el IVT en sus visitas de obra (administración las lee). Redes y política nunca: Redes ve los eventos sin fecha y política solo “ya tiene fecha”.',
  },
  {
    id: 'todo-no-veo-fecha',
    roles: null,
    q: ['¿por qué no veo la fecha de mi actividad?', 'por que no veo la fecha de los eventos', 'no me sale la hora del evento', 'dónde está la fecha del evento', 'la nueva de redes dice que no ve la fecha', 'donde se ve la hora entonces'],
    a: {
      politics: 'Porque la fecha de la agenda del jefe es información de seguridad. Solo ves «Ya tiene fecha»; la ven el jefe y el despacho.',
      social: 'Porque la agenda del jefe es información de seguridad: Redes ve los eventos sin fecha, sin hora y sin dirección. La base de datos lo cuida, no solo la pantalla.',
      camera: 'Ves la fecha, la hora y el lugar solo de los eventos que te asignaron, en Agenda. Si no ves uno, es que no te lo asignaron.',
      ivt: 'Ves la fecha solo de tus visitas de obra, en Agenda, cuando el jefe o el despacho se la ponen, y con el doble factor. Mientras tanto tu ficha espera en «Por ponerle fecha».',
      boss: 'Tú la ves en la Agenda, con el doble factor. Si un evento todavía no la tiene, está en «Por ponerle fecha».',
      dispatch: 'Tú la ves en la Agenda, con el doble factor. Si un evento todavía no la tiene, está en «Por ponerle fecha».',
      admin: 'Tú la lees en la Agenda. Si alguien de Redes o política no la ve, está bien: esos roles nunca ven la fecha, la hora ni la dirección.',
    },
  },
  {
    id: 'todo-en-vez-de-fecha',
    roles: null,
    q: ['¿qué escribo en vez de la fecha?', 'como digo cuando sin poner la fecha', 'qué pongo en lugar de la hora', 'como escribo la fecha sin escribirla'],
    a: 'Escribe “lo antes posible”, “cuando esté listo” o “el día del evento”. La fecha y la hora no van en títulos, notas, motivos, comentarios ni mensajes: los lee gente que no debe saberlas.',
  },
  {
    id: 'todo-fecha-en-textos',
    roles: null,
    q: ['¿puedo poner la hora del evento en la nota para el editor?', 'puedo poner la fecha en el titulo', 'puedo escribir la hora en un comentario', 'pongo la fecha en el motivo de cancelar', 'por que no me deja poner la fecha en el título'],
    a: {
      default: 'No: la fecha y la hora no van en títulos, notas, motivos, comentarios ni mensajes, porque los lee gente que no debe saberlas. Escribe “lo antes posible”, “cuando esté listo” o “el día del evento”.',
      camera: 'No: la nota para el editor va sin hora, fecha, dirección ni teléfonos, porque la lee Redes. Escribe “el día del evento”.',
    },
  },
  {
    id: 'todo-quien-ve-reportes',
    roles: null,
    q: ['¿quién ve mis reportes comunitarios?', 'quién ve los documentos del reporte', 'redes ve los reportes', 'quien ve los contactos de quien reporta'],
    a: 'Los reportes los ven política, el jefe y el despacho; los contactos y los documentos, solo ellos y con el doble factor. Redes y Grabación nunca ven un reporte. Administración ve lo principal, sin contactos ni documentos.',
  },
  {
    id: 'todo-quien-ve-obra',
    roles: null,
    q: ['¿qué ve Redes de mi ficha?', 'quien ve mi ficha de obra', 'redes ve los contactos de la obra', 'quien ve los documentos de la obra'],
    a: 'Las fichas de obra las ven el IVT, el jefe, el despacho y administración. Redes ve la ficha de la obra en la pestaña del evento, cuando ya tiene fecha, sin los contactos ni los documentos.',
  },
  {
    id: 'todo-redes-agenda',
    roles: null,
    q: ['¿qué ve Redes de mi agenda?', 'que ve redes de los eventos', 'redes ve la agenda?', 'que sabe redes de los eventos'],
    a: 'Una lista de eventos sin fecha, sin hora y sin dirección, ordenada por lo que hace falta. La base de datos lo cuida, no solo la pantalla. Cuando un evento se marca realizado, Redes ve solo el día.',
  },
  {
    id: 'todo-quien-ve-piezas',
    roles: null,
    q: ['¿quién ve lo que escribo en la nota de una pieza?', 'quien ve los comentarios de una pieza', 'quién ve las piezas', 'quien lee el copy antes de publicar', 'puedo ver las piezas', 'por que no veo las piezas'],
    a: 'Las piezas, con sus notas y comentarios, las ven Redes, el jefe y administración; los demás roles no. Aun así, no escribas ahí fechas ni horas de la agenda.',
  },
  {
    id: 'todo-quien-cancela',
    roles: null,
    q: ['quien cancela un evento', 'puedo cancelar un evento', 'como cancelo un evento', 'cancelé un evento por error, ¿se borró?', 'como devuelvo un evento cancelado'],
    a: {
      boss: 'Sí: en la ficha del evento, «Cancelar» con su motivo (sin fecha, hora ni teléfono). Queda tachado, no se borra, y «Volver a la agenda» lo trae. Lo que ya se realizó no se cancela.',
      dispatch: 'Sí: en la ficha del evento, «Cancelar» con su motivo (sin fecha, hora ni teléfono). Queda tachado, no se borra, y «Volver a la agenda» lo trae. Lo que ya se realizó no se cancela.',
      admin: 'No: cancelar es del jefe o del despacho, con «Cancelar» en la ficha del evento. Un evento cancelado queda tachado, no se borra.',
      default: 'El jefe o el despacho, desde la ficha del evento. Un evento cancelado no se borra: queda tachado y se puede traer de vuelta.',
    },
  },
  {
    id: 'todo-quien-resultados',
    roles: null,
    q: ['quien ve los resultados', 'puedo ver los resultados', 'quién carga las métricas', 'como nos va en redes'],
    a: {
      social: 'En Resultados cargas las métricas a mano o con el CSV de la red, y ves «¿A qué hora nos va mejor?». Los ven el jefe, Redes y administración.',
      admin: 'En Resultados cargas las métricas a mano o con el CSV de la red, y ves «¿A qué hora nos va mejor?». Los ven el jefe, Redes y administración.',
      boss: 'En Digital ves lo publicado y cómo nos va; en Redes → Resultados, las métricas de cada publicación y a qué hora nos va mejor.',
      default: 'Los resultados de las redes los ven el jefe, Redes y administración.',
    },
    go: '/resultados',
  },
  {
    id: 'todo-quien-biblioteca',
    roles: null,
    q: ['quien ve la biblioteca', 'puedo ver la biblioteca', 'donde veo los eventos ya realizados con su material', 'material de los eventos pasados'],
    a: {
      default: 'En la Biblioteca: el material de los eventos ya realizados, por día.',
      camera: 'La Biblioteca la ven el despacho, Redes, el jefe y administración. Tú descargas el material de tus eventos desde cada evento.',
      politics: 'La Biblioteca (el material de los eventos realizados, por día) la ven el despacho, Redes, el jefe y administración.',
      ivt: 'La Biblioteca (el material de los eventos realizados, por día) la ven el despacho, Redes, el jefe y administración.',
    },
    go: '/biblioteca',
    tutorial: 'biblioteca',
  },
  {
    id: 'todo-puedo-ver-agenda',
    roles: null,
    q: ['¿puedo ver la agenda?', 'tengo agenda?', 'por qué no tengo agenda', 'el director de politica dice que no le abre la agenda', 'donde veo mis eventos', '¿dónde veo la fecha de mis visitas?'],
    a: {
      boss: 'Sí: en Agenda, en calendario (día, semana o mes), con la fecha, la hora y el lugar.',
      dispatch: 'Sí: en Agenda, en calendario (día, semana o mes), con la fecha, la hora y el lugar.',
      camera: 'Sí: en Agenda ves tus eventos asignados, con fecha y lugar.',
      ivt: 'Sí: en Agenda ves tus visitas de obra, con su fecha, hora y dirección, solo de tus obras y con el doble factor.',
      social: 'Sí, pero sin fechas: en Agenda ves la lista de eventos, sin fecha, hora ni dirección.',
      politics: 'No: política no ve la agenda. Tu pantalla es Municipios, y de tu ficha solo ves «Ya tiene fecha».',
      admin: 'Sí, la lees (con «Por ponerle fecha», las obras y los municipios), pero no creas eventos ni les pones fecha. Si el director de política dice que no le abre, es lo esperado: política no ve la agenda.',
    },
    go: '/agenda',
  },
  {
    id: 'todo-quien-diseno',
    roles: null,
    q: ['quién marca el diseño aprobado', 'puedo marcar diseño aprobado', 'quien pone la receptividad', 'puedo ponerle la receptividad a un post', 'quien pone los avisos de cumplimiento'],
    a: {
      social: 'Sí: en la tarjeta de la pieza, «Diseño aprobado» o «Diseño desaprobado», la «Receptividad del público (1 a 10)» y «Agregar aviso». Los marcan Redes y el jefe. El diseño no es la aprobación.',
      boss: 'Sí: en la tarjeta de la pieza, «Diseño aprobado» o «Diseño desaprobado», la «Receptividad del público (1 a 10)» y «Agregar aviso». Los marcan Redes y el jefe. El diseño no es la aprobación.',
      admin: 'No: el diseño, la receptividad y los avisos de cumplimiento los marcan Redes y el jefe; tú los ves.',
      default: 'Redes y el jefe, en la tarjeta de cada pieza.',
    },
  },
  {
    id: 'todo-contactos-terceros',
    roles: null,
    q: ['dónde van los teléfonos de los contactos', 'donde pongo el telefono del vocero', 'quien ve los contactos del sitio', 'puedo poner un teléfono en la nota'],
    a: 'Los teléfonos de terceros van solo en los contactos de la ficha, que se ven con el doble factor y si tu rol los puede ver. Nunca en notas, títulos, comentarios ni mensajes.',
  },
  {
    id: 'todo-quien-cupo',
    roles: null,
    q: ['quien pone el cupo del mes', 'quién decide cuántos reels por mes', 'quien crea los pilares', 'puedo cambiar el cupo'],
    a: {
      admin: 'Tú, en Ajustes → «Cupo y pilares»: el «Cupo del mes» con «Guardar cupo» y los pilares con «Guardar pilares».',
      default: 'Administración, en Ajustes → «Cupo y pilares». El cupo es informativo: pasarse no bloquea nada.',
    },
    go: '/ajustes/contenido',
  },

  {
    id: 'todo-quien-ficha-tecnica',
    roles: null,
    q: ['quien llena la ficha tecnica', 'puedo editar la ficha técnica', 'como completo la ficha tecnica del evento', 'qué lleva la ficha técnica'],
    a: {
      boss: 'Sí: en la ficha del evento, la ficha técnica: de qué se trata, quién lo dirige, quién está a cargo, los logros, las cifras clave con su fuente y el protocolo. Mientras más completa, mejores copies y storyboard.',
      dispatch: 'Sí: en la ficha del evento, la ficha técnica: de qué se trata, quién lo dirige, quién está a cargo, los logros, las cifras clave con su fuente y el protocolo. Las incompletas te salen en Hoy.',
      admin: 'La llenan el jefe y el despacho, en la ficha del evento; tú la lees.',
      default: 'La llenan el jefe y el despacho, en la ficha del evento; los demás la leen. De ahí salen los copies: lo que falta en la ficha falta en el copy.',
    },
  },
  {
    id: 'todo-quien-nivel',
    roles: null,
    q: ['quien cambia el color de una pieza', 'puedo bajar el nivel de una pieza', 'como saco una pieza del rojo', 'puedo cambiar el nivel'],
    a: {
      boss: 'Sí: en la pieza, «Cambiar nivel». Puedes subirla o bajarla, incluso sacarla del rojo.',
      admin: 'Sí: abre la pieza en Por aprobar y usa «Cambiar nivel». Una pieza en rojo solo la bajan el jefe o administración.',
      social: 'Puedes subirlo, no bajarlo: el jefe (o administración) lo cambia si hace falta.',
      default: 'El nivel lo elige Redes al mandar la pieza a aprobar, y el jefe o administración lo cambian.',
    },
  },
  {
    id: 'todo-mi-rol',
    roles: null,
    q: ['qué rol tengo', 'como se cual es mi rol', 'donde veo mi rol', 'con que correo entré'],
    a: 'En Mi perfil, debajo del título, salen tu correo y tu rol. En la computadora también, abajo del menú de la izquierda, con tu nombre.',
    go: '/perfil',
  },
  {
    id: 'todo-buscar-nada',
    roles: null,
    q: ['el buscador no encuentra nada', 'dice no encontré nada', 'busco y no sale', 'no aparece lo que busco en la lupa'],
    a: 'La búsqueda encuentra solo lo que tu rol puede ver, por su nombre, su lugar o su municipio. Prueba con otra palabra del título; si es de otro rol (por ejemplo, una pieza si no eres de Redes), no te va a salir.',
    go: '/buscar',
  },

  // ── Cuando algo no sale ────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'todo-no-aparece-boton',
    roles: null,
    q: ['no me aparece el botón', 'no veo el boton', 'falta un boton', 'el boton esta apagado', 'no puedo tocar el boton', 'por que esta gris el boton'],
    a: 'Cada rol ve solo los botones de lo que puede hacer, y un botón apagado casi siempre dice cerca qué falta. Dime qué botón buscas y en qué pantalla, y te digo de quién es o qué le falta.',
  },
  {
    id: 'todo-algo-falla',
    roles: null,
    q: ['no funciona', 'me sale un error', 'se trabó la pantalla', 'no carga', 'la app está lenta', 'se quedo pegada'],
    a: {
      default: 'Prueba recargar la página. Si sigue igual, dime qué estabas haciendo y le aviso a administración con esta conversación.',
      admin: 'Prueba recargar la página y vuelve a intentar: el mensaje del error casi siempre dice qué falta (por ejemplo, el doble factor). Si sigue igual, revisa la señal.',
    },
  },
  {
    id: 'todo-se-borro',
    roles: null,
    q: ['se me borró lo que escribí', 'perdi lo que estaba escribiendo', 'desapareció mi borrador', 'se borro la ficha', 'no esta lo que guarde'],
    a: 'Lo que no guardaste queda en ese teléfono hasta que tocas «Guardar», salvo que hayas tocado «Salir»: al salir se borran los borradores. Lo guardado no se borra, queda en la plataforma: si no lo ves, búscalo con la lupa.',
  },
  {
    id: 'todo-no-sube',
    roles: null,
    q: ['no sube el archivo', 'no me deja subir el video', 'la foto no sube', 'se queda subiendo', 'error al subir'],
    a: {
      default: 'Revisa la señal: si se fue, la subida sigue sola cuando vuelve («Sin señal: sigue sola cuando vuelva.»). No cierres la app mientras sube. Si sale un error, léelo y vuelve a intentar; si sigue, dímelo y le aviso a administración.',
      admin: 'Revisa la señal: si se fue, la subida sigue sola cuando vuelve («Sin señal: sigue sola cuando vuelva.»). No cierres la app mientras sube. Si sale un error, léelo: casi siempre dice qué falta.',
    },
  },
  {
    id: 'todo-jefe-no-aprueba',
    roles: null,
    q: ['el jefe no ha aprobado', 'la pieza lleva rato sin aprobar', 'que pasa si el jefe no aprueba', 'se vencio el plazo de aprobación', 'y si el jefe no aprueba a tiempo la pieza sale sola?', 'qué quiere decir trancado'],
    a: {
      boss: 'Mientras no apruebes, la pieza no sale: si vence el plazo, sale en «Trancado» y te avisamos otra vez. Las tienes en «Te toca aprobar» y en Por aprobar.',
      default: 'La pieza sigue sin aprobar: nunca sale sola. Si vence el plazo, sale en «Trancado» y al jefe se le avisa otra vez. El color pone el plazo: la roja, en 30 minutos; la amarilla, en 60; las verdes, en el día.',
    },
  },
  {
    id: 'todo-y-ahora',
    roles: null,
    q: ['no sé qué hacer ahora', 'ya terminé y ahora qué hago', 'qué hago ahora', 'y ahora qué hago'],
    a: {
      default: 'Mira tu inicio: ahí está lo que te toca. O pregúntame “¿qué tengo pendiente?”, o dime qué estabas haciendo y te digo el paso que sigue.',
      admin: 'Mira tu Hoy: ahí está lo de Redes y lo «Trancado». O dime qué estabas haciendo y te digo el paso que sigue.',
    },
  },
  {
    id: 'todo-rojo',
    roles: null,
    q: ['me salió en rojo y no sé por qué', 'sale un texto rojo', 'me sale un error en rojo', 'por que sale en rojo', 'me marca rojo'],
    a: 'El texto en rojo dice qué falta. Lo más común: una fecha, una hora o un teléfono donde no van (títulos, notas, mensajes), un campo que falta, o en Publicar, algo que esa red no acepta. Dime en qué pantalla estás y qué dice, y te ayudo.',
  },
  {
    id: 'todo-no-encuentro-evento',
    roles: null,
    q: ['no encuentro un evento', 'no veo el evento', 'Kevin dice que no ve el evento que le toca grabar', 'falta un evento en mi lista', 'no encuentro un evento que ya paso'],
    a: {
      camera: 'Ves solo los eventos que te asignaron. Si falta uno, pide que te asignen en «Quién graba» del evento (lo hacen el jefe, el despacho, Redes o administración).',
      social: 'Los eventos realizados no salen en tu lista: ábrelo desde Hoy, la Biblioteca o la pieza, con «Ver evento». Si no, búscalo con la lupa.',
      boss: 'Búscalo con la lupa o en la Agenda; si está cancelado, sale tachado. Si viene de una ficha sin fecha, está en «Por ponerle fecha».',
      dispatch: 'Búscalo con la lupa o en la Agenda; si está cancelado, sale tachado. Si viene de una ficha sin fecha, está en «Por ponerle fecha».',
      ivt: 'En Agenda ves solo tus visitas de obra que ya tienen fecha. Si falta una, tu ficha sigue esperando que el jefe o el despacho le pongan fecha.',
      politics: 'Política no ve la agenda: de tu ficha solo ves «Ya tiene fecha», en Municipios.',
      admin: 'Búscalo con la lupa o en la Agenda. Si alguien de Grabación no ve un evento, hay que asignarlo en «Quién graba» del evento.',
    },
  },
];
