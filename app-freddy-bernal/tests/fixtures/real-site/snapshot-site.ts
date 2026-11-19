// The INVENTED official site of the real-content fixture: WordPress's API, its home page with the weekly, a Drive file
// and a YouTube channel with two episodes behind a fake fetch, so fixtureSnapshot() runs the app's own build code
// (scripts/real-site/build.ts with the real network code of sources.ts: photos checked and cleaned like an upload, ids
// and keys from names and bytes) against it and nothing leaves the machine. make-snapshot.mts writes the result as a
// folder laid out like the .real-site/ a demo build writes, and a server reads it through REAL_SITE_DIR (the Playwright
// project «real-fixture» does both). Only this site and its drawings are committed; the snapshot is made again each time
// from the build code of the day, so it never goes stale. Every text is made up and marked (demo); no person is named
// and nobody's words or deeds are told (institutions only); the biography says it is an example. The photos are drawn by
// drawings.mjs. The hosts, the channel and the Drive file do not exist. (The unit tests of the build have their own
// invented site next to this one: site.ts and wp.ts.)
import { getClientConfig, type ClientConfig } from '../../../src/lib/client-config';
import { textPdf } from '../../../src/lib/participation/pdf';
import { buildSnapshot, type BuildResult } from '../../../scripts/real-site/build';
import { programNameOf, type RealSiteConfig } from '../../../scripts/real-site/settings';
import { Deadline, networkSources } from '../../../scripts/real-site/sources';
import { drawJpeg } from './drawings.mjs';

export const FIXTURE_HOST = 'sitio-oficial.test';
const ORIGIN = `https://${FIXTURE_HOST}`;
const DRIVE_ID = 'ArchivoFixtureDemo0001';
/** When the invented site was «read»: the snapshot's fetchedAt (fixed, so the fixture does not change by itself). */
export const FIXTURE_NOW = new Date('2026-11-18T14:17:00.000Z');

export const FIXTURE_REAL_CONFIG: RealSiteConfig = {
  source: FIXTURE_HOST,
  bioPostId: 9301,
  officePostIds: [9401, 9402],
  heroMediaId: 7101,
  bioMediaId: 7102,
  maxNews: 48,
  maxOpinion: 8,
  maxEpisodes: 12,
  semanarioName: 'Semanario de prueba (demo)',
  youtube: { channelId: 'UCdemoCanalDeLaFixture01', playlistId: 'UULFdemoCanalDeLaFixture01', handle: '@CanalDemo.oficial' },
};

type Cat = 'tachira' | 'salud' | 'deportes' | 'seguridad' | 'opinion' | 'biografia';
const CATEGORIES: { id: number; slug: Cat; name: string }[] = [
  { id: 3, slug: 'tachira', name: 'Táchira' },
  { id: 6, slug: 'salud', name: 'Salud' },
  { id: 7, slug: 'deportes', name: 'Deportes' },
  { id: 8, slug: 'seguridad', name: 'Seguridad' },
  { id: 9, slug: 'opinion', name: 'Opinión' },
  { id: 10, slug: 'biografia', name: 'Biografía' },
];
const catId = (s: Cat) => CATEGORIES.find((c) => c.slug === s)!.id;

/** A note of the invented site: when (Caracas time), its category, title, paragraphs and its drawn photo (opinion has
 * none: the home shows it as text). */
type Note = { id: number; at: string; cat: Cat; title: string; body: string[]; photo?: string; alt?: string; signature?: string };

const NOTES: Note[] = [
  {
    id: 40106, at: '2026-11-17T09:20', cat: 'tachira', photo: 'plaza',
    title: 'Vecinos del municipio Lobatera estrenan una plaza con juegos infantiles (demo)',
    alt: 'Dibujo de una plaza con columpios, un tobogán, bancos y faroles, frente a una fila de casas',
    body: [
      'Los vecinos de un sector del municipio Lobatera estrenaron su plaza, recuperada por la Gobernación del estado Táchira (demo). Los trabajos incluyeron columpios y un tobogán nuevos, bancos, faroles y la siembra de arbustos.',
      'El consejo comunal del sector (demo) se organizó para cuidar los juegos y las áreas verdes.',
      'Según la Secretaría de Obras del estado (demo), antes de fin de año se recuperarán otras dos plazas del municipio con el mismo plan.',
    ],
  },
  {
    id: 40105, at: '2026-11-16T15:10', cat: 'salud', photo: 'ambulatorio',
    title: 'Un ambulatorio rural del municipio Uribante recibe equipos para emergencias (demo)',
    alt: 'Dibujo de un ambulatorio rural blanco con una ambulancia frente a la entrada',
    body: [
      'El ambulatorio rural de una parroquia del municipio Uribante recibió una camilla, un monitor de signos vitales y un lote de insumos médicos (demo).',
      'La Secretaría de Salud del estado (demo) explicó que con estos equipos el centro atenderá las urgencias más frecuentes sin trasladar a los pacientes.',
    ],
  },
  {
    id: 40104, at: '2026-11-15T11:05', cat: 'deportes', photo: 'pista',
    title: 'Más de 300 estudiantes compiten en los juegos regionales escolares (demo)',
    alt: 'Dibujo de una pista de atletismo con sus carriles frente a unas gradas vacías',
    body: [
      'Con estudiantes de 18 municipios comenzaron en San Cristóbal los juegos regionales escolares (demo): atletismo, voleibol, ajedrez y fútbol sala.',
      'El instituto regional de deportes (demo) informó que las pruebas durarán tres días y que las familias pueden asistir sin costo.',
    ],
  },
  {
    id: 40103, at: '2026-11-14T16:30', cat: 'seguridad', photo: 'primeros-auxilios',
    title: 'Protección Civil forma a 120 voluntarios en primeros auxilios (demo)',
    alt: 'Dibujo de una carpa naranja con un botiquín sobre una mesa y conos en la grama',
    body: [
      'Protección Civil del estado Táchira (demo) terminó un curso de primeros auxilios para 120 voluntarios de consejos comunales, escuelas y grupos de vecinos.',
      'Los voluntarios apoyarán los planes de prevención de la temporada de lluvias en sus comunidades (demo).',
    ],
  },
  {
    id: 40102, at: '2026-11-13T10:00', cat: 'tachira', photo: 'cauce',
    title: 'Cuadrillas limpian el cauce de tres quebradas en el municipio Fernández Feo (demo)',
    alt: 'Dibujo de una excavadora que limpia el cauce de una quebrada entre árboles',
    body: [
      'Cuadrillas de la Gobernación del estado Táchira (demo) limpiaron el cauce de tres quebradas del municipio Fernández Feo, como parte del plan de prevención de la temporada de lluvias.',
      'Los trabajos incluyeron la remoción de sedimentos y ramas con maquinaria pesada y el refuerzo de dos muros de contención (demo).',
    ],
  },
  {
    id: 40101, at: '2026-11-12T15:00', cat: 'tachira', photo: 'puente',
    title: 'Rehabilitan el puente peatonal de un sector del municipio Independencia (demo)',
    alt: 'Dibujo de un puente peatonal colgante sobre un río entre árboles',
    body: [
      'La Gobernación del estado Táchira (demo) terminó la rehabilitación del puente peatonal que une dos sectores del municipio Independencia: tablas nuevas, barandas y pintura.',
      'Por el puente pasan cada día estudiantes y trabajadores. La comunidad lo pidió a través de su consejo comunal (demo).',
    ],
  },
  // Opinion: two columns, signed inside the text (the official site has no author field in public).
  {
    id: 40202, at: '2026-11-14T07:00', cat: 'opinion',
    title: 'La escuela como centro de la comunidad (demo)',
    body: [
      'Una escuela es mucho más que un edificio con aulas: es el lugar donde se reúnen las familias y donde los niños aprenden a convivir (demo).',
      'Cuidar la escuela es tarea de todos: de quienes la dirigen, de quienes estudian en ella y de quienes viven a su alrededor.',
    ],
    signature: 'Columna de una docente invitada (demo)',
  },
  {
    id: 40201, at: '2026-11-11T07:00', cat: 'opinion',
    title: 'Cuidar el agua empieza en casa (demo)',
    body: [
      'El agua que llega a nuestras casas nace en las montañas, se potabiliza en las plantas y viaja por kilómetros de tuberías (demo).',
      'Cerrar el grifo a tiempo, reparar una fuga y reportar los botes en la calle son gestos pequeños que hacen una gran diferencia.',
    ],
    signature: 'Columna de un vecino invitado (demo)',
  },
];

/** The governor's page: an example text that says it is one (the real biography is read from the official site at the
 * demo's build), and two example notes about the period. */
const BIO_HTML = [
  '<p>Texto de ejemplo para la versión de prueba (demo). La biografía de la web oficial se lee al construir la demo; este texto no cuenta nada de nadie.</p>',
  '<p>Condecoraciones</p>',
  '<p>&#8211; Condecoración de ejemplo (demo).</p>',
  '<p>&#8211; Reconocimiento de ejemplo (demo).</p>',
].join('\n');

// --- Media -------------------------------------------------------------------------------------------------------------
type Media = { id: number; scene: string; month: string; alt: string; width: number };
const COVER_MEDIA_ID = 7201;
const MEDIA: Media[] = [
  ...NOTES.filter((n) => n.photo).map((n, i) => ({ id: 7001 + i, scene: n.photo!, month: n.at.slice(0, 7).replace('-', '/'), alt: n.alt!, width: 1200 })),
  { id: FIXTURE_REAL_CONFIG.heroMediaId, scene: 'valle', month: '2026/01', alt: 'Dibujo de un valle andino con un pueblo al pie de las montañas, al amanecer', width: 1200 },
  { id: FIXTURE_REAL_CONFIG.bioMediaId, scene: 'edificio', month: '2026/01', alt: 'Dibujo de la fachada de un edificio público con columnas, frente a una plaza', width: 1200 },
  { id: COVER_MEDIA_ID, scene: 'portada-semanario', month: '2026/11', alt: '', width: 720 },
];
const mediaUrl = (m: Media) => `${ORIGIN}/wp-content/uploads/${m.month}/${m.scene}-demo.jpg`;
const photoOf = (n: Note) => (n.photo ? 7001 + NOTES.filter((x) => x.photo).indexOf(n) : 0);

/** The width and height of a JPEG (its first frame header). */
function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  for (let i = 2; i < bytes.length - 9; ) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  throw new Error('un JPEG sin tamaño');
}

// --- The program's channel ---------------------------------------------------------------------------------------------
/** Two invented episodes of the client's program (its name from the config: only the titles carry it), the newest in
 * two parts (a later upload with the same number is a part of it). Low numbers, far from the real ones. */
const EPISODES = [
  { videoId: 'fixtEmisi2b', number: 42, part: 'Segunda parte', published: '2026-11-14T23:30:00+00:00', scene: 'valle' },
  { videoId: 'fixtEmisio2', number: 42, part: 'Emisión de prueba', published: '2026-11-14T22:00:00+00:00', scene: 'calle' },
  { videoId: 'fixtEmisio1', number: 41, part: 'Emisión de prueba', published: '2026-11-07T22:00:00+00:00', scene: 'sala-reuniones' },
];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function feedXml(programName: string): string {
  const yt = FIXTURE_REAL_CONFIG.youtube;
  const entries = EPISODES.map(
    (e) => ` <entry>
  <id>yt:video:${e.videoId}</id>
  <yt:videoId>${e.videoId}</yt:videoId>
  <yt:channelId>${yt.channelId}</yt:channelId>
  <title>${esc(`${programName} ${e.number} | ${e.part} (demo)`)}</title>
  <published>${e.published}</published>
  <media:group>
   <media:title>${esc(`${programName} ${e.number} | ${e.part} (demo)`)}</media:title>
   <media:description>Emisión inventada para la versión de prueba (demo).</media:description>
  </media:group>
 </entry>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?playlist_id=${yt.playlistId}"/>
 <id>yt:playlist:${yt.playlistId}</id>
 <yt:playlistId>${yt.playlistId}</yt:playlistId>
 <yt:channelId>${yt.channelId}</yt:channelId>
 <title>Videos</title>
 <author><name>Canal Demo</name><uri>https://www.youtube.com/channel/${yt.channelId}</uri></author>
 <published>2026-01-16T01:34:14+00:00</published>
${entries}
</feed>`;
}

// --- The WordPress API ---------------------------------------------------------------------------------------------------
const slugify = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const pad = (n: number) => String(n).padStart(2, '0');
/** «2026-11-07T09:20» in Caracas (UTC−4) → WordPress's local and GMT strings. */
function dates(at: string) {
  const local = `${at}:00`;
  const t = new Date(`${local}-04:00`);
  const gmt = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:00`;
  return { date: local, date_gmt: gmt, modified: local, modified_gmt: gmt };
}
type Post = { id: number; categories: number[]; [k: string]: unknown };
function post(id: number, at: string, cat: Cat, title: string, html: string, slug: string, featured: number): Post {
  const month = at.slice(0, 7).replace('-', '/');
  return {
    id, ...dates(at), slug, status: 'publish', type: 'post', link: `${ORIGIN}/${month}/${slug}/`,
    title: { rendered: esc(title) }, content: { rendered: html }, excerpt: { rendered: '' }, author: 1,
    featured_media: featured, categories: [catId(cat)], tags: [],
  };
}
const paragraphs = (n: Note) => [...n.body.map((p) => `<p>${esc(p)}</p>`), ...(n.signature ? [`<p><em>${esc(n.signature)}</em></p>`] : [])].join('\n');
const WP = {
  categories: CATEGORIES.map((c) => ({ id: c.id, slug: c.slug, name: c.name, link: `${ORIGIN}/category/${c.slug}/`, count: 1 })),
  news: NOTES.filter((n) => n.cat !== 'opinion').map((n) => post(n.id, n.at, n.cat, n.title, paragraphs(n), slugify(n.title), photoOf(n))),
  opinion: NOTES.filter((n) => n.cat === 'opinion').map((n) => post(n.id, n.at, n.cat, n.title, paragraphs(n), slugify(n.title), 0)),
  pages: [
    post(FIXTURE_REAL_CONFIG.bioPostId, '2026-01-12T10:00', 'biografia', 'Biografía', BIO_HTML, 'biografia-demo', 0),
    post(FIXTURE_REAL_CONFIG.officePostIds[0], '2025-05-30T11:00', 'tachira', 'Primera nota de ejemplo sobre el período de gestión (demo)',
      '<p>Texto de ejemplo para la versión de prueba (demo).</p>\n<h3><strong>Primera nota de ejemplo sobre el período de gestión (demo)</strong></h3>\n<p>El texto completo de esta nota es inventado (demo).</p>',
      'primera-nota-de-ejemplo-demo', 0),
    post(FIXTURE_REAL_CONFIG.officePostIds[1], '2025-07-14T10:30', 'tachira', 'Segunda nota de ejemplo sobre el período de gestión (demo)',
      '<p>Una segunda nota de ejemplo para la versión de prueba (demo).</p>',
      'segunda-nota-de-ejemplo-demo', 0),
  ],
};

/** The home: the weekly (a heading «Semanario», its cover linked to the Drive file). No account is linked: the fixture
 * verifies none. */
function homeHtml(): string {
  const cover = MEDIA.find((m) => m.id === COVER_MEDIA_ID)!;
  return `<!DOCTYPE html>
<html lang="es"><head><title>Sitio oficial inventado (demo)</title></head>
<body>
  <div class="benqu-section-title-wrap"><h2>Últimas noticias (demo)</h2></div>
  <div class="elementor-column">
    <div class="benqu-section-title-wrap text-left"><h2>Semanario</h2></div>
    <div class="elementor-widget-image">
      <a href="https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing"><img src="${mediaUrl(cover)}" class="attachment-full size-full wp-image-${COVER_MEDIA_ID}" alt="" /></a>
    </div>
  </div>
</body></html>`;
}

/** The weekly's PDF: two pages of invented text, made on 13/11 (its edition's day). */
function weeklyPdf(): Uint8Array {
  const news = NOTES.filter((n) => n.cat !== 'opinion');
  return textPdf(
    [
      { text: 'Semanario de prueba (demo)', size: 24, bold: true },
      { text: 'Edición de prueba del 13 de noviembre de 2026 (demo)', size: 13, gap: 6 },
      { text: 'Ejemplar inventado para la versión de prueba de la web. No es el Semanario oficial.', gap: 10 },
      { text: 'En esta edición (demo)', size: 15, bold: true, gap: 24 },
      ...news.map((n) => ({ text: `• ${n.title}`, gap: 6 })),
      { text: 'Gestión (demo)', size: 18, bold: true, gap: 2000 },
      ...news.slice(0, 4).flatMap((n) => [{ text: n.title, bold: true, gap: 14 }, { text: n.body[0], gap: 4 }]),
      { text: 'Fin del ejemplar de prueba (demo).', gap: 24 },
    ],
    { title: 'Semanario de prueba (demo)', createdAt: new Date('2026-11-13T16:00:00Z') },
  );
}
const WEEKLY_NAME = 'Edición de prueba del 13 de noviembre de 2026 (demo).pdf';

// --- The fake network ----------------------------------------------------------------------------------------------------
const json = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json; charset=UTF-8', 'x-wp-total': String(Array.isArray(data) ? data.length : 1), 'x-wp-totalpages': '1' } });
const notFound = () => new Response('No encontrado (demo)', { status: 404, headers: { 'content-type': 'text/html' } });

/** The identity the invented site's API gives: the client's name and office from the config, as «<name>  <name> -
 * <office>» (the shape the official WordPress gives). */
export function fixtureIdentity(cfg: ClientConfig): { name: string; tagline: string } {
  return { name: cfg.brand.clientName, tagline: `${cfg.brand.clientName} - ${cfg.web.structuredData.jobTitle}` };
}

/** A fetch that answers as the invented sites would (every photo drawn once, before the first answer), and the
 * addresses it was asked. */
export async function fixtureFetcher(o: { identity: { name: string; tagline: string }; programName: string }) {
  const photos = new Map<string, Uint8Array>();
  const media: Record<string, unknown>[] = [];
  for (const m of MEDIA) {
    const bytes = await drawJpeg(m.scene, { width: m.width });
    photos.set(mediaUrl(m), bytes);
    const { width, height } = jpegSize(bytes);
    media.push({ id: m.id, source_url: mediaUrl(m), mime_type: 'image/jpeg', media_type: 'image', alt_text: m.alt, caption: { rendered: '' }, media_details: { width, height, filesize: bytes.length } });
  }
  const thumbs = new Map<string, Uint8Array>();
  for (const e of EPISODES) thumbs.set(e.videoId, await drawJpeg(e.scene, { width: 1280, height: 720 }));
  const pdf = weeklyPdf();
  const home = homeHtml();
  const feed = feedXml(o.programName);
  const seen: string[] = [];
  const fetcher = async (raw: string): Promise<Response> => {
    seen.push(raw);
    const u = new URL(raw);
    if (u.hostname === FIXTURE_HOST || u.hostname === `www.${FIXTURE_HOST}`) {
      if (u.pathname === '/wp-json/' || u.pathname === '/wp-json') return json({ name: `${o.identity.name}  ${o.identity.tagline}`, description: '' });
      if (u.pathname === '/wp-json/wp/v2/categories') return json(WP.categories);
      if (u.pathname === '/wp-json/wp/v2/posts') {
        const include = u.searchParams.get('include');
        if (include) {
          const ids = include.split(',').map(Number);
          return json([...WP.pages, ...WP.news, ...WP.opinion].filter((p) => ids.includes(p.id)));
        }
        const cats = (u.searchParams.get('categories') ?? '').split(',').filter(Boolean).map(Number);
        if (cats.length) return json(WP.opinion.filter((p) => p.categories.some((c) => cats.includes(c))));
        const without = (u.searchParams.get('categories_exclude') ?? '').split(',').filter(Boolean).map(Number);
        const perPage = Number(u.searchParams.get('per_page') ?? 10);
        return json(WP.news.filter((p) => !p.categories.some((c) => without.includes(c))).slice(0, perPage));
      }
      if (u.pathname === '/wp-json/wp/v2/media') {
        const ids = (u.searchParams.get('include') ?? '').split(',').map(Number);
        return json(media.filter((m) => ids.includes(m.id as number)));
      }
      if (u.pathname === '/') return new Response(home, { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } });
      const photo = photos.get(`${u.origin}${u.pathname}`);
      return photo ? new Response(photo as Uint8Array<ArrayBuffer>, { status: 200, headers: { 'content-type': 'image/jpeg' } }) : notFound();
    }
    if (u.hostname === 'www.youtube.com' && u.pathname === '/feeds/videos.xml') {
      return u.searchParams.get('playlist_id') === FIXTURE_REAL_CONFIG.youtube.playlistId
        ? new Response(feed, { status: 200, headers: { 'content-type': 'text/xml; charset=UTF-8' } })
        : notFound();
    }
    if (u.hostname === 'i.ytimg.com') {
      const thumb = thumbs.get(u.pathname.split('/')[2] ?? '');
      return thumb && u.pathname.endsWith('/maxresdefault.jpg') ? new Response(thumb as Uint8Array<ArrayBuffer>, { status: 200, headers: { 'content-type': 'image/jpeg' } }) : notFound();
    }
    if (u.hostname === 'drive.google.com' && u.pathname === '/uc') {
      return new Response(null, { status: 303, headers: { location: `https://drive.usercontent.google.com/download?id=${u.searchParams.get('id')}&export=download` } });
    }
    if (u.hostname === 'drive.usercontent.google.com' && u.pathname === '/download') {
      if (u.searchParams.get('id') !== DRIVE_ID) return notFound();
      return new Response(pdf as Uint8Array<ArrayBuffer>, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="edicion-de-prueba.pdf"; filename*=UTF-8''${encodeURIComponent(WEEKLY_NAME)}` },
      });
    }
    if (u.hostname === 'drive.google.com' && u.pathname.startsWith('/file/d/')) {
      return new Response(`<html><head><title>${esc(WEEKLY_NAME)} - Google Drive</title></head></html>`, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return notFound();
  };
  return Object.assign(fetcher, { seen });
}

/** The fixture's snapshot and its files, made by the build code against the invented site, with the client's config
 * (its name, office and program). No configured account is passed: the fixture verifies none and carries no real
 * handle. The run's own measures (requests, duration) are dropped: the same code gives the same snapshot. */
export async function fixtureSnapshot(cfg: ClientConfig = getClientConfig(), log: (line: string) => void = () => {}): Promise<BuildResult & { hosts: string[] }> {
  const programName = programNameOf(cfg.brand.programName);
  const identity = fixtureIdentity(cfg);
  const fetcher = await fixtureFetcher({ identity, programName });
  const deadline = new Deadline(120_000);
  try {
    const result = await buildSnapshot(
      { config: FIXTURE_REAL_CONFIG, programName, tz: 'America/Caracas', accounts: [], fallbackIdentity: identity, now: FIXTURE_NOW, log },
      networkSources({ config: FIXTURE_REAL_CONFIG, fetcher, deadline, cache: null, apiDelayMs: 0, fileDelayMs: 0, sleep: () => Promise.resolve() }),
    );
    if (result.failed.length) throw new Error(`el sitio inventado no respondió: ${result.failed.join(', ')}`);
    result.snapshot.report = { ...result.snapshot.report, requests: undefined, durationMs: undefined };
    return { ...result, hosts: [...new Set(fetcher.seen.map((u) => new URL(u).hostname))] };
  } finally {
    deadline.dispose();
  }
}
