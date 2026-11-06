// What the participation components draw (design §4), rendered on the server as the pages do: the emergency line on
// every form and on the receipt, the denuncia's notice (private, «acude también a las autoridades competentes»), the
// receipt with its code and secret (never as a link or an address), the consultation of a support that never shows the
// other person's text, and the form without JavaScript that says the truth when Turnstile needs JavaScript. All data
// invented. The server actions are mocked (nothing here touches the database).
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }), usePathname: () => '/atencion' }));
vi.mock('@/lib/actions/participation', () => ({
  sendRequest: vi.fn(), sendRequestWithoutJs: vi.fn(), checkSimilar: vi.fn(), joinReport: vi.fn(), openCase: vi.fn(), addCaseInfo: vi.fn(),
  confirmCase: vi.fn(), closeCase: vi.fn(),
}));

const { NoJsForm } = await import('@/components/participation/no-js-form');
const { ReceiptView } = await import('@/components/participation/receipt-view');
const { CaseView } = await import('@/components/participation/case-view');
const { StepWhat, StepWhere } = await import('@/components/participation/form-steps');
const { emptyValues } = await import('@/components/participation/form-core');

const html = <P extends object>(c: (p: P) => unknown, p: P) => renderToStaticMarkup(createElement(c as never, p as never));
const EMERGENCY = 'Esto no es un servicio de emergencias.';
const AUTHORITIES = 'acude también a las autoridades competentes';
const MUNIS = [{ id: '00000000-0000-4000-8000-0000000000a1', name: 'Torbes', slug: 'torbes', parishes: [] }];
const CATS = [{ id: '00000000-0000-4000-8000-0000000000c1', name: 'Agua', slug: 'agua', description: 'Falta de agua (demo).' }];
const noop = () => {};

describe('el formulario', () => {
  it('una denuncia avisa que es privada y que también se acude a las autoridades; nunca pide el punto exacto', () => {
    const v = { ...emptyValues(), type: 'denuncia' as const };
    const what = html(StepWhat, { v, set: noop, errors: {}, categories: CATS });
    expect(what).toContain('Una denuncia es privada');
    expect(what).toContain(AUTHORITIES);
    const where = html(StepWhere, { v, set: noop, errors: {}, municipalities: MUNIS });
    expect(where).toContain('solo el lugar aproximado');
    expect(where).not.toContain('Usar mi ubicación');
    expect(where).not.toContain('Punto de referencia');
    // A report does offer the location, only if the person wants it.
    const report = html(StepWhere, { v: { ...emptyValues(), type: 'reporte' as const }, set: noop, errors: {}, municipalities: MUNIS });
    expect(report).toContain('Usar mi ubicación');
    expect(report).toContain('Marcar en el mapa');
    expect(report).toContain('(opcional)');
  });

  it('un error queda atado a su campo (aria-invalid y aria-describedby con el id del mensaje)', () => {
    const where = html(StepWhere, { v: { ...emptyValues(), type: 'reporte' as const }, set: noop, errors: { municipalityId: 'Elige el municipio.' }, municipalities: MUNIS });
    expect(where).toMatch(/<select[^>]*id="f-municipalityId"[^>]*aria-invalid="true"[^>]*aria-describedby="f-municipalityId-error"/);
    expect(where).toContain('id="f-municipalityId-error"');
  });
});

describe('sin JavaScript', () => {
  const props = { municipalities: MUNIS, categories: CATS, formKey: '00000000-0000-4000-8000-00000000f001', linkedItemId: null, presetType: null, today: '2026-11-06' };

  it('el formulario completo de una página, con el aviso de emergencias y el campo trampa', () => {
    const out = html(NoJsForm, props);
    expect(out).toContain('Tu navegador no tiene JavaScript activo');
    expect(out).toContain('name="submissionKey"');
    expect(out).toContain('name="sitio_web"');
    expect(out).toContain(EMERGENCY);
    expect(out).toContain(AUTHORITIES);
  });

  it('con Turnstile encendido dice la verdad: sin JavaScript no se puede enviar (no un formulario que siempre falla)', () => {
    const out = html(NoJsForm, { ...props, turnstileOn: true });
    expect(out).toContain('Para enviar, activa JavaScript');
    expect(out).not.toContain('<form');
    expect(out).toContain(EMERGENCY);
  });
});

describe('el comprobante', () => {
  const receipt = {
    reference: 'AC-2026-K7QM2H', secret: 'K7QM-2HXP-9WRT-4BNE', kind: 'request' as const, sentAt: '2026-11-06T14:30:00.000Z', type: 'denuncia' as const,
    files: [], emailNote: false, saved: false,
  };

  it('el código y la clave se muestran una vez, nunca en un enlace; PDF, imprimir y copiar; emergencias y autoridades', () => {
    const out = html(ReceiptView, { receipt, siteName: 'Gobernación (demo)', onRetry: noop, onSaved: noop, onNew: noop });
    // The code may wrap only after its dashes (<wbr>): read as text it is whole.
    const text = out.replace(/<[^>]+>/g, '');
    expect(text).toContain('AC-2026-K7QM2H');
    expect(text).toContain('K7QM-2HXP-9WRT-4BNE');
    expect(out).not.toMatch(/href="[^"]*(K7QM-2HXP|K7QM2HXP)/);
    expect(out).toContain('Descargar comprobante (PDF)');
    expect(out).toContain('Imprimir');
    expect(out).toContain('Copiar código y clave');
    expect(out).toContain('La clave se muestra solo esta vez');
    expect(out).toContain(EMERGENCY);
    expect(out).toContain(AUTHORITIES);
    // No email promised unless the server said one is on its way.
    expect(out).not.toContain('Te enviamos un correo');
    expect(html(ReceiptView, { receipt: { ...receipt, emailNote: true }, siteName: 'x', onRetry: noop, onSaved: noop, onNew: noop })).toContain('Te enviamos un correo');
  });

  it('un archivo que no subió: la solicitud quedó guardada y se puede reintentar ese archivo', () => {
    const out = html(ReceiptView, {
      receipt: { ...receipt, type: 'reporte' as const, files: [{ id: 'f1', name: 'foto.jpg', size: 120_000, status: 'failed' as const, error: 'revisa la señal' }] },
      siteName: 'x', onRetry: noop, onSaved: noop, onNew: noop,
    });
    expect(out).toContain('Tu solicitud quedó guardada; un archivo no se pudo subir');
    expect(out).toContain('Reintentar');
  });
});

describe('la consulta', () => {
  const base = {
    status: 'ok' as const,
    timeline: [{ at: '2026-11-06T14:30:00.000Z', kind: 'created' as const, by: 'citizen' as const }],
    attachments: [],
  };
  const request = {
    reference: 'AC-2026-K7QM2H', type: 'reporte' as const, category: 'Agua', municipality: 'Torbes', state: 'en_atencion' as const, supportCount: 0,
    createdAt: '2026-11-06T14:30:00.000Z', updatedAt: '2026-11-06T14:30:00.000Z', resolvedAt: null, canAddInfo: true, canConfirm: false,
  };

  it('lo que envió la persona, su estado en palabras sencillas, «Salir» y los avisos', () => {
    const out = html(CaseView, {
      view: { ...base, kind: 'request' as const, request: { ...request, title: 'Bote de agua (demo)', description: 'Sale agua (demo).', anonymous: true } },
      maxFileBytes: 8 * 1024 * 1024,
    });
    expect(out).toContain('Bote de agua (demo)');
    expect(out).toContain('En atención');
    expect(out).toContain('El área responsable está trabajando en ella.');
    expect(out).toContain('Salir');
    expect(out).toContain('Agregar información');
    expect(out).toContain(EMERGENCY);
  });

  it('un apoyo ve el estado del caso, nunca el título ni el texto de quien lo envió', () => {
    const out = html(CaseView, {
      view: { ...base, kind: 'support' as const, request: { ...request, supportCount: 2, note: 'También me afecta (demo).' } },
      maxFileBytes: 8 * 1024 * 1024,
    });
    expect(out).toContain('Tu apoyo a un reporte');
    expect(out).toContain('aquí no se muestra su texto');
    expect(out).toContain('También me afecta (demo).');
    expect(out).not.toContain('Lo que enviaste');
  });
});
