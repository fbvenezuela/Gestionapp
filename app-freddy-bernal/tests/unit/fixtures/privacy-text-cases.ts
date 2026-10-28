// The SAME cases for the app's text rules and the database's (20261028002100_privacy_hardening.sql):
//   * phone: phonesIn() of src/lib/domain/phones.ts  ⇔  public.text_has_phone();
//   * datetime: looksLikeDateTime() of src/lib/push/text.ts  ⇔  public.text_has_datetime().
// tests/unit/privacy-text-rules.test.ts checks the JavaScript against them; tests/rls/privacy-hardening.test.ts checks
// the SQL against them and compares both on the generated texts below. All data here is invented.

export const PHONE_CASES: { text: string; phone: boolean }[] = [
  // Written every way they are written in Venezuela.
  { text: 'Llamar al enlace 0414.555.0199', phone: true },
  { text: 'Sra. de prueba (vocera) 0276.555.0101 (demo)', phone: true },
  { text: '0414-555.01.99', phone: true },
  { text: '0414/555/0199 o 0414_555_0199', phone: true },
  { text: 'tel:0414.555.0177.', phone: true },
  { text: 'Local 555.0199', phone: true },
  { text: 'Llamar al 0414-123 45 67 o al (0276) 555-1234.', phone: true },
  { text: '+58 414 555 0199', phone: true },
  { text: '04145550199', phone: true },
  { text: '+584145550199', phone: true },
  { text: 'Contacto: 0000-0000102', phone: true },
  { text: 'Avisar al 0414 555 0199', phone: true },
  { text: 'Avisar al 0414 555 0199', phone: true },
  // Full-width digits read as digits (NFKC), as the phone's keyboard may type them.
  { text: 'Vocera ０４１４ ５５５ ０１９９', phone: true },
  { text: 'Son 1200 300 familias.', phone: true },
  { text: 'Van 123 456 7890.', phone: true },
  { text: 'Ñ0414-555-0199', phone: true },
  { text: 'RIF J-30123456-7 y teléfono 0414-5550199', phone: true },
  { text: 'Muro de 120. 3500 m2', phone: true },
  // Not phones: amounts with dots for thousands, dates, bare figures, IDs with their letter, figures on two lines.
  { text: '', phone: false },
  { text: 'Inversión de 1.500.000 para 1200 familias', phone: false },
  { text: '1.500.000 - 2.000.000', phone: false },
  { text: '1.500.000.000', phone: false },
  { text: 'Bs. 1.500.000,50', phone: false },
  { text: '1500000', phone: false },
  { text: '(1500000)', phone: false },
  { text: 'desde 15/03/2024', phone: false },
  { text: 'el 15.03.2024', phone: false },
  { text: 'el 2024-03-15', phone: false },
  { text: 'RIF J-30123456-7', phone: false },
  { text: 'V-12345678', phone: false },
  { text: 'Ñ-12345678', phone: false },
  { text: 'Muro de 120 m\n3500 m2', phone: false },
  { text: 'Puente de 25 m, 60 % de avance', phone: false },
  { text: 'Son 1.200 personas y 300 familias.', phone: false },
  { text: 'Rehabilitación del puente La Quebrada', phone: false },
];

export const DATETIME_CASES: { text: string; datetime: boolean }[] = [
  // Times, every way.
  { text: 'Acto a las 9:30', datetime: true },
  { text: 'Acto 14:00', datetime: true },
  { text: 'Acto 9:30 a. m.', datetime: true },
  { text: 'Acto 9am', datetime: true },
  { text: 'Acto 7 p.m.', datetime: true },
  { text: 'Acto 21h30', datetime: true },
  { text: 'Acto a las 3 de la tarde', datetime: true },
  { text: 'Acto 18:00 hrs', datetime: true },
  { text: 'Acto al mediodía', datetime: true },
  { text: 'Abierto desde las 8 hasta las 10:30', datetime: true },
  { text: 'A LAS NUEVE DE LA NOCHE', datetime: true },
  { text: 'Se movió a la una y media', datetime: true },
  { text: 'Llegamos 19 horas', datetime: true },
  // Dates and days.
  { text: 'Entrega 24/10', datetime: true },
  { text: 'Entrega 24-10-2026', datetime: true },
  { text: 'Entrega 2026-10-24T13:00:00Z', datetime: true },
  { text: 'Entrega el 24 de octubre de 2026', datetime: true },
  { text: 'Entrega sáb 24 de oct.', datetime: true },
  { text: 'Entrega el viernes', datetime: true },
  { text: 'Se pasa para el LUNES', datetime: true },
  { text: 'Queda para el Miércoles', datetime: true },
  { text: 'Entrega mañana', datetime: true },
  { text: 'MAÑANA temprano', datetime: true },
  { text: 'Entrega hoy', datetime: true },
  { text: 'Pasado mañana se ve', datetime: true },
  { text: 'Entrega octubre 24', datetime: true },
  { text: 'Se suspende hasta el 3 de MARZO', datetime: true },
  { text: 'oct. 25', datetime: true },
  { text: '25-oct', datetime: true },
  // Phones of 10 digits or more.
  { text: 'Llamar al 0414-1234567', datetime: true },
  { text: 'Vocera +58 414 123 4567 en sitio', datetime: true },
  // Plain reasons.
  { text: '', datetime: false },
  { text: 'Lluvia fuerte en la zona', datetime: false },
  { text: 'El jefe tuvo un cambio de agenda', datetime: false },
  { text: 'Quedan 5 días de tweets programados', datetime: false },
  { text: 'Venció el plazo: «Entrega de la cancha techada de El Mirador» sigue sin aprobar', datetime: false },
  { text: 'Beneficiados: unas 1.200 personas', datetime: false },
  { text: 'Aprobadas 3 piezas verdes', datetime: false },
  { text: 'Martín no pudo llegar', datetime: false },
  { text: 'Hoyos en la vía de acceso', datetime: false },
  { text: 'Los sábados no hay transporte', datetime: false },
  { text: 'Mañanita de lluvia', datetime: false },
];

// Generated texts: pieces that sit on the edges of both rules (digits, separators, Spanish words of dates and times,
// accents and capitals, IDs, full-width digits), joined at random with a fixed seed: the same texts every run.
const PIECES = [
  '0414', '555', '0199', '1', '12', '2026', '24', '9', '30', '1200', '300', '15', '03', '7', '00', '1500000', '04145550199',
  ' ', ' ', ' ', '-', '.', '/', '_', '(', ')', '+', ':', ' ', ' ', '\n', ',', '\t', ' ', '  ', ' - ', '%',
  'de', 'la', 'las', 'a', 'y', 'media', 'menos', 'cuarto', 'en', 'punto', 'h', 'hs', 'hrs', 'horas', 'am', 'a.m.', 'p. m.', 'pm',
  'mañana', 'MAÑANA', 'tarde', 'noche', 'madrugada', 'hoy', 'Hoy', 'anoche', 'esta', 'pasado', 'lunes', 'Miércoles', 'miercoles',
  'sáb', 'SAB', 'dom', 'mar', 'marzo', 'Oct', 'oct.', 'sept', 'set', 'setiembre', 'mediodía', 'MEDIODIA', 'medianoche', 'nueve', 'una',
  'doce', 'V-', 'J-', 'Ж-', 'x', 'é', 'É', 'Ñ', 'ó', '1.500.000', '15/03/2024', '2024-03-15', '０４１４', '²', 'tel', 'Bs.', 'ene', 'Ene',
  'del', 'Las', 'A', 'LAS', 'DE LA', 'T', 'Z', 'a las', 'a la', 'é9', 'b', '_', 'Á', 'ü', 'ſ', 'K', 'İ',
];

export function generatedTexts(count: number, seed = 20261028): string[] {
  let state = seed >>> 0;
  const next = () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 2 ** 32;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const n = 1 + Math.floor(next() * 9);
    let s = '';
    for (let k = 0; k < n; k++) s += PIECES[Math.floor(next() * PIECES.length)] + (next() < 0.35 ? ' ' : '');
    out.push(s);
  }
  return out;
}
