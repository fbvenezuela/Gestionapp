import { FORMAT, type Format } from '../../domain/redes';
import type { DemoUserKey } from '../seed-demo';
import { asPerson, type SeedCtx } from './context';
import { demoThumbBytes } from './thumbs';

// Redes by format in the demo (R4, D-76, design §7.1): Mes 1, Mes 2 and Mes 3; the six pieces of always as reels of
// Mes 1; Mes 1 filled with INVENTED pieces for each format (8 posts, 12 reels, 4 carousels, 12 stories, 2 YouTube
// videos, 1 month-end piece), 21 of the 24 feed places taken (the top row free), a post and a carousel in review
// (amarillo: the boss tries «Revisar» outside Reels), design marks, ratings and notices. No new event and no new green
// piece in review («Aprobar todas las verdes (2)» stays). The same rows in the same order on every server (stable ids,
// src/lib/db/stable-ids.ts): no random values, every list in a fixed order.
// No day, date, time or phone in any text (tests/unit/redes-seed-texts.test.ts); a piece's creation day is one of the
// days without an event in the demo (-4 to -27, never -2, -1, 0, +1, +3 or +6: the six events of core.ts). Approvals
// are the boss's through review_piece(); design marks and notices go as the person who makes them; the rest as the
// system. The small pictures are INVENTED and abstract (src/lib/db/demo-assets/redes-*.jpg, made once by
// scripts/make-demo-thumbs.mts), kept in media_thumbs like seed-parts/thumbs.ts does.

// The demo's pillars (D-68): invented examples; the real configuration starts empty (config/clients/fb.json).
export const DEMO_PILLARS = [
  { key: 'obras', name: 'Obras que se ven', tone: 'accent' },
  { key: 'servicios', name: 'Servicios públicos', tone: 'info' },
  { key: 'gente', name: 'La gente del Táchira', tone: 'ok' },
  { key: 'cultura', name: 'Cultura y tradición', tone: 'neutral' },
  { key: 'cuentas', name: 'Rendición de cuentas', tone: 'neutral' },
] as const;
type Pillar = (typeof DEMO_PILLARS)[number]['key'];

export const DEMO_MONTHS = ['Mes 1', 'Mes 2', 'Mes 3'] as const;

// Days without an event in the demo, for every creation day seeded here.
export const REDES_SEED_DAYS = { min: -27, max: -4 } as const;

type Pic = 'post-1' | 'post-2' | 'post-3' | 'post-4' | 'reel-1' | 'reel-2' | 'reel-3' | 'yt-1' | 'slide-1' | 'slide-2' | 'slide-3' | 'slide-4';
// A file of the demo: no bytes behind it (like core.ts), only its small picture. Images have no duration, fps or codecs.
type File = { kind: 'final' | 'cover'; label: string; pic: Pic; video?: { seconds: number }; w: number; h: number };
type Copies = { formula: 'FAB' | 'PAS' | 'AIDA'; long: string; medium: string; short: string };
type Details = Partial<{
  art_overline: string; art_headline: string; art_seals: string; art_fine_print: string; visual_concept: string; hook: string;
  cta: string; hashtags: string; publication_notes: string; sticker: string; sticker_text: string; sticker_url: string;
  on_screen: string; follow_up: string; idea: string; links: string; post_ratio: '4:5' | '1:1';
  shots: { says: string; action: string; on_screen: string }[]; slides: { role: string; title: string; text: string }[];
}>;
type State = 'draft' | 'in_review' | 'changes' | 'approved';
type Spec = {
  format: Format; title: string; cat: string; pillar: Pillar; day: number; by: DemoUserKey; state: State;
  month?: 'm1' | 'm2'; media?: File; cover?: File; slides?: (File | null)[]; copies?: Copies; details?: Details;
  changes?: string; // the boss's comment when he asks for changes
  notice?: { kind: string; body: string; by: DemoUserKey; resolvedBy?: DemoUserKey };
  pubs?: { network: 'instagram' | 'facebook'; format: string; status: 'published' | 'scheduled'; day: number; hour: number; slug: string }[];
  design?: { status: 'approved' | 'disapproved'; note?: string; by: DemoUserKey };
  rating?: number;
  feed?: number; // its place in the Mes 1 feed (#1 bottom right, the first to go out)
};

const reelVideo = (pic: Pic, seconds: number, label = 'Video final v1'): File => ({ kind: 'final', label, pic, video: { seconds }, w: 1080, h: 1920 });
const reelCover = (pic: Pic): File => ({ kind: 'cover', label: 'Portada v1', pic, w: 1080, h: 1920 });
const postImage = (pic: Pic): File => ({ kind: 'final', label: 'Imagen del post v1', pic, w: 1080, h: 1350 });
const storyPhoto = (pic: Pic): File => ({ kind: 'final', label: 'Foto de la historia', pic, w: 1080, h: 1920 });
const storyClip = (pic: Pic): File => ({ kind: 'final', label: 'Clip de la historia', pic, video: { seconds: 15 }, w: 1080, h: 1920 });
const slide = (pic: Pic, n: number): File => ({ kind: 'final', label: `Lámina ${n}`, pic, w: 1080, h: 1350 });

const HELLO = '¡Saludos, Táchira! 👋';
const LOVE = '💛 Por amor al Táchira.';

// ---------------------------------------------------------------------------------------------------------------
// The pieces of Mes 1 (and two drafts of Mes 2). Invented: no real people, places, phones, days or hours.
// ---------------------------------------------------------------------------------------------------------------
const SPECS: Spec[] = [
  // Reels: 6 new (12 with the six of always): 3 approved (one scheduled on Facebook), 2 drafts with video, 1 without file.
  {
    format: 'reel', title: 'Así quedó el parque del sector', cat: 'Recreación y espacios públicos', pillar: 'obras', day: -20, by: 'social', state: 'approved',
    media: reelVideo('reel-1', 45), cover: reelCover('reel-1'),
    copies: {
      formula: 'FAB',
      long: `${HELLO} Así quedó el parque del sector: caminerías nuevas, bancos y luces para disfrutar sin apuro. Los niños ya tienen dónde jugar y la comunidad, dónde reunirse. ${LOVE}`,
      medium: 'Así quedó el parque del sector 🌳 Caminerías nuevas, bancos y luces. Un espacio para jugar y para reunirse. Seguimos trabajando 👇',
      short: '🌳 Así quedó el parque del sector: caminerías, bancos y luces nuevas. Seguimos trabajando 👇 #Tachira',
    },
    details: {
      shots: [
        { says: 'Así quedó el parque del sector.', action: 'Toma abierta desde la entrada', on_screen: 'Así quedó' },
        { says: 'Caminerías nuevas, bancos y luces.', action: 'Paneo lento por las caminerías', on_screen: 'Caminerías nuevas' },
        { says: 'Seguimos trabajando.', action: 'Niños jugando en el parque (sin caras)', on_screen: 'Por amor al Táchira' },
      ],
    },
    pubs: [{ network: 'facebook', format: 'reel', status: 'scheduled', day: 5, hour: 19, slug: 'facebook/reel-parque' }],
    design: { status: 'approved', by: 'boss' }, rating: 6, feed: 5,
  },
  {
    format: 'reel', title: 'Un día en el ambulatorio', cat: 'Salud', pillar: 'servicios', day: -18, by: 'social2', state: 'approved',
    media: reelVideo('reel-2', 52), cover: reelCover('reel-2'),
    copies: {
      formula: 'FAB',
      long: `${HELLO} Acompañamos una jornada completa en el ambulatorio de la comunidad: consultas, vacunas y un equipo que atiende con cariño. Cuando el servicio funciona, la familia está tranquila. ${LOVE}`,
      medium: 'Una jornada en el ambulatorio 🩺 Consultas, vacunas y un equipo que atiende con cariño. Seguimos trabajando 👇',
      short: '🩺 Una jornada en el ambulatorio de la comunidad. Seguimos trabajando 👇 #Tachira',
    },
    details: {
      shots: [
        { says: 'Así se trabaja en el ambulatorio.', action: 'Fachada y sala de espera', on_screen: 'Un día en el ambulatorio' },
        { says: 'Consultas y vacunas para la familia.', action: 'Enfermera preparando la vacuna (sin caras)', on_screen: 'Consultas y vacunas' },
      ],
    },
    rating: 5, feed: 7,
  },
  {
    format: 'reel', title: 'Preguntas de la gente: el agua', cat: 'Agua potable', pillar: 'servicios', day: -16, by: 'social', state: 'approved',
    media: reelVideo('reel-3', 58), cover: reelCover('reel-3'),
    copies: {
      formula: 'PAS',
      long: `${HELLO} Nos preguntan mucho por el agua. Sabemos lo que cuesta cuando no llega: por eso explicamos qué se está reparando y qué falta. Pregunta en los comentarios y respondemos. ${LOVE}`,
      medium: 'Preguntas de la gente: el agua 💧 Qué se está reparando y qué falta. Pregunta en los comentarios 👇',
      short: '💧 Preguntas de la gente: el agua. Respondemos en los comentarios 👇 #Tachira',
    },
    details: {
      shots: [
        { says: '¿Cuándo vuelve el agua? Esa es la pregunta.', action: 'Pregunta escrita en pantalla', on_screen: 'Preguntas de la gente' },
        { says: 'Esto es lo que se está reparando.', action: 'Obreros en la tubería', on_screen: 'Lo que se repara' },
        { says: 'Pregunta en los comentarios.', action: 'Cierre con el logo', on_screen: 'Pregunta aquí' },
      ],
    },
    feed: 11,
  },
  {
    format: 'reel', title: 'Tradiciones que nos unen (demo)', cat: 'Música y tradiciones', pillar: 'cultura', day: -10, by: 'social2', state: 'draft',
    media: reelVideo('reel-1', 40), cover: reelCover('reel-2'),
    details: {
      shots: [
        { says: 'La música que nos une.', action: 'Instrumentos de cuerda en primer plano', on_screen: 'Tradiciones que nos unen' },
        { says: 'Una tradición que pasa de padres a hijos.', action: 'Manos tocando el cuatro', on_screen: '' },
      ],
    },
    design: { status: 'disapproved', note: 'La foto está oscura: probar otra.', by: 'boss' }, feed: 18,
  },
  {
    format: 'reel', title: 'Detrás del trabajo de los obreros', cat: 'Obras', pillar: 'gente', day: -9, by: 'social', state: 'draft',
    media: reelVideo('reel-3', 33),
    details: { shots: [{ says: 'Ellos hacen posible cada obra.', action: 'Obreros llegando al frente de trabajo', on_screen: 'Detrás del trabajo' }] },
    feed: 20,
  },
  {
    format: 'reel', title: 'La plaza recuperada (demo)', cat: 'Recreación y espacios públicos', pillar: 'obras', day: -6, by: 'social2', state: 'draft',
    details: { shots: [{ says: 'Así estaba la plaza.', action: 'Antes y después lado a lado', on_screen: 'Antes y después' }] },
    feed: 21,
  },

  // Posts: 2 published (Instagram), 2 approved, 1 in review (amarillo, with an open notice), 1 with changes asked,
  // 1 draft with its image, 1 draft without one.
  {
    format: 'post', title: 'Cifras de la semana (demo)', cat: 'Rendición de cuentas', pillar: 'cuentas', day: -24, by: 'social', state: 'approved',
    media: postImage('post-1'),
    copies: {
      formula: 'AIDA',
      long: `${HELLO} ¿Sabes cuánto avanzó la gestión? En la imagen están las cifras de ejemplo de las obras, los operativos y las jornadas. Cada número es una familia atendida. Cuéntanos qué obra quieres ver. ${LOVE}`,
      medium: 'Las cifras de la gestión, en una imagen 📊 Obras, operativos y jornadas. Cuéntanos qué obra quieres ver 👇',
      short: '📊 Las cifras de la gestión, en una imagen. Seguimos trabajando 👇 #Tachira',
    },
    details: {
      art_overline: 'Rendición de cuentas', art_headline: 'Lo que avanzó la gestión', art_seals: 'Cifras de ejemplo',
      art_fine_print: 'Datos de la ficha demo, solo para la demostración.', visual_concept: 'Fondo oliva con tres números grandes y un ícono por obra.',
      cta: 'Cuéntanos qué obra quieres ver', hashtags: '#Tachira #FreddyBernal', publication_notes: 'Publicar la imagen en 4:5, sin recortes.',
      links: 'https://example.org/demo/cifras',
    },
    pubs: [{ network: 'instagram', format: 'photo', status: 'published', day: -21, hour: 12, slug: 'instagram/post-cifras' }],
    design: { status: 'approved', by: 'social' }, rating: 8, feed: 2,
  },
  {
    format: 'post', title: 'Tips para comprar en el mercado', cat: 'Comercio y emprendimiento', pillar: 'gente', day: -22, by: 'social2', state: 'approved',
    media: postImage('post-2'),
    copies: {
      formula: 'FAB',
      long: `${HELLO} Tips para comprar en el mercado: lleva tu bolsa, compara precios entre puestos y apoya a los productores de la zona. Así rinde más el dinero y gana la economía local. ${LOVE}`,
      medium: 'Tips para comprar en el mercado 🛒 Lleva tu bolsa, compara precios y apoya a los productores de la zona 👇',
      short: '🛒 Tips para comprar en el mercado: compara y apoya lo nuestro 👇 #Tachira',
    },
    details: {
      art_overline: 'Tips', art_headline: 'Compra mejor en el mercado', art_seals: 'Apoya lo nuestro',
      visual_concept: 'Cesta de frutas y verduras dibujada, colores cálidos.', cta: 'Comparte con quien hace las compras',
      hashtags: '#Tachira #HechoEnElTachira', post_ratio: '1:1',
    },
    pubs: [{ network: 'instagram', format: 'photo', status: 'published', day: -19, hour: 19, slug: 'instagram/post-mercado' }],
    design: { status: 'approved', by: 'boss' }, rating: 7, feed: 4,
  },
  {
    format: 'post', title: 'Tips para ahorrar agua', cat: 'Agua potable', pillar: 'servicios', day: -19, by: 'social', state: 'approved',
    media: postImage('post-3'),
    copies: {
      formula: 'FAB',
      long: `${HELLO} Tips para ahorrar agua en casa: cierra la llave mientras te cepillas, revisa las fugas y reutiliza el agua de lavar. Entre todos cuidamos el servicio. ${LOVE}`,
      medium: 'Tips para ahorrar agua en casa 💧 Cierra la llave, revisa las fugas y reutiliza. Entre todos cuidamos el servicio 👇',
      short: '💧 Tips para ahorrar agua en casa. Entre todos cuidamos el servicio 👇 #Tachira',
    },
    details: {
      art_overline: 'Tips', art_headline: 'Ahorra agua en casa', art_seals: 'Tres tips',
      visual_concept: 'Gota grande con tres íconos: llave, fuga y balde.', hashtags: '#Tachira #CuidaElAgua',
    },
    notice: { kind: 'verify_source', body: 'Confirmar el dato del consumo de agua con la ficha antes de publicar.', by: 'social2', resolvedBy: 'boss' },
    feed: 9,
  },
  {
    format: 'post', title: 'Así trabajan los bomberos del estado', cat: 'Protección civil y bomberos', pillar: 'gente', day: -17, by: 'social2', state: 'approved',
    media: postImage('post-4'),
    copies: {
      formula: 'AIDA',
      long: `${HELLO} Detrás de cada emergencia hay un equipo listo para ayudar. Así trabajan los bomberos del estado: preparación, equipos nuevos y mucha vocación. Gracias por cuidarnos. ${LOVE}`,
      medium: 'Así trabajan los bomberos del estado 🚒 Preparación, equipos nuevos y mucha vocación. Gracias por cuidarnos 👇',
      short: '🚒 Así trabajan los bomberos del estado. Gracias por cuidarnos 👇 #Tachira',
    },
    details: { art_overline: 'Nuestra gente', art_headline: 'Listos para ayudar', visual_concept: 'Casco y manguera en primer plano, sin caras.' },
    feed: 6,
  },
  {
    format: 'post', title: 'La vecina que volvió a tener agua', cat: 'Agua potable', pillar: 'gente', day: -12, by: 'social', state: 'in_review',
    media: postImage('post-2'),
    copies: {
      formula: 'PAS',
      long: `${HELLO} Durante meses, la vecina cargó tobos para tener agua en casa. Con la reparación de la tubería del sector, el agua volvió a llegar. Historias así nos dicen que vamos por buen camino. ${LOVE}`,
      medium: 'La vecina que volvió a tener agua 💧 Con la reparación de la tubería del sector, el agua volvió a llegar 👇',
      short: '💧 La vecina que volvió a tener agua en casa. Seguimos trabajando 👇 #Tachira',
    },
    details: {
      art_overline: 'Historias de la gente', art_headline: 'El agua volvió a llegar', visual_concept: 'Manos abriendo una llave, luz cálida.',
      cta: 'Cuéntanos si en tu sector ya llegó', hashtags: '#Tachira #AguaParaTodos',
    },
    notice: { kind: 'written_consent', body: 'Testimonio: falta la autorización escrita de la vecina.', by: 'social' },
    feed: 13,
  },
  {
    format: 'post', title: 'Así pides una jornada de salud', cat: 'Salud', pillar: 'servicios', day: -14, by: 'social2', state: 'changes',
    media: postImage('post-4'),
    copies: {
      formula: 'FAB',
      long: `${HELLO} ¿Tu comunidad necesita una jornada de salud? El consejo comunal hace la solicitud en la Gobernación y el equipo coordina la visita. Comparte para que llegue a quien lo necesita. ${LOVE}`,
      medium: 'Así pides una jornada de salud 🩺 El consejo comunal hace la solicitud y el equipo coordina la visita 👇',
      short: '🩺 Así pides una jornada de salud para tu comunidad 👇 #Tachira',
    },
    details: { art_overline: 'Paso a paso', art_headline: 'Pide una jornada de salud', visual_concept: 'Tres pasos numerados con íconos.' },
    changes: 'El titular no se lee bien en el teléfono: súbelo de tamaño.',
    feed: 17,
  },
  {
    format: 'post', title: 'Nuestro café de altura', cat: 'Café y cacao', pillar: 'cultura', day: -8, by: 'social', state: 'draft',
    media: postImage('post-1'),
    details: {
      art_overline: 'Orgullo tachirense', art_headline: 'Café de altura', art_fine_print: 'Imagen de ejemplo para la demostración.',
      visual_concept: 'Taza humeante sobre sacos de café, tonos tierra.', hashtags: '#Tachira #CafeTachirense',
    },
    design: { status: 'disapproved', note: 'El titular se lee pequeño en el teléfono.', by: 'social2' }, feed: 19,
  },
  {
    format: 'post', title: 'Rutas para conocer el estado', cat: 'Turismo', pillar: 'cultura', day: -5, by: 'social2', state: 'draft',
    details: { idea: '', art_headline: 'Rutas para conocer el estado', visual_concept: 'Mapa ilustrado sin nombres, solo íconos de montaña y río.' },
  },

  // Carousels: 1 published (4 slides), 1 approved (5), 1 in review (amarillo, 4), 1 draft with 3 (one without image).
  {
    format: 'carousel', title: 'Paso a paso: reportar una falla', cat: 'Atención al ciudadano', pillar: 'servicios', day: -23, by: 'social', state: 'approved',
    slides: [slide('slide-1', 1), slide('slide-2', 2), slide('slide-3', 3), slide('slide-4', 4)],
    copies: {
      formula: 'AIDA',
      long: `${HELLO} ¿Viste una falla en tu sector? Desliza y aprende a reportarla paso a paso: qué datos dar, dónde enviarlos y cómo seguir tu reporte. Así llegamos más rápido. ${LOVE}`,
      medium: 'Paso a paso: reportar una falla 🛠️ Qué datos dar, dónde enviarlos y cómo seguir tu reporte 👇',
      short: '🛠️ Reporta una falla en tu sector, paso a paso 👇 #Tachira',
    },
    details: {
      hook: '¿Viste una falla en tu sector?', cta: 'Guarda este carrusel', hashtags: '#Tachira #ReportaYa',
      slides: [
        { role: 'cover', title: 'Reporta una falla', text: 'En cuatro pasos.' },
        { role: 'body', title: 'Qué datos dar', text: 'Qué pasó y en qué sector.' },
        { role: 'summary', title: 'Dónde enviarlo', text: 'Por el canal de atención al ciudadano.' },
        { role: 'cta', title: 'Sigue tu reporte', text: 'Guarda el número de tu reporte.' },
      ],
    },
    pubs: [{ network: 'instagram', format: 'carousel', status: 'published', day: -20, hour: 12, slug: 'instagram/carrusel-falla' }],
    design: { status: 'approved', by: 'boss' }, rating: 8, feed: 3,
  },
  {
    format: 'carousel', title: 'Cinco obras del mes', cat: 'Obras', pillar: 'obras', day: -15, by: 'social2', state: 'approved',
    slides: [slide('slide-2', 1), slide('slide-3', 2), slide('slide-4', 3), slide('slide-1', 4), slide('slide-2', 5)],
    copies: {
      formula: 'FAB',
      long: `${HELLO} Cinco obras que avanzaron este mes: vialidad, agua, canchas, escuelas y alumbrado. Desliza para ver cada una y cuéntanos cuál te tocó de cerca. ${LOVE}`,
      medium: 'Cinco obras que avanzaron este mes 🏗️ Desliza para ver cada una 👇',
      short: '🏗️ Cinco obras que avanzaron este mes 👇 #Tachira',
    },
    details: {
      hook: 'Cinco obras que avanzaron', cta: 'Cuéntanos cuál te tocó de cerca',
      slides: [
        { role: 'cover', title: 'Cinco obras del mes', text: '' },
        { role: 'body', title: 'Vialidad', text: 'Bacheo y asfaltado en vías de la comunidad.' },
        { role: 'body', title: 'Agua', text: 'Reparación de tuberías.' },
        { role: 'summary', title: 'Canchas y escuelas', text: 'Espacios para los muchachos.' },
        { role: 'cta', title: '¿Cuál te tocó?', text: 'Cuéntanos en los comentarios.' },
      ],
    },
    design: { status: 'approved', by: 'social' }, rating: 7, feed: 8,
  },
  {
    format: 'carousel', title: 'Cómo pedir un operativo', cat: 'Atención al ciudadano', pillar: 'servicios', day: -11, by: 'social', state: 'in_review',
    slides: [slide('slide-3', 1), slide('slide-4', 2), slide('slide-1', 3), slide('slide-2', 4)],
    copies: {
      formula: 'PAS',
      long: `${HELLO} ¿Tu comunidad necesita un operativo y no sabes por dónde empezar? Desliza: te explicamos quién lo pide, qué hace falta y cómo se coordina. ${LOVE}`,
      medium: 'Cómo pedir un operativo 📋 Quién lo pide, qué hace falta y cómo se coordina 👇',
      short: '📋 Cómo pedir un operativo para tu comunidad 👇 #Tachira',
    },
    details: {
      hook: '¿No sabes por dónde empezar?', cta: 'Comparte con tu consejo comunal',
      slides: [
        { role: 'cover', title: 'Cómo pedir un operativo', text: '' },
        { role: 'body', title: 'Quién lo pide', text: 'El consejo comunal.' },
        { role: 'summary', title: 'Qué hace falta', text: 'La solicitud y la lista de familias.' },
        { role: 'cta', title: 'Compártelo', text: 'Con tu consejo comunal.' },
      ],
    },
    feed: 15,
  },
  {
    format: 'carousel', title: 'Cuidemos a los abuelos', cat: 'Adultos mayores', pillar: 'gente', day: -7, by: 'social2', state: 'draft',
    slides: [slide('slide-4', 1), slide('slide-1', 2), null],
    details: {
      hook: 'Ellos nos cuidaron', slides: [
        { role: 'cover', title: 'Cuidemos a los abuelos', text: '' },
        { role: 'body', title: 'Visítalos', text: 'Una llamada o una visita les cambia el ánimo.' },
        { role: 'cta', title: 'Comparte', text: 'Etiqueta a tu abuelo o abuela.' },
      ],
    },
  },

  // Stories: 4 approved (verde), 2 published (Instagram), 6 drafts; stickers of every kind.
  {
    format: 'story', title: 'Encuesta: ¿qué obra quieres ver?', cat: 'Participación ciudadana', pillar: 'obras', day: -21, by: 'social', state: 'approved',
    media: storyPhoto('reel-2'),
    details: {
      idea: 'Preguntar qué obra quieren ver en los próximos videos.', sticker: 'poll', sticker_text: '¿Vialidad o canchas?',
      on_screen: '¿Qué obra quieres ver?', follow_up: 'Responder con un reel a la opción ganadora.',
    },
    pubs: [{ network: 'instagram', format: 'story', status: 'published', day: -20, hour: 20, slug: 'instagram/historia-encuesta' }],
  },
  {
    format: 'story', title: 'Quiz del Táchira', cat: 'Tradiciones del Táchira', pillar: 'cultura', day: -18, by: 'social2', state: 'approved',
    media: storyClip('reel-3'),
    details: {
      idea: 'Un quiz de cultura andina para que la gente participe.', sticker: 'quiz', sticker_text: '¿Cuál es el plato andino más pedido? Pisca · Arepa de trigo · Mute',
      on_screen: 'Quiz del Táchira', follow_up: 'Compartir la respuesta correcta en otra historia.',
    },
    pubs: [{ network: 'instagram', format: 'story', status: 'published', day: -17, hour: 20, slug: 'instagram/historia-quiz' }],
  },
  {
    format: 'story', title: 'Detrás de cámaras', cat: 'Gestión de gobierno', pillar: 'gente', day: -15, by: 'social', state: 'approved',
    media: storyClip('reel-1'),
    details: { idea: 'Mostrar cómo se graba un reel.', sticker: 'behind_scenes', on_screen: 'Así grabamos el reel del parque' },
  },
  {
    format: 'story', title: 'Pregúntale al equipo', cat: 'Atención al ciudadano', pillar: 'servicios', day: -13, by: 'social2', state: 'approved',
    media: storyPhoto('reel-2'),
    details: { idea: 'Abrir preguntas sobre las obras.', sticker: 'question', sticker_text: '¿Qué quieres saber de las obras?', on_screen: 'Pregúntanos', follow_up: 'Responder las preguntas más repetidas.' },
  },
  {
    format: 'story', title: 'Tip para ahorrar agua', cat: 'Agua potable', pillar: 'servicios', day: -12, by: 'social', state: 'approved',
    media: storyPhoto('reel-3'),
    details: { idea: 'Un tip corto del post de ahorro de agua.', sticker: 'tip', on_screen: 'Cierra la llave mientras te cepillas' },
  },
  {
    format: 'story', title: 'Enlace al reporte de obras', cat: 'Rendición de cuentas', pillar: 'cuentas', day: -11, by: 'social2', state: 'approved',
    media: storyPhoto('reel-1'),
    details: { idea: 'Llevar a la gente al reporte completo.', sticker: 'link', sticker_text: 'Lee el reporte', sticker_url: 'https://example.org/demo/reporte', on_screen: 'Lee el reporte completo' },
  },
  {
    format: 'story', title: 'Deslizador: ¿te gustó el parque?', cat: 'Recreación y espacios públicos', pillar: 'obras', day: -10, by: 'social', state: 'draft',
    media: storyPhoto('reel-1'),
    details: { idea: 'Medir cómo recibieron el parque.', sticker: 'slider', sticker_text: '¿Cuánto te gustó?', on_screen: '¿Te gustó el parque?' },
  },
  {
    format: 'story', title: 'Cuenta regresiva: reel nuevo', cat: 'Gestión de gobierno', pillar: 'obras', day: -9, by: 'social2', state: 'draft',
    details: { idea: 'Anunciar que viene un reel nuevo.', sticker: 'countdown', sticker_text: 'Reel nuevo del parque' },
  },
  {
    format: 'story', title: 'Repost: la gente comparte', cat: 'Participación ciudadana', pillar: 'gente', day: -8, by: 'social', state: 'draft',
    media: storyPhoto('reel-2'),
    details: { idea: 'Compartir lo que la gente publica sobre las obras.', sticker: 'repost', on_screen: 'Gracias por compartir' },
  },
  {
    format: 'story', title: 'Detrás de cámaras: la edición', cat: 'Gestión de gobierno', pillar: 'gente', day: -7, by: 'social2', state: 'draft',
    details: { idea: 'Mostrar cómo se edita un video.', sticker: 'behind_scenes' },
  },
  {
    format: 'story', title: 'Encuesta: tu servicio favorito', cat: 'Urbanismo y servicios públicos', pillar: 'servicios', day: -6, by: 'social', state: 'draft',
    media: storyPhoto('reel-3'),
    details: { idea: 'Saber qué servicio valoran más.', sticker: 'poll', sticker_text: '¿Agua o alumbrado?', on_screen: '¿Qué servicio mejoró más?' },
  },
  {
    format: 'story', title: 'Saludo a los abuelos', cat: 'Adultos mayores', pillar: 'gente', day: -5, by: 'social2', state: 'draft',
    details: { idea: 'Un saludo para los abuelos de la comunidad.', sticker: 'other' },
  },

  // YouTube: 1 approved (16:9 video, thumbnail, shots and a description with chapters), 1 draft with shots.
  {
    format: 'youtube', title: 'Reporte semanal (demo)', cat: 'Rendición de cuentas', pillar: 'cuentas', day: -14, by: 'social', state: 'approved',
    media: { kind: 'final', label: 'Video final v1', pic: 'yt-1', video: { seconds: 420 }, w: 1920, h: 1080 },
    cover: { kind: 'cover', label: 'Miniatura v1', pic: 'yt-1', w: 1280, h: 720 },
    copies: {
      formula: 'FAB',
      long: `${HELLO} Este es el reporte de la gestión: obras, servicios y lo que viene. Capítulos: 1. Lo que avanzó · 2. Los servicios · 3. Lo que viene. Comenta qué quieres ver en el próximo reporte. ${LOVE}`,
      medium: 'Reporte de la gestión 🎥 Obras, servicios y lo que viene. Comenta qué quieres ver en el próximo 👇',
      short: '🎥 Reporte de la gestión: obras, servicios y lo que viene 👇 #Tachira',
    },
    details: {
      shots: [
        { says: 'Bienvenidos al reporte de la gestión.', action: 'Presentación con el logo', on_screen: 'Reporte de la gestión' },
        { says: 'Esto es lo que avanzó.', action: 'Imágenes de las obras', on_screen: 'Lo que avanzó' },
        { says: 'Y esto es lo que viene.', action: 'Cierre con las próximas obras', on_screen: 'Lo que viene' },
      ],
    },
  },
  {
    format: 'youtube', title: 'Recorrido por la vía nueva', cat: 'Vialidad', pillar: 'obras', day: -7, by: 'social2', state: 'draft',
    details: {
      shots: [
        { says: 'Recorremos la vía nueva de punta a punta.', action: 'Toma desde el carro', on_screen: 'Recorrido por la vía nueva' },
        { says: 'Así quedó el asfalto y la señalización.', action: 'Detalle de las rayas y señales', on_screen: 'Señalización nueva' },
      ],
    },
  },

  // Fin de mes: a draft with 3 images.
  {
    format: 'month_end', title: 'Cierre del mes', cat: 'Rendición de cuentas', pillar: 'cuentas', day: -4, by: 'social', state: 'draft',
    slides: [slide('slide-2', 1), slide('slide-3', 2), slide('slide-4', 3)],
    copies: {
      formula: 'FAB',
      long: `${HELLO} Así cerramos el mes: obras entregadas, servicios que mejoraron y mucha gente trabajando por el estado. Gracias por acompañarnos. ${LOVE}`,
      medium: 'Así cerramos el mes 📌 Obras, servicios y mucha gente trabajando 👇',
      short: '📌 Así cerramos el mes 👇 #Tachira',
    },
    details: {
      slides: [
        { role: 'cover', title: 'Obras entregadas', text: 'Las más vistas del mes.' },
        { role: 'body', title: 'Servicios', text: 'Lo que mejoró en agua y alumbrado.' },
        { role: 'cta', title: 'Gracias', text: 'Por acompañarnos.' },
      ],
    },
  },

  // Mes 2: a post and a reel in draft (to move pieces and delete months). Mes 3: empty.
  { format: 'post', title: 'Saludo a los productores (demo)', cat: 'Agricultura', pillar: 'gente', day: -5, by: 'social', state: 'draft', month: 'm2', details: { art_headline: 'Gracias, productores' } },
  { format: 'reel', title: 'Avance de la obra del liceo (demo)', cat: 'Escuelas y liceos', pillar: 'obras', day: -4, by: 'social2', state: 'draft', month: 'm2' },
];

// The six pieces of always (core.ts): reels of Mes 1, with a creation day without an event, an order in Reels and their
// place in the feed (p4, the red one, stays «Sin programar»). p3 is the draft without a file.
const ALWAYS: { key: string; title: string; pillar: Pillar; day: number; feed: number | null; design?: Spec['design']; rating?: number }[] = [
  { key: 'p1', title: 'Cancha techada de El Mirador', pillar: 'obras', day: -25, feed: 1, design: { status: 'approved', by: 'boss' }, rating: 9 },
  { key: 'p2', title: 'Avance del puente La Quebrada', pillar: 'obras', day: -13, feed: 12 },
  { key: 'p3', title: 'Jornada de salud escolar', pillar: 'servicios', day: -26, feed: 10 },
  { key: 'p4', title: 'Aclaratoria sobre el servicio de agua (demo)', pillar: 'servicios', day: -9, feed: null },
  { key: 'green1', title: 'Saludo semanal a los clubes deportivos', pillar: 'gente', day: -11, feed: 14 },
  { key: 'green2', title: 'Resumen de obras de la semana', pillar: 'cuentas', day: -8, feed: 16 },
];
// Open on p2 (in review): the boss reads it in the review room before deciding.
const P2_NOTICE = { kind: 'verify_source', body: 'Verificar la fuente del dato del avance antes de publicar.' };

export async function seedRedes(ctx: SeedCtx): Promise<void> {
  const { sql, ids, at, cat, pieceIds } = ctx;
  const one = async <T>(q: string, p: unknown[] = []) => (await sql.one<T>(q, p))!;
  const as = <T>(who: DemoUserKey, fn: () => Promise<T>) => asPerson(sql, ids[who], fn);

  // 1. The pillars of the demo (the real configuration keeps its own, empty until the team says them).
  await sql.query(`update public.app_settings set value = $1::text::jsonb where key = 'redes.pillars'`, [JSON.stringify(DEMO_PILLARS)]);

  // 2. Months: seedClient already made «Mes 1» (it makes one on a database without any); then Mes 2 and Mes 3. Each
  //    month is born with its 24 feed places (content_month_slots).
  const months: string[] = [];
  for (const [i, label] of DEMO_MONTHS.entries()) {
    const found = await sql.one<{ id: string }>(`select id from public.content_months where deleted_at is null and ordinal = $1`, [i + 1]);
    const id = found?.id ?? (await one<{ id: string }>(`insert into public.content_months (label, ordinal) values ($1, $2) returning id`, [label, i + 1])).id;
    await sql.query(`update public.content_months set label = $2, created_at = $3, created_by = $4 where id = $1`, [id, label, at(i === 0 ? -27 : -5, 9), ids.social]);
    months.push(id);
  }
  const [m1, m2] = months;

  // 3. Files: rows without bytes (like core.ts) and their small picture, kept the way a phone keeps one at upload.
  let fileN = 0;
  const file = async (f: File, by: DemoUserKey, day: number) => {
    const n = ++fileN;
    const ext = f.video ? 'mp4' : 'jpg';
    const pic = demoThumbBytes(`redes-${f.pic}.jpg`);
    const r = await one<{ id: string }>(
      `insert into public.media_assets (kind, storage_path, label, mime, size_bytes, duration_s, width, height, fps, video_codec, audio_codec, status, uploaded_by, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ready', $12, $13) returning id`,
      [f.kind, `${f.kind}/demo-redes-${n}.${ext}`, f.label, f.video ? 'video/mp4' : 'image/jpeg', f.video ? 40_000_000 + n * 1_000_000 : 300_000 + n * 1_000,
        f.video?.seconds ?? null, f.w, f.h, f.video ? 30 : null, f.video ? 'avc' : null, f.video ? 'aac' : null, ids[by], at(day, 10, n % 50)],
    );
    await sql.query(`insert into public.media_thumbs (media_id, mime, bytes) values ($1, 'image/jpeg', $2) on conflict (media_id) do nothing`, [r.id, pic]);
    return r.id;
  };

  const formula = async (code: string) => (await one<{ id: string }>(`select id from public.copy_formulas where code = $1`, [code])).id;
  const sendToReview = (id: string) => sql.query(`update public.pieces set status = 'in_review' where id = $1`, [id]);
  const placeInFeed = (month: string, num: number, piece: string) =>
    sql.query(`update public.feed_slots set piece_id = $3, placed_by = $4 where month_id = $1 and num = $2`, [month, num, piece, ids.social]);
  const markDesign = (piece: string, d: NonNullable<Spec['design']>) =>
    as(d.by, () => sql.query(`update public.pieces set design_status = $2, design_note = $3 where id = $1`, [piece, d.status, d.note ?? '']));

  // 4. The six pieces of always: reels of Mes 1.
  for (const [i, p] of ALWAYS.entries()) {
    const id = pieceIds[p.key] ?? (await sql.one<{ id: string }>(`select id from public.pieces where title = $1 and deleted_at is null order by created_at limit 1`, [p.title]))?.id;
    if (!id) continue;
    pieceIds[p.key] = id;
    await sql.query(
      `update public.pieces set format = 'reel', content_month_id = $2, sort_order = $3, pillar = $4, created_at = $5, rating = $6 where id = $1`,
      [id, m1, i + 1, p.pillar, at(p.day, 9, 30), p.rating ?? null],
    );
    await sql.query(`update public.piece_versions set created_at = $2 where piece_id = $1`, [id, at(p.day, 11)]);
    if (p.design) await markDesign(id, p.design);
    if (p.feed) await placeInFeed(m1, p.feed, id);
  }
  if (pieceIds.p2) {
    await as('social', () =>
      sql.query(`insert into public.piece_notices (piece_id, kind, body, created_at) values ($1, $2, $3, $4)`, [pieceIds.p2, P2_NOTICE.kind, P2_NOTICE.body, at(-12, 11)]),
    );
  }

  // 5. The new pieces, in order.
  const order: Partial<Record<Format, number>> = { reel: ALWAYS.length };
  for (const s of SPECS) {
    const sort = (order[s.format] = (order[s.format] ?? 0) + 1);
    const mediaId = s.media ? await file(s.media, s.by, s.day) : null;
    const coverId = s.cover ? await file(s.cover, s.by, s.day) : null;
    const slideIds: (string | null)[] = [];
    for (const sl of s.slides ?? []) slideIds.push(sl ? await file(sl, s.by, s.day) : null);
    const firstSlide = slideIds.find((x) => x) ?? null;
    const main = mediaId ?? firstSlide;
    const hasFile = !!main;
    const id = (
      await one<{ id: string }>(
        `insert into public.pieces (kind, format, title, category_id, status, current_version, review_level, created_by, created_at, content_month_id, pillar, sort_order)
         values ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11) returning id`,
        [FORMAT[s.format].kind, s.format, s.title, await cat(s.cat), hasFile ? 1 : 0, FORMAT[s.format].defaultLevel, ids[s.by], at(s.day, 9, 15),
          s.month === 'm2' ? m2 : m1, s.pillar, sort],
      )
    ).id;
    if (hasFile) {
      await sql.query(
        `insert into public.piece_versions (piece_id, version, media_asset_id, cover_asset_id, slide_asset_ids, created_by, created_at)
         values ($1, 1, $2, $3, $4::uuid[], $5, $6)`,
        // A post's image and a carousel's first slide are also the cover the feed and Publicar show.
        [id, main, coverId ?? (s.format === 'post' || s.slides ? main : null), slideIds, ids[s.by], at(s.day, 11)],
      );
    }
    if (s.copies) {
      const f = await formula(s.copies.formula);
      for (const group of ['long', 'medium', 'short'] as const) {
        const body = s.copies[group];
        await sql.query(
          `insert into public.copies (piece_id, formula_id, length_group, body, char_count, generated_by, updated_by) values ($1, $2, $3, $4, $5, 'template', $6)`,
          [id, f, group, body, [...body].length, ids[s.by]],
        );
      }
    }
    if (s.details) {
      const d = s.details;
      await sql.query(
        `insert into public.piece_details (piece_id, art_overline, art_headline, art_seals, art_fine_print, visual_concept, hook, cta, hashtags,
           publication_notes, sticker, sticker_text, sticker_url, on_screen, follow_up, idea, links, post_ratio, shots, slides, updated_by, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::text::jsonb, $20::text::jsonb, $21, $22)`,
        [id, d.art_overline ?? '', d.art_headline ?? '', d.art_seals ?? '', d.art_fine_print ?? '', d.visual_concept ?? '', d.hook ?? '', d.cta ?? '',
          d.hashtags ?? '', d.publication_notes ?? '', d.sticker ?? null, d.sticker_text ?? '', d.sticker_url ?? '', d.on_screen ?? '', d.follow_up ?? '',
          d.idea ?? '', d.links ?? '', d.post_ratio ?? '4:5', JSON.stringify(d.shots ?? []), JSON.stringify(d.slides ?? []), ids[s.by], at(s.day, 12)],
      );
    }
    if (s.state !== 'draft') await sendToReview(id);
    // Notices before the boss decides: a new one on an approved piece would send it back (notices_reopen_review).
    if (s.notice) {
      const n = s.notice;
      const notice = await as(n.by, () =>
        one<{ id: string }>(`insert into public.piece_notices (piece_id, kind, body, created_at) values ($1, $2, $3, $4) returning id`, [id, n.kind, n.body, at(s.day, 13)]),
      );
      if (n.resolvedBy) await as(n.resolvedBy, () => sql.query(`update public.piece_notices set resolved_at = now() where id = $1`, [notice.id]));
    }
    if (s.state === 'approved') await as('boss', () => sql.query(`select public.review_piece($1, 'approved', 'Bien. Aprobado.')`, [id]));
    if (s.state === 'changes') await as('boss', () => sql.query(`select public.review_piece($1, 'changes_requested', $2)`, [id, s.changes ?? 'Revisa la pieza.']));
    for (const p of s.pubs ?? []) {
      const copy = p.format === 'story' ? '' : s.copies!.long; // Instagram and Facebook take the long copy; a story has none
      const when = at(p.day, p.hour, 15);
      await sql.query(
        `insert into public.publications (piece_id, network, format, copy_body, cover_asset_id, scheduled_at, published_at, url, status, mode, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual', $10)`,
        [id, p.network, p.format, copy, p.format === 'story' ? null : coverId ?? main, when, p.status === 'published' ? when : null,
          p.status === 'published' ? `https://example.org/demo/${p.slug}` : null, p.status, ids[s.by]],
      );
    }
    if (s.design) await markDesign(id, s.design);
    if (s.rating) await sql.query(`update public.pieces set rating = $2 where id = $1`, [id, s.rating]);
    if (s.feed) await placeInFeed(m1, s.feed, id);
  }

  // The feed's checks wait for the end of the transaction (deferrable uniques and constraint triggers, from the months
  // seedClient made too). Fire them now: withStableIds changes column defaults right after the seed, and Postgres
  // does not alter a table with pending trigger events. A part added after this one that touches the feed or a
  // piece's month does the same at its end.
  await sql.query('set constraints all immediate');
}
