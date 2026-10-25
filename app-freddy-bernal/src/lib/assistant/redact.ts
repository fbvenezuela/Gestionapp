// What a person writes passes through here BEFORE it goes to an AI provider and before it
// is stored ("Lo que preguntan", the conversation). Emails, phone numbers, times, dates and
// addresses become placeholders, so an event's date, time or place typed by mistake never
// leaves the server. Event titles never get this far on the model path: they travel as
// placeholders (titles.ts); these rules are the second layer.

import { looksLikeDateTime, stripDateTime } from '../push/text';

const MONTHS_FULL = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const MONTHS_SHORT = 'ene|feb|mar|abr|may|jun|jul|ago|sept|sep|oct|nov|dic';
// A month, whole or short ("nov", "nov.", "dic"), never the start of another word ("marca", "dice").
const MONTH = String.raw`(?:${MONTHS_FULL}|(?:${MONTHS_SHORT})\.?)(?![a-záéíóúñ])`;
const WEEKDAYS = 'lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo';
const WEEKDAYS_SHORT = 'lun|mar|mi[ée]|jue|vie|s[áa]b|dom';
// Hours written as words: "a las cinco", "la una y media".
const HOUR_WORDS = 'una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce';
const HOUR = String.raw`(?:\d{1,2}|${HOUR_WORDS})`;
// Days of the month written as words or as ordinals: «primero», «tres», «1ro», «1°».
const DAY_WORDS = 'primero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[ée]is|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintid[óo]s|veintitr[ée]s|veinticuatro|veinticinco|veintis[ée]is|veintisiete|veintiocho|veintinueve|treinta(?:\\s+y\\s+uno)?';
// A day of the month spelled out after «el» (not «uno»: «el uno» is «the one»).
const SPELLED_DAYS = 'primero|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[ée]is|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintid[óo]s|veintitr[ée]s|veinticuatro|veinticinco|veintis[ée]is|veintisiete|veintiocho|veintinueve|treinta(?:\\s+y\\s+uno)?';
// A phone number said digit by digit («cero cuatro uno cuatro, cinco cinco cinco…»): seven or more.
const DIGIT_WORD = String.raw`(?:cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|\d)`;
const PART_OF_DAY = String.raw`de\s+la\s+(?:mañana|tarde|noche|madrugada)`;
// "a. m." / "p.m." / "pm" / "am" (with or without dots and spaces).
const MERIDIEM = String.raw`[ap]\.?\s?m\.?(?![a-záéíóúñ])`;
const NOT_LETTER = '(?![a-záéíóúñ])';
// An hour of the day (0-23) and its minutes (00-59), for the formats that only make sense as a time.
const HH = '(?:[01]?\\d|2[0-3])';
const MM = '[0-5]\\d';

type Replacer = string | ((match: string, ...rest: unknown[]) => string);

// The replacer's last two arguments are always the offset and the whole text.
function where(rest: unknown[]): { offset: number; whole: string } {
  return { offset: rest.at(-2) as number, whole: rest.at(-1) as string };
}
const afterOf = (m: string, rest: unknown[], n = 24) => {
  const { offset, whole } = where(rest);
  return whole.slice(offset + m.length, offset + m.length + n);
};

// "9:16" is almost always the vertical video format, not a time (unless written "a las 9:16").
const timeOrRatio: Replacer = (m: string, ...rest: unknown[]) => {
  const { offset, whole } = where(rest);
  return m === '9:16' && !/las?\s+$/i.test(whole.slice(Math.max(0, offset - 6), offset)) ? m : '[hora]';
};

// Numbers that look like d/m but are sizes, ratios, versions or steps: "2.5 GB", "formato 4/5",
// "versión 1.2", "paso 1-2", "1-2 días", "24/7". Only possible days (1-31) and months (1-12).
const UNIT_AFTER = new RegExp(
  String.raw`^\s*(?:(?:gb|mb|kb|tb|px|fps|mbps|kbps|mp|hz|k|cm|mm|m|km|kg|seg|segundos?|s|min|minutos?|horas?|d[ií]as?|semanas?|meses|veces|millones?|mil|personas?)${NOT_LETTER}|%|x${NOT_LETTER})`,
  'i',
);
// Words after a number that make it a count, not a time or a phone number: «de 3 a 5 piezas», «1500000 vistas».
const COUNT_AFTER = new RegExp(
  String.raw`^\s*(?:vistas|views|likes|me\s+gusta|seguidores|comentarios|compartidos|guardados|caracteres|palabras|letras|l[ií]neas|piezas?|videos?|fotos?|tweets?|tuits?|archivos?|copies|copys?|publicaciones|reels?|historias|clips?|tomas|bloques|pendientes|avisos|usuarios|cuentas|redes|bol[ií]vares|bs|d[oó]lares|usd|puntos)${NOT_LETTER}`,
  'i',
);
const isAmount = (after: string) => UNIT_AFTER.test(after) || COUNT_AFTER.test(after);
const NOT_DATE_BEFORE = /(?:versi[oó]n|v|pasos?|nivel|cap[ií]tulo|p[aá]gina|p[aá]g\.?|puntos?|formato|proporci[oó]n|relaci[oó]n|ratio|aspecto|tama[ñn]o|escala)\s*$/i;
const DATE_ARTICLE_BEFORE = /(?:\b(?:el|del|al|para|hasta|desde)|d[ií]a)\s+$/i;
// «a las 10.11», «10.11 am» or «7.10 hrs» is a time of day (the rules for times take it).
const TIME_AFTER = new RegExp(String.raw`^\s*(?:${MERIDIEM}|(?:h|hs|hrs?)(?![a-záéíóúñ]))`, 'i');
// The common image and video ratios: «portada en 4/5», «16/9». Next to the format words of its
// clause, or without «el / del / para / día» right before, they are a ratio, not the 4th of May.
const RATIOS = new Set(['4/5', '5/4', '16/9', '9/16', '1/1', '4/3', '3/4', '2/3', '3/2']);
const FORMAT_CLAUSE = /formato|portada|proporci[oó]n|relaci[oó]n|aspecto|vertical|horizontal|cuadrad|reels?\b|historias?\b|stories|miniatura|pantalla/i;
function clauseAround(whole: string, offset: number, len: number): string {
  const start = Math.max(whole.lastIndexOf('.', offset - 1), whole.lastIndexOf('?', offset - 1), whole.lastIndexOf('!', offset - 1), whole.lastIndexOf('\n', offset - 1), whole.lastIndexOf(';', offset - 1));
  const ends = ['.', '?', '!', '\n', ';'].map((c) => whole.indexOf(c, offset + len)).filter((i) => i >= 0);
  return whole.slice(start + 1, ends.length ? Math.min(...ends) : whole.length);
}
function isRatio(m: string, whole: string, offset: number): boolean {
  if (!RATIOS.has(m.replace(/\s+/g, ''))) return false;
  const before = whole.slice(Math.max(0, offset - 16), offset);
  return !DATE_ARTICLE_BEFORE.test(before) || FORMAT_CLAUSE.test(clauseAround(whole, offset, m.length));
}
const numericDate: Replacer = (m: string, ...rest: unknown[]) => {
  const { offset, whole } = where(rest);
  const [d, mo, y] = rest as [string, string, string | undefined];
  const day = Number(d);
  const month = Number(mo);
  if (day < 1 || day > 31 || month < 1 || month > 12) return m;
  if (y) return '[fecha]';
  const before = whole.slice(Math.max(0, offset - 16), offset);
  const after = whole.slice(offset + m.length, offset + m.length + 14);
  if (m.includes('.') && (/\blas?\s+$/i.test(before) || TIME_AFTER.test(after))) return m;
  if (UNIT_AFTER.test(after) || NOT_DATE_BEFORE.test(before)) return m;
  if (m === '24/7' && !DATE_ARTICLE_BEFORE.test(before)) return m;
  if (m.includes('/') && isRatio(m, whole, offset)) return m;
  return '[fecha]';
};
// «3 del 11»: a day and a month (not «paso 2 del 3», not «2 del 3 de los videos»).
const dayOfMonth: Replacer = (m: string, ...rest: unknown[]) => {
  const { offset, whole } = where(rest);
  const [d, mo] = rest as [string, string];
  if (Number(d) < 1 || Number(d) > 31 || Number(mo) < 1 || Number(mo) > 12) return m;
  if (NOT_DATE_BEFORE.test(whole.slice(Math.max(0, offset - 16), offset)) || isAmount(afterOf(m, rest)) || /^\s*de\s+(?:los|las)\b/i.test(afterOf(m, rest))) return m;
  return '[fecha]';
};
// A time of day only when no unit or count follows («9,30» is a time; «2,50 GB» or «9 y 30 segundos» are not).
const timeUnlessAmount: Replacer = (m: string, ...rest: unknown[]) => (isAmount(afterOf(m, rest)) ? m : '[hora]');
// «de 7 a 9», «entre 7 y 9»: the two hours go (the words around them stay). «de 3 a 5 segundos», «de 1 a 3
// piezas» or a scale («de 1 a 10») are not hours.
const hourRange: Replacer = (m: string, ...rest: unknown[]) => {
  const [lead, las1, from, conj, las2, noon, to, meridiem] = rest as (string | undefined)[];
  const a = Number(from);
  const b = noon ? 12 : Number(to);
  if (a > 24 || b > 24 || isAmount(afterOf(m, rest))) return m;
  if (!noon && !meridiem && a <= 1 && (b === 5 || b === 10)) return m;
  return `${lead} ${las1 ? `${las1.trim()} ` : ''}[hora] ${conj} ${las2 ? `${las2.trim()} ` : ''}[hora]`;
};
// «el 3» in what the platform wrote: a day, unless a unit, a count or more digits follow.
const theDay: Replacer = (m: string, ...rest: unknown[]) => {
  const [lead] = rest as [string];
  const after = afterOf(m, rest);
  if (isAmount(after) || /^\s*(?:[%°º]|ro\b|ero\b|de\s+(?:los|las|\d)|[.,:/-]\d)/i.test(after)) return m;
  return `${lead} [fecha]`;
};

type Kind = 'contact' | 'when' | 'date' | 'place' | 'loose' | 'landmark' | 'named' | 'bare' | 'relative' | 'days';

// Addresses: a street word followed by a number or a Name («calle 3», «carrera 5 con calle 7»,
// «av. Libertador», «sector La Ermita», «casa N° 12», «km 8», «piso 2»). A street word alone or
// before an ordinary word («la vía de publicar», «el sector salud», «la casa comunal») stays, and so
// do «vía WhatsApp» (only «vía a/al/hacia…» is a road) and «el sector Salud». Only abbreviations take
// a period («av. Libertador»): «la calle. Mañana…» is a sentence end.
// Street words match in any case; the Name needs its capital (no «i» flag: it would fold \p{Lu}).
const ci = (w: string) =>
  w.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}${({ a: 'áÁ', e: 'éÉ', i: 'íÍ', o: 'óÓ', u: 'úÚ' } as Record<string, string>)[c] ?? ''}]`);
const words = (list: string) => `(?:${list.split(' ').map((w) => w.split('_').map(ci).join(String.raw`\s+`)).join('|')})`;
const ABBR = String.raw`${words('avda av cra urb edif apto km')}\.?`;
const WITH_NUMBER = String.raw`(?:${words('calles calle carreras carrera avenidas avenida transversal diagonal vereda pasaje callejon prolongacion autopista carretera troncal via sector urbanizacion barrio edificio torre quinta local apartamento piso manzana parcela casa kilometro')}|${ABBR})`;
const WITH_NAME = String.raw`(?:${words('calle carrera avenida transversal vereda pasaje callejon prolongacion autopista carretera troncal sector urbanizacion barrio caserio aldea residencias edificio')}|${words('avda av cra urb edif')}\.?|${words('via')}\s+${words('a al hacia para')})`;
const WITH_ARTICLE = String.raw`(?:${words('sector barrio urbanizacion caserio aldea avenida residencias quinta')}|${words('avda av urb')}\.?)`;
// Capitalized words that follow a street word without being a place: networks, apps, fields.
const NOT_PLACE = words('whatsapp instagram facebook tiktok telegram drive youtube threads twitter gmail zoom meet salud educacion publico publica privado privada comercio cultura deporte deportes turismo agricola electrico social productivo version');
const START = String.raw`(?<![\p{L}\d])`;
const END = String.raw`(?![\p{L}\d])`;
// «15-B» or «15B» (not «10K», a race).
const NUMBER = String.raw`\d+(?:-?[a-jl-zA-JL-Z])?${END}`;
const MARK = String.raw`(?:[nN](?:[°º]|[rR][oO]\.?|[oO]\.)|[nN][uú]mero|#)`;
const NUMBER_MARK = String.raw`(?:${MARK}\s*)?`;
const NAME = String.raw`(?:(?:de|del|la|las|los|el|a|al)\s+)*(?!${NOT_PLACE}${END})\p{Lu}\p{L}*(?:\s+(?:(?:de|del|la|las|los|el|y)\s+)*\p{Lu}\p{L}*)*`;
const PLACE_RULES: RegExp[] = [
  // «C/ 7 # 4»: the abbreviation of calle.
  new RegExp(String.raw`${START}[cC]\/\s*\d+[a-zA-Z]?(?:\s*(?:#|${MARK})\s*\d+(?:-\d+)?)?${END}`, 'gu'),
  // «calle 3», «carrera 5 con calle 7», «casa N° 12-34», «casa 15-B», «km 8», «entre carreras 3 y 4»,
  // «Calle 7 N° 4-23» (the house number goes with its street).
  new RegExp(
    String.raw`${START}${WITH_NUMBER}\s*${NUMBER_MARK}${NUMBER}(?:\s*(?:con|y|entre|esquina(?:\s+con)?|esq\.?|[-/#]|,?\s*${MARK})\s*(?:(?:${words('calles calle carreras carrera avenidas avenida')}|${words('av cra')}\.?)\s*)?${NUMBER})*`,
    'gu',
  ),
  // «av. Libertador», «sector El Mirador», «vía a San Cristóbal», «urbanización Los Pinos».
  new RegExp(String.raw`${START}${WITH_NAME}\s+${NAME}`, 'gu'),
  // Written in lower case, with its article: «sector la ermita», «barrio el carmen», «quinta La Esperanza».
  new RegExp(String.raw`${START}${WITH_ARTICLE}\s+(?:[lL]a|[eE]l|[lL]os|[lL]as|[sS]an|[sS]anta|[sS]anto)\s+\p{L}+${END}`, 'gu'),
  // The road or town that goes with an address: «km 8 vía San Cristóbal», «calle 3 de San Cristóbal».
  new RegExp(String.raw`\[direccion\](?:,?\s+(?:${words('via de del')})\s+${NAME})+`, 'gu'),
];

// Places named by a landmark or a short form («frente a la plaza Bolívar», «detrás del mercado
// municipal», «a dos cuadras de la plaza», «en el Liceo Simón Bolívar», «qta. Las Flores», «C.C.
// Sambil», «parroquia La Concordia», «calle principal de X»). They also hit ordinary event titles
// («Inauguración de la plaza Bolívar» names its subject), so they never run on the person's
// question unless it is about an event (guardQuestion in brain.ts), only on what the platform wrote.
const LANDMARK = words('plaza plazoleta liceo escuela colegio universidad alcaldia gobernacion prefectura cancha polideportivo estadio gimnasio iglesia capilla catedral basilica sede modulo mercado ambulatorio hospital clinica cdi parque redoma terminal comando auditorio teatro monumento cementerio estacion unidad_educativa centro_comercial casa_comunal salon urbanismo hacienda finca');
const LANDMARK_ADJ = words('municipal central principal nacional vieja viejo nueva nuevo mayor techada techado deportiva deportivo comunal bolivariana bolivariano');
const DIRECTION = words('frente_a enfrente_de al_frente_de al_lado_de a_un_lado_de detras_de delante_de diagonal_a junto_a cerca_de en_la_esquina_de');
const BLOCKS = String.raw`${ci('a')}\s+(?:\d{1,3}|${words('una dos tres cuatro cinco seis media pocas unas unos pocos')})\s+${words('cuadra cuadras metros')}\s+${ci('de')}`;
const ARTICLE = String.raw`(?:l(?=\s)|\s+(?:la|el|los|las))?\s+`;
const LANDMARK_TAIL = String.raw`(?:\s+${LANDMARK_ADJ})?(?:\s+(?:de\s+|del\s+)?${NAME})?`;
const LANDMARK_RULES: [RegExp, Replacer][] = [
  [new RegExp(String.raw`${START}(?:${DIRECTION}|${BLOCKS})${ARTICLE}(?:${LANDMARK}${LANDMARK_TAIL}|${NAME})`, 'gu'), '[direccion]'],
  [new RegExp(String.raw`${START}((?:${words('en por')})\s+(?:la|el|los|las)\s+)${LANDMARK}(?:\s+${LANDMARK_ADJ})?\s+(?:de\s+|del\s+)?${NAME}`, 'gu'), '$1[direccion]'],
  [new RegExp(String.raw`${START}(?:${words('qta')}\.?|[cC]\.\s?[cC]\.|CC|${words('parroquia')})\s+${NAME}`, 'gu'), '[direccion]'],
  [new RegExp(String.raw`${START}(?:${words('calle avenida carrera')}|${words('av')}\.?)\s+${words('principal central real vieja nueva')}(?:\s+(?:de|del)\s+${NAME})?${END}`, 'gu'), '[direccion]'],
  // A landmark with its name or its adjective, whatever comes before it: «sale de la plaza Bolívar», «en
  // plaza Bolívar», «encuentro: plaza Bolívar», «la cancha techada de El Mirador», «la plaza central».
  [new RegExp(String.raw`${START}${LANDMARK}(?:\s+${LANDMARK_ADJ}(?:\s+(?:de\s+|del\s+)?${NAME})?|\s+(?:de\s+|del\s+)?${NAME})${END}`, 'gu'), '[direccion]'],
];

// Somewhere said only by its name or by a bare landmark, after a word that says where: «en la Hacienda El
// Trapiche», «desde Pueblo Nuevo», «hasta San Cristóbal», «pa Alto Verde», «sale de la plaza», «en la
// escuela»; or by any kind of place with its name («en el hotel Tamá»). Not a network, an app, a screen,
// a role or «mi…» («en Instagram», «en Material», «en la Agenda», «para Redes», «desde Mi perfil»). Too
// broad for ordinary text: only on a question about an event, a notice about one, team material about
// one in the prompt and what a model asks to tell the team.
const NOT_NAMED = words('instagram facebook tiktok threads twitter youtube whatsapp telegram drive gmail zoom meet agenda hoy inicio material piezas pieza aprobar por_aprobar ajustes avisos biblioteca resultados copies storyboard ficha tweets publicar buzon equipo perfil asistente registro politica digital categorias formulas horarios marca buscar nuevo_evento nueva_pieza nueva_publicacion nueva_tanda eventos mis_eventos crear mas redes supervision despacho grabacion secretaria administracion mi mis canva capcut photoshop premiere lightroom google chrome excel word wetransfer meta');
// The things of the platform a Name can follow without being a place («en la pestaña Material»).
const NOT_PLACE_NOUN = words('pestana pestaña pantalla menu boton seccion red redes cuenta grupo canal carpeta opcion campo casilla lista formato plantilla formula pieza video copy app aplicacion plataforma enlace link perfil ficha rol jefe senor señor gobernador doctor doctora licenciado licenciada profesor profesora companero companera compañero compañera hermano hermana');
const NAMED_RULES: RegExp[] = [
  new RegExp(String.raw`${START}(${words('en desde hasta por hacia para pa pal al')}\s+(?:${words('la el los las')}\s+)?)(?!${NOT_NAMED}${END})\p{Lu}\p{L}+(?:\s+(?:(?:de|del|la|las|los|el|y)\s+)*\p{Lu}\p{L}*)*`, 'gu'),
  // Any kind of place with its Name: «en el hotel Tamá», «en el club Demócrata», «del galpón de Los Pinos».
  new RegExp(String.raw`${START}(${words('en desde hasta por hacia de del al a')}\s+(?:${words('la el los las un una')}\s+)?)(?!${NOT_PLACE_NOUN}${END})\p{Ll}{3,}\s+(?:(?:de|del)\s+)?(?:(?:la|el|los|las)\s+)?(?!${NOT_NAMED}${END})\p{Lu}\p{L}{2,}(?:\s+(?:(?:de|del|la|las|los|el|y)\s+)*\p{Lu}\p{L}*)*`, 'gu'),
];
// «a» + a Name («lleven el dron a Táriba»): the named rule leaves it out, for «a Kevin». Only the callers
// that know the team's names use it (redactPlacesAfterA): a Name that is someone of the team stays.
const TO_NAME = new RegExp(String.raw`${START}(${ci('a')}\s+(?:${words('la el los las')}\s+)?)((?!${NOT_NAMED}${END})\p{Lu}\p{L}+(?:\s+(?:(?:de|del|la|las|los|el|y)\s+)*\p{Lu}\p{L}*)*)`, 'gu');
// Bare: a landmark with a name or an adjective after it is the landmark rules' (whole). «La pieza de la
// cancha» is a piece: alone it is not a place by its name.
const BARE_RULE = new RegExp(String.raw`${START}(${words('en desde hasta de del al a por')}\s+(?:${words('la el los las')}\s+)?)${LANDMARK}(?!\s+(?:${LANDMARK_ADJ}|(?:de\s+|del\s+)?(?:(?:de|del|la|las|los|el)\s+)*\p{Lu}))${END}`, 'gu');

const RULES: [RegExp, Replacer, Kind][] = [
  // Emails, also without a dot after the @ («juan@localhost») and spelled out («juan arroba gmail punto com»).
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[correo]', 'contact'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*/g, '[correo]', 'contact'],
  [/\b[A-Za-z0-9._+-]+\s+arroba\s+[A-Za-z0-9-]+(?:\s+punto\s+[A-Za-z]{2,})+\b/gi, '[correo]', 'contact'],
  // ISO dates and date-times (2026-10-24, 2026/11/03, 2026-11-03T13:30:00Z) and compact ones
  // (20261103). Before the phone rule: a date-time is not a phone number. Never a piece of a
  // longer chain of digit groups ("0414-555-12-34" is a phone number, caught whole below).
  [new RegExp(String.raw`(?<!\d[/.-]?)\b\d{4}([-/.])\d{1,2}\1\d{1,2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?(?:\s*${MERIDIEM})?)?(?!\d)(?![/.-]\d)`, 'gi'), '[fecha]', 'date'],
  [/\b20\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\b/g, '[fecha]', 'date'],
  // Dates written out: "lunes 3 de noviembre", "3 de noviembre de 2026", "el 3 de nov", "3 nov", "3-nov".
  [new RegExp(String.raw`\b(?:(?:${WEEKDAYS})\s+)?\d{1,2}(?:\s+de\s+|\s*[-/.]\s*|\s+)${MONTH}(?:,?\s+(?:de|del)\s+\d{2,4}|\s*[-/.]\s*\d{2,4}|\s+\d{4})?`, 'gi'), '[fecha]', 'date'],
  // An ordinal or a spelled-out day before a month: «1ro de noviembre», «1° de nov», «primero de noviembre», «tres de noviembre».
  // Also «1ro nov», «1° nov» (an ordinal needs no «de»).
  [new RegExp(String.raw`(?<![\p{L}\d])(?:(?:${WEEKDAYS})\s+)?(?:\d{1,2}\s*(?:ro|ero|[°º]|o\.)(?:\s+de)?|(?:${DAY_WORDS})\s+de)\s+${MONTH}(?:,?\s+(?:de|del)\s+\d{2,4})?`, 'giu'), '[fecha]', 'date'],
  // A short weekday before a day number: «sáb 3», «Mar. 3/11» (the month goes with it).
  [new RegExp(String.raw`(?<![\p{L}])(?:${WEEKDAYS_SHORT})\.?\s+\d{1,2}(?:\s*[/.-]\s*\d{1,2}(?:\s*[/.-]\s*\d{2,4})?)?(?![\d])`, 'giu'), '[fecha]', 'date'],
  // "noviembre 3", "dic 24", "dic. 24".
  [new RegExp(String.raw`\b${MONTH}\s*\d{1,2}\b`, 'gi'), '[fecha]', 'date'],
  // Weekday followed by a day number: "el lunes 3", "lunes 3/11" (the month goes with it).
  [new RegExp(String.raw`\b(?:${WEEKDAYS})\s+\d{1,2}(?:\s*[/.-]\s*\d{1,2}(?:\s*[/.-]\s*\d{2,4})?)?\b`, 'gi'), '[fecha]', 'date'],
  // «el día 3», «para el día 15», «el día primero» (not «el día 15/13»); «3 del 11».
  [new RegExp(String.raw`\b(el|del|al|para\s+el|hasta\s+el|desde\s+el)\s+d[ií]a\s+(?:(?:[1-9]|[12]\d|3[01])\b(?![/.,:-]?\d)|(?:${DAY_WORDS})(?![a-záéíóúñ]))`, 'gi'), '$1 [fecha]', 'date'],
  [/(?<![\d.,/-])\b(\d{1,2})\s+del\s+(\d{1,2})\b(?![/.,:-]?\d)/gi, dayOfMonth, 'date'],
  // Numeric dates: 24/10, 24-10-2026, 24.10.26.
  [/(?<!\d[/.-]?)\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b(?![/.-]\d)/g, numericDate, 'date'],
  // Hour ranges with digits: «de 7 a 9», «entre 7 y 9», «de 7 a 9 am», «de 8 a 12 m».
  [new RegExp(String.raw`\b(de|entre)\s+(las?\s+)?(\d{1,2})(?:[:.,h]\d{2})?\s+(a|y|hasta)\s+(las?\s+)?(?:(12\s*m\.?(?![a-záéíóúñ²³]))|(\d{1,2})(?:[:.,h]\d{2})?(\s*${MERIDIEM})?)(?![\d])`, 'gi'), hourRange, 'when'],
  // Times: 10:30, 10:30 a. m., 3 p. m., 3pm, 15 hrs, 8h, 19.30 hrs, "las 10 y media", "cuatro de la
  // tarde", "a las cinco", "sobre las 7", "tipo 3", "al mediodía". With a dot only next to «las»,
  // am/pm or h/hrs («a las 9.30», «9.00 am», «7.30h»): «versión 1.20» or «1.91:1» are not times.
  // «24 h» after «en», «por», «tienen»… is how long, not when («tienen 24 h para subir»).
  [new RegExp(String.raw`\b\d{1,2}[:h]\d{2}(?:\s*${MERIDIEM})?`, 'gi'), timeOrRatio, 'when'],
  [/\b\d{1,2}[.,]\d{2}\s*(?:h|hs|hrs?)\b(?![.:]?\d)/gi, '[hora]', 'when'],
  [new RegExp(String.raw`\b(las?\s+)\d{1,2}[.,]\d{2}(?!\d)(?:\s*${MERIDIEM})?`, 'gi'), '$1[hora]', 'when'],
  [new RegExp(String.raw`\b\d{1,2}(?:[.,]\d{2})?\s*${MERIDIEM}`, 'gi'), '[hora]', 'when'],
  [/(?<!\b(?:en|por|cada|durante|unas?|tienen|tiene|tienes|hace|pr[oó]ximas|primeras|[uú]ltimas)\s+)\b\d{1,2}\s*(?:h|hs|hrs?)\b(?![.:,]?\d)/gi, '[hora]', 'when'],
  [new RegExp(String.raw`\b${HOUR}\s+(?:y\s+(?:media|cuarto)(?:\s+${PART_OF_DAY})?|${PART_OF_DAY})${NOT_LETTER}`, 'gi'), '[hora]', 'when'],
  // «9 menos cuarto», «8 y pico» (not «20 y pico personas», «3 y pico horas»).
  [new RegExp(String.raw`\b${HOUR}\s+(?:menos\s+(?:cuarto|cinco|diez|veinte|\d{1,2})|y\s+pico)${NOT_LETTER}`, 'gi'), timeUnlessAmount, 'when'],
  [new RegExp(String.raw`\b(a|desde|hasta|sobre|tipo|para)\s+(las?\s+)?${HOUR}(?:\s+y\s+(?:\d{1,2}|media|cuarto))?${NOT_LETTER}(?!\s*(?:[/.,:]\d))`, 'gi'), timeAfter, 'when'],
  // "de las dos a las cuatro": only as a range ("cuál de las dos" is not a time).
  [new RegExp(String.raw`\bde\s+las?\s+${HOUR}${NOT_LETTER}(?=\s+(?:a|hasta)\s+la)`, 'gi'), 'de las [hora]', 'when'],
  [new RegExp(String.raw`\bde\s+las?\s+\d{1,2}\b`, 'gi'), 'de las [hora]', 'when'],
  // A comma for the dot («9,30»), «9 y 30», «9 con 30» (not «carrera 5 con 10»), «9 en punto»,
  // «12 m» (noon; «12 m de largo» is metres). Never before a unit or a count («2,50 GB», «9 y 30 segundos»).
  [new RegExp(String.raw`(?<![\d.,]|(?:bs|bs\.|\$|us\$|usd|€)\s?)\b${HH},${MM}\b(?![.,]?\d)`, 'gi'), timeUnlessAmount, 'when'],
  [new RegExp(String.raw`(?<!\d[.,]?)\b${HH}\s+y\s+${MM}\b(?!\s*[.,]?\d)`, 'gi'), timeUnlessAmount, 'when'],
  [new RegExp(String.raw`(?<!(?:calles?|carreras?|cra\.?|avenidas?|av\.?|transversal|diagonal|esquina|esq\.?)\s+)\b${HH}\s+con\s+${MM}\b(?!\s*[.,]?\d)`, 'gi'), timeUnlessAmount, 'when'],
  [new RegExp(String.raw`\b${HH}\s+en\s+punto\b`, 'gi'), '[hora]', 'when'],
  [/\b12\s*m\.?(?![a-záéíóúñ²³])(?!\s*de\s+(?:largo|ancho|alto|altura|fondo|profundidad|distancia|di[aá]metro))/gi, '[hora]', 'when'],
  // «al mediodía», «12 del mediodía», «a la medianoche».
  [/\b(?:\d{1,2}\s+(?:del|de\s+la)\s+)?(?:al\s+)?(?:mediod[ií]a|medianoche)(?![a-záéíóúñ])/gi, '[hora]', 'when'],
  // The first hour of a range whose end was taken above: «7 a 9 am» → «7 a [hora]» → «[hora] a [hora]».
  [new RegExp(String.raw`(?<![\d.,:/])\b${HH}(?:[:.,]${MM})?(\s*(?:a|-|–|hasta)\s*)\[hora\]`, 'gi'), '[hora]$1[hora]', 'when'],
  // Phone numbers: 0414-1234567, +58 414 123 45 67, (0276) 555 1234, 0414-555-12-34; and local
  // ones of 7 digits (356-1234), never before a count («1500000 vistas»).
  [/\+?\d[\d ().-]{7,}\d/g, '[numero]', 'contact'],
  [new RegExp(String.raw`\b(?:${DIGIT_WORD}[\s,.-]+){6,}${DIGIT_WORD}(?![a-záéíóúñ\d])`, 'gi'), '[numero]', 'contact'],
  [/(?<![\d.,+-])\b\d{3}[-. ]?\d{4}\b(?![.,-]?\d)/g, (m: string, ...rest: unknown[]) => (isAmount(afterOf(m, rest)) ? m : '[numero]'), 'contact'],
  ...PLACE_RULES.map((re): [RegExp, Replacer, Kind] => [re, '[direccion]', 'place']),
  // Only on what the platform wrote (a tool's result, an earlier answer, a script) or on a
  // question about an event: «9 30», «0930», «el 3». In ordinary text they are too often a count.
  [new RegExp(String.raw`(?<![\d.,:/])\b${HH}\s${MM}\b(?![.,:/]?\d)`, 'g'), timeUnlessAmount, 'loose'],
  [/(?<![\d.,:/-])\b0\d[0-5]\d\b(?![.,:/-]?\d)/g, '[hora]', 'loose'],
  [/\b(el|del)\s+(?:[1-9]|[12]\d|3[01])\b(?![.,:/-]?\d)/gi, theDay, 'loose'],
  ...LANDMARK_RULES.map(([re, to]): [RegExp, Replacer, Kind] => [re, to, 'landmark']),
  ...NAMED_RULES.map((re): [RegExp, Replacer, Kind] => [re, '$1[direccion]', 'named']),
  [BARE_RULE, '$1[direccion]', 'bare'],
  // Parts of the day and relative days that stripDateTime does not take: «fin de semana», «la
  // semana que viene», «por la tarde», «temprano», «a primera hora».
  [/\b(?:el\s+|este\s+)?fin(?:es)?\s+de\s+semana(?![a-záéíóúñ])/gi, '[fecha]', 'relative'],
  [/\b(?:la\s+)?(?:semana|quincena)\s+(?:que\s+viene|entrante|pr[oó]xima)(?![a-záéíóúñ])|\b(?:la\s+)?(?:pr[oó]xima|otra)\s+(?:semana|quincena)(?![a-záéíóúñ])|\besta\s+(?:semana|quincena)(?![a-záéíóúñ])/gi, '[fecha]', 'relative'],
  [new RegExp(String.raw`\b(?:(?:el|este)\s+)?(?:pr[oó]ximo|otro)\s+(?:${WEEKDAYS})(?![a-záéíóúñ])`, 'gi'), '[fecha]', 'relative'],
  // «en dos días», «dentro de 3 semanas», «en un mes»: when, not how long («tienen 2 días para…» is how long).
  [/\b(?:en|dentro\s+de)\s+(?:\d{1,3}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|unos|unas|pocos|pocas)\s+(?:d[ií]as?|semanas?|mes|meses)(?![a-záéíóúñ])/gi, '[fecha]', 'relative'],
  [/\b(?:(?:por|en|a)\s+la\s+(?:mañana|tarde|noche|madrugada)|de\s+(?:tarde|noche|madrugada))(?![a-záéíóúñ])/gi, '[hora]', 'relative'],
  [/\b(?:(?:bien|muy|m[aá]s)\s+)?tempran(?:o|ito)(?![a-záéíóúñ])|\b(?:a|de)\s+primera\s+hora(?![a-záéíóúñ])|\ba\s+[uú]ltima\s+hora(?![a-záéíóúñ])|\bal\s+(?:amanecer|anochecer|atardecer)(?![a-záéíóúñ])/gi, '[hora]', 'relative'],
  // The way people say a day or an hour without naming it: «el finde», «en la mañanita», «después del
  // almuerzo», a month alone («en noviembre»), «el mes que viene», «a fin de mes», «en un par de días», a
  // day of the month spelled out («el veinticuatro», not «el primero de la lista»). One place for every
  // check that asks «does this carry a when?» (carriesWhen, carriesDay, carriesHour), for redactQuoted
  // and for the masking of a question about an event.
  [/\b(?:(?:el|este|ese|otro|pr[oó]ximo|cada)\s+)?findes?(?![a-záéíóúñ])/gi, '[fecha]', 'relative'],
  [/\b(?:(?:en|por|a|de|desde)\s+la\s+)?(?:ma[ñn]anita|tardecita|nochecita|madrugadita)(?![a-záéíóúñ])/gi, '[hora]', 'relative'],
  [/\b(?:despu[eé]s|antes|luego)\s+del?\s+(?:almuerzo|desayuno|cena|almorzar|desayunar|cenar)(?![a-záéíóúñ])|\ba\s+la\s+hora\s+del?\s+(?:almuerzo|desayuno|cena)(?![a-záéíóúñ])/gi, '[hora]', 'relative'],
  [new RegExp(String.raw`\b(?:${MONTHS_FULL})(?![a-záéíóúñ])`, 'gi'), '[fecha]', 'relative'],
  [/\b(?:el\s+)?(?:mes|año)\s+(?:que\s+viene|entrante|pr[oó]ximo)(?![a-záéíóúñ])|\b(?:el\s+)?(?:pr[oó]ximo|otro)\s+(?:mes|año)(?![a-záéíóúñ])|\b(?:a\s+)?(?:fin(?:es)?|principios?|mediados|finales)\s+del?\s+(?:mes|año)(?![a-záéíóúñ])|\beste\s+(?:mes|año)(?![a-záéíóúñ])/gi, '[fecha]', 'relative'],
  [/\b(?:en|dentro\s+de)\s+(?:un\s+)?par\s+de\s+(?:d[ií]as|semanas|meses)(?![a-záéíóúñ])/gi, '[fecha]', 'relative'],
  [new RegExp(String.raw`\b(el|del|al|para\s+el|hasta\s+el|desde\s+el)\s+(?:${SPELLED_DAYS})(?![a-záéíóúñ])(?!\s+(?:de\s+(?:la|las|los|el)\b|que\b|en\s+(?:la|el|llegar)\b|por\s+ciento|veces|horas|minutos|segundos|d[ií]as|semanas|meses|piezas|videos|fotos|tweets))`, 'gi'), '$1 [fecha]', 'relative'],
  // Days said as words: only on a question about an event (they are ordinary words otherwise:
  // «¿qué tengo hoy?», «mañana subo el material»).
  [new RegExp(String.raw`\b(?:(?:el|este|esta)\s+)?(?:pr[oó]ximo\s+|otro\s+)?(?:${WEEKDAYS})(?![a-záéíóúñ])(?:\s+que\s+viene)?`, 'gi'), '[fecha]', 'days'],
  [/\b(?:pasado\s+mañana|antier|anteayer|ayer|hoy)(?![a-záéíóúñ])|(?<!\bla\s)\bmañana(?![a-záéíóúñ])/gi, '[fecha]', 'days'],
  [/\b(?:esta\s+(?:misma\s+)?(?:noche|tarde)|anoche)(?![a-záéíóúñ])/gi, '[hora]', 'days'],
];

// "a las 5" → "a las [hora]", "tipo cinco" → "tipo [hora]". Without "la(s)" only "tipo" counts:
// "a 5 minutos", "para 3 redes" or "sobre 2 piezas" are not times.
function timeAfter(m: string, ...rest: unknown[]): string {
  const [lead, las] = rest as [string, string | undefined];
  if (!las && lead.toLowerCase() !== 'tipo') return m;
  return `${lead} ${las ? `${las.trim()} ` : ''}[hora]`;
}

function apply(text: string, kinds: Kind[]): string {
  let out = String(text ?? '');
  for (const [re, to, kind] of RULES) {
    if (!kinds.includes(kind)) continue;
    out = typeof to === 'string' ? out.replace(re, to) : out.replace(re, to as (m: string) => string);
  }
  return out;
}

const BASE: Kind[] = ['contact', 'date', 'when', 'place'];
const QUOTED: Kind[] = [...BASE, 'loose', 'landmark', 'relative'];

export function redact(text: string): string {
  return apply(text, BASE);
}

// «Hoy» is also the name of a screen («Todo eso está en Hoy», «Inicio: Hoy con…»): written with its
// capital after a word or a colon, it is the screen, not the day.
const SCREEN_HOY = /(?<=[\p{Ll}:,;«(]\s{0,2})Hoy(?![\p{L}])/gu;
const SCREEN_MARK = '\u0001\u0002\u0001';

/**
 * redact() with every rule (also the landmarks, the short forms and the parts of the day) and then
 * the phone's guard (stripDateTime) as a second lock: for what the platform wrote and may quote an
 * event title in as it is (a tool's result, an earlier answer, a script saved from a conversation).
 * A way of writing a date or time that the rules miss («Toma 9.30»), a weekday, «hoy» or «mañana» goes too.
 */
export function redactQuoted(text: string): string {
  const kept = protectRatios(String(text ?? '').replace(SCREEN_HOY, SCREEN_MARK));
  return stripDateTime(apply(kept, QUOTED)).replaceAll(SCREEN_MARK, 'Hoy').replaceAll(RATIO_MARK, '/');
}

// A ratio in a format context («portada en 4/5») keeps its slash away from the phone's guard, which
// would take it for a date.
const RATIO_MARK = '\u0003';
const RATIO_SHAPED = /(?<![\d/.-])\b\d{1,2}\/\d{1,2}\b(?![/.-]?\d)/g;
function protectRatios(text: string): string {
  return text.replace(RATIO_SHAPED, (m, offset: number, whole: string) => (isRatio(m, whole, offset) ? m.replace('/', RATIO_MARK) : m));
}

// A day said for the person's own work, not for the event: «mañana subo el material», «¿lo publico el
// sábado?», «hoy hay que editarlo», «subo hoy». Uploading, sending, checking, editing or publishing
// is not when the event is; recording or handing something over can be («grabo mañana» goes).
const WORK_VERB = String.raw`(?:sub(?:o|e|en|an|imos|ir)|mand(?:o|a|an|en|amos|ar)|envi(?:o|a|an|en|amos|ar)|env[ií](?:o|a|an|en)|revis(?:o|a|an|en|amos|ar)|carg(?:o|a|an|amos|ar)|carguen|aprueb(?:o|a|an|en)|aprob(?:amos|ar)|public(?:o|a|an|amos|ar)|publiquen|edit(?:o|a|an|en|amos|ar)|corrij(?:o|a|an)|correg(?:imos|ir))(?:lo|la|los|las)?`;
const OWN_DAY = String.raw`(?:pasado\s+ma[ñn]ana|ma[ñn]ana|hoy|esta\s+(?:noche|tarde)|(?:el\s+)?(?:${WEEKDAYS}))`;
const HELPER = String.raw`(?:(?:hay|tengo|tienes|tiene|tenemos|tienen|debo|debes|debe|debemos|deben|puedo|puedes|puede|podemos|pueden|voy\s+a|vas\s+a|va\s+a|vamos\s+a|van\s+a)\s+(?:que\s+)?)?`;
// The day is looked for first: a look back over a run of spaces at every place of a long blank text
// took seconds.
const OWN_WORK_DAY = new RegExp(
  String.raw`(?<![\p{L}])(?=${OWN_DAY})(?:(?<!(?:\bde|\bdel|\bla)\s+)${OWN_DAY}(?=\s+(?:mismo\s+)?(?:(?:lo|la|los|las|le|les|me|se)\s+)?${HELPER}${WORK_VERB}(?![\p{L}]))|(?<=(?<![\p{L}])${WORK_VERB}\s+)${OWN_DAY}(?![\p{L}]))`,
  'giu',
);
const KEPT = /\uE000(\uE001+)\uE002/g;
function keepOwnWorkDays(text: string, run: (t: string) => string): string {
  const kept: string[] = [];
  const marked = text.replace(OWN_WORK_DAY, (m) => `\uE000${'\uE001'.repeat(kept.push(m))}\uE002`);
  return run(marked).replace(KEPT, (_m, n: string) => kept[n.length - 1] ?? '');
}

/** The text with the days said for the person's own work («mañana subo el material») taken out. */
function withoutOwnWorkDays(text: string): string {
  return String(text ?? '').replace(OWN_WORK_DAY, ' pronto ');
}

/**
 * The words of a question about an event that say where it is (a landmark, a place by its name) and,
 * unless it asks about publishing (`when: false`), when it is (its days, its parts of the day, «0930»,
 * «el 3»), but not a day said for the person's own work («mañana subo el material»). brain.ts
 * guardQuestion() calls it when the question names an event, how-to or not.
 */
export function redactEventSpeech(text: string, o: { when?: boolean } = {}): string {
  const kinds: Kind[] = o.when === false ? ['landmark', 'named', 'bare'] : ['loose', 'landmark', 'named', 'bare', 'relative', 'days'];
  return keepOwnWorkDays(String(text ?? ''), (t) => apply(t, kinds));
}

/** The landmarks with their name or adjective and the short forms («frente a la plaza…», «qta. X», «la plaza central»). */
export function redactLandmarks(text: string): string {
  return apply(text, ['landmark']);
}

/** A place said by its name or by a bare landmark after a word that says where («en Pueblo Nuevo», «desde la plaza»). */
export function hasPlaceName(text: string): boolean {
  return apply(text, ['named', 'bare']) !== String(text ?? '');
}

/** A place said by its Name («pa Alto Verde», «en el hotel Tamá»), not a bare landmark («de la cancha»). */
export function hasPlaceByName(text: string): boolean {
  return apply(text, ['named']) !== String(text ?? '');
}

/** «a» + a Name as «a [direccion]», unless `isPerson` says the Name (its first word) is someone of the team («a Kevin»). */
export function redactPlacesAfterA(text: string, isPerson: (firstWord: string) => boolean = () => false): string {
  return String(text ?? '').replace(TO_NAME, (m: string, lead: string, name: string) => (isPerson(name.split(/\s+/)[0]) ? m : `${lead}[direccion]`));
}

/**
 * What a model wrote for people outside the turn (the reason of an «aviso al equipo»): every rule, a
 * place said by its name too, and the second lock. Nothing of the agenda reaches Supervisión that way.
 */
export function redactForTeam(text: string): string {
  return apply(redactQuoted(text), ['named', 'bare']);
}

/**
 * redactQuoted() on every string inside a value (objects and arrays walked, keys kept): what a tool
 * returns, before it goes to an AI provider. With keepTimes, times of day stay (the best hours to
 * publish are not the agenda) and only the rules for dates, places and contacts run.
 */
export function redactDeep(value: unknown, o: { keepTimes?: boolean } = {}): unknown {
  const scrub = (s: string) => (o.keepTimes ? redactKeepTimes(s) : redactQuoted(s));
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return scrub(v);
    if (v instanceof Date) return '[fecha]';
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}

/** Dates, places (landmarks too) and contacts go; times of day stay (the best hours, the tweet slots). */
export function redactKeepTimes(text: string): string {
  return apply(text, ['contact', 'date', 'place', 'landmark']);
}

/** True when the text carries something that looks like a date or a time of day. */
export function hasDateOrTime(text: string): boolean {
  return apply(text, ['date', 'when']) !== String(text ?? '');
}

/** True when the text carries something that looks like a date (times of day don't count). */
export function hasDate(text: string): boolean {
  return apply(text, ['date']) !== String(text ?? '');
}

/** An address or a landmark with its name or adjective (no contacts, no place said only by its name). */
export function hasPlace(text: string): boolean {
  return apply(text, ['place', 'landmark']) !== String(text ?? '');
}

/**
 * What a prepared notice keeps when it is stored and sent: contacts and addresses go (a second lock:
 * the check refuses them first); a team deadline keeps its real time («antes de las 3 pm»).
 */
export function redactContacts(text: string): string {
  return apply(text, ['contact', 'place', 'landmark']);
}

/** True when redact() would change something (the text carried a time, date, email, phone or address). */
export function hasSensitive(text: string): boolean {
  return redact(text) !== String(text ?? '');
}

/** Every rule but the days said as words, and no second lock: for checks that judge the days in context. */
export function redactStrict(text: string): string {
  return apply(text, QUOTED);
}

/** A phone number, an email or an address, also a landmark («frente a la plaza…») or a short form («qta.»). */
export function hasPlaceOrContact(text: string): boolean {
  return apply(text, ['contact', 'place', 'landmark']) !== String(text ?? '');
}

// How long, not when: «tienen 24 h para subir», «en 2 horas», «dentro de 30 minutos», «cada 2 días».
// «En 2 días» or «dentro de 3 días» is when (a relative day): it is left for the rules to see.
const DURATION = /\b(?:(?:en|dentro\s+de)\s+\d{1,3}\s*(?:h|hs|hrs?|horas?|minutos?|min)|(?:por|cada|durante|unas?|unos|tienen|tiene|tienes|tengo|tenemos|hace|pr[oó]ximas|primeras|[uú]ltimas|m[aá]s\s+de|menos\s+de)\s+\d{1,3}\s*(?:h|hs|hrs?|horas?|minutos?|min|d[ií]as?))(?![a-záéíóúñ])/gi;
// A number with its unit or count («2.5 GB», «1.200 personas»): never a date.
const AMOUNT = new RegExp(String.raw`\b\d+(?:[.,]\d+)*(?=\s*(?:gb|mb|kb|tb|px|fps|k|cm|mm|km|kg|seg|segundos?|minutos?|horas?|veces|millones?|mil|personas?|%|vistas|likes|seguidores|caracteres|piezas?|videos?|fotos?|tweets?|archivos?|copies|reels?|clips?|tomas|historias|publicaciones|bloques|redes|cuentas|usuarios)(?![a-záéíóúñ]))`, 'gi');

/**
 * What a detector should look at: ratios in a format context («4/5»), «Hoy» the screen, how long
 * something takes and numbers with their unit become neutral words; the rest is left as it is.
 */
export function neutralForChecks(text: string): string {
  return String(text ?? '')
    .replace(RATIO_SHAPED, (m, offset: number, whole: string) => (isRatio(m, whole, offset) ? 'proporción' : m))
    .replace(SCREEN_HOY, 'Inicio')
    .replace(DURATION, ' un rato ')
    .replace(AMOUNT, 'varios');
}

/**
 * The strongest «does this carry a date, a time or a day?» there is: every rule above (the
 * question-only ones too) plus the phone's guard. Ratios, «Hoy» the screen and durations don't count.
 */
export function carriesWhen(text: string): boolean {
  const t = neutralForChecks(text);
  return apply(t, ['date', 'when', 'loose', 'relative', 'days']) !== t || looksLikeDateTime(t);
}

/** A when that is not a day said for the person's own work («mañana subo el material»); a phone number is not one. */
export function carriesEventWhen(text: string): boolean {
  return carriesWhen(withoutOwnWorkDays(apply(text, ['contact'])));
}

/** A day: a date, a weekday, «hoy», «mañana», «en dos días», «el fin de semana», «el 3». */
export function carriesDay(text: string): boolean {
  const t = neutralForChecks(text);
  return /\[fecha\]/.test(apply(t, ['date', 'relative', 'days'])) || /\b(?:el|del)\s+(?:[1-9]|[12]\d|3[01])\b(?![.,:/-]?\d)/i.test(t);
}

/** An hour or a part of the day, written in any of the ways the rules see («a las 8», «9 30», «temprano»). */
export function carriesHour(text: string): boolean {
  const t = neutralForChecks(text);
  return /\[hora\]/.test(apply(t, ['when', 'relative', 'days'])) || /(?<![\d.,:/])\b(?:[01]?\d|2[0-3])\s[0-5]\d\b(?![.,:/]?\d)|(?<![\d.,:/-])\b0\d[0-5]\d\b(?![.,:/-]?\d)/.test(t);
}

const PLACEHOLDER_RUN = /[\s,;:·-]*(?:\b(?:a|al|el|la|los|las|lo|en|de|del|desde|hasta|para|entre|y|o|por|frente|lado|cerca|junto|detr[aá]s|delante)\s+){0,5}\[(?:fecha|hora|direccion|numero|correo)\]/giu;

/**
 * An event title as it can be quoted next to a when or a where: without its date, time, day, place
 * or contacts (and the little words that led to them). Empty when nothing worth quoting is left.
 */
export function safeTitle(title: string): string {
  let t = redactQuoted(title);
  for (let i = 0; i < 4; i++) {
    const next = t.replace(PLACEHOLDER_RUN, '');
    if (next === t) break;
    t = next;
  }
  t = t
    .replace(/«\s*»|\(\s*\)/g, ' ')
    .replace(/\s+([,.;:!?»)])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:·.-]+|[\s,;:·-]+$/g, '')
    .trim();
  return /\p{L}{3}/u.test(t) ? t : '';
}
