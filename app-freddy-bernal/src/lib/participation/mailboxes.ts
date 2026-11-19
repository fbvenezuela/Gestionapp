import { newRequestHref } from '../web/links';
import type { RequestInput, RequestState, RequestType } from './input';

// The three mailboxes of the new website and «Otros trámites» (design of the new website, 19/11/2026: §4.2, §5, decision
// 5): the one contract the home, the menu, the mailbox screens, the endpoint, the database seed, the public road map and
// the panel build on. Names, hints and order; which kinds of request and which categories go in each; the three public
// states of a road report with their glyph and shape; and the shapes of what the neutral endpoint takes and gives back.
// Nothing here says which mailbox a person chose in an address, a title or a log: the choice lives only in the page's
// memory (src/components/participation/mailbox-intent.ts) and in the body of a send. Pure: server and browser share it.

// --- The mailboxes ---------------------------------------------------------------------------------------------------
/** Every mailbox, with «otros» last: the database's request_categories.mailbox takes these values. */
export const MAILBOX_IDS = ['ayudas', 'vias', 'corrupcion', 'otros'] as const;
export type MailboxId = (typeof MAILBOX_IDS)[number];

/** The three doors, in the order they show everywhere (the home, the menu, the footer and /atencion/buzones). */
export const DOOR_MAILBOXES = ['ayudas', 'vias', 'corrupcion'] as const satisfies readonly MailboxId[];
export type DoorMailbox = (typeof DOOR_MAILBOXES)[number];

export const MAILBOX_NAME: Record<DoorMailbox, string> = {
  ayudas: 'Buzón de ayudas',
  vias: 'Reporte de vías',
  corrupcion: 'Buzón de corrupción',
};

/** The door's one-line hint (§4.2): at 360 px it fits in one line under the name. */
export const MAILBOX_HINT: Record<DoorMailbox, string> = {
  ayudas: 'Medicinas, prótesis, vivienda y más',
  vias: 'Huecos, derrumbes, alumbrado',
  corrupcion: 'Anónimo: sin cuenta ni teléfono',
};

export const isMailboxId = (v: unknown): v is MailboxId => typeof v === 'string' && (MAILBOX_IDS as readonly string[]).includes(v);
export const isDoorMailbox = (v: unknown): v is DoorMailbox => typeof v === 'string' && (DOOR_MAILBOXES as readonly string[]).includes(v);

/** The ONE address of the three mailboxes (§5.1): whoever reads the host's logs cannot tell which one a person used.
 * The page's title is «Buzones · {site}»; the choice never goes into a path, query, fragment, title, history or storage. */
export const MAILBOXES_PATH = '/atencion/buzones';
export const MAILBOXES_LABEL = 'Buzones';

/** The old form links of the kinds that now have a mailbox: they answer 308 to MAILBOXES_PATH, without the query. */
export const MAILBOX_FORM_TYPES: readonly RequestType[] = ['peticion', 'denuncia'];

/** «Otros trámites»: what is not one of the three mailboxes, on the generic form (/atencion/nueva?tipo=…). Under the
 * doors, the first two are rows of their own; the other two live inside «Otros trámites». */
export const OTHER_PROCEDURES_LABEL = 'Otros trámites';
export const OTHER_PROCEDURES: readonly { type: RequestType; label: string; underDoors: boolean; href: string }[] = [
  { type: 'reporte', label: 'Reportar otro problema', underDoors: true, href: newRequestHref('reporte') },
  { type: 'acotacion', label: 'Dejar una acotación', underDoors: true, href: newRequestHref('acotacion') },
  { type: 'sugerencia', label: 'Enviar una sugerencia', underDoors: false, href: newRequestHref('sugerencia') },
  { type: 'reconocimiento', label: 'Enviar un reconocimiento', underDoors: false, href: newRequestHref('reconocimiento') },
];

/** Whether the mailboxes take sends. The real app (no demo) opens them only with both Turnstile keys; otherwise they say
 * «Disponibles pronto» and /admin/atencion warns. The demo always takes them: the published demo is a production build
 * in demo mode, so this is never decided by NODE_ENV. */
export function mailboxesOpen(o: { demo: boolean; turnstileKeys: boolean }): boolean {
  return o.demo || o.turnstileKeys;
}
export const MAILBOXES_CLOSED_TEXT = 'Disponibles pronto';

// --- What goes in each mailbox ---------------------------------------------------------------------------------------
/** The kinds of request each mailbox takes (the database's request_category_fits): a petición is always the Buzón de
 * ayudas, a denuncia always the Buzón de corrupción; a reporte is a road (vías) or another problem (otros). */
export const MAILBOX_TYPES: Record<MailboxId, readonly RequestType[]> = {
  ayudas: ['peticion'],
  vias: ['reporte'],
  corrupcion: ['denuncia'],
  otros: ['reporte', 'acotacion', 'sugerencia', 'reconocimiento'],
};

/** The kind of request each door's form sends. */
export const DOOR_TYPE: Record<DoorMailbox, RequestType> = { ayudas: 'peticion', vias: 'reporte', corrupcion: 'denuncia' };

export function typeFits(type: RequestType, mailbox: MailboxId): boolean {
  return MAILBOX_TYPES[mailbox].includes(type);
}

/** A category of a door's mailbox: its slug (the config's and the database's), its name on the screen, and whether it
 * is about health (sensitive: never published in «Casos atendidos», files only for the handling area and the
 * coordination). The «otros» mailbox keeps the categories it has today (OTHER_CATEGORY_RULES below). */
export type MailboxCategory = { slug: string; name: string; sensitive: boolean };

/** The categories of the three doors, in the order the forms show them (§5.2–5.4; decision 5: five for corruption, and
 * bridges and drains as two). The database's name is unique per mailbox, so «Salud» and «Educación» here live next to
 * the «otros» categories of the same name. */
export const MAILBOX_CATEGORIES: Record<DoorMailbox, readonly MailboxCategory[]> = {
  ayudas: [
    { slug: 'ayuda-medicinas', name: 'Medicinas', sensitive: true },
    { slug: 'ayuda-protesis', name: 'Prótesis', sensitive: true },
    { slug: 'ayuda-vivienda', name: 'Vivienda', sensitive: false },
    { slug: 'ayuda-alimentacion', name: 'Alimentación', sensitive: false },
    { slug: 'ayuda-salud', name: 'Salud', sensitive: true },
    { slug: 'ayuda-educacion', name: 'Educación', sensitive: false },
    { slug: 'ayuda-otra', name: 'Otra', sensitive: false },
  ],
  vias: [
    { slug: 'via-huecos', name: 'Huecos', sensitive: false },
    { slug: 'via-derrumbes', name: 'Derrumbes', sensitive: false },
    { slug: 'via-asfaltado', name: 'Asfaltado', sensitive: false },
    { slug: 'via-alumbrado', name: 'Alumbrado de la vía', sensitive: false },
    { slug: 'via-senalizacion', name: 'Señalización', sensitive: false },
    { slug: 'via-puentes', name: 'Puentes', sensitive: false },
    { slug: 'via-drenajes', name: 'Drenajes', sensitive: false },
  ],
  corrupcion: [
    { slug: 'corrupcion-cobros-indebidos', name: 'Cobros indebidos', sensitive: false },
    { slug: 'corrupcion-bienes-publicos', name: 'Uso indebido de bienes públicos', sensitive: false },
    { slug: 'corrupcion-obras-compras', name: 'Obras o compras irregulares', sensitive: false },
    { slug: 'corrupcion-abuso-funcionarios', name: 'Abuso de funcionarios', sensitive: false },
    { slug: 'corrupcion-otro-hecho', name: 'Otro hecho', sensitive: false },
  ],
};

/** The mailbox of a contract category's slug, or null (a category of «otros», or an unknown slug). */
export function mailboxOfCategory(slug: string): DoorMailbox | null {
  return DOOR_MAILBOXES.find((m) => MAILBOX_CATEGORIES[m].some((c) => c.slug === slug)) ?? null;
}

/** «otros» («Reportar otro problema» and the other procedures of the generic form) keeps today's categories: those of
 * config/clients/fb.json participation.categories that carry no mailbox of a door. Two of them have a rule of their own:
 *   - retired: the road category stays on the cases that have it (they stay where they are, in «otros») but is never
 *     offered for a new send: roads go to the Reporte de vías and its seven categories («¿Es una vía? Use el Reporte de
 *     vías.», §5.5); the fit check refuses it for a new send;
 *   - sensitive: health, like the door categories marked sensitive (never in «Casos atendidos», §4.2; files only for
 *     the handling area and the coordination, B18). */
export const OTHER_CATEGORY_RULES = { retired: ['vialidad'], sensitive: ['salud'] } as const satisfies Record<string, readonly string[]>;

/** Whether a category is retired: kept on the cases that have it, never offered for a new send. */
export function isRetiredCategory(slug: string): boolean {
  return (OTHER_CATEGORY_RULES.retired as readonly string[]).includes(slug);
}

/** Whether a category is about health: a door's marked one or one of «otros». Never shown in public. */
export function isSensitiveCategory(slug: string): boolean {
  const door = mailboxOfCategory(slug);
  if (door) return MAILBOX_CATEGORIES[door].some((c) => c.slug === slug && c.sensitive);
  return (OTHER_CATEGORY_RULES.sensitive as readonly string[]).includes(slug);
}

// --- The public states of a road report (§2.3, §5.7) -----------------------------------------------------------------
/** In legend order everywhere: Recibido · En camino · Arreglado. Never told by colour alone: each has a shape and a
 * glyph, the same chip in legends, tags and map markers. */
export const PUBLIC_STATES = ['recibido', 'en_camino', 'arreglado'] as const;
export type PublicState = (typeof PUBLIC_STATES)[number];

export const PUBLIC_STATE: Record<PublicState, { label: string; glyph: string; shape: 'hollow' | 'hatched' | 'solid' }> = {
  recibido: { label: 'Recibido', glyph: '•', shape: 'hollow' },
  en_camino: { label: 'En camino', glyph: '→', shape: 'hatched' },
  arreglado: { label: 'Arreglado', glyph: '✓', shape: 'solid' },
};

const PUBLIC_OF_STATE: Partial<Record<RequestState, PublicState>> = {
  recibido: 'recibido',
  en_revision: 'recibido',
  requiere_informacion: 'recibido',
  asignado: 'en_camino',
  en_atencion: 'en_camino',
  derivado: 'en_camino',
  resuelto: 'arreglado',
};

/** A case's public state, or null when it never counts in public: spam, a duplicate merged into another, «no procede»,
 * and «cerrado» without a resolution («cerrado» after a resolution counts as arreglado). Whether a vías report counts
 * at all (its consent, the team's first look or 48 hours) is the database's snapshot rule, not this. */
export function publicStateOf(c: { state: RequestState; resolvedAt: string | Date | null; isSpam?: boolean; duplicateOf?: string | null }): PublicState | null {
  if (c.isSpam || c.duplicateOf) return null;
  if (c.state === 'cerrado') return c.resolvedAt ? 'arreglado' : null;
  return PUBLIC_OF_STATE[c.state] ?? null;
}

// --- The neutral endpoint (§5.1) -------------------------------------------------------------------------------------
/** Every step that talks to the server goes to one address, whatever the mailbox; files go to a second one, with the
 * short-lived upload token of the send's answer. */
export const MAILBOX_ENDPOINTS = { send: '/api/atencion/enviar', files: '/api/atencion/adjuntos' } as const;

/** The steps of that one address, by the body's «paso»: «Empezar», «Otra frase», «¿Se suma?» (vías only) and «Enviar». */
export const ENDPOINT_STEPS = ['empezar', 'frase', 'parecidos', 'enviar'] as const;
export type EndpointStep = (typeof ENDPOINT_STEPS)[number];

/** How the browser calls them: no session cookie travels with a send, the referrer says only the site, nothing cached.
 * (`no-referrer` would null the Origin header that the server's same-origin check reads.) */
export const MAILBOX_FETCH_INIT = { method: 'POST', credentials: 'omit', referrerPolicy: 'strict-origin', cache: 'no-store' } as const satisfies RequestInit;

// --- The frase clave (§5.1; review B5 and B27) -----------------------------------------------------------------------
/** Four words from a list of 2,048 common words (44 bits), made by the SERVER (crypto.randomBytes), never by the browser
 * and never in a cached page: «Empezar» brings the first one, «Otra frase» asks for another (paso «frase»), and without
 * JavaScript the per-request answer of «Empezar» renders it. Each comes with a token, an HMAC over the send's key and
 * the phrase that is stored nowhere, so at «Enviar» the server knows a phrase sent as generated is one it made for this
 * key: a browser cannot pass a short phrase of its own as generated. A person's own phrase needs five words or more
 * (and WP2's phrase.ts refuses the code, the person's contact and obvious phrases). */
export const PHRASE_RULES = { generatedWords: 4, wordListSize: 2048, ownMinWords: 5 } as const;
export type GeneratedPhrase = { text: string; token: string };

/** The words of a person's own phrase, as the length rule counts them: what the spaces separate, with a letter or a
 * digit in it (a dash or a dot alone is no word). */
export function phraseWordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
export const ownPhraseLongEnough = (text: string) => phraseWordCount(text) >= PHRASE_RULES.ownMinWords;

/** The frase clave a send carries: «Usar esta frase» (one the server generated, with its token) or «Escribir mi propia
 * frase». */
export type PhraseChoice = { kind: 'generated'; text: string; token: string } | { kind: 'own'; text: string };

// --- The steps' bodies and answers -----------------------------------------------------------------------------------
/** «Empezar»: the server gives the send its key, the signed fill-time token (an HMAC over the key and the time it
 * started), a light proof-of-work challenge and the first generated phrase. With JavaScript it is this POST; without
 * it, the page's server action renders the same in its own answer. */
export type StartBody = { paso: 'empezar' };
export type ProofOfWorkChallenge = { salt: string; bits: number };
export type StartResponse =
  | { ok: true; key: string; fillToken: string; challenge: ProofOfWorkChallenge; phrase: GeneratedPhrase }
  | { ok: false; error: string };

/** «Otra frase»: another generated phrase for the same key. */
export type PhraseBody = { paso: 'frase'; key: string; fillToken: string };
export type PhraseResponse = { ok: true; phrase: GeneratedPhrase } | { ok: false; error: string };

/** «¿Se suma?» (§5.3; review B7), only in the Reporte de vías and only for a point the person agreed to show on the
 * public map: how many OPEN vías reports of the same category, among those sent with that consent (point_public_ok),
 * have their point in the same cell of about 100 m (SIMILAR_CELL_DEGREES) or an adjacent one. The answer is coarse and
 * never an id: 0 (no offer), 1, 2 or «3 o más». With «Sí, sumarme» the send says `sumarse` and the server finds the
 * case again from the request's category and point. The step goes through the network limit, as today's check does. */
export const SIMILAR_CELL_DEGREES = 0.0009;
export const SIMILAR_COUNTS = [0, 1, 2, '3+'] as const;
export type SimilarCount = (typeof SIMILAR_COUNTS)[number];
export function similarCountOf(n: number): SimilarCount {
  if (!(n >= 1)) return 0;
  return n >= 3 ? '3+' : n >= 2 ? 2 : 1;
}
export type SimilarBody = { paso: 'parecidos'; key: string; fillToken: string; categoryId: string; point: { lat: number; lng: number } };
export type SimilarResponse = { ok: true; similar: SimilarCount } | { ok: false; error: string };

/** The offer's sentence and its two answers (§5.3, §7). */
export function similarOfferText(n: Exclude<SimilarCount, 0>): string {
  const many = n === '3+' ? '3 o más reportes' : n === 2 ? '2 reportes' : '1 reporte';
  return `Ya hay ${many} de esto a unos 100 metros. ¿Se suma?`;
}
export const SIMILAR_JOIN_LABEL = 'Sí, sumarme';
export const SIMILAR_OTHER_LABEL = 'No, es otro problema';

/** «Enviar»: the mailbox travels in the body, never in the address. A send that misses a soft check (no Turnstile, no
 * proof of work…) is still accepted and goes to «Por revisar (posible envío masivo)». */
export type SendBody = {
  paso: 'enviar';
  buzon: MailboxId;
  key: string;
  fillToken: string;
  /** The proof of work's answer, or null (no JavaScript). */
  proof: string | null;
  /** Turnstile's token, or null (off in the demo, or no JavaScript). */
  turnstile: string | null;
  phrase: PhraseChoice;
  /** «Sí, sumarme» (vías only; false everywhere else, and the server refuses true elsewhere): a support of the open
   * case the server finds again. If none is open any more, it is filed as a new report: the answer is the same receipt
   * either way, as with the automatic join of a fourth report. */
  sumarse: boolean;
  request: RequestInput;
};

/** Whatever the one address takes. */
export type EndpointBody = StartBody | PhraseBody | SimilarBody | SendBody;

/** The receipt, the same for every mailbox: never its name or a link of its own. The upload token is null when the
 * send takes no files now (none chosen, or the hourly budget is spent: «texto sí, archivos después»). */
export type ReceiptResponse = { ok: true; reference: string; uploadToken: string | null };
export type SendFailure = { ok: false; error: string; field?: string };
export type SendResponse = ReceiptResponse | SendFailure;

/** The receipt's code of every new case: «AC-XXXX-XXXX-XXXX-XXXX», 80 bits in Crockford's base32, made by the app. The
 * old «AC-2026-XXXXXX» codes keep working where a code is typed (REFERENCE_PATTERN in receipt-code.ts). */
export const LONG_REFERENCE_PATTERN = /^AC-[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/;
