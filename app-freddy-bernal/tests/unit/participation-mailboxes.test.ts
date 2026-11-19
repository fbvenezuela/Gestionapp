// The mailboxes' contract (src/lib/participation/mailboxes.ts, design of the new website §4.2 and §5) and the door's
// one-shot memory (src/components/participation/mailbox-intent.ts): the names, hints and order every package shows; the
// kinds of request and the categories of each mailbox; the three public states; the endpoint's shapes; and a tapped door
// that lives only in the page's memory, never in storage, the address, the title or the history.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { getClientConfig } from '@/lib/client-config';
import { REQUEST_STATES, REQUEST_TYPES, type RequestState } from '@/lib/participation/input';
import { REFERENCE_PATTERN } from '@/lib/participation/receipt-code';
import { PUBLIC_SEGMENTS } from '@/lib/web/routes';
import {
  DOOR_MAILBOXES, DOOR_TYPE, ENDPOINT_STEPS, LONG_REFERENCE_PATTERN, MAILBOXES_CLOSED_TEXT, MAILBOXES_PATH, MAILBOX_CATEGORIES,
  MAILBOX_ENDPOINTS, MAILBOX_FETCH_INIT, MAILBOX_FORM_TYPES, MAILBOX_HINT, MAILBOX_IDS, MAILBOX_NAME, MAILBOX_TYPES, OTHER_CATEGORY_RULES,
  OTHER_PROCEDURES, OTHER_PROCEDURES_LABEL, PHRASE_RULES, PUBLIC_STATE, PUBLIC_STATES, SIMILAR_CELL_DEGREES, SIMILAR_COUNTS,
  SIMILAR_JOIN_LABEL, SIMILAR_OTHER_LABEL, isDoorMailbox, isMailboxId, isRetiredCategory, isSensitiveCategory, mailboxOfCategory,
  mailboxesOpen, ownPhraseLongEnough, phraseWordCount, publicStateOf, similarCountOf, similarOfferText, typeFits,
  type EndpointBody, type GeneratedPhrase, type PhraseChoice, type PhraseResponse, type ReceiptResponse, type SendBody, type SendResponse,
  type SimilarBody, type SimilarResponse, type StartResponse,
} from '@/lib/participation/mailboxes';
import {
  MAILBOX_INTENT_TTL_MS, clearMailboxIntent, peekMailboxIntent, setMailboxIntent, takeMailboxIntent,
} from '@/components/participation/mailbox-intent';

describe('los tres buzones: nombres, pistas y orden', () => {
  it('ayudas, vías y corrupción, en ese orden, con sus nombres y su pista de una línea; «otros» al final', () => {
    expect(MAILBOX_IDS).toEqual(['ayudas', 'vias', 'corrupcion', 'otros']);
    expect(DOOR_MAILBOXES).toEqual(['ayudas', 'vias', 'corrupcion']);
    expect(DOOR_MAILBOXES.map((m) => MAILBOX_NAME[m])).toEqual(['Buzón de ayudas', 'Reporte de vías', 'Buzón de corrupción']);
    expect(DOOR_MAILBOXES.map((m) => MAILBOX_HINT[m])).toEqual(['Medicinas, prótesis, vivienda y más', 'Huecos, derrumbes, alumbrado', 'Anónimo: sin cuenta ni teléfono']);
    // One line under the name at 360 px; no period, no numbering (the doors carry no 01–03).
    for (const m of DOOR_MAILBOXES) expect(MAILBOX_HINT[m].length, m).toBeLessThanOrEqual(36);
    for (const m of DOOR_MAILBOXES) expect(MAILBOX_HINT[m]).not.toMatch(/\.$|\d/);
    expect(isMailboxId('otros')).toBe(true);
    expect(isDoorMailbox('otros')).toBe(false);
    expect(isDoorMailbox('denuncia')).toBe(false);
  });

  it('una sola dirección para los tres, dentro de la sección pública «atencion»; las viejas de petición y denuncia van a ella', () => {
    expect(MAILBOXES_PATH).toBe('/atencion/buzones');
    expect(PUBLIC_SEGMENTS).toContain(MAILBOXES_PATH.split('/')[1]);
    expect(MAILBOX_FORM_TYPES).toEqual(['peticion', 'denuncia']);
    // No mailbox's name or id in the address (the choice is never in a path, query or fragment).
    for (const m of MAILBOX_IDS) expect(MAILBOXES_PATH).not.toContain(m);
  });

  it('«Otros trámites»: «Reportar otro problema» y «Dejar una acotación» a la vista; sugerencia y reconocimiento adentro', () => {
    expect(OTHER_PROCEDURES_LABEL).toBe('Otros trámites');
    expect(OTHER_PROCEDURES.map((o) => [o.label, o.underDoors, o.href])).toEqual([
      ['Reportar otro problema', true, '/atencion/nueva?tipo=reporte'],
      ['Dejar una acotación', true, '/atencion/nueva?tipo=acotacion'],
      ['Enviar una sugerencia', false, '/atencion/nueva?tipo=sugerencia'],
      ['Enviar un reconocimiento', false, '/atencion/nueva?tipo=reconocimiento'],
    ]);
    for (const o of OTHER_PROCEDURES) expect(typeFits(o.type, 'otros'), o.type).toBe(true);
  });

  it('abiertos siempre en la demo (aunque sea una construcción de producción); en la app real solo con las dos claves de Turnstile', () => {
    expect(mailboxesOpen({ demo: true, turnstileKeys: false })).toBe(true);
    expect(mailboxesOpen({ demo: true, turnstileKeys: true })).toBe(true);
    expect(mailboxesOpen({ demo: false, turnstileKeys: true })).toBe(true);
    expect(mailboxesOpen({ demo: false, turnstileKeys: false })).toBe(false);
    expect(MAILBOXES_CLOSED_TEXT).toBe('Disponibles pronto');
    // Never NODE_ENV: the rule reads only what it is given (comments aside).
    const code = fs.readFileSync(path.join('src', 'lib', 'participation', 'mailboxes.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/NODE_ENV|process\.env/);
  });
});

describe('qué va en cada buzón', () => {
  it('la petición solo en ayudas, la denuncia solo en corrupción, el reporte en vías u otros; los demás en otros', () => {
    for (const t of REQUEST_TYPES) expect(MAILBOX_IDS.some((m) => typeFits(t, m)), t).toBe(true);
    expect(MAILBOX_IDS.filter((m) => typeFits('peticion', m))).toEqual(['ayudas']);
    expect(MAILBOX_IDS.filter((m) => typeFits('denuncia', m))).toEqual(['corrupcion']);
    expect(MAILBOX_IDS.filter((m) => typeFits('reporte', m))).toEqual(['vias', 'otros']);
    for (const t of ['acotacion', 'sugerencia', 'reconocimiento'] as const) expect(MAILBOX_IDS.filter((m) => typeFits(t, m))).toEqual(['otros']);
    for (const m of DOOR_MAILBOXES) expect(MAILBOX_TYPES[m]).toEqual([DOOR_TYPE[m]]);
  });

  it('las categorías: 7 de ayudas, 7 de vías y 5 de corrupción, en el orden del diseño', () => {
    expect(MAILBOX_CATEGORIES.ayudas.map((c) => c.name)).toEqual(['Medicinas', 'Prótesis', 'Vivienda', 'Alimentación', 'Salud', 'Educación', 'Otra']);
    expect(MAILBOX_CATEGORIES.vias.map((c) => c.name)).toEqual(['Huecos', 'Derrumbes', 'Asfaltado', 'Alumbrado de la vía', 'Señalización', 'Puentes', 'Drenajes']);
    expect(MAILBOX_CATEGORIES.corrupcion.map((c) => c.name)).toEqual([
      'Cobros indebidos', 'Uso indebido de bienes públicos', 'Obras o compras irregulares', 'Abuso de funcionarios', 'Otro hecho',
    ]);
  });

  it('cada categoría con un slug que la base acepta y que no repite otro; las de salud son sensibles y solo están en ayudas', () => {
    const all = DOOR_MAILBOXES.flatMap((m) => MAILBOX_CATEGORIES[m].map((c) => ({ ...c, m })));
    expect(new Set(all.map((c) => c.slug)).size).toBe(all.length);
    for (const c of all) {
      // request_categories: slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$', at most 60; a name of 2 to 80.
      expect(c.slug, c.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(c.slug.length).toBeLessThanOrEqual(60);
      expect(c.name.trim().length).toBeGreaterThanOrEqual(2);
      expect(mailboxOfCategory(c.slug)).toBe(c.m);
    }
    for (const m of DOOR_MAILBOXES) expect(new Set(MAILBOX_CATEGORIES[m].map((c) => c.name.toLowerCase())).size, m).toBe(MAILBOX_CATEGORIES[m].length);
    expect(all.filter((c) => c.sensitive).map((c) => c.name)).toEqual(['Medicinas', 'Prótesis', 'Salud']);
    expect(mailboxOfCategory('agua')).toBeNull();
  });

  it('con la configuración del cliente: ningún slug del contrato pisa una categoría de hoy con otro nombre', () => {
    const today = getClientConfig().participation.categories as { slug: string; name: string }[];
    for (const c of DOOR_MAILBOXES.flatMap((m) => MAILBOX_CATEGORIES[m])) {
      const same = today.find((t) => t.slug === c.slug);
      if (same) expect(same.name, c.slug).toBe(c.name);
    }
  });

  it('«otros» guarda las de hoy: la de vías ya no se ofrece (sus casos se quedan) y la de salud es sensible', () => {
    expect(OTHER_CATEGORY_RULES).toEqual({ retired: ['vialidad'], sensitive: ['salud'] });
    expect(isRetiredCategory('vialidad')).toBe(true);
    for (const c of DOOR_MAILBOXES.flatMap((m) => MAILBOX_CATEGORIES[m])) expect(isRetiredCategory(c.slug), c.slug).toBe(false);
    expect(isRetiredCategory('agua')).toBe(false);
    // Health is sensitive wherever it lives: the doors' marked ones and «otros» «Salud» (never in «Casos atendidos»).
    expect(DOOR_MAILBOXES.flatMap((m) => MAILBOX_CATEGORIES[m]).filter((c) => isSensitiveCategory(c.slug)).map((c) => c.slug)).toEqual([
      'ayuda-medicinas', 'ayuda-protesis', 'ayuda-salud',
    ]);
    expect(isSensitiveCategory('salud')).toBe(true);
    for (const s of ['agua', 'educacion', 'vialidad', 'otros', 'no-existe']) expect(isSensitiveCategory(s), s).toBe(false);
  });

  it('con la configuración del cliente: las reglas de «otros» nombran categorías que existen, sin buzón de una puerta', () => {
    // The config's categories without a door's mailbox are «otros»; one that carries a mailbox (WP2 marks the doors'
    // ones) must be that door's, by slug and name.
    const today = getClientConfig().participation.categories as { slug: string; name: string; mailbox?: string }[];
    const others = today.filter((c) => !c.mailbox);
    for (const slug of [...OTHER_CATEGORY_RULES.retired, ...OTHER_CATEGORY_RULES.sensitive]) {
      expect(others.map((c) => c.slug), slug).toContain(slug);
      expect(mailboxOfCategory(slug), slug).toBeNull();
    }
    for (const c of others) expect(mailboxOfCategory(c.slug), c.slug).toBeNull();
    for (const c of today.filter((t) => t.mailbox)) {
      expect(isDoorMailbox(c.mailbox), c.slug).toBe(true);
      expect(MAILBOX_CATEGORIES[c.mailbox as (typeof DOOR_MAILBOXES)[number]].find((d) => d.slug === c.slug)?.name, c.slug).toBe(c.name);
    }
    // At least one category stays to offer in «Reportar otro problema».
    expect(others.filter((c) => !isRetiredCategory(c.slug)).length).toBeGreaterThan(0);
  });
});

describe('los tres estados públicos de un reporte de vías', () => {
  it('Recibido · En camino · Arreglado, cada uno con su forma y su signo (nunca solo el color)', () => {
    expect(PUBLIC_STATES.map((s) => [PUBLIC_STATE[s].label, PUBLIC_STATE[s].glyph, PUBLIC_STATE[s].shape])).toEqual([
      ['Recibido', '•', 'hollow'],
      ['En camino', '→', 'hatched'],
      ['Arreglado', '✓', 'solid'],
    ]);
    expect(new Set(PUBLIC_STATES.map((s) => PUBLIC_STATE[s].glyph)).size).toBe(3);
  });

  it('cada estado del caso va a uno público; «no procede», el cerrado sin resolver, el spam y el duplicado no cuentan', () => {
    const of = (state: RequestState, extra: Partial<Parameters<typeof publicStateOf>[0]> = {}) => publicStateOf({ state, resolvedAt: null, ...extra });
    expect(Object.fromEntries(REQUEST_STATES.map((s) => [s, of(s)]))).toEqual({
      recibido: 'recibido', en_revision: 'recibido', requiere_informacion: 'recibido',
      asignado: 'en_camino', en_atencion: 'en_camino', derivado: 'en_camino',
      resuelto: 'arreglado', cerrado: null, no_procede: null,
    });
    expect(of('cerrado', { resolvedAt: '2026-11-10T14:00:00Z' })).toBe('arreglado');
    expect(of('resuelto', { isSpam: true })).toBeNull();
    expect(of('en_atencion', { duplicateOf: '00000000-0000-4000-8000-000000000001' })).toBeNull();
  });
});

describe('lo que el punto neutro recibe y devuelve', () => {
  it('dos direcciones neutras para los tres buzones, y el navegador las llama sin galletas y con el origen solo', () => {
    expect(MAILBOX_ENDPOINTS).toEqual({ send: '/api/atencion/enviar', files: '/api/atencion/adjuntos' });
    for (const p of Object.values(MAILBOX_ENDPOINTS)) for (const m of MAILBOX_IDS) expect(p).not.toContain(m);
    expect(MAILBOX_FETCH_INIT).toEqual({ method: 'POST', credentials: 'omit', referrerPolicy: 'strict-origin', cache: 'no-store' });
  });

  it('el comprobante tiene la misma forma en los tres: {ok, reference, uploadToken} y nada que diga el buzón', () => {
    const receipt: ReceiptResponse = { ok: true, reference: 'AC-7K2M-9QXP-4BNE-W8RT', uploadToken: null };
    expect(Object.keys(receipt).sort()).toEqual(['ok', 'reference', 'uploadToken']);
    expectTypeOf<keyof ReceiptResponse>().toEqualTypeOf<'ok' | 'reference' | 'uploadToken'>();
    expectTypeOf<Extract<SendResponse, { ok: true }>>().toEqualTypeOf<ReceiptResponse>();
    expectTypeOf<Extract<StartResponse, { ok: true }>>().toHaveProperty('fillToken');
    expectTypeOf<SendBody['buzon']>().toEqualTypeOf<(typeof MAILBOX_IDS)[number]>();
    expectTypeOf<SendBody['paso']>().toEqualTypeOf<'enviar'>();
  });

  it('una sola dirección con cuatro pasos: empezar, otra frase, «¿Se suma?» y enviar', () => {
    expect(ENDPOINT_STEPS).toEqual(['empezar', 'frase', 'parecidos', 'enviar']);
    expectTypeOf<EndpointBody['paso']>().toEqualTypeOf<(typeof ENDPOINT_STEPS)[number]>();
    expectTypeOf<SendBody['sumarse']>().toEqualTypeOf<boolean>();
  });

  it('la frase clave la hace el servidor (con su ficha), nunca el navegador; la propia lleva cinco palabras o más', () => {
    expect(PHRASE_RULES).toEqual({ generatedWords: 4, wordListSize: 2048, ownMinWords: 5 });
    // 4 words of 2,048: 44 bits.
    expect(PHRASE_RULES.generatedWords * Math.log2(PHRASE_RULES.wordListSize)).toBe(44);
    // «Empezar» and «Otra frase» bring a generated phrase with its token; a send says which kind it carries, and only a
    // generated one carries a token (the server checks it against the key: a browser cannot pass its own as generated).
    expectTypeOf<Extract<StartResponse, { ok: true }>['phrase']>().toEqualTypeOf<GeneratedPhrase>();
    expectTypeOf<Extract<PhraseResponse, { ok: true }>['phrase']>().toEqualTypeOf<GeneratedPhrase>();
    expectTypeOf<keyof GeneratedPhrase>().toEqualTypeOf<'text' | 'token'>();
    expectTypeOf<PhraseChoice['kind']>().toEqualTypeOf<'generated' | 'own'>();
    expectTypeOf<Extract<PhraseChoice, { kind: 'own' }>>().not.toHaveProperty('token');
    expect(phraseWordCount('  caballo  verde   luna  río ')).toBe(4);
    expect(phraseWordCount('mi perro come mango - todos . los días')).toBe(7);
    expect(phraseWordCount('')).toBe(0);
    expect(ownPhraseLongEnough('caballo verde luna río')).toBe(false);
    expect(ownPhraseLongEnough('caballo verde luna río montaña')).toBe(true);
    expect(ownPhraseLongEnough('a - b - c . d')).toBe(false);
  });

  it('«¿Se suma?»: solo cuántos (0, 1, 2 o «3 o más»), nunca cuál; la persona elige «Sí, sumarme» o «No, es otro problema»', () => {
    expect(SIMILAR_CELL_DEGREES).toBe(0.0009);
    expect(SIMILAR_COUNTS).toEqual([0, 1, 2, '3+']);
    expect([-1, 0, 0.5, 1, 2, 3, 4, 250, Number.NaN].map(similarCountOf)).toEqual([0, 0, 0, 1, 2, '3+', '3+', '3+', 0]);
    expect(similarOfferText('3+')).toBe('Ya hay 3 o más reportes de esto a unos 100 metros. ¿Se suma?');
    expect(similarOfferText(2)).toBe('Ya hay 2 reportes de esto a unos 100 metros. ¿Se suma?');
    expect(similarOfferText(1)).toBe('Ya hay 1 reporte de esto a unos 100 metros. ¿Se suma?');
    expect([SIMILAR_JOIN_LABEL, SIMILAR_OTHER_LABEL]).toEqual(['Sí, sumarme', 'No, es otro problema']);
    // No id goes to the browser: the answer is the coarse count only, and the body carries the person's own point.
    expectTypeOf<keyof Extract<SimilarResponse, { ok: true }>>().toEqualTypeOf<'ok' | 'similar'>();
    expectTypeOf<keyof SimilarBody>().toEqualTypeOf<'paso' | 'key' | 'fillToken' | 'categoryId' | 'point'>();
  });

  it('el código nuevo: AC y cuatro grupos de cuatro (80 bits, Crockford); el viejo sigue siendo otro patrón', () => {
    expect(LONG_REFERENCE_PATTERN.test('AC-7K2M-9QXP-4BNE-W8RT')).toBe(true);
    for (const bad of ['AC-2026-K7QM2H', 'AC-7K2M-9QXP-4BNE', 'AC-7K2M-9QXP-4BNE-W8RU', 'ac-7k2m-9qxp-4bne-w8rt', 'AC-7K2M-9QXP-4BNE-W8RT-0000']) {
      expect(LONG_REFERENCE_PATTERN.test(bad), bad).toBe(false);
    }
    expect(REFERENCE_PATTERN.test('AC-2026-K7QM2H')).toBe(true);
    expect(REFERENCE_PATTERN.test('AC-7K2M-9QXP-4BNE-W8RT')).toBe(false);
  });
});

describe('la puerta elegida vive solo en la memoria de la página (mailbox-intent)', () => {
  afterEach(() => {
    clearMailboxIntent();
    vi.unstubAllGlobals();
  });

  it('se usa una vez: la página la mira, la abre y la olvida', () => {
    vi.stubGlobal('window', {});
    expect(setMailboxIntent('vias', 1_000)).toBe(true);
    expect(peekMailboxIntent(1_500)).toBe('vias');
    expect(peekMailboxIntent(1_600)).toBe('vias');
    clearMailboxIntent();
    expect(peekMailboxIntent(1_700)).toBeNull();
    expect(setMailboxIntent('corrupcion', 2_000)).toBe(true);
    expect(takeMailboxIntent(2_100)).toBe('corrupcion');
    expect(takeMailboxIntent(2_200)).toBeNull();
  });

  it('un toque viejo no elige por la persona; solo las tres puertas; en el servidor nunca se guarda nada', () => {
    vi.stubGlobal('window', {});
    setMailboxIntent('ayudas', 10_000);
    expect(peekMailboxIntent(10_000 + MAILBOX_INTENT_TTL_MS)).toBe('ayudas');
    expect(peekMailboxIntent(10_001 + MAILBOX_INTENT_TTL_MS)).toBeNull();
    expect(peekMailboxIntent(10_002)).toBeNull();
    setMailboxIntent('ayudas', 20_000);
    expect(peekMailboxIntent(19_000)).toBeNull();
    expect(setMailboxIntent('otros' as never, 30_000)).toBe(false);
    expect(peekMailboxIntent(30_000)).toBeNull();
    vi.unstubAllGlobals();
    expect(typeof window).toBe('undefined');
    expect(setMailboxIntent('ayudas', 40_000)).toBe(false);
    expect(peekMailboxIntent(40_000)).toBeNull();
  });

  it('nunca toca el almacenamiento, la dirección, el título, el historial ni las galletas', () => {
    const src = fs.readFileSync(path.join('src', 'components', 'participation', 'mailbox-intent.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.(title|cookie)|history\.|location|URLSearchParams|cookie|caches\./);
    expect(src.trimStart().startsWith("'use client';")).toBe(true);
  });
});
