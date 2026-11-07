// The attention desk's words (copy audit §1, §6, F4): one text for each legal notice, the same in the client's config;
// the database's older messages said as «usted» on their way to the citizen, and still tied to real migrations; the
// emails never say the secret or the kind of request; and nothing the citizen reads on these pages speaks as «tú» or
// names «el equipo». All data invented. The server actions are mocked (nothing here touches the database).
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getClientConfig } from '@/lib/client-config';
import { DENUNCIA_NOTICE, EMERGENCY_NOTICE } from '@/lib/participation/notices';
import { CITIZEN_EMAIL_FOOTER, HOW_TO_CONSULT, receiptEmail, statusEmail } from '@/lib/participation/emails';
import { CONTACT_CHANNEL_OPTION, REQUEST_STATES, REQUEST_TYPES, REQUEST_TYPE_HINT } from '@/lib/participation/input';
import { receiptPdf } from '@/lib/participation/pdf';
import { DB_MESSAGES_SAID_AGAIN, citizenDbText, failureOf } from '@/lib/actions/participation-core';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }), usePathname: () => '/atencion' }));
vi.mock('@/lib/actions/participation', () => ({
  sendRequest: vi.fn(), sendRequestWithoutJs: vi.fn(), checkSimilar: vi.fn(), joinReport: vi.fn(), openCase: vi.fn(), addCaseInfo: vi.fn(),
  confirmCase: vi.fn(), closeCase: vi.fn(),
}));

const words = await import('@/components/participation/words');
const { StepWhat, StepWhere, StepDetail } = await import('@/components/participation/form-steps');
const { ContactFields, PrivacyCheck } = await import('@/components/participation/contact-fields');
const { SimilarOffer, JoinForm } = await import('@/components/participation/similar-offer');
const { ReceiptView } = await import('@/components/participation/receipt-view');
const { CaseView } = await import('@/components/participation/case-view');
const { NoJsForm } = await import('@/components/participation/no-js-form');
const { LookupForm } = await import('@/components/participation/lookup-form');
const { ErrorSummary } = await import('@/components/participation/error-summary');
const { DemoDataWarning } = await import('@/components/participation/demo-warning');
const { ParticipationNav } = await import('@/components/participation/participation-nav');
const { emptyValues } = await import('@/components/participation/form-core');
const { default: AttentionError } = await import('@/app/(web)/atencion/error');

const html = <P extends object>(c: (p: P) => unknown, p: P) => renderToStaticMarkup(createElement(c as never, p as never));
const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const noop = () => {};
const MUNIS = [{ id: '00000000-0000-4000-8000-0000000000a1', name: 'Torbes', slug: 'torbes', parishes: [] }];
const CATS = [{ id: '00000000-0000-4000-8000-0000000000c1', name: 'Agua', slug: 'agua', description: 'Falta de agua (demo).' }];

// Forms of «tú» that never mean anything else, and the words the house style leaves out of what a citizen reads.
const TU = /(?<!\p{L})(tu|tus|te|ti|contigo|quieres|puedes|tienes|sabes|cuéntanos|cuéntaselo|súmate|sumarme|dinos|inténtalo|actívalo|anótalos|guárdalos|mándala|escribiste|enviaste|dejaste|agregaste|contaste|perdiste|estabas|llenas|eres)(?!\p{L})/iu;
// «letras» as a count (the secret is, truly, letters and numbers).
const OFF = /el equipo|del equipo|\d+ letras|de punta a punta|de verdad|súmate|por completar/i;
function citizenReads(label: string, s: string) {
  expect(s, label).not.toMatch(TU);
  expect(s, label).not.toMatch(OFF);
}

describe('los dos avisos legales: un solo texto', () => {
  it('la configuración del cliente dice lo mismo que las constantes (el pie de la web y /canales leen esos ajustes)', () => {
    const settings = getClientConfig().web.settings as Record<string, unknown>;
    expect(settings['site.emergency_notice']).toBe(EMERGENCY_NOTICE);
    expect(settings['site.denuncia_notice']).toBe(DENUNCIA_NOTICE);
    expect(EMERGENCY_NOTICE.startsWith('Esto no es un servicio de emergencias.')).toBe(true);
    expect(DENUNCIA_NOTICE).toMatch(/acuda también a las autoridades competentes\.$/);
  });

  it('las condiciones de participación y la página «atencion» los citan tal cual', () => {
    const pages = getClientConfig().web.pages;
    const of = (slug: string) => JSON.stringify(pages.find((p) => p.slug === slug)!.draft);
    expect(of('condiciones-de-participacion')).toContain(EMERGENCY_NOTICE);
    expect(of('condiciones-de-participacion')).toContain(DENUNCIA_NOTICE);
    expect(of('atencion')).toContain(EMERGENCY_NOTICE);
  });

  it('las páginas legales y la de atención hablan de usted y dejan para los editores solo lo que falta de la consulta legal', () => {
    const pages = getClientConfig().web.pages;
    for (const slug of ['atencion', 'aviso-de-privacidad', 'condiciones-de-participacion', 'accesibilidad']) {
      const draft = pages.find((p) => p.slug === slug)!.draft as { blocks: { data: { content?: { type: string; text?: string }[] } }[] };
      // What the public reads (pending slots are the editors' notes, drawn only in the admin's preview).
      const shown = JSON.stringify(draft, (k, v) => (v && typeof v === 'object' && (v as { type?: string }).type === 'pending' ? undefined : v));
      expect(shown, slug).not.toMatch(TU);
      expect(shown, slug).not.toMatch(/el equipo|del equipo|¿Qué quieres/i);
    }
  });
});

describe('los mensajes de la base, dichos de usted', () => {
  const migrations = fs
    .readdirSync(path.resolve('supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .map((f) => fs.readFileSync(path.resolve('supabase/migrations', f), 'utf8'))
    .join('\n');

  it('cada mensaje que se vuelve a decir sigue siendo un mensaje de las migraciones, y su versión nueva no tutea', () => {
    expect(DB_MESSAGES_SAID_AGAIN.length).toBeGreaterThan(15);
    for (const m of DB_MESSAGES_SAID_AGAIN) {
      expect(migrations, m).toContain(`'${m}'`);
      citizenReads(m, citizenDbText(m));
    }
    expect(citizenDbText('Ese envío ya existe con otra clave.')).toBe('Ese envío ya existe con otra clave.');
  });

  it('failureOf los dice así: el límite de intentos (P0429) y los mensajes propios (P0001)', () => {
    const err = (code: string, message: string) => Object.assign(new Error(message), { code });
    expect(failureOf(err('P0429', 'Hiciste muchos intentos seguidos. Espera un rato y vuelve a intentarlo.'), 'prueba')).toEqual({
      ok: false, code: 'rate', error: 'Se hicieron demasiados intentos seguidos. Espere unos minutos e intente de nuevo.',
    });
    expect(failureOf(err('P0001', 'Esta solicitud ya está cerrada: si es otra cosa, envía una nueva.'), 'prueba').error).toBe(
      'Esta solicitud ya está cerrada. Si se trata de otro asunto, envíe una nueva.',
    );
  });
});

describe('los correos a la persona', () => {
  it('el de recibido y los de estado: el código, cómo consultar y el aviso de emergencias; nunca la clave ni el tipo', () => {
    const all = [
      receiptEmail('request', 'AC-2026-K7QM2H'),
      receiptEmail('support', 'AC-2026-K7QM2H'),
      ...(['state', 'reply', 'info_request', 'merged'] as const).flatMap((kind) =>
        (['owner', 'supporter', 'duplicate'] as const).flatMap((role) =>
          [...REQUEST_STATES, null].map((state) => ({ ...statusEmail(kind, { reference: 'AC-2026-K7QM2H', state, role }), role }))),
      ),
    ];
    for (const e of all) {
      const t = `${e.subject}\n${e.title}\n${e.body}`;
      expect(t).toContain('AC-2026-K7QM2H');
      expect(t).toContain('Consultar mi solicitud');
      expect(t).toContain('la clave no se envía por correo');
      expect(t).toContain(EMERGENCY_NOTICE);
      expect(t).not.toMatch(/denuncia|petici[oó]n|acotaci[oó]n|sugerencia|reconocimiento|nota interna|K7QM-2HXP/i);
      citizenReads(e.subject, t);
    }
    // Only who supported a report reads that word.
    expect(statusEmail('state', { reference: 'AC-2026-K7QM2H', state: 'resuelto', role: 'owner' }).body).not.toMatch(/reporte/i);
    expect(statusEmail('state', { reference: 'AC-2026-K7QM2H', state: 'en_atencion' }).subject).toBe('Su solicitud AC-2026-K7QM2H: En atención');
    expect(receiptEmail('request', 'AC-2026-K7QM2H').subject).toBe('Recibimos su solicitud AC-2026-K7QM2H');
    citizenReads('pie', `${CITIZEN_EMAIL_FOOTER} ${HOW_TO_CONSULT}`);
  });

  it('el PDF del comprobante: de usted, con el aviso de emergencias y sin el nombre de la herramienta interna', () => {
    for (const support of [false, true]) {
      const s = Buffer.from(receiptPdf({ siteName: 'Gobernación (demo)', reference: 'AC-2026-K7QM2H', secret: 'K7QM-2HXP-9WRT-4BNE', typeLabel: 'Reporte', sentAt: '6 de noviembre de 2026', lookupUrl: 'https://ejemplo.test/atencion/consultar', support })).toString('latin1');
      expect(s).not.toContain('/Producer');
      expect(s).toContain('(Comprobante de su solicitud) Tj');
      expect(s).not.toMatch(/\(Guarda |compartas|Te sumaste/);
    }
  });
});

describe('lo que lee la persona en el formulario, el comprobante y la consulta', () => {
  it('las palabras de cada tipo y de cada estado, y los medios de contacto', () => {
    for (const t of REQUEST_TYPES) {
      expect(words.TYPE_COPY[t].hint).toBe(REQUEST_TYPE_HINT[t]);
      citizenReads(t, `${words.TYPE_COPY[t].action} ${words.TYPE_COPY[t].hint} ${words.DETAIL_COPY[t].title} ${words.DETAIL_COPY[t].description}`);
    }
    for (const s of REQUEST_STATES) citizenReads(s, `${words.STATE_PLAIN[s].label} ${words.STATE_PLAIN[s].text} ${words.timelineLine({ kind: 'state', state: s })}`);
    for (const k of ['created', 'merged', 'citizen_confirmed', 'citizen_not_resolved', 'public_reply', 'info_request', 'citizen_message', 'support'] as const) {
      citizenReads(k, words.timelineLine({ kind: k }));
    }
    citizenReads('canales', Object.values(CONTACT_CHANNEL_OPTION).join(' '));
  });

  it('los pasos, el contacto, el apoyo, el comprobante, la consulta y el formulario sin JavaScript', () => {
    const denuncia = { ...emptyValues(), type: 'denuncia' as const };
    const reporte = { ...emptyValues(), type: 'reporte' as const, name: 'Ana (prueba)' };
    const receipt = {
      reference: 'AC-2026-K7QM2H', secret: 'K7QM-2HXP-9WRT-4BNE', kind: 'request' as const, sentAt: '2026-11-06T14:30:00.000Z', type: 'denuncia' as const,
      files: [
        { id: 'f1', name: 'foto.jpg', size: 120_000, status: 'failed' as const, error: 'No se pudo subir. Revise la señal e intente de nuevo.' },
        { id: 'f2', name: 'acta.pdf', size: 90_000, status: 'lost' as const },
      ],
      emailNote: true, saved: false,
    };
    const request = {
      reference: 'AC-2026-K7QM2H', type: 'reporte' as const, category: 'Agua', municipality: 'Torbes', state: 'requiere_informacion' as const, supportCount: 2,
      createdAt: '2026-11-06T14:30:00.000Z', updatedAt: '2026-11-06T14:30:00.000Z', resolvedAt: null, canAddInfo: true, canConfirm: true,
      title: 'Bote de agua (demo)', description: 'Sale agua (demo).', anonymous: false, hasLocation: true, merged: true, mainState: 'en_atencion' as const,
    };
    const timeline = (['created', 'info_request', 'citizen_message', 'public_reply', 'citizen_confirmed', 'support'] as const).map((kind) => ({
      at: '2026-11-06T14:30:00.000Z', kind, by: kind.startsWith('citizen') || kind === 'created' || kind === 'support' ? ('citizen' as const) : ('team' as const), body: 'Texto (demo).',
    }));
    const pieces: [string, string][] = [
      ['paso 1', html(StepWhat, { v: denuncia, set: noop, errors: {}, categories: CATS })],
      ['paso 2, denuncia', html(StepWhere, { v: denuncia, set: noop, errors: {}, municipalities: MUNIS })],
      ['paso 2, reporte', html(StepWhere, { v: { ...emptyValues(), type: 'sugerencia' as const }, set: noop, errors: {}, municipalities: MUNIS })],
      ['paso 3', html(StepDetail, { v: denuncia, set: noop, errors: {}, today: '2026-11-06', files: [], onFiles: noop, maxFileBytes: 8 * 1024 * 1024, remembered: ['foto.jpg'] })],
      ['contacto', html(ContactFields, { v: reporte, set: noop, errors: {} })],
      ['anónimo', html(ContactFields, { v: { ...reporte, anonymous: true }, set: noop, errors: {} })],
      ['privacidad', html(PrivacyCheck, { checked: false, onChange: noop })],
      ['parecidos', html(SimilarOffer, { count: 1, onJoin: noop, onSkip: noop })],
      ['apoyo', html(JoinForm, { v: reporte, set: noop, errors: {}, sending: false, onSubmit: noop, onBack: noop, hpRef: null, turnstileSiteKey: null, onToken: noop, turnstileReset: 0 })],
      ['resumen de errores', html(ErrorSummary, { errors: { title: 'x', description: 'y' } })],
      ['comprobante', html(ReceiptView, { receipt, siteName: 'Gobernación (demo)', onRetry: noop, onSaved: noop, onNew: noop })],
      ['comprobante de un apoyo', html(ReceiptView, { receipt: { ...receipt, kind: 'support' as const, type: 'reporte' as const, emailNote: false }, siteName: 'x', onRetry: noop, onSaved: noop, onNew: noop })],
      ['consulta', html(CaseView, { view: { status: 'ok' as const, kind: 'request' as const, timeline, attachments: [], request: { ...request, citizenConfirmation: 'resolved' as const } }, maxFileBytes: 8 * 1024 * 1024 })],
      ['consulta de un apoyo', html(CaseView, { view: { status: 'ok' as const, kind: 'support' as const, timeline, attachments: [], request: { ...request, note: 'También (demo).' } }, maxFileBytes: 8 * 1024 * 1024 })],
      ['sin JavaScript', html(NoJsForm, { municipalities: MUNIS, categories: CATS, formKey: '00000000-0000-4000-8000-00000000f001', linkedItemId: null, presetType: null, today: '2026-11-06' })],
      ['sin JavaScript con Turnstile', html(NoJsForm, { municipalities: MUNIS, categories: CATS, formKey: '00000000-0000-4000-8000-00000000f001', linkedItemId: null, presetType: null, today: '2026-11-06', turnstileOn: true })],
      ['consultar', html(LookupForm, { notice: null })],
      ['aviso de prueba', html(DemoDataWarning, { demo: true })],
      ['menú', html(ParticipationNav, { current: 'inicio' })],
      ['error al cargar', html(AttentionError, { error: new Error('prueba'), reset: noop })],
    ];
    for (const [label, markup] of pieces) citizenReads(label, text(markup));
    const all = pieces.map(([, m]) => text(m)).join(' ');
    // The two notices, whole, where they go; the new names where the old ones were.
    expect(all).toContain(EMERGENCY_NOTICE);
    expect(all).toContain(DENUNCIA_NOTICE);
    for (const t of ['Historial de la solicitud', 'Apoyar este reporte', 'caracteres', 'Casos atendidos', 'No se pudo cargar la página']) expect(all).toContain(t);
    expect(text(html(NoJsForm, { municipalities: MUNIS, categories: CATS, formKey: '00000000-0000-4000-8000-00000000f001', linkedItemId: null, presetType: null, today: '2026-11-06' })))
      .toContain('Si no marca esta casilla, solo se publicarán sus iniciales.');
  });
});
