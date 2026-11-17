// «Palabras de la app» (team guide, 11/11; Juan: «asegúrate que el bot sepa todo»): the words a new person does not
// know, as the team uses them. One source for /ayuda («Para todos» → «Palabras de la app»), docs/GUIA-POR-ROL.md and
// 360 (answers/engine.ts glossaryEntries: «¿qué es…?», «¿qué significa…?», «¿qué quiere decir…?»; explain.ts: «más
// fácil», «un ejemplo»). Plain Venezuelan Spanish, «tú»; «» only for what the screen says; no demo data (the pillars are
// the client's own, so none is named here).
// `aka`: the names people ask with, as they say them (WF-C, 17/11): singular and plural, the other name the word has in
// redes («short», «story», «gancho»), the plain way of saying it («el texto de abajo», «la cuadrícula», «los recuadritos
// de colores») and the screen's own numbers («9:16», «85/280»). Never a name that is another thing of the app: not
// «historia» alone (a ficha has its «Historia»), not «programado» (política's reports have that state), not «llamado a
// la acción» (a block of the web).
// `easy` and `example` are what 360 says when asked to explain the word (design §4(c)): the same said more simply, and
// a made-up case with the screen's labels (no dates, hours, names, phones or codes). `why` only where the guide gives it.
import type { GlossaryTerm } from './types';

export const GLOSSARY: GlossaryTerm[] = [
  {
    id: 'pieza',
    term: 'Pieza',
    aka: ['pieza', 'piezas', 'pieza de redes', 'piezas de redes'],
    text: 'Cada publicación que prepara Redes: un reel, un post, un carrusel, una historia, un video de YouTube o la pieza de fin de mes.',
    easy: 'Es cada publicación que se prepara, sea un video, una foto o varias fotos. Cada una tiene su tarjeta en Redes.',
    example: 'Por ejemplo: el video corto de un evento es una pieza, y el post con la foto del jefe es otra.',
  },
  {
    id: 'reel-y-short',
    term: 'Reel y Short',
    aka: ['reel', 'reels', 'short', 'shorts', 'ril', 'riles', 'video corto', 'videos cortos'],
    text: 'Un video corto y vertical. En Instagram se llama reel; en YouTube, Short.',
    easy: 'Es un video cortico y parado, como se ve en el teléfono. En Instagram le dicen reel y en YouTube, Short.',
    example: 'Por ejemplo: un video vertical del jefe saludando es un reel en Instagram; el mismo video en YouTube es un Short.',
  },
  {
    id: 'carrusel-y-lamina',
    term: 'Carrusel y lámina',
    aka: ['carrusel', 'carruseles', 'lámina', 'láminas', 'carrusel de fotos', 'carrusel de imágenes'],
    text: 'Un carrusel es un post de varias imágenes. Cada imagen es una lámina.',
    easy: 'Es un post con varias imágenes que se pasan de lado. Cada imagen se llama lámina.',
    example: 'Por ejemplo: un post con cinco imágenes de una obra, de la portada al CTA, es un carrusel de cinco láminas.',
  },
  {
    // Never «historia» alone (nor «historias», read as the same word): a ficha has its «Historia» too. Said with where it
    // goes, or as redes say it, it is this.
    id: 'historia-y-sticker',
    term: 'Historia y sticker',
    aka: [
      'historia de instagram',
      'historias de instagram',
      'historia de facebook',
      'historias de facebook',
      'historia en redes',
      'historias en redes',
      'historia de redes',
      'historias de redes',
      'story',
      'stories',
      'sticker',
      'stickers',
    ],
    text: 'La historia se ve un día en el perfil. El sticker es lo que se le pega encima: una encuesta, una pregunta o un enlace.',
    easy: 'La historia es lo que se ve un día en el perfil y después se va. El sticker es lo que se le pega encima, como una encuesta.',
    example: 'Por ejemplo: una historia con la foto de un evento y un sticker de pregunta que dice “¿Qué te pareció?”.',
  },
  {
    id: 'copy',
    term: 'Copy',
    aka: ['copy', 'copies', 'copi', 'copis', 'texto de la publicación', 'textos de la publicación'],
    text: 'El texto que acompaña una publicación. Cada pieza lleva tres, menos las historias: largo (Instagram, Facebook y TikTok), medio (Threads) y corto (X).',
    easy: 'Es el texto que va con la publicación. Cada pieza lleva tres: uno largo, uno medio y uno corto, según la red.',
    example: 'Por ejemplo: en un reel, el copy largo va en Instagram, el medio en Threads y el corto en X.',
  },
  {
    id: 'caption',
    term: 'Caption',
    aka: ['caption', 'captions', 'texto de abajo', 'texto de abajo de la foto', 'texto de abajo del video', 'copy largo'],
    text: 'El texto que va debajo de la foto o del video. Es el copy largo.',
    easy: 'Es el texto que sale debajo de la foto o del video. Es lo mismo que el copy largo.',
    example: 'Por ejemplo: en Instagram, lo que se lee debajo de un post es su caption.',
  },
  {
    // Not «llamado a la acción»: on the web it is a block («Llamado a la acción»), the web's word.
    id: 'hook-y-cta',
    term: 'Hook y CTA',
    aka: ['hook', 'hooks', 'cta', 'ctas', 'gancho', 'frase gancho', 'call to action'],
    text: 'El hook es la primera frase, la que engancha. El CTA es la invitación del final: comenta, comparte, escríbenos.',
    easy: 'El hook es la primera frase, la que hace que la gente se quede. El CTA es lo que se le pide al final, como comentar.',
    example: 'Por ejemplo: “¿Sabías que esta obra cambia tu calle?” es un hook, y “Cuéntanos en los comentarios” es un CTA.',
  },
  {
    id: 'texto-del-arte',
    term: 'Texto del arte',
    aka: ['texto del arte', 'antetítulo', 'titular', 'sellos', 'sello', 'letra pequeña', 'concepto visual', 'texto de la imagen', 'texto dentro de la imagen'],
    text: 'Lo que va escrito dentro de la imagen de un post: el «Antetítulo» (la línea chica de arriba), el «Titular», los «Sellos» (frases cortas en un recuadro, como “Tres tips”) y la «Letra pequeña». El «Concepto visual» dice cómo debe verse la imagen.',
    easy: 'Es lo que va escrito dentro de la imagen de un post, como el título grande y la línea chica de arriba.',
    example: 'Por ejemplo: en un post, el «Antetítulo» puede decir “Obras”, el «Titular» “Llegó el agua” y un sello “Tres tips”.',
  },
  {
    id: 'feed',
    term: 'Feed',
    aka: ['feed', 'fid', 'cuadrícula', 'cuadrícula del perfil', 'feed de instagram'],
    text: 'La cuadrícula del perfil: cómo se ven juntas las publicaciones. En la app, cada mes tiene 24 espacios.',
    easy: 'Es la vista del perfil con todas las publicaciones juntas, en cuadritos. En la app ordenas las del mes en 24 espacios.',
    example: 'Por ejemplo: cuando abres el Instagram del jefe, la cuadrícula de fotos y videos es el feed.',
  },
  {
    // The app's text drops the demo's pillars (each instance has its own, in Ajustes → «Cupo y pilares»).
    id: 'mes-cupo-y-pilar',
    term: 'Mes, cupo y pilar',
    aka: ['mes de contenido', 'meses de contenido', 'cupo', 'cupos', 'pilar', 'pilares', 'pilar de contenido', 'pilares de contenido'],
    text: 'El mes de contenido junta las piezas de un mes. El cupo dice cuántas piezas de cada formato lleva. El pilar es el tema fijo de cada pieza.',
    easy: 'El mes junta las piezas de un mes, el cupo dice cuántas de cada formato tocan y el pilar es el tema fijo de cada una.',
    example: 'Por ejemplo: si el cupo del mes dice 8 posts, ese mes se planean 8 posts, y cada uno lleva su pilar.',
  },
  {
    id: 'storyboard',
    term: 'Storyboard',
    aka: ['storyboard', 'storyboards', 'story board', 'storiboard', 'guion', 'guiones', 'guion de grabación'],
    text: 'El guion de grabación: qué se graba y qué se dice, toma por toma.',
    easy: 'Es el plan de lo que se va a grabar, toma por toma, para que Grabación sepa qué hacer y qué se dice.',
    example: 'Por ejemplo: toma 1, la gente llegando; toma 2, el jefe hablando, con lo que dice; toma 3, un detalle de la obra.',
  },
  {
    id: 'ficha-tecnica',
    term: 'Ficha técnica',
    aka: ['ficha técnica', 'fichas técnicas'],
    text: 'Lo que se sabe de un evento antes de ir: de qué es, quién lo dirige, qué se logra y los datos con su fuente.',
    easy: 'Es lo que hay que saber de un evento antes de ir: de qué es, quién lo dirige y los datos, cada uno con su fuente.',
    example: 'Por ejemplo: un dato como “200 familias beneficiadas” va en la ficha técnica con su fuente, como el informe de la obra.',
  },
  {
    id: 'dialogo-fab',
    term: 'Diálogo FAB',
    aka: ['diálogo fab', 'fab'],
    text: 'Lo que dice el jefe en una visita de obra, en tres partes: qué es la obra, qué mejora y qué gana la gente.',
    easy: 'Es lo que el jefe dice en una obra, en tres partes cortas: qué es, qué mejora y qué gana la gente con ella.',
    example: 'Por ejemplo: “Esta es la tubería nueva; ya no se va el agua; las familias tienen agua todos los días.”',
  },
  {
    id: 'nota-para-el-editor',
    term: 'Nota para el editor',
    aka: ['nota para el editor', 'notas para el editor', 'nota de grabación', 'nota para quien edita'],
    text: 'La nota que deja Grabación para quien edita el video en Redes: qué toma sirve, qué falló y qué falta.',
    easy: 'Es un mensaje corto de quien grabó a quien edita, para que sepa qué toma usar y qué salió mal.',
    example: 'Por ejemplo: “La mejor toma es la del final; la del inicio tiene viento; faltó la gente aplaudiendo.”',
  },
  {
    id: 'semaforo',
    term: 'El semáforo',
    aka: ['semáforo', 'semáforo de aprobación', 'nivel', 'nivel de aprobación', 'verde amarillo y rojo', 'verde amarillo o rojo', 'colores de las piezas'],
    text: 'El color que Redes le pone a cada pieza al mandarla a aprobar. Verde es rutina: el jefe las aprueba todas juntas, en el día. Amarillo es normal: el jefe la revisa en 60 minutos. Rojo es sensible, como política, una crisis o una aclaratoria: el jefe la revisa en 30 minutos.',
    easy: 'Es el color de cada pieza, que le dice al jefe qué tan rápido revisarla: verde es rutina, amarillo es normal y rojo es lo delicado, que va primero.',
    example: 'Por ejemplo: un post de saludo va en verde, uno de una obra en amarillo y una aclaratoria en rojo.',
    why: 'Porque el color dice cuánto apura: el verde se aprueba con las demás verdes en el día, el amarillo en 60 minutos y el rojo, lo sensible, en 30.',
  },
  {
    id: 'motivos-rapidos',
    term: 'Motivos rápidos',
    aka: ['motivos rápidos', 'motivo rápido'],
    text: 'Los motivos ya escritos que el jefe toca para pedir cambios, como «Muy largo» o «Revisar ortografía».',
    easy: 'Son motivos ya escritos que el jefe toca para pedir un cambio sin tener que escribirlo.',
    example: 'Por ejemplo: el jefe toca «Muy largo» en un copy, y a Redes le llega ese motivo con la pieza.',
  },
  {
    id: 'avisos-de-cumplimiento',
    term: 'Avisos de cumplimiento',
    aka: ['avisos de cumplimiento', 'aviso de cumplimiento'],
    text: 'Avisos de cuidado antes de publicar: «Necesita autorización escrita», «Verificar la fuente y la fecha del dato», «Remitir a un profesional», «Tono de testimonio» u «Otro aviso».',
    easy: 'Es una alerta de cuidado en una pieza antes de publicarla, como cuando lleva un testimonio o un dato que hay que verificar.',
    example: 'Por ejemplo: un reel trae el testimonio de una vecina; Redes le pone el aviso «Tono de testimonio», con el cuidado que hay que tener, y el jefe lo lee antes de aprobar.',
  },
  {
    id: 'receptividad',
    term: 'Receptividad',
    aka: ['receptividad', 'receptividad media', 'receptividad del público', 'estrellas', 'estrellitas'],
    text: 'Una nota de 1 a 10 sobre cómo recibió la gente una pieza en redes (comentarios, reacciones). No mide apoyo político. La «Receptividad media» es el promedio de las piezas que ya tienen nota.',
    easy: 'Es una nota de 1 a 10 de cómo le cayó una pieza a la gente en redes. No mide si apoyan al jefe.',
    example: 'Por ejemplo: un reel con muchos comentarios buenos puede llevar 9; uno que casi nadie comentó, 3.',
  },
  {
    id: 'programar',
    term: 'Programar',
    // Not «programado»: política's reports have a state «Programado» (por hacerse), and the web's lists too.
    aka: ['programar', 'programada', 'programar una publicación', 'programar una pieza'],
    text: 'Apartarle el día y la hora a una publicación en el calendario. La app no publica sola: a esa hora la publicas tú y marcas «Ya lo publiqué».',
    easy: 'Es apartar el día y la hora en que sale una publicación. La app no la sube sola: a esa hora alguien la publica a mano.',
    example: {
      social: 'Por ejemplo: programas un reel en Instagram; cuando llega la hora, lo subes tú y marcas «Ya lo publiqué».',
      boss: 'Por ejemplo: programas un reel en Instagram; cuando llega la hora, lo subes tú y marcas «Ya lo publiqué».',
      admin: 'Por ejemplo: programas un reel en Instagram; cuando llega la hora, lo subes tú y marcas «Ya lo publiqué».',
      default: 'Por ejemplo: Redes programa un reel en Instagram; cuando llega la hora, lo sube a mano y marca «Ya lo publiqué».',
    },
  },
  {
    id: 'tanda',
    term: 'Tanda',
    // («tuits» reads as «tweet»: the question says «tanda de tweet».)
    aka: ['tanda', 'tandas', 'tanda de tweets', 'tanda de tweet', 'tandas de tweets'],
    text: 'Los tweets de una semana, que se suben juntos.',
    easy: 'Son los tweets de una semana, que se suben todos juntos desde un documento.',
    example: 'Por ejemplo: Redes sube el documento con los 15 tweets de la semana: esa es la tanda.',
  },
  {
    id: 'trancado',
    term: 'Trancado',
    aka: ['trancado', 'trancada', 'trancados', 'trancadas'],
    text: 'Lo que se paró y necesita una mano, como una publicación que falló o una pieza que venció sin aprobar.',
    easy: 'Es algo que se paró y necesita que alguien lo mueva, como una publicación que falló.',
    example: 'Por ejemplo: una pieza venció sin aprobar y sale en «Trancado» hasta que alguien la atiende.',
  },
  {
    id: 'etiquetas',
    term: 'Etiquetas',
    aka: ['etiquetas', 'etiqueta', 'chips', 'chip', 'recuadritos', 'recuadritos de colores', 'recuadritos de color', 'cuadritos de colores'],
    text: 'Los recuadritos de color que dicen cómo va algo, como «Por decidir» o «Aceptado».',
    easy: 'Son los recuadritos de color que dicen cómo va algo, como si ya se aceptó o si todavía espera.',
    example: 'Por ejemplo: un evento que espera al jefe tiene la etiqueta «Por decidir», y cuando lo acepta, «Aceptado».',
  },
  {
    id: 'campos',
    term: 'Campos',
    aka: ['campos', 'campo', 'campos de la tarjeta', 'campos del formulario'],
    text: 'Los espacios de una tarjeta o de un formulario donde se escribe.',
    easy: 'Son los espacios donde escribes en una tarjeta o en un formulario.',
    example: 'Por ejemplo: en un reel, el título es un campo y la portada es otro.',
  },
  {
    // «9:16» reads as a clock time: check.ts lets the four screen ratios through (and «a las 9:16» still fails). «1080×1920»
    // is read «1080 1920»; written with an «x», «1080x1920».
    id: 'numeros-y-medidas',
    term: 'Números y medidas',
    aka: ['85/280', '9:16', '16:9', '4:5', '1:1', '1080x1920', '1080×1920', 'kb', 'mb', 'peso', 'medidas', 'peso del archivo', 'medidas del video', 'proporción'],
    text: '“85/280” dice cuántas letras lleva un texto y cuántas caben. 9:16 es vertical, como la pantalla del teléfono; 16:9 es horizontal y 4:5, casi cuadrado. Junto a un archivo salen su peso (KB o MB), su duración y su tamaño (por ejemplo, 1080×1920).',
    easy: 'Son los números que salen junto a un texto o un archivo: cuántas letras lleva, si es vertical u horizontal y cuánto pesa.',
    example: 'Por ejemplo: “85/280” junto a un tweet quiere decir que lleva 85 letras de las 280 que caben.',
  },
  {
    id: 'csv',
    term: 'CSV',
    aka: ['csv', 'archivo csv'],
    text: 'Un archivo de hoja de cálculo, como los de Excel, guardado en ese formato. Sirve para cargar muchos resultados de una vez.',
    easy: 'Es un archivo de tabla, como los de Excel, que sirve para cargar muchos resultados de una sola vez.',
    example: 'Por ejemplo: guardas los resultados en Excel como CSV y los subes en Resultados con «Elegir archivo CSV».',
  },
  {
    id: 'oficina',
    term: 'La oficina',
    aka: ['oficina', 'sala', 'salas'],
    text: 'Lo que abre «Oficina» en el menú: el trabajo dibujado como una oficina de diez salas, de «Recepción» a «Analizador». Cada actividad del jefe está en la sala donde va su trabajo. Tocas una sala para ver cuáles hay. El jefe también la ve arriba de Digital.',
    easy: {
      politics: 'Es un dibujo del trabajo como una oficina de diez salas. No está en tu menú: la abren el jefe, el despacho, Redes, Grabación y administración.',
      ivt: 'Es un dibujo del trabajo como una oficina de diez salas. No está en tu menú: la abren el jefe, el despacho, Redes, Grabación y administración.',
      default: 'Es un dibujo del trabajo como una oficina de diez salas: cada actividad del jefe está en la sala donde va su trabajo.',
    },
    example: {
      politics: 'Por ejemplo: el jefe la ve arriba de Digital, con «Ver todas las salas».',
      ivt: 'Por ejemplo: el jefe la ve arriba de Digital, con «Ver todas las salas».',
      default: 'Por ejemplo: tocas una sala y ves las actividades que están ahí; el jefe también la ve arriba de Digital.',
    },
  },
  {
    // The web's own guide is not inside the team's: «La web» and «Atención ciudadana» of «Ayuda y guías» are the boss's and
    // Administración's.
    id: 'web-y-atencion',
    term: 'Web y Atención',
    aka: ['web', 'atención', 'web y atención'],
    text: 'En el menú del jefe: la web pública y la atención a la gente que escribe por ella. Tienen su propia guía, aparte de esta.',
    easy: {
      boss: 'Son la página web pública y la atención a la gente que escribe por ella. Están en tu menú y tienen su propia guía.',
      admin: 'Son la página web pública y la atención a la gente que escribe por ella. Están en tu menú y tienen su propia guía.',
      default: 'Son la página web pública y la atención a la gente que escribe por ella. No están en tu menú: las manejan el jefe, administración y las personas de la web y de la atención.',
    },
    example: 'Por ejemplo: en la web la gente puede mandar una solicitud, y en Atención las personas que atienden la responden.',
  },
  {
    // A team guide may name Administración here (D-43, 12/11): shared.ts ADMIN_MENTIONS.
    id: 'administracion',
    term: 'Administración',
    aka: ['administración', 'los de administración', 'gente de administración'],
    text: 'Las personas que manejan la parte técnica de la app: invitan a cada quien, ayudan con el doble factor y recuperan lo eliminado. No es ninguno de los seis roles.',
    easy: 'Son las personas que ven la parte técnica de la app: invitan a la gente, ayudan con el doble factor y recuperan lo eliminado.',
    example: 'Por ejemplo: si cambias de teléfono y ya no te llega el código de tu aplicación, administración te ayuda a activarlo de nuevo.',
  },
];

/** Administración's word: the one a team text may name it with (shared.ts ADMIN_MENTIONS). */
export const GLOSSARY_ADMIN: GlossaryTerm = GLOSSARY.find((g) => g.id === 'administracion')!;

/** What 360 says of a word, and what the guides' checks read: «Término: lo que significa». */
export const glossaryLine = (g: GlossaryTerm) => `${g.term}: ${g.text}`;
