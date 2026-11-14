// The public website's demo content (design §8, D-95): INVENTED and marked «(demo)» in every title. No real person,
// phone, address, account, case or video: episodes have no YouTube id (the site shows their placeholder), documents are
// small generated PDFs, sources say they are invented, sectors are generic. Dates are days from today (negative =
// past). What speaks to the citizen says «usted» (copy audit §1), and the two legal notices are their one text
// (src/lib/participation/notices.ts). Plain data, read by seed-parts/web.ts.
import type { TextNode } from '../../web/blocks';
import { DENUNCIA_NOTICE, EMERGENCY_NOTICE } from '../../participation/notices';
import { getClientConfig } from '../../client-config';
import { programNameOf } from '../../web/program-name';

export type DemoNews = { slug: string; category: 'noticia' | 'comunicado' | 'articulo' | 'entrevista'; muni: string | null; day: number; title: string; excerpt: string; body: string[]; topics: string[]; status?: 'draft' | 'in_review' | 'scheduled' };
export type DemoProject = {
  slug: string; category: string; state: 'anunciado' | 'en_ejecucion' | 'concluido'; muni: string; day: number; title: string; excerpt: string;
  place: string; beneficiaries: string; description: string[]; progress?: number; investment?: { amount: number; currency: 'VES' | 'USD' };
  started?: number; finished?: number; expected?: number;
};
export type DemoDocument = { slug: string; category: 'semanario' | 'informe' | 'rendicion' | 'normativa' | 'prensa' | 'otro'; day: number; title: string; excerpt: string; version: string; pages: string[] };
export type DemoNotice = { slug: string; category: 'agua' | 'electricidad' | 'vialidad' | 'transporte'; munis: string[]; day: number; expires: number | null; title: string; body: string };
export type DemoFaq = { slug: string; group: 'atencion' | 'web' | 'gobernacion'; order: number; q: string; a: string[] };
export type DemoIndicator = { slug: string; order: number; title: string; value: number; unit: string };

// Where every figure of the demo comes from.
export const DEMO_SOURCE = { label: 'Cifra inventada para la demostración (demo)' };

export const p = (text: string): TextNode => ({ type: 'paragraph', text });

export const DEMO_NEWS: DemoNews[] = [
  { slug: 'arranco-rehabilitacion-avenida-principal-demo', category: 'noticia', muni: 'San Cristóbal', day: -2, title: 'Arrancó la rehabilitación de la avenida principal (demo)',
    excerpt: 'Las cuadrillas empezaron por el tramo más dañado; el paso queda por un canal mientras duran los trabajos.',
    body: ['Las cuadrillas empezaron por el tramo más dañado de la avenida, el que más reportes recibió en la web.', 'Mientras duran los trabajos el paso queda por un canal. Los avisos de servicio dicen qué días cambia.', 'Texto inventado para la versión de prueba.'],
    topics: ['vialidad', 'obras'] },
  { slug: 'horarios-oficina-participacion-demo', category: 'comunicado', muni: null, day: -4, title: 'Comunicado: así funciona la atención de las solicitudes (demo)',
    excerpt: 'Cada solicitud que llega por la web queda asignada a un área y se sigue con su código.',
    body: ['Cada solicitud que llega por la web queda registrada con un código y una clave que recibe quien la envía.', 'El personal de atención la revisa, la pasa al área que corresponde y responde en el mismo caso. Lo que se envía no se publica.', 'Texto inventado para la versión de prueba.'],
    topics: ['participación'] },
  { slug: 'jornada-de-salud-junin-demo', category: 'noticia', muni: 'Junín', day: -6, title: 'Jornada de salud en Junín atendió a 800 personas (demo)',
    excerpt: 'Consultas, vacunas y entrega de medicinas durante un día completo.',
    body: ['Durante un día completo hubo consultas de medicina general, pediatría y odontología.', 'La cifra de personas atendidas es inventada para la demostración.'], topics: ['salud'] },
  { slug: 'como-hacer-un-reporte-demo', category: 'articulo', muni: null, day: -8, title: 'Cómo hacer un reporte y seguirlo con su código (demo)',
    excerpt: 'Tres pasos desde el teléfono, sin crear una cuenta.',
    body: ['Elija qué desea enviar, indique dónde es y describa lo que pasa. Si lo desea, agregue una foto.', 'Al enviar recibirá un código y una clave. Con los dos puede consultar el avance cuando lo necesite.', 'Texto inventado para la versión de prueba.'], topics: ['participación', 'guía'] },
  { slug: 'planta-potabilizadora-bolivar-asi-quedo-demo', category: 'noticia', muni: 'Bolívar', day: -10, title: 'Planta potabilizadora en Bolívar: así quedó (demo)',
    excerpt: 'La planta ya surte a los sectores que tenían agua por horas.', body: ['La planta ya surte a los sectores que tenían agua por horas.', 'Texto y cifras inventados para la versión de prueba.'], topics: ['agua', 'obras'] },
  { slug: 'entrevista-equipo-atencion-ciudadana-demo', category: 'entrevista', muni: null, day: -12, title: 'Entrevista: el equipo de atención ciudadana cuenta cómo trabaja (demo)',
    excerpt: 'Quién lee lo que llega, cómo se asigna y en cuánto tiempo se responde.',
    body: ['Lo que llega por la web lo lee primero la coordinación de atención, que lo pasa al área que corresponde.', 'Las denuncias las leen solo el operador de denuncias y la coordinación.', 'Entrevista inventada para la versión de prueba.'], topics: ['participación'] },
  { slug: 'entregadas-viviendas-pedro-maria-urena-demo', category: 'noticia', muni: 'Pedro María Ureña', day: -15, title: 'Entregadas 40 viviendas en Pedro María Ureña (demo)',
    excerpt: 'Las familias recibieron sus llaves en un acto con la comunidad.', body: ['Las familias recibieron sus llaves en un acto con la comunidad.', 'Cifra inventada para la versión de prueba.'], topics: ['vivienda'] },
  { slug: 'salio-el-semanario-12-demo', category: 'comunicado', muni: null, day: -18, title: 'Ya está en la web el Semanario n.º 12 (demo)',
    excerpt: 'El boletín de la semana, para leer o descargar sin pasar por otras plataformas.', body: ['El boletín de la semana ahora vive en esta web, con su página y su archivo.', 'Texto inventado para la versión de prueba.'], topics: ['semanario'] },
  { slug: 'alumbrado-nuevo-cardenas-demo', category: 'noticia', muni: 'Cárdenas', day: -21, title: 'Alumbrado nuevo en tres sectores de Cárdenas (demo)',
    excerpt: 'Postes y luminarias nuevas donde los vecinos reportaron calles oscuras.', body: ['Se instalaron postes y luminarias donde los vecinos reportaron calles oscuras.', 'Texto inventado para la versión de prueba.'], topics: ['electricidad', 'obras'] },
  { slug: 'transparencia-que-cifras-publica-la-web-demo', category: 'articulo', muni: null, day: -25, title: 'Transparencia: qué cifras publica esta web y cómo se calculan (demo)',
    excerpt: 'Solicitudes recibidas, resueltas, pendientes y vencidas, sin datos de ninguna persona.',
    body: ['La web publica cuántas solicitudes llegan, cuántas se resuelven, cuántas siguen abiertas y cuántas pasaron su plazo de atención.', 'Ninguna cifra lleva datos de personas. Las denuncias solo cuentan en los totales.', 'Texto inventado para la versión de prueba.'], topics: ['transparencia'] },
  { slug: 'escuela-rehabilitada-michelena-demo', category: 'noticia', muni: 'Michelena', day: -30, title: 'Escuela rehabilitada en Michelena reabre sus aulas (demo)',
    excerpt: 'Techo, baños y pintura nuevos para el inicio de clases.', body: ['Techo, baños y pintura nuevos para el inicio de clases.', 'Texto inventado para la versión de prueba.'], topics: ['educación', 'obras'] },
  { slug: 'limpieza-de-quebradas-torbes-demo', category: 'noticia', muni: 'Torbes', day: -36, title: 'Operativo de limpieza de quebradas en Torbes (demo)',
    excerpt: 'Antes de las lluvias, cuadrillas y vecinos limpiaron los cauces.', body: ['Antes de las lluvias, cuadrillas y vecinos limpiaron los cauces.', 'Texto inventado para la versión de prueba.'], topics: ['ambiente'] },
  // Programada: sale sola en dos días.
  { slug: 'proxima-jornada-de-vacunacion-libertador-demo', category: 'noticia', muni: 'Libertador', day: 2, status: 'scheduled', title: 'Jornada de vacunación en Libertador (demo)',
    excerpt: 'Vacunas para niños y adultos mayores en los ambulatorios del municipio.', body: ['Vacunas para niños y adultos mayores en los ambulatorios del municipio.', 'Texto inventado para la versión de prueba.'], topics: ['salud'] },
  // Sin publicar: para el administrador de la web.
  { slug: 'balance-del-mes-demo', category: 'articulo', muni: null, day: -1, status: 'draft', title: 'Borrador: balance del mes (demo)',
    excerpt: 'Lo hecho en el mes, por municipio.', body: ['Por completar.'], topics: [] },
  { slug: 'ferias-de-alimentos-fin-de-semana-demo', category: 'noticia', muni: 'Guásimos', day: -1, status: 'in_review', title: 'Ferias de alimentos del fin de semana (demo)',
    excerpt: 'Dónde y a qué hora, municipio por municipio.', body: ['Texto inventado para la versión de prueba.'], topics: ['alimentación'] },
];

export const DEMO_PROJECTS: DemoProject[] = [
  { slug: 'rehabilitacion-avenida-principal-demo', category: 'vialidad', state: 'en_ejecucion', muni: 'San Cristóbal', day: -2, title: 'Rehabilitación de la avenida principal (demo)',
    excerpt: 'Asfaltado, drenajes y aceras del tramo más dañado.', place: 'Tramo central (demo)', beneficiaries: 'Unas 30.000 personas que la recorren cada día (demo)',
    description: ['Asfaltado, drenajes y aceras nuevas en el tramo central.', 'Datos inventados para la versión de prueba.'], progress: 45, investment: { amount: 1_200_000, currency: 'USD' }, started: -20, expected: 60 },
  { slug: 'planta-potabilizadora-bolivar-demo', category: 'agua', state: 'concluido', muni: 'Bolívar', day: -10, title: 'Planta potabilizadora (demo)',
    excerpt: 'Agua continua para los sectores que la recibían por horas.', place: 'Sector norte (demo)', beneficiaries: '4.500 familias (demo)',
    description: ['Una planta nueva que surte de forma continua a los sectores altos.', 'Datos inventados para la versión de prueba.'], started: -150, finished: -12 },
  { slug: 'urbanismo-40-viviendas-demo', category: 'vivienda', state: 'concluido', muni: 'Pedro María Ureña', day: -15, title: 'Urbanismo de 40 viviendas (demo)',
    excerpt: 'Casas con servicios, entregadas a sus familias.', place: 'Urbanismo de prueba (demo)', beneficiaries: '40 familias (demo)',
    description: ['Cuarenta casas con agua, luz y vialidad interna.', 'Datos inventados para la versión de prueba.'], investment: { amount: 850_000, currency: 'USD' }, started: -300, finished: -16 },
  { slug: 'alumbrado-tres-sectores-cardenas-demo', category: 'electricidad', state: 'en_ejecucion', muni: 'Cárdenas', day: -21, title: 'Alumbrado público en tres sectores (demo)',
    excerpt: 'Postes y luminarias LED donde había calles oscuras.', place: 'Sectores centro, norte y sur (demo)', beneficiaries: '2.000 vecinos (demo)',
    description: ['Postes y luminarias LED nuevas.', 'Datos inventados para la versión de prueba.'], progress: 70, started: -40, expected: 15 },
  { slug: 'rehabilitacion-escuela-michelena-demo', category: 'educacion', state: 'concluido', muni: 'Michelena', day: -30, title: 'Rehabilitación de la escuela (demo)',
    excerpt: 'Techo, baños y pintura para el nuevo año escolar.', place: 'Escuela de prueba (demo)', beneficiaries: '320 estudiantes (demo)',
    description: ['Techo nuevo, baños y pintura.', 'Datos inventados para la versión de prueba.'], started: -90, finished: -31 },
  { slug: 'ambulatorio-rural-junin-demo', category: 'salud', state: 'anunciado', muni: 'Junín', day: -6, title: 'Nuevo ambulatorio rural (demo)',
    excerpt: 'Consulta y emergencias básicas cerca de casa.', place: 'Zona rural (demo)', beneficiaries: '6.000 personas (demo)',
    description: ['Un ambulatorio con consulta y emergencias básicas.', 'Datos inventados para la versión de prueba.'], expected: 180 },
  { slug: 'limpieza-canalizacion-quebradas-torbes-demo', category: 'ambiente', state: 'en_ejecucion', muni: 'Torbes', day: -36, title: 'Limpieza y canalización de quebradas (demo)',
    excerpt: 'Cauces limpios antes de las lluvias.', place: 'Quebradas del municipio (demo)', beneficiaries: '1.500 familias en zonas bajas (demo)',
    description: ['Limpieza de cauces y muros de contención.', 'Datos inventados para la versión de prueba.'], progress: 30, started: -36, expected: 45 },
  { slug: 'cancha-techada-lobatera-demo', category: 'deporte-cultura', state: 'anunciado', muni: 'Lobatera', day: -9, title: 'Cancha techada comunitaria (demo)',
    excerpt: 'Un espacio techado para el deporte y las reuniones de la comunidad.', place: 'Centro (demo)', beneficiaries: 'La comunidad del centro (demo)',
    description: ['Cancha múltiple con techo y gradas.', 'Datos inventados para la versión de prueba.'], expected: 120 },
  { slug: 'puente-vehicular-fernandez-feo-demo', category: 'vialidad', state: 'concluido', muni: 'Fernández Feo', day: -45, title: 'Puente vehicular (demo)',
    excerpt: 'Paso seguro todo el año, también en temporada de lluvias.', place: 'Vía rural (demo)', beneficiaries: '12 caseríos (demo)',
    description: ['Un puente que reemplaza el paso por el río.', 'Datos inventados para la versión de prueba.'], started: -200, finished: -46 },
  { slug: 'red-de-tuberias-garcia-de-hevia-demo', category: 'agua', state: 'anunciado', muni: 'García de Hevia', day: -5, title: 'Red de tuberías del sector norte (demo)',
    excerpt: 'Tuberías nuevas para acabar con las fugas.', place: 'Sector norte (demo)', beneficiaries: '900 familias (demo)',
    description: ['Cambio de la red de tuberías.', 'Datos inventados para la versión de prueba.'], expected: 90 },
  { slug: 'comedor-comunitario-libertador-demo', category: 'social', state: 'en_ejecucion', muni: 'Libertador', day: -14, title: 'Comedor comunitario (demo)',
    excerpt: 'Almuerzo diario para niños y adultos mayores.', place: 'Casa comunal (demo)', beneficiaries: '250 personas al día (demo)',
    description: ['Cocina equipada y almuerzo diario.', 'Datos inventados para la versión de prueba.'], started: -14 },
  { slug: 'dotacion-hospital-ayacucho-demo', category: 'salud', state: 'concluido', muni: 'Ayacucho', day: -50, title: 'Dotación del hospital (demo)',
    excerpt: 'Equipos e insumos para el área de emergencias.', place: 'Hospital de prueba (demo)', beneficiaries: 'El municipio y sus vecinos (demo)',
    description: ['Equipos e insumos nuevos para emergencias.', 'Datos inventados para la versión de prueba.'], finished: -51 },
  { slug: 'asfaltado-via-de-acceso-uribante-demo', category: 'vialidad', state: 'anunciado', muni: 'Uribante', day: -3, title: 'Asfaltado de la vía de acceso (demo)',
    excerpt: 'La vía principal de entrada al municipio, asfaltada de punta a punta.', place: 'Vía de acceso (demo)', beneficiaries: 'Todo el municipio (demo)',
    description: ['Asfaltado y señalización.', 'Datos inventados para la versión de prueba.'], expected: 150 },
  { slug: 'liceo-techo-y-banos-independencia-demo', category: 'educacion', state: 'en_ejecucion', muni: 'Independencia', day: -18, title: 'Liceo: techo y baños nuevos (demo)',
    excerpt: 'Las aulas sin goteras y los baños funcionando.', place: 'Liceo de prueba (demo)', beneficiaries: '540 estudiantes (demo)',
    description: ['Techo nuevo y baños.', 'Datos inventados para la versión de prueba.'], progress: 55, started: -25, expected: 30 },
];

// The weekly program's name is the client's (its menu label in the config, §11.6), never written here; the slugs keep
// the program's route.
const PROGRAM = programNameOf(getClientConfig());

export const DEMO_EPISODES = [1, 2, 3, 4, 5, 6].map((n) => ({
  slug: `reporte-bernal-programa-${30 - n}-demo`,
  day: -1 - (n - 1) * 7,
  title: `${PROGRAM} · Programa ${30 - n} (demo)`,
  excerpt: ['Obras de la semana y casos atendidos en la web.', 'Salud, vialidad y las preguntas de la gente.', 'Agua y electricidad: lo que se hizo y lo que falta.', 'Vivienda y deporte en los municipios.', 'Lo que llegó por la web y cómo se resolvió.', 'Educación: escuelas y liceos rehabilitados.'][n - 1],
  topics: [['obras', 'participación'], ['salud', 'vialidad'], ['agua', 'electricidad'], ['vivienda', 'deporte'], ['participación'], ['educación']][n - 1],
  minutes: 40 + n * 3,
}));

export const DEMO_DOCUMENTS: DemoDocument[] = [
  { slug: 'semanario-12-demo', category: 'semanario', day: -18, title: 'Semanario n.º 12 (demo)', excerpt: 'El boletín de la semana.', version: 'n.º 12', pages: ['Semanario n.º 12 (demo)', 'Boletín inventado para la versión de prueba.'] },
  { slug: 'semanario-11-demo', category: 'semanario', day: -25, title: 'Semanario n.º 11 (demo)', excerpt: 'El boletín de la semana.', version: 'n.º 11', pages: ['Semanario n.º 11 (demo)', 'Boletín inventado para la versión de prueba.'] },
  { slug: 'semanario-10-demo', category: 'semanario', day: -32, title: 'Semanario n.º 10 (demo)', excerpt: 'El boletín de la semana.', version: 'n.º 10', pages: ['Semanario n.º 10 (demo)', 'Boletín inventado para la versión de prueba.'] },
  { slug: 'informe-tercer-trimestre-demo', category: 'informe', day: -40, title: 'Informe de gestión del tercer trimestre (demo)', excerpt: 'Las obras y la atención del trimestre.', version: 'Versión 1', pages: ['Informe de gestión (demo)', 'Documento inventado para la versión de prueba.'] },
  { slug: 'rendicion-de-cuentas-demo', category: 'rendicion', day: -60, title: 'Memoria y Cuenta del año anterior (demo)', excerpt: 'La gestión del año, por área.', version: 'Versión final', pages: ['Memoria y Cuenta (demo)', 'Documento inventado para la versión de prueba.'] },
  { slug: 'normas-de-la-participacion-demo', category: 'normativa', day: -20, title: 'Normas de la participación ciudadana (demo)', excerpt: 'Qué se puede enviar, quién lo lee y en cuánto tiempo se responde.', version: 'Versión 1', pages: ['Normas de la participación (demo)', 'Documento inventado para la versión de prueba.'] },
  { slug: 'kit-de-prensa-demo', category: 'prensa', day: -14, title: 'Datos de la gestión para la prensa (demo)', excerpt: 'Datos básicos para periodistas.', version: 'Noviembre', pages: ['Material para la prensa (demo)', 'Documento inventado para la versión de prueba.'] },
  { slug: 'guia-para-hacer-un-reporte-demo', category: 'otro', day: -9, title: 'Guía para hacer un reporte (demo)', excerpt: 'Paso a paso, con fotos de la pantalla.', version: 'Versión 1', pages: ['Guía para hacer un reporte (demo)', 'Documento inventado para la versión de prueba.'] },
];

export const DEMO_NOTICES: DemoNotice[] = [
  { slug: 'corte-de-agua-por-mantenimiento-demo', category: 'agua', munis: ['San Cristóbal', 'Torbes'], day: -1, expires: 3, title: 'Corte de agua por mantenimiento (demo)',
    body: 'El servicio se interrumpe por trabajos en la tubería principal. Vuelve en cuanto terminen. Aviso inventado para la versión de prueba.' },
  { slug: 'paso-restringido-por-obras-demo', category: 'vialidad', munis: ['Junín'], day: -3, expires: 10, title: 'Paso restringido en la vía por obras (demo)',
    body: 'Se pasa por un solo canal mientras duran los trabajos. Aviso inventado para la versión de prueba.' },
  // Vencido: la web ya no lo muestra como vigente.
  { slug: 'interrupcion-electrica-por-trabajos-demo', category: 'electricidad', munis: ['Cárdenas'], day: -6, expires: -2, title: 'Interrupción eléctrica por trabajos en la red (demo)',
    body: 'Trabajos en la red eléctrica del municipio. Aviso inventado para la versión de prueba.' },
  { slug: 'nuevo-horario-transporte-publico-demo', category: 'transporte', munis: [], day: -8, expires: null, title: 'Nuevo horario del transporte público (demo)',
    body: 'Las rutas principales amplían su horario en la tarde. Aviso inventado para la versión de prueba.' },
];

export const DEMO_FAQS: DemoFaq[] = [
  { slug: 'como-sigo-mi-solicitud-demo', group: 'atencion', order: 1, q: '¿Cómo sigo mi solicitud? (demo)', a: ['En «Consultar mi solicitud», con el código y la clave de su comprobante.'] },
  { slug: 'perdi-mi-clave-demo', group: 'atencion', order: 2, q: '¿Qué pasa si pierdo la clave? (demo)', a: ['La clave no se puede recuperar. Si dejó un dato de contacto, el personal de atención puede escribirle por esa vía.'] },
  { slug: 'puedo-enviar-sin-mi-nombre-demo', group: 'atencion', order: 3, q: '¿Puedo enviar sin dar mi nombre? (demo)', a: ['Sí. Sin datos de contacto, el código y la clave son la única forma de consultar la solicitud. Guárdelos en un lugar seguro.'] },
  { slug: 'quien-lee-una-denuncia-demo', group: 'atencion', order: 4, q: '¿Quién lee una denuncia? (demo)', a: [DENUNCIA_NOTICE] },
  { slug: 'cuanto-tardan-en-responder-demo', group: 'atencion', order: 5, q: '¿Cuánto tardan en responder? (demo)', a: ['Depende de lo que se pida y de su urgencia: las urgentes se atienden primero. Cada avance aparece en «Consultar mi solicitud».'] },
  { slug: 'es-un-servicio-de-emergencias-demo', group: 'atencion', order: 6, q: '¿Esto es un servicio de emergencias? (demo)', a: [EMERGENCY_NOTICE] },
  { slug: 'que-datos-guarda-la-web-demo', group: 'web', order: 1, q: '¿Qué datos guarda esta web? (demo)', a: ['Solo lo necesario para atender lo que usted envía. El contacto es opcional y se guarda cifrado. El aviso de privacidad lo explica completo.'] },
  { slug: 'como-reconocer-los-canales-oficiales-demo', group: 'web', order: 2, q: '¿Cómo reconozco los canales oficiales? (demo)', a: ['Son los que aparecen en «Canales». Nadie de la Gobernación le pedirá claves ni pagos.'] },
  { slug: 'donde-veo-las-obras-demo', group: 'gobernacion', order: 1, q: '¿Dónde veo las obras de mi municipio? (demo)', a: ['En «Gestión», puede filtrar por municipio, categoría o estado.'] },
  { slug: 'que-es-el-semanario-demo', group: 'gobernacion', order: 2, q: '¿Qué es el Semanario? (demo)', a: ['El boletín de la semana. Está en «Noticias», para leer o descargar.'] },
];

export const DEMO_INDICATORS: DemoIndicator[] = [
  { slug: 'viviendas-entregadas-demo', order: 1, title: 'Viviendas entregadas (demo)', value: 1250, unit: 'viviendas' },
  { slug: 'personas-atendidas-en-jornadas-demo', order: 2, title: 'Personas atendidas en jornadas de salud (demo)', value: 18400, unit: 'personas' },
  { slug: 'protesis-entregadas-demo', order: 3, title: 'Prótesis entregadas (demo)', value: 320, unit: 'prótesis' },
  { slug: 'obras-concluidas-demo', order: 4, title: 'Obras concluidas (demo)', value: 42, unit: 'obras' },
];
