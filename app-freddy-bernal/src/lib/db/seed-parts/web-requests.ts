// The demo's citizen requests (design §8): 60 INVENTED cases of the six kinds, across states, municipalities and areas,
// with what happened to each (built by seed-parts/web.ts from its state: review, assignment, attention, replies, notes,
// requests for information, resolution, closing). Generic sectors, no names, no phones, no addresses; denuncias never
// with a point or a reference. `day` = days ago it arrived. Plain data.
import type { RequestPriority, RequestState, RequestType } from '../../participation/input';

export type DemoRequest = {
  type: RequestType;
  cat: string;
  muni: string | null;
  sector: string;
  title: string;
  text: string;
  state: RequestState;
  day: number;
  prio?: RequestPriority;
  // A point with the person's consent (never for a denuncia), and a reference of the place.
  point?: [number, number];
  place?: string;
  anonymous?: boolean;
  contact?: 'email' | 'phone' | 'whatsapp';
  nameConsent?: boolean;
  supports?: number;
  photo?: boolean;
  evidence?: boolean;
  spam?: boolean;
  // Index (in DEMO_REQUESTS) of the case it was merged into.
  mergeInto?: number;
  // A published project it is about («Hacer una observación sobre esta obra»).
  linked?: string;
  confirmed?: boolean;
  // «Lo atendido»: the public summary (denuncias get the database's fixed sentence).
  attended?: string;
  // The receipts of docs/DEMO.md: «AC-<año>-<suffix>» and its secret.
  showcase?: { suffix: string; secret: string };
};

const SC: [number, number] = [7.767, -72.225];
const near = (base: [number, number], dLat: number, dLng: number): [number, number] => [+(base[0] + dLat).toFixed(4), +(base[1] + dLng).toFixed(4)];

export const DEMO_REQUESTS: DemoRequest[] = [
  // --- Reportes (24) -------------------------------------------------------------------------------------------------
  { type: 'reporte', cat: 'vialidad', muni: 'San Cristóbal', sector: 'Sector centro (demo)', title: 'Hueco grande en la avenida principal (demo)', text: 'Hay un hueco que ocupa medio canal y ya causó accidentes de motos (demo).', state: 'en_atencion', day: -12, prio: 'alta', point: near(SC, 0.002, 0.001), place: 'Frente a la plaza (demo)', contact: 'email', supports: 3, photo: true, linked: 'rehabilitacion-avenida-principal-demo', showcase: { suffix: 'DEMR01', secret: 'K7QM-2HXP-9WRT-4BNE' } },
  { type: 'reporte', cat: 'agua', muni: 'San Cristóbal', sector: 'Sector norte (demo)', title: 'Tubería rota que bota agua limpia (demo)', text: 'Desde hace tres días sale agua de la tubería en la esquina y se pierde por la cuneta (demo).', state: 'resuelto', day: -20, point: near(SC, 0.011, -0.004), place: 'Esquina de la cancha (demo)', contact: 'whatsapp', photo: true, evidence: true, showcase: { suffix: 'DEMR02', secret: 'R3PS-W8N2-DEMV-7QKA' } },
  { type: 'reporte', cat: 'electricidad-alumbrado', muni: 'Cárdenas', sector: 'Sector sur (demo)', title: 'Calle sin alumbrado desde hace semanas (demo)', text: 'Las tres lámparas de la calle están apagadas y de noche no se ve nada (demo).', state: 'requiere_informacion', day: -9, contact: 'email', showcase: { suffix: 'DEMR03', secret: 'H4JX-5ZTB-9CNF-W2YE' } },
  { type: 'reporte', cat: 'ambiente-aseo', muni: 'Torbes', sector: 'Vía principal (demo)', title: 'Basura acumulada junto a la quebrada (demo)', text: 'Botan basura junto a la quebrada y cuando llueve se tapa el paso del agua (demo).', state: 'asignado', day: -5, point: near([7.79, -72.19], 0.001, 0.002), anonymous: true, supports: 2 },
  { type: 'reporte', cat: 'vialidad', muni: 'Junín', sector: 'Sector centro (demo)', title: 'Brocal hundido en la esquina (demo)', text: 'El brocal se hundió y los carros caen en el hueco al cruzar (demo).', state: 'recibido', day: -1, point: near([7.70, -72.36], 0.001, -0.001), contact: 'phone' },
  { type: 'reporte', cat: 'agua', muni: 'Bolívar', sector: 'Sector alto (demo)', title: 'No llega el agua a la parte alta (demo)', text: 'En la parte alta del sector tenemos una semana sin agua (demo).', state: 'cerrado', day: -40, contact: 'email', confirmed: true, attended: 'Se cambió la bomba del sector alto y el agua volvió a llegar a todas las casas (demo).', nameConsent: true },
  { type: 'reporte', cat: 'electricidad-alumbrado', muni: 'Guásimos', sector: 'Sector centro (demo)', title: 'Transformador que hace ruido y se apaga (demo)', text: 'El transformador de la esquina se apaga varias veces al día (demo).', state: 'derivado', day: -15, contact: 'email' },
  { type: 'reporte', cat: 'vialidad', muni: 'Fernández Feo', sector: 'Vía rural (demo)', title: 'Derrumbe parcial en la vía rural (demo)', text: 'Un derrumbe tapa la mitad de la vía hacia los caseríos (demo).', state: 'resuelto', day: -28, prio: 'urgente', evidence: true, attended: 'Se retiró el derrumbe y la vía quedó habilitada en los dos canales (demo).' },
  { type: 'reporte', cat: 'ambiente-aseo', muni: 'San Cristóbal', sector: 'Sector este (demo)', title: 'No pasa el camión del aseo (demo)', text: 'El camión del aseo no pasa desde hace dos semanas (demo).', state: 'en_revision', day: -2, contact: 'email' },
  { type: 'reporte', cat: 'servicios-comunitarios', muni: 'Michelena', sector: 'Sector centro (demo)', title: 'Cancha con el techo dañado (demo)', text: 'La lámina del techo de la cancha se soltó con el viento (demo).', state: 'en_atencion', day: -14, contact: 'whatsapp' },
  { type: 'reporte', cat: 'agua', muni: 'García de Hevia', sector: 'Sector norte (demo)', title: 'Fuga en la tubería principal (demo)', text: 'Hay una fuga grande en la tubería que pasa por el sector (demo).', state: 'asignado', day: -7, linked: 'red-de-tuberias-garcia-de-hevia-demo', contact: 'email' },
  { type: 'reporte', cat: 'vialidad', muni: 'San Cristóbal', sector: 'Sector centro (demo)', title: 'Otro hueco en la avenida principal (demo)', text: 'El mismo hueco de la avenida, cada día más grande (demo).', state: 'cerrado', day: -11, point: near(SC, 0.0021, 0.0011), mergeInto: 0 },
  { type: 'reporte', cat: 'electricidad-alumbrado', muni: 'Lobatera', sector: 'Sector centro (demo)', title: 'Poste inclinado a punto de caer (demo)', text: 'Un poste quedó inclinado después de la lluvia (demo).', state: 'resuelto', day: -18, prio: 'alta', contact: 'phone', evidence: true, attended: 'Se cambió el poste inclinado por uno nuevo (demo).' },
  { type: 'reporte', cat: 'transporte', muni: 'Córdoba', sector: 'Parada principal (demo)', title: 'Parada sin techo ni banco (demo)', text: 'La parada principal no tiene techo y la gente espera bajo la lluvia (demo).', state: 'recibido', day: -1, contact: 'email' },
  { type: 'reporte', cat: 'ambiente-aseo', muni: 'Independencia', sector: 'Sector oeste (demo)', title: 'Quema de basura en un terreno (demo)', text: 'Queman basura en un terreno baldío y el humo llega a las casas (demo).', state: 'en_atencion', day: -10, anonymous: true },
  { type: 'reporte', cat: 'vialidad', muni: 'Ayacucho', sector: 'Sector sur (demo)', title: 'Calle de tierra intransitable (demo)', text: 'Con las lluvias la calle de tierra quedó llena de barro (demo).', state: 'no_procede', day: -25, contact: 'email' },
  { type: 'reporte', cat: 'agua', muni: 'Pedro María Ureña', sector: 'Urbanismo (demo)', title: 'Agua turbia en el urbanismo (demo)', text: 'El agua llega turbia desde hace unos días (demo).', state: 'en_revision', day: -3, contact: 'whatsapp' },
  { type: 'reporte', cat: 'servicios-comunitarios', muni: 'Junín', sector: 'Plaza (demo)', title: 'Plaza sin iluminación ni mantenimiento (demo)', text: 'La plaza está oscura y con el monte alto (demo).', state: 'recibido', day: 0, point: near([7.70, -72.36], -0.002, 0.001) },
  { type: 'reporte', cat: 'vialidad', muni: 'Uribante', sector: 'Vía de acceso (demo)', title: 'Huecos en la vía de acceso (demo)', text: 'La vía de acceso al municipio tiene muchos huecos (demo).', state: 'asignado', day: -4, linked: 'asfaltado-via-de-acceso-uribante-demo', supports: 1, contact: 'email' },
  { type: 'reporte', cat: 'electricidad-alumbrado', muni: 'Cárdenas', sector: 'Sector norte (demo)', title: 'Cables caídos en la acera (demo)', text: 'Hay cables caídos en la acera desde la última tormenta (demo).', state: 'cerrado', day: -33, prio: 'urgente', evidence: true },
  { type: 'reporte', cat: 'agua', muni: 'Torbes', sector: 'Sector centro (demo)', title: 'Tanquilla destapada en la calle (demo)', text: 'Una tanquilla quedó sin tapa y es un peligro de noche (demo).', state: 'en_atencion', day: -8, prio: 'alta', photo: true, contact: 'phone' },
  { type: 'reporte', cat: 'ambiente-aseo', muni: 'Guásimos', sector: 'Sector este (demo)', title: 'Árbol que tapa la calle (demo)', text: 'Un árbol caído tapa la mitad de la calle (demo).', state: 'resuelto', day: -16, evidence: true },
  { type: 'reporte', cat: 'otros', muni: 'San Judas Tadeo', sector: 'Sector centro (demo)', title: 'Ruido de una planta eléctrica toda la noche (demo)', text: 'Una planta eléctrica suena toda la noche cerca de las casas (demo).', state: 'requiere_informacion', day: -6, contact: 'email' },
  { type: 'reporte', cat: 'vialidad', muni: 'Libertador', sector: 'Sector centro (demo)', title: 'Semáforo dañado en el cruce (demo)', text: 'El semáforo del cruce principal está apagado (demo).', state: 'recibido', day: 0, contact: 'whatsapp' },

  // --- Peticiones (10) -----------------------------------------------------------------------------------------------
  { type: 'peticion', cat: 'salud', muni: 'Junín', sector: 'Sector rural (demo)', title: 'Jornada médica para el caserío (demo)', text: 'Pedimos una jornada médica para el caserío: hay muchos adultos mayores (demo).', state: 'asignado', day: -6, contact: 'email' },
  { type: 'peticion', cat: 'educacion', muni: 'Michelena', sector: 'Escuela (demo)', title: 'Pupitres para la escuela (demo)', text: 'La escuela necesita pupitres para dos salones (demo).', state: 'resuelto', day: -35, contact: 'email', nameConsent: true, attended: 'La escuela recibió pupitres nuevos para dos salones (demo).' },
  { type: 'peticion', cat: 'servicios-comunitarios', muni: 'Lobatera', sector: 'Casa comunal (demo)', title: 'Sillas para la casa comunal (demo)', text: 'Pedimos sillas para las reuniones de la casa comunal (demo).', state: 'recibido', day: -2 },
  { type: 'peticion', cat: 'otros', muni: 'San Cristóbal', sector: 'Sector oeste (demo)', title: 'Apoyo con un trámite de vivienda (demo)', text: 'Necesito orientación para un trámite de vivienda que está detenido (demo).', state: 'en_atencion', day: -13, contact: 'phone' },
  { type: 'peticion', cat: 'salud', muni: 'Ayacucho', sector: 'Sector centro (demo)', title: 'Medicinas para pacientes crónicos (demo)', text: 'Pedimos apoyo con medicinas para pacientes crónicos del sector (demo).', state: 'derivado', day: -19, contact: 'email' },
  { type: 'peticion', cat: 'servicios-comunitarios', muni: 'Seboruco', sector: 'Sector centro (demo)', title: 'Bombillos para la cancha (demo)', text: 'La cancha necesita bombillos nuevos para jugar de noche (demo).', state: 'cerrado', day: -38, contact: 'whatsapp', confirmed: true, attended: 'Se cambiaron los bombillos de la cancha y ya se juega de noche (demo).' },
  { type: 'peticion', cat: 'educacion', muni: 'Independencia', sector: 'Liceo (demo)', title: 'Transporte para los estudiantes (demo)', text: 'Los estudiantes de la zona alta caminan mucho para llegar al liceo (demo).', state: 'en_revision', day: -3, contact: 'email' },
  { type: 'peticion', cat: 'otros', muni: 'Córdoba', sector: 'Sector sur (demo)', title: 'Ayuda técnica para un emprendimiento (demo)', text: 'Pedimos un taller para emprendedores del sector (demo).', state: 'no_procede', day: -30, contact: 'email' },
  { type: 'peticion', cat: 'salud', muni: 'Libertad', sector: 'Ambulatorio (demo)', title: 'Médico fijo en el ambulatorio (demo)', text: 'El ambulatorio pasa días sin médico (demo).', state: 'asignado', day: -8, anonymous: true },
  { type: 'peticion', cat: 'servicios-comunitarios', muni: 'Rafael Urdaneta', sector: 'Sector centro (demo)', title: 'Mantenimiento del parque infantil (demo)', text: 'Los columpios del parque están rotos (demo).', state: 'recibido', day: -1, contact: 'email' },

  // --- Acotaciones (7) -----------------------------------------------------------------------------------------------
  { type: 'acotacion', cat: 'vialidad', muni: 'San Cristóbal', sector: 'Avenida principal (demo)', title: 'Los desvíos de la obra no están señalizados (demo)', text: 'Los desvíos por la obra de la avenida no tienen señales y confunden a los conductores (demo).', state: 'en_atencion', day: -4, linked: 'rehabilitacion-avenida-principal-demo', contact: 'email' },
  { type: 'acotacion', cat: 'otros', muni: null, sector: '', title: 'La web debería tener las rutas del transporte (demo)', text: 'Sería útil ver en la web las rutas del transporte público (demo).', state: 'recibido', day: -2 },
  { type: 'acotacion', cat: 'agua', muni: 'Bolívar', sector: 'Sector norte (demo)', title: 'La planta funciona, pero falta presión arriba (demo)', text: 'Desde la planta nueva hay agua, pero arriba llega con poca presión (demo).', state: 'asignado', day: -7, linked: 'planta-potabilizadora-bolivar-demo', contact: 'email' },
  { type: 'acotacion', cat: 'educacion', muni: 'Michelena', sector: 'Escuela (demo)', title: 'Falta pintar la cerca de la escuela (demo)', text: 'La escuela quedó bien, solo falta pintar la cerca (demo).', state: 'cerrado', day: -27, contact: 'email' },
  { type: 'acotacion', cat: 'otros', muni: 'Torbes', sector: '', title: 'Más avisos antes de los cortes (demo)', text: 'Los cortes de agua deberían avisarse con más tiempo (demo).', state: 'en_revision', day: -5 },
  { type: 'acotacion', cat: 'transporte', muni: 'Cárdenas', sector: 'Parada (demo)', title: 'La ruta de la tarde pasa muy llena (demo)', text: 'La ruta de la tarde siempre pasa llena y no para (demo).', state: 'recibido', day: -1 },
  { type: 'acotacion', cat: 'otros', muni: null, sector: '', title: 'Mensaje sin relación con la gestión (demo)', text: 'Texto de publicidad que no tiene que ver con la gestión (demo).', state: 'no_procede', day: -12, spam: true },

  // --- Sugerencias (6) -----------------------------------------------------------------------------------------------
  { type: 'sugerencia', cat: 'transporte', muni: 'San Cristóbal', sector: '', title: 'Una ruta nocturna los fines de semana (demo)', text: 'Sugiero una ruta de transporte nocturna los fines de semana (demo).', state: 'en_revision', day: -6, contact: 'email' },
  { type: 'sugerencia', cat: 'ambiente-aseo', muni: 'Guásimos', sector: '', title: 'Puntos de reciclaje en las plazas (demo)', text: 'Pongan puntos de reciclaje en las plazas del municipio (demo).', state: 'asignado', day: -9 },
  { type: 'sugerencia', cat: 'otros', muni: null, sector: '', title: 'Avisos por WhatsApp de los cortes (demo)', text: 'Sería bueno recibir los avisos de cortes por el canal de WhatsApp (demo).', state: 'resuelto', day: -22, contact: 'whatsapp', attended: 'Los avisos de servicio ahora también salen por el canal oficial (demo).' },
  { type: 'sugerencia', cat: 'educacion', muni: 'Junín', sector: '', title: 'Biblioteca abierta en las tardes (demo)', text: 'Sugiero abrir la biblioteca municipal en las tardes (demo).', state: 'recibido', day: -3 },
  { type: 'sugerencia', cat: 'salud', muni: 'Ayacucho', sector: '', title: 'Citas por la web para el ambulatorio (demo)', text: 'Que se puedan pedir citas del ambulatorio por la web (demo).', state: 'derivado', day: -17, contact: 'email' },
  { type: 'sugerencia', cat: 'servicios-comunitarios', muni: 'Libertador', sector: '', title: 'Ferias de emprendedores en la plaza (demo)', text: 'Hacer ferias de emprendedores en la plaza una vez al mes (demo).', state: 'cerrado', day: -31 },

  // --- Reconocimientos (5) -------------------------------------------------------------------------------------------
  { type: 'reconocimiento', cat: 'salud', muni: 'Junín', sector: '', title: 'Gracias al equipo de la jornada de salud (demo)', text: 'Nos atendieron muy bien en la jornada de salud (demo).', state: 'cerrado', day: -5, contact: 'email', nameConsent: true },
  { type: 'reconocimiento', cat: 'educacion', muni: 'Michelena', sector: '', title: 'La escuela quedó muy bonita (demo)', text: 'Agradecemos la rehabilitación de la escuela (demo).', state: 'resuelto', day: -26 },
  { type: 'reconocimiento', cat: 'vialidad', muni: 'Fernández Feo', sector: '', title: 'El puente nos cambió la vida (demo)', text: 'Gracias por el puente: ya no quedamos aislados cuando llueve (demo).', state: 'cerrado', day: -40, contact: 'email' },
  { type: 'reconocimiento', cat: 'otros', muni: null, sector: '', title: 'Me respondieron rápido por la web (demo)', text: 'Mi reporte se resolvió en pocos días. Gracias (demo).', state: 'recibido', day: -1 },
  { type: 'reconocimiento', cat: 'agua', muni: 'Bolívar', sector: '', title: 'Por fin tenemos agua todo el día (demo)', text: 'Gracias por la planta: tenemos agua todo el día (demo).', state: 'en_revision', day: -4 },

  // --- Denuncias (8): privadas de punta a punta, solo municipio y sector -------------------------------------------
  { type: 'denuncia', cat: 'otros', muni: 'San Cristóbal', sector: 'Sector centro (demo)', title: 'Cobro indebido por un trámite (demo)', text: 'Me pidieron dinero para agilizar un trámite que es gratuito (demo).', state: 'en_atencion', day: -10, contact: 'email', prio: 'alta' },
  { type: 'denuncia', cat: 'servicios-comunitarios', muni: 'Guásimos', sector: 'Sector este (demo)', title: 'Materiales de una obra desviados (demo)', text: 'Vimos cómo se llevaban materiales de la obra en un camión sin identificación (demo).', state: 'asignado', day: -6, anonymous: true },
  { type: 'denuncia', cat: 'seguridad', muni: 'Junín', sector: 'Sector rural (demo)', title: 'Amenazas a vecinos que reclamaron (demo)', text: 'Unos vecinos recibieron amenazas después de reclamar por el servicio (demo).', state: 'recibido', day: -1, anonymous: true, prio: 'urgente' },
  { type: 'denuncia', cat: 'agua', muni: 'Bolívar', sector: 'Sector alto (demo)', title: 'Venta del agua de un camión cisterna (demo)', text: 'El agua de un camión cisterna se vende cuando debería repartirse gratis (demo).', state: 'resuelto', day: -24, contact: 'email', attended: 'denuncia' },
  { type: 'denuncia', cat: 'otros', muni: 'Cárdenas', sector: 'Sector sur (demo)', title: 'Uso de un vehículo oficial para fines personales (demo)', text: 'Un vehículo oficial se usa los fines de semana para fines personales (demo).', state: 'en_revision', day: -3, anonymous: true },
  { type: 'denuncia', cat: 'seguridad', muni: 'Pedro María Ureña', sector: 'Sector centro (demo)', title: 'Cobro por pasar en un punto de la vía (demo)', text: 'En un punto de la vía cobran a los conductores para dejarlos pasar (demo).', state: 'derivado', day: -15, anonymous: true },
  { type: 'denuncia', cat: 'otros', muni: 'Torbes', sector: 'Sector oeste (demo)', title: 'Cobro por un cupo en un programa social (demo)', text: 'Piden dinero para inscribir a las familias en un programa social (demo).', state: 'cerrado', day: -34, contact: 'email' },
  { type: 'denuncia', cat: 'servicios-comunitarios', muni: 'Libertador', sector: 'Sector norte (demo)', title: 'Denuncia repetida sin datos nuevos (demo)', text: 'El mismo hecho de otra denuncia, sin datos nuevos (demo).', state: 'no_procede', day: -20, anonymous: true },
];
