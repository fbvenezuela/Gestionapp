import { z } from 'zod';

// The blocks of the website's pages (design §3): each one {id, type, visible, data}, a page is their order. Text is
// STRUCTURED (headings, paragraphs, lists, «por completar» slots, bold, italic and links), rendered by the site's own
// renderer: no HTML or script ever passes, and a link goes only to http, https, mailto or a path of this site. Media and
// content are referenced by id (a web_media id is frozen into the item when it is published; a web_items id is read
// live). Shared by the editor (W3) and the public site (W2); pure, no Node imports.

const uuid = z.string().uuid();
const short = (max: number) => z.string().trim().max(max);

/** An internal path («/gestion», «/atencion/nueva?tipo=reporte»): starts with one /, no spaces, no backslash. */
export const internalPath = z
  .string()
  .trim()
  .max(500)
  .regex(/^\/(?!\/)[^\s\\]*$/, 'Una dirección de esta web empieza con / (por ejemplo /gestion).');

/** A link a person may follow: https or http, mailto, or a path of this site. Never javascript:, data: or the like. */
export const safeHref = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    if (/^\/(?!\/)[^\s\\]*$/.test(v)) return true;
    if (/^mailto:[^\s<>"]+@[^\s<>"]+$/i.test(v)) return true;
    try {
      const u = new URL(v);
      return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname && !/\s/.test(v);
    } catch {
      return false;
    }
  }, 'El enlace va a una página (https://…), a un correo (mailto:…) o a una dirección de esta web (/…).');

/** A link out of the site (sources, channels): https or http only. */
export const externalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v);
      return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname && !/\s/.test(v);
    } catch {
      return false;
    }
  }, 'El enlace empieza con https://');

// --- Rich text ------------------------------------------------------------------------------------------------------
export const textRun = z.object({
  text: z.string().max(2000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  href: safeHref.optional(),
});
export type TextRun = z.infer<typeof textRun>;

const inline = z.union([z.string().max(4000), z.array(textRun).min(1).max(60)]);

export const textNode = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3)]), text: short(200).min(1) }),
  // A paragraph: plain text, or runs with bold, italic and links.
  z.object({ type: z.literal('paragraph'), text: z.string().max(4000).optional(), runs: z.array(textRun).min(1).max(60).optional() }).refine(
    (p) => (p.text !== undefined) !== (p.runs !== undefined),
    'Un párrafo lleva su texto.',
  ),
  z.object({ type: z.literal('list'), ordered: z.boolean().optional(), items: z.array(inline).min(1).max(50) }),
  z.object({ type: z.literal('quote'), text: z.string().trim().min(1).max(1000), cite: short(200).optional() }),
  // «Por completar»: what the team still has to write (D-95). The site shows it as a visible empty slot.
  z.object({ type: z.literal('pending'), text: short(500).min(1) }),
]);
export type TextNode = z.infer<typeof textNode>;
export const richText = z.array(textNode).max(200);

// --- The blocks -----------------------------------------------------------------------------------------------------
const titled = { title: short(120).optional() };
const limit = (max: number) => z.number().int().min(1).max(max).optional();

export const BLOCK_DATA = {
  hero: z.object({ title: short(160).min(1), text: short(600).optional(), mediaId: uuid.nullable().optional(), ctaLabel: short(60).optional(), ctaHref: safeHref.optional() }),
  text: z.object({ ...titled, content: richText }),
  image: z.object({ mediaId: uuid, caption: short(500).optional(), wide: z.boolean().optional() }),
  gallery: z.object({ ...titled, mediaIds: z.array(uuid).min(1).max(24) }),
  // A YouTube video (lite: thumbnail and button, youtube-nocookie.com only on tap), or the latest Reporte Bernal.
  video: z.object({
    ...titled,
    youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/, 'El código del video de YouTube tiene 11 caracteres.').nullable().optional(),
    latestEpisode: z.boolean().optional(),
    episodeId: uuid.optional(),
  }),
  documents: z.object({ ...titled, ids: z.array(uuid).max(30).default([]), category: short(80).optional(), limit: limit(30) }),
  faq: z.object({ ...titled, group: short(80).optional(), ids: z.array(uuid).max(50).optional() }),
  // Only indicators with their source are shown (design §3).
  indicators: z.object({ ...titled, ids: z.array(uuid).max(12).default([]) }),
  projects: z.object({ ...titled, limit: limit(24), municipalityId: uuid.optional(), category: short(80).optional(), state: short(40).optional(), ids: z.array(uuid).max(24).optional() }),
  news: z.object({ ...titled, limit: limit(24), category: short(80).optional() }),
  cta: z.object({ title: short(120).min(1), text: short(400).optional(), label: short(60).min(1), href: safeHref }),
  notices: z.object({ ...titled, limit: limit(12) }),
  channels: z.object({ ...titled }),
  // The big accesses: report, petition, observation, denuncia, «Consultar mi solicitud».
  participation: z.object({ ...titled }),
  attended: z.object({ ...titled, limit: limit(24) }),
} as const;

export type BlockType = keyof typeof BLOCK_DATA;
export const BLOCK_TYPES = Object.keys(BLOCK_DATA) as BlockType[];

export const BLOCK_LABEL: Record<BlockType, string> = {
  hero: 'Portada con foto',
  text: 'Texto',
  image: 'Foto',
  gallery: 'Galería',
  video: 'Video',
  documents: 'Documentos',
  faq: 'Preguntas frecuentes',
  indicators: 'Indicadores',
  projects: 'Obras y gestión',
  news: 'Noticias',
  cta: 'Llamado a la acción',
  notices: 'Avisos de servicio',
  channels: 'Canales oficiales',
  participation: 'Accesos de participación',
  attended: 'Casos atendidos',
};

const blockId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'El id de un bloque va en minúsculas, números y guiones.');
const mk = <T extends BlockType>(type: T) => z.object({ id: blockId, type: z.literal(type), visible: z.boolean(), data: BLOCK_DATA[type] });

export const block = z.discriminatedUnion('type', [
  mk('hero'), mk('text'), mk('image'), mk('gallery'), mk('video'), mk('documents'), mk('faq'), mk('indicators'), mk('projects'),
  mk('news'), mk('cta'), mk('notices'), mk('channels'), mk('participation'), mk('attended'),
]);
export type Block = z.infer<typeof block>;

/** The blocks of a page: valid one by one and with ids that do not repeat. */
export const blocks = z
  .array(block)
  .max(60)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((b, i) => {
      if (seen.has(b.id)) ctx.addIssue({ code: 'custom', path: [i, 'id'], message: 'Dos bloques con el mismo id.' });
      seen.add(b.id);
    });
  });
