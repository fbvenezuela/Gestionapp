// «Palabras de la app» (team guide, 11/11; Juan: «asegúrate que el bot sepa todo»): the words a new person does not
// know, as the team uses them. One source for /ayuda («Para todos» → «Palabras de la app»), docs/GUIA-POR-ROL.md and
// 360 (answers/engine.ts glossaryEntries: «¿qué es…?», «¿qué significa…?»). Plain Venezuelan Spanish, «tú»; «» only for
// what the screen says; no demo data (the pillars are the client's own, so none is named here).
import type { GlossaryTerm } from './types';

export const GLOSSARY: GlossaryTerm[] = [
  {
    id: 'pieza',
    term: 'Pieza',
    aka: ['pieza', 'piezas'],
    text: 'Cada publicación que prepara Redes: un reel, un post, un carrusel, una historia, un video de YouTube o la pieza de fin de mes.',
  },
  {
    id: 'reel-y-short',
    term: 'Reel y Short',
    aka: ['reel', 'reels', 'short', 'shorts'],
    text: 'Un video corto y vertical. En Instagram se llama reel; en YouTube, Short.',
  },
  {
    id: 'carrusel-y-lamina',
    term: 'Carrusel y lámina',
    aka: ['carrusel', 'carruseles', 'lámina', 'láminas'],
    text: 'Un carrusel es un post de varias imágenes. Cada imagen es una lámina.',
  },
  {
    // Never «historia» alone (nor «historias», read as the same word): a ficha has its «Historia» too.
    id: 'historia-y-sticker',
    term: 'Historia y sticker',
    aka: ['historia de instagram', 'historias de instagram', 'sticker', 'stickers'],
    text: 'La historia se ve un día en el perfil. El sticker es lo que se le pega encima: una encuesta, una pregunta o un enlace.',
  },
  {
    id: 'copy',
    term: 'Copy',
    aka: ['copy', 'copies'],
    text: 'El texto que acompaña una publicación. Cada pieza lleva tres, menos las historias: largo (Instagram, Facebook y TikTok), medio (Threads) y corto (X).',
  },
  {
    id: 'caption',
    term: 'Caption',
    aka: ['caption', 'captions'],
    text: 'El texto que va debajo de la foto o del video. Es el copy largo.',
  },
  {
    id: 'hook-y-cta',
    term: 'Hook y CTA',
    aka: ['hook', 'hooks', 'cta', 'ctas'],
    text: 'El hook es la primera frase, la que engancha. El CTA es la invitación del final: comenta, comparte, escríbenos.',
  },
  {
    id: 'texto-del-arte',
    term: 'Texto del arte',
    aka: ['texto del arte', 'antetítulo', 'titular', 'sellos', 'letra pequeña', 'concepto visual'],
    text: 'Lo que va escrito dentro de la imagen de un post: el «Antetítulo» (la línea chica de arriba), el «Titular», los «Sellos» (frases cortas en un recuadro, como “Tres tips”) y la «Letra pequeña». El «Concepto visual» dice cómo debe verse la imagen.',
  },
  {
    id: 'feed',
    term: 'Feed',
    aka: ['feed'],
    text: 'La cuadrícula del perfil: cómo se ven juntas las publicaciones. En la app, cada mes tiene 24 espacios.',
  },
  {
    // The app's text drops the demo's pillars (each instance has its own, in Ajustes → «Cupo y pilares»).
    id: 'mes-cupo-y-pilar',
    term: 'Mes, cupo y pilar',
    aka: ['mes de contenido', 'cupo', 'pilar', 'pilares'],
    text: 'El mes de contenido junta las piezas de un mes. El cupo dice cuántas piezas de cada formato lleva. El pilar es el tema fijo de cada pieza.',
  },
  {
    id: 'storyboard',
    term: 'Storyboard',
    aka: ['storyboard', 'guion'],
    text: 'El guion de grabación: qué se graba y qué se dice, toma por toma.',
  },
  {
    id: 'ficha-tecnica',
    term: 'Ficha técnica',
    aka: ['ficha técnica', 'fichas técnicas'],
    text: 'Lo que se sabe de un evento antes de ir: de qué es, quién lo dirige, qué se logra y los datos con su fuente.',
  },
  {
    id: 'dialogo-fab',
    term: 'Diálogo FAB',
    aka: ['diálogo fab', 'fab'],
    text: 'Lo que dice el jefe en una visita de obra, en tres partes: qué es la obra, qué mejora y qué gana la gente.',
  },
  {
    id: 'nota-para-el-editor',
    term: 'Nota para el editor',
    aka: ['nota para el editor', 'notas para el editor'],
    text: 'La nota que deja Grabación para quien edita el video en Redes: qué toma sirve, qué falló y qué falta.',
  },
  {
    id: 'semaforo',
    term: 'El semáforo',
    aka: ['semáforo', 'nivel'],
    text: 'El color que Redes le pone a cada pieza al mandarla a aprobar. Verde es rutina: el jefe las aprueba todas juntas, en el día. Amarillo es normal: el jefe la revisa en 60 minutos. Rojo es sensible, como política, una crisis o una aclaratoria: el jefe la revisa en 30 minutos.',
  },
  {
    id: 'motivos-rapidos',
    term: 'Motivos rápidos',
    aka: ['motivos rápidos'],
    text: 'Los motivos ya escritos que el jefe toca para pedir cambios, como «Muy largo» o «Revisar ortografía».',
  },
  {
    id: 'avisos-de-cumplimiento',
    term: 'Avisos de cumplimiento',
    aka: ['avisos de cumplimiento'],
    text: 'Avisos de cuidado antes de publicar: «Necesita autorización escrita», «Verificar la fuente y la fecha del dato», «Remitir a un profesional», «Tono de testimonio» u «Otro aviso».',
  },
  {
    id: 'receptividad',
    term: 'Receptividad',
    aka: ['receptividad', 'receptividad media'],
    text: 'Una nota de 1 a 10 sobre cómo recibió la gente una pieza en redes (comentarios, reacciones). No mide apoyo político. La «Receptividad media» es el promedio de las piezas que ya tienen nota.',
  },
  {
    id: 'programar',
    term: 'Programar',
    // Not «programado»: política's reports have a state «Programado» (por hacerse).
    aka: ['programar', 'programada'],
    text: 'Apartarle el día y la hora a una publicación en el calendario. La app no publica sola: a esa hora la publicas tú y marcas «Ya lo publiqué».',
  },
  {
    id: 'tanda',
    term: 'Tanda',
    aka: ['tanda', 'tandas'],
    text: 'Los tweets de una semana, que se suben juntos.',
  },
  {
    id: 'trancado',
    term: 'Trancado',
    aka: ['trancado'],
    text: 'Lo que se paró y necesita una mano, como una publicación que falló o una pieza que venció sin aprobar.',
  },
  {
    id: 'etiquetas',
    term: 'Etiquetas',
    aka: ['etiquetas', 'etiqueta', 'chips', 'chip'],
    text: 'Los recuadritos de color que dicen cómo va algo, como «Por decidir» o «Aceptado».',
  },
  {
    id: 'campos',
    term: 'Campos',
    aka: ['campos', 'campo'],
    text: 'Los espacios de una tarjeta o de un formulario donde se escribe.',
  },
  {
    // «9:16» reads as a clock time: check.ts lets the four screen ratios through (and «a las 9:16» still fails).
    id: 'numeros-y-medidas',
    term: 'Números y medidas',
    aka: ['85/280', '9:16', '16:9', '4:5', 'kb', 'mb', 'peso', 'medidas'],
    text: '“85/280” dice cuántas letras lleva un texto y cuántas caben. 9:16 es vertical, como la pantalla del teléfono; 16:9 es horizontal y 4:5, casi cuadrado. Junto a un archivo salen su peso (KB o MB), su duración y su tamaño (por ejemplo, 1080×1920).',
  },
  {
    id: 'csv',
    term: 'CSV',
    aka: ['csv'],
    text: 'Un archivo de hoja de cálculo, como los de Excel, guardado en ese formato. Sirve para cargar muchos resultados de una vez.',
  },
  {
    id: 'oficina',
    term: 'La oficina',
    aka: ['oficina', 'sala', 'salas'],
    text: 'Lo que abre «Oficina» en el menú: el trabajo dibujado como una oficina de diez salas, de «Recepción» a «Analizador». Cada actividad del jefe está en la sala donde va su trabajo. Tocas una sala para ver cuáles hay. El jefe también la ve arriba de Digital.',
  },
  {
    // The web's own guide is not inside the app.
    id: 'web-y-atencion',
    term: 'Web y Atención',
    aka: ['web', 'atención'],
    text: 'En el menú del jefe: la web pública y la atención a la gente que escribe por ella. Tienen su propia guía, aparte de esta.',
  },
  {
    // A team guide may name Administración here (D-43, 12/11): shared.ts ADMIN_MENTIONS.
    id: 'administracion',
    term: 'Administración',
    aka: ['administración'],
    text: 'Las personas que manejan la parte técnica de la app: invitan a cada quien, ayudan con el doble factor y recuperan lo eliminado. No es ninguno de los seis roles.',
  },
];

/** Administración's word: the one a team text may name it with (shared.ts ADMIN_MENTIONS). */
export const GLOSSARY_ADMIN: GlossaryTerm = GLOSSARY.find((g) => g.id === 'administracion')!;

/** What 360 says of a word, and what the guides' checks read: «Término: lo que significa». */
export const glossaryLine = (g: GlossaryTerm) => `${g.term}: ${g.text}`;
