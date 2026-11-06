// «La oficina» (pedido del 06/11/2026): the content line for the boss's activities drawn as an isometric office. Ten
// rooms, in the order the work goes through them. Pure: what each room is, who works there and which room an activity
// is in, from facts the data layer reads under RLS. Never a date, a time or a place: everyone on the team sees it.

export const ROOMS = [
  'reception',
  'script',
  'storyboard',
  'recording',
  'clean_cut',
  'brutal_edit',
  'approval',
  'copywriting',
  'publishing',
  'analytics',
] as const;
export type Room = (typeof ROOMS)[number];

// «Mezcla» (Juan, 06/11): in some rooms the AI proposes a draft and a person checks it; in others only a person works.
// The AI stays off until the legal OK (D-26): there, the draft comes from a template built with the ficha's own words.
export type Crew = 'person' | 'ai_and_person';

export type RoomInfo = {
  label: string;
  who: string;
  crew: Crew;
  does: string;
  // An example of what comes out of the room, made up (§4.6), so a new person sees what is expected.
  example: string;
};

export const ROOM: Record<Room, RoomInfo> = {
  reception: {
    label: 'Recepción',
    who: 'Despacho',
    crew: 'person',
    does: 'Llega la actividad que va a visitar el jefe, con su ficha.',
    example: 'Entrega de un módulo de salud: qué se hizo, quién lo lleva y los datos que hay que decir.',
  },
  script: {
    label: 'Guionistas',
    who: 'Redes',
    crew: 'ai_and_person',
    does: 'Borrador del guion pensado en la ficha. Lo aprueba el jefe.',
    example: 'Toma 1: el jefe llega y saluda. Toma 2: recorrido por el módulo. Toma 3: frase de cierre.',
  },
  storyboard: {
    label: 'Storyboard',
    who: 'Redes y Grabación',
    crew: 'ai_and_person',
    does: 'Cada toma del guion dibujada: plano, ángulo, luz y fondo.',
    example: 'Toma 2 · plano general · ángulo bajo · luz de la mañana de lado · fondo: la fachada.',
  },
  recording: {
    label: 'Grabación',
    who: 'Grabación',
    crew: 'person',
    does: 'Se graba en el sitio con el storyboard en la mano y se sube el material.',
    example: 'Material del jefe, tomas de apoyo y dron, con la nota para el editor.',
  },
  clean_cut: {
    label: 'Editor en línea',
    who: 'Jefe',
    crew: 'person',
    does: 'Quita los tiempos muertos y limpia el video de imperfecciones.',
    example: 'Sin silencios largos, sin «eh», sin tomas movidas: el video limpio, listo para el editor.',
  },
  brutal_edit: {
    label: 'Editor brutal',
    who: 'Redes',
    crew: 'ai_and_person',
    does: 'Animaciones, efectos, sonidos y subtítulos: el video final.',
    example: 'Entrada con golpe de sonido, subtítulos grandes, cifras animadas de la ficha y cierre con la marca.',
  },
  approval: {
    label: 'Oficina del jefe',
    who: 'Jefe',
    crew: 'person',
    does: 'El jefe ve el video final y lo aprueba o pide cambios.',
    example: '«Aprobado» o «Cambia el inicio, que arranque con la gente».',
  },
  copywriting: {
    label: 'Copywriting',
    who: 'Redes',
    crew: 'ai_and_person',
    does: 'Los textos para X, Threads, Instagram, Facebook y TikTok sobre el video.',
    example: 'X: una línea con la cifra de la ficha. Instagram: tres párrafos cortos y el cierre de la voz.',
  },
  publishing: {
    label: 'Publicador',
    who: 'Redes',
    crew: 'person',
    does: 'Ubicación, sonido, hora de publicación y todo lo de cada red.',
    example: 'Instagram a la mejor hora, con el sonido elegido, la ubicación del municipio y colaboradores.',
  },
  analytics: {
    label: 'Analizador',
    who: 'Redes',
    crew: 'ai_and_person',
    does: 'Revisa las métricas de la publicación y de todas las cuentas.',
    example: 'Este reel llegó a más gente que el promedio del mes; los de obras rinden mejor de noche.',
  },
};

export const CREW_LABEL: Record<Crew, string> = {
  person: 'Persona',
  ai_and_person: 'IA propone, persona revisa',
};

export const SCRIPT_STATUSES = ['none', 'draft', 'approved'] as const;
export type ScriptStatus = (typeof SCRIPT_STATUSES)[number];

// What the data layer reads about one activity (public.office_facts(): counts and yes/no only, the same for every
// reader who sees the event).
export type OfficeFacts = {
  tracked: boolean; // the activity has its office row (it went through the office); older ones are inferred
  scriptStatus: ScriptStatus;
  cleanDone: boolean;
  brutalDone: boolean;
  shots: number; // storyboard shots with something in them
  rawMedia: number; // material from the recording that is ready
  pieces: number;
  piecesInReview: number;
  piecesApproved: number;
  piecesApprovedWithCopies: number; // approved pieces with the three copy lengths written
  published: number;
};

/**
 * The room an activity is in: the first step not done yet, in the order of the line. An activity from before the
 * office (no row) counts the script as approved once it has a storyboard, material or a piece, and both edits as done
 * once it has a piece: it never goes back to «Recepción» for steps that happened outside.
 */
export function officeRoom(f: OfficeFacts): Room {
  const later = f.shots > 0 || f.rawMedia > 0 || f.pieces > 0;
  const script: ScriptStatus = f.tracked ? f.scriptStatus : later ? 'approved' : 'none';
  const clean = f.tracked ? f.cleanDone : f.pieces > 0;
  const brutal = f.tracked ? f.brutalDone : f.pieces > 0;
  if (f.published > 0) return 'analytics';
  if (f.piecesApproved > 0) return f.piecesApprovedWithCopies > 0 ? 'publishing' : 'copywriting';
  if (f.piecesInReview > 0) return 'approval';
  if (script === 'none') return 'reception';
  if (script === 'draft') return 'script';
  if (f.shots === 0) return 'storyboard';
  if (f.rawMedia === 0) return 'recording';
  if (!clean) return 'clean_cut';
  if (!brutal) return 'brutal_edit';
  return 'approval';
}

export function roomIndex(r: Room) {
  return ROOMS.indexOf(r);
}

export const SCRIPT_MAX = 6000;

/**
 * The script's first draft, from the ficha's own words (§4.7: no number that is not in the ficha; if something is
 * missing, the draft says so). One shot per line, so the storyboard room can take them one by one.
 */
export function scriptDraft(b: { title: string; work: string; ledBy: string; achievements: string; keyFacts: string }): string {
  const missing = '(falta en la ficha)';
  const or = (s: string) => (s.trim() ? s.trim() : missing);
  return [
    `Guion: ${b.title}`,
    '',
    `Toma 1 · Llegada: el jefe llega y saluda a la gente. Voz: qué se vino a hacer hoy (${or(b.work)}).`,
    `Toma 2 · Recorrido: el jefe camina con ${or(b.ledBy)} y mira el trabajo.`,
    `Toma 3 · Lo logrado: ${or(b.achievements)}.`,
    `Toma 4 · El dato: ${or(b.keyFacts)}. Solo las cifras de la ficha.`,
    'Toma 5 · Cierre: frase del jefe mirando a cámara.',
  ].join('\n');
}
