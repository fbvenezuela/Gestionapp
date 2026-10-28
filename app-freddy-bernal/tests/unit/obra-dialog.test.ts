// «Generame un diálogo FAB con esto» (§4.1) with the AI off: the template never invents a figure (rule 7, «nunca
// inventa cifras»), never says what is «Por confirmar», never reads a contact, and keeps the FAB order. All data
// here is invented.
import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { DIALOG_KEYS, buildObraDialog, dialogContactProblem, dialogInput, dialogPhones, dialogUnknownNumbers, obraDialogSources, type ObraDialogInput } from '@/lib/domain/obra-dialog';
import { unknownNumbers } from '@/lib/domain/copies';
import { OBRA_FIELDS } from '@/lib/domain/ficha-fields';

const BRAND = { greeting: '¡Saludos, Táchira!', closings: ['Seguimos trabajando', 'Por amor al Táchira'] };

const base = (over: Partial<ObraDialogInput> = {}): ObraDialogInput => ({
  name: 'Rehabilitación del puente de prueba', municipality: 'Junín', parish: 'La Petrólea (demo)', sector: 'Sector El Llano (demo)',
  problem: 'Las bases se socavaron con las lluvias. La carga pesada no pasa. Los camiones dan la vuelta larga.',
  problem_since: 'hace dos inviernos', why_decided: 'Es el paso de los productores.',
  works: 'Pilotes nuevos y losa de 80 m. Barandas a los dos lados.', communities: 'los caseríos de la zona alta (demo)',
  people_count: 1200, families_count: 300, benefits: 'La cosecha sale sin dar la vuelta larga.',
  executor: 'Vialidad del estado (demo)', investment: '1.500.000', currency: 'VES', funding_source: 'Fondo regional (demo)',
  work_state: 'in_progress', progress_pct: 60, due_on: '2027-03-05', marks: {},
  ...over,
});

describe('el orden FAB y la voz del jefe', () => {
  it('saludo y lugar, Característica, Ventaja, Beneficio y cierre, en ese orden', () => {
    const d = buildObraDialog(base(), BRAND);
    const at = (s: string) => d.text.indexOf(s);
    expect(at('¡Saludos, Táchira!')).toBe(0);
    expect(at('Estamos en Sector El Llano (demo), parroquia La Petrólea (demo), municipio Junín')).toBeGreaterThan(0);
    expect(at('Lo que estamos haciendo')).toBeGreaterThan(at('Estamos en'));
    expect(at('Esta obra resuelve un problema')).toBeGreaterThan(at('Lo que estamos haciendo'));
    expect(at('Beneficia a')).toBeGreaterThan(at('Esta obra resuelve un problema'));
    expect(d.text.trimEnd().endsWith('Seguimos trabajando.')).toBe(true);
    expect(d.feature).toContain('Ya vamos en 60 % de avance.');
    expect(d.feature).toContain('La inversión es de 1.500.000 bolívares, con recursos de Fondo regional (demo).');
    expect(d.advantage).toContain('La entrega está prevista para el 5 de marzo de 2027.');
    expect(d.benefit).toContain('Son 1.200 personas y 300 familias.');
    // Plain words, no emojis (it is read aloud).
    expect(d.text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('cada respuesta larga se dice en dos oraciones como mucho, y lo avisa', () => {
    const d = buildObraDialog(base(), BRAND);
    expect(d.advantage).toContain('las bases se socavaron con las lluvias. La carga pesada no pasa.');
    expect(d.advantage).not.toContain('vuelta larga. Esto');
    expect(d.missing).toContain('Se dicen solo las dos primeras oraciones de «Qué problema resuelve»');
  });

  it('sin cuentas: ni «faltan N días» ni porcentajes sacados, aunque estén las fechas', () => {
    const d = buildObraDialog(base({ due_on: '2027-01-10' }), BRAND);
    expect(d.text).not.toMatch(/\bfaltan\b|\bd[ií]as?\b|\bquedan\b/i);
    expect(d.text.match(/%/g)).toHaveLength(1);
  });

  it('la moneda no se repite si la cifra ya la dice', () => {
    expect(buildObraDialog(base({ investment: 'Bs. 2.000.000' }), BRAND).feature).toContain('La inversión es de Bs. 2.000.000, con recursos');
    expect(buildObraDialog(base({ investment: '$ 20.000', currency: 'USD' }), BRAND).feature).toContain('La inversión es de $ 20.000, con recursos');
    expect(buildObraDialog(base({ investment: '20.000', currency: 'USD' }), BRAND).feature).toContain('20.000 dólares');
  });

  it('sin avance escrito dice el estado; sin ninguno de los dos, lo pide', () => {
    expect(buildObraDialog(base({ progress_pct: null, work_state: 'stalled' }), BRAND).feature).toContain('La obra está paralizada.');
    expect(buildObraDialog(base({ progress_pct: null, work_state: null }), BRAND).missing).toContain('Falta: Porcentaje de avance');
  });

  it('una ficha vacía no arma nada', () => {
    const empty = dialogInput({ name: 'Obra de prueba', municipality: 'Junín' });
    const d = buildObraDialog(empty, BRAND);
    expect(d.text).toBe('');
    expect(d.missing).toContain('Falta: Qué trabajos se están haciendo (medidas y características)');
  });
});

describe('«Por confirmar» no se dice; «No aplica» se salta', () => {
  it('lo marcado «Por confirmar» nunca sale y queda en la lista', () => {
    const d = buildObraDialog(
      base({ investment: '9.876.543', progress_pct: 77, works: 'Trabajo secreto ZQCONF.', marks: { investment: 'to_confirm', progress_pct: 'to_confirm', works: 'to_confirm' } }),
      BRAND,
    );
    for (const secret of ['9.876.543', '77', 'ZQCONF']) expect(d.text).not.toContain(secret);
    expect(d.missing).toEqual(expect.arrayContaining(['Por confirmar: Inversión (no se dice)', 'Por confirmar: Porcentaje de avance (no se dice)']));
  });

  it('«No aplica» no sale ni se pide', () => {
    const d = buildObraDialog(base({ funding_source: 'Fondo ZQNA', marks: { funding_source: 'not_applicable', due_on: 'not_applicable' } }), BRAND);
    expect(d.text).not.toContain('ZQNA');
    expect(d.text).not.toContain('La entrega está prevista');
    expect(d.missing.join(' ')).not.toMatch(/financiamiento|entrega/i);
  });
});

describe('solo la parte principal de la ficha', () => {
  it('un contacto metido a la fuerza en la entrada nunca llega al texto', () => {
    const row = { ...base(), liaison_phone: '0000-0000999', reporter_name: 'Persona ZQPRIV', boss_should_know: 'Algo ZQBOSS', difficulties: 'ZQDIF 4321', pending_needs: 'ZQNEED', next_action: 'ZQNEXT', other_aid: 'ZQAID' };
    const input = dialogInput(row);
    expect(Object.keys(input).sort()).toEqual([...DIALOG_KEYS, 'marks'].sort());
    const d = buildObraDialog(row as unknown as ObraDialogInput, BRAND);
    for (const secret of ['0000-0000999', 'ZQPRIV', 'ZQBOSS', 'ZQDIF', '4321', 'ZQNEED', 'ZQNEXT', 'ZQAID']) expect(d.text).not.toContain(secret);
  });

  it('las claves que lee son campos de la ficha de obra, ninguna privada', () => {
    for (const k of DIALOG_KEYS) {
      const def = OBRA_FIELDS.find((f) => f.key === k);
      expect(def, k).toBeDefined();
      expect(def!.private, k).toBeFalsy();
    }
  });
});

// ---------------------------------------------------------------------------
// «Nunca inventa cifras»: 200 invented fichas, figures spread over every field, random marks.
// ---------------------------------------------------------------------------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['obra', 'vía', 'puente', 'sector', 'escuela', 'cancha', 'lluvias', 'comunidad', 'trabajos', 'familias', 'muro', 'tubería', 'losa', 'asfalto', 'Los Pinos', 'El Llano', 'La Quebrada', 'IVT', 'productores', 'cosecha'];
const FIGURES = ['12', '80 m', '1.200', '2,5 km', '45 %', '600 m²', '3', '1500', '10.000', '7,25', 'km 12', '19', '2026', '0,5'];

function sentence(r: () => number, digits: boolean): string {
  const n = 3 + Math.floor(r() * 8);
  const words = Array.from({ length: n }, () => WORDS[Math.floor(r() * WORDS.length)]);
  if (digits) words.splice(Math.floor(r() * words.length), 0, FIGURES[Math.floor(r() * FIGURES.length)]);
  const s = words.join(' ');
  return s[0].toUpperCase() + s.slice(1) + (r() < 0.8 ? '.' : '');
}

function text(r: () => number): string {
  if (r() < 0.15) return '';
  const k = 1 + Math.floor(r() * 4);
  return Array.from({ length: k }, () => sentence(r, r() < 0.6)).join(r() < 0.2 ? '\n' : ' ');
}

const TEXT_KEYS = ['name', 'parish', 'sector', 'problem', 'problem_since', 'why_decided', 'works', 'communities', 'benefits', 'executor', 'investment', 'funding_source'] as const;
const MARKABLE = DIALOG_KEYS.filter((k) => k !== 'name' && k !== 'municipality');

function randomFicha(r: () => number): ObraDialogInput {
  const f: Record<string, unknown> = { municipality: 'San Judas Tadeo', marks: {} };
  for (const k of TEXT_KEYS) f[k] = text(r);
  if (!f.name) f.name = 'Obra de prueba';
  f.people_count = r() < 0.3 ? null : Math.floor(r() * 50000);
  f.families_count = r() < 0.3 ? null : Math.floor(r() * 9000);
  f.progress_pct = r() < 0.3 ? null : Math.floor(r() * 101);
  f.work_state = r() < 0.3 ? null : ['not_started', 'in_progress', 'stalled', 'finished'][Math.floor(r() * 4)];
  f.currency = ['', 'VES', 'USD', 'EUR', 'COP', 'other'][Math.floor(r() * 6)];
  f.due_on = r() < 0.3 ? null : DateTime.fromISO('2026-01-01').plus({ days: Math.floor(r() * 900) }).toISODate();
  const marks: Record<string, string> = {};
  for (const k of MARKABLE) if (r() < 0.15) marks[k] = r() < 0.5 ? 'to_confirm' : 'not_applicable';
  f.marks = marks;
  return f as unknown as ObraDialogInput;
}

// What the ficha says, built here on its own (not with the code under test): every unmarked value as typed, the
// numbers as numbers, the delivery day and year, and the brand's own texts.
function sourcesOf(f: ObraDialogInput): string[] {
  const out: string[] = [BRAND.greeting, ...BRAND.closings];
  for (const k of DIALOG_KEYS) {
    if (f.marks[k]) continue;
    const v = f[k];
    if (v === null || v === undefined) continue;
    if (k === 'due_on') {
      const d = DateTime.fromISO(String(v));
      out.push(String(d.day), String(d.year));
    } else out.push(String(v));
  }
  return out;
}

describe('nunca inventa cifras', () => {
  it('200 fichas inventadas: toda cifra del diálogo está en un campo no marcado de su ficha', () => {
    const r = rng(20261027);
    let spoken = 0;
    for (let i = 0; i < 200; i++) {
      const f = randomFicha(r);
      const d = buildObraDialog(f, BRAND);
      if (d.text) spoken++;
      expect(unknownNumbers([d.text], sourcesOf(f)), `ficha ${i}: ${d.text}`).toEqual([]);
      // The guard the action uses (a hand-edited text) agrees.
      expect(dialogUnknownNumbers(d.text, f, BRAND), `ficha ${i}`).toEqual([]);
      // «Por confirmar» is never said: no text of a field marked so reaches the dialog.
      for (const k of TEXT_KEYS) {
        const v = String(f[k] ?? '');
        if (f.marks[k] === 'to_confirm' && v.length > 25) expect(d.text, `ficha ${i} ${k}`).not.toContain(v.slice(0, 25));
      }
    }
    expect(spoken).toBeGreaterThan(150);
  });

  it('1.200 y 1200 son la misma cifra; una cifra que no está, sí se ve', () => {
    expect(unknownNumbers(['Son 1.200 personas.'], ['1200'])).toEqual([]);
    expect(unknownNumbers(['Son 1.300 personas y 45 familias.'], ['1200', '45'])).toEqual(['1.300']);
    const f = base();
    expect(dialogUnknownNumbers('Ya vamos en 75 % de avance.', f, BRAND)).toEqual(['75']);
    expect(obraDialogSources(f, BRAND)).toContain('5 de marzo de 2027');
  });
});

// «Lo que voy a decir» lo leen Redes y Grabación: a text edited by hand never carries a contact or a phone.
describe('sin contactos ni teléfonos', () => {
  const PRIV = { reporter_name: 'Vecina que denunció (demo)', liaison_name: 'Enlace comunitario (demo)', representative: '', engineer_phone: '0000-0000101', liaison_phone: '0000-0000102' };

  it('la plantilla nunca choca con la regla: 200 fichas inventadas y la de ejemplo', () => {
    const r = rng(20261028);
    for (let i = 0; i < 200; i++) {
      const f = randomFicha(r);
      const d = buildObraDialog(f, BRAND);
      expect(dialogContactProblem(d.text, f, BRAND, PRIV), `ficha ${i}: ${d.text}`).toBeNull();
    }
    expect(dialogContactProblem(buildObraDialog(base(), BRAND).text, base(), BRAND, PRIV)).toBeNull();
  });

  it('un nombre o un teléfono de los contactos se rechaza, con el nombre del campo y sin importar mayúsculas', () => {
    expect(dialogContactProblem('Gracias a la vecina que denunció (demo).', base(), BRAND, PRIV)).toContain('«Quién hizo el reporte o la denuncia»');
    expect(dialogContactProblem('Saludos al ENLACE COMUNITARIO (DEMO).', base(), BRAND, PRIV)).toContain('«Nombre del enlace comunitario»');
    expect(dialogContactProblem('Llamen al 0000-0000102.', base(), BRAND, PRIV)).toContain('«Teléfono del enlace comunitario»');
    // A name that is also in the main part (which Redes already reads) is not a leak.
    const f = base({ communities: 'el sector del Enlace comunitario (demo)' });
    expect(dialogContactProblem('Saludos al Enlace comunitario (demo).', f, BRAND, PRIV)).toBeNull();
    // Without 2FA the contacts are not read: the phone check still runs.
    expect(dialogContactProblem('Llamen al 0000-0000102.', base(), BRAND, null)).toContain('parece un teléfono (0000-0000102)');
  });

  it('lo que parece un teléfono: 7 números o más con guiones, espacios, paréntesis o +; nunca un monto con puntos ni una fecha', () => {
    expect(dialogPhones('Llamen al 0414-1234567 o al (0276) 555-1234, o al +58 414 123 4567.')).toEqual(['0414-1234567', '(0276) 555-1234', '+58 414 123 4567']);
    expect(dialogPhones('Escriban al 04141234567.')).toEqual(['04141234567']);
    expect(dialogPhones('La inversión es de 1.500.000 bolívares; son 1.200 personas, 300 familias y 80 m de puente.')).toEqual([]);
    expect(dialogPhones('La inversión es de 1500000 bolívares.')).toEqual([]);
    expect(dialogPhones('Lo entregamos el 2027-03-05, como se dijo.')).toEqual([]);
    expect(dialogPhones('Van 123 456 7890.')).toEqual(['123 456 7890']);
  });

  it('dos cifras de la ficha pegadas como un teléfono también se rechazan: la base no guarda eso en «Lo que voy a decir»', () => {
    // 1200 personas y 300 familias son de la ficha, pero «1200 300» se lee como un teléfono (Redes y Grabación lo
    // leen tal cual): el texto se rechaza con la salida de siempre, escribir la cifra con puntos.
    const problem = dialogContactProblem('Son 1200 300 familias.', base(), BRAND, null);
    expect(problem).toContain('parece un teléfono (1200 300)');
    expect(problem).toContain('escríbela con puntos');
    expect(dialogContactProblem('Son 1.200 personas y 300 familias.', base(), BRAND, null)).toBeNull();
  });
});
