// Checks a video against each network's rules BEFORE scheduling, and says what fails
// in plain words ("TikTok: el video dura 11 minutos y el máximo es 10. Córtalo.").

export type FormatRule = {
  min_duration_s?: number;
  max_duration_s?: number;
  aspects?: string[];
  aspect_tolerance?: number;
  min_width?: number;
  min_height?: number;
  max_width?: number;
  max_height?: number;
  max_size_mb?: number;
  min_fps?: number;
  max_fps?: number;
  video_codecs?: string[];
  audio_codecs?: string[];
  // A carousel (R4, D-73): how many images it takes. min_items defaults to 2.
  min_items?: number;
  max_items?: number;
};

export type MediaFacts = {
  durationS: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  sizeBytes: number | null;
  isImage?: boolean;
};

export type Issue = { level: 'error' | 'warn'; text: string };

function dur(s: number) {
  if (s < 60) return `${Math.round(s)} segundos`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r ? `${m} min ${r} s` : `${m} ${m === 1 ? 'minuto' : 'minutos'}`;
}

/** The weight in MB as a person reads it: one decimal below 10 MB («4,3 MB»), and always more than the maximum when the
 * file is over it, never «pesa 4 MB y el máximo es 4 MB» (F4: the photo limits are 4, 5 and 8 MB). */
export function weightMb(bytes: number, max?: number): string {
  const n = bytes / 1024 / 1024;
  const at = (d: number) => Number(n.toFixed(d));
  let d = n < 10 ? 1 : 0;
  while (d < 2 && max != null && at(d) <= max) d++;
  let v = at(d);
  if (max != null && v <= max && n > max) v = Math.ceil(n * 100) / 100;
  return String(v).replace('.', ',');
}

/** The shape of a picture: «horizontal», «vertical» or «cuadrada». */
const shapeOf = (w: number, h: number) => (w / h > 1.05 ? 'horizontal' : w / h < 0.95 ? 'vertical' : 'cuadrada');

/** «4:5, 1:1 o 1.91:1». */
const orList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} o ${xs[xs.length - 1]}` : xs.join(''));

function ratio(a: string) {
  const [w, h] = a.split(':').map(Number);
  return w / h;
}

function codecMatch(actual: string, allowed: string[]) {
  const a = actual.toLowerCase().replace(/[^a-z0-9]/g, '');
  return allowed.some((x) => {
    const b = x.toLowerCase().replace(/[^a-z0-9]/g, '');
    return a.includes(b) || b.includes(a) || (b === 'h264' && a === 'avc') || (b === 'h265' && a === 'hevc');
  });
}

export function checkVideo(network: string, formatName: string, rule: FormatRule | undefined, m: MediaFacts): Issue[] {
  if (!rule) return [{ level: 'warn', text: `${network}: no hay reglas guardadas para «${formatName}». Revísalo a mano.` }];
  const out: Issue[] = [];
  const say = (level: Issue['level'], text: string) => out.push({ level, text: `${network}: ${text}` });

  if (!m.isImage) {
    if (m.durationS == null) say('warn', 'no se pudo leer la duración del video.');
    else {
      if (rule.max_duration_s && m.durationS > rule.max_duration_s + 0.5)
        say('error', `el video dura ${dur(m.durationS)} y el máximo es ${dur(rule.max_duration_s)}. Córtalo.`);
      if (rule.min_duration_s && m.durationS < rule.min_duration_s)
        say('error', `el video dura ${dur(m.durationS)} y el mínimo es ${dur(rule.min_duration_s)}.`);
    }
  }
  if (m.width && m.height) {
    if (rule.aspects?.length) {
      const actual = m.width / m.height;
      const tol = rule.aspect_tolerance ?? 0.03;
      const ok = rule.aspects.some((a) => Math.abs(actual - ratio(a)) / ratio(a) <= tol);
      if (!ok) {
        // A photo is «la imagen … horizontal/vertical/cuadrada» (F10, like the height below); a video, «el video …».
        const shape = m.isImage ? shapeOf(m.width, m.height) : actual > 1.05 ? 'horizontal' : actual < 0.95 ? 'vertical' : 'cuadrado';
        say('error', `${m.isImage ? 'la imagen' : 'el video'} es ${shape} (${m.width}×${m.height}) y en ${network} va ${orList(rule.aspects)}${rule.aspects.includes('9:16') ? ' (vertical, por ejemplo 1080×1920)' : ''}.`);
      }
    }
    if (rule.min_width && m.width < rule.min_width) say('error', `el ancho es ${m.width} px y el mínimo es ${rule.min_width} px. Exporta en mejor calidad.`);
    if (rule.min_height && m.height < rule.min_height) say('error', `el alto es ${m.height} px y el mínimo es ${rule.min_height} px. Exporta en mejor calidad.`);
    if (rule.max_width && m.width > rule.max_width) say('error', `el ancho es ${m.width} px y el máximo es ${rule.max_width} px. Exporta más pequeño.`);
    // Says what to do, like the others (APP-41: «el alto es 1920 px y el máximo es 1200 px.» stopped there), with the
    // network's name rather than «aquí» (read as «in this app») and the width's words (R19: «más bajo» read as quality).
    if (rule.max_height && m.height > rule.max_height) {
      say('error', m.isImage
        ? `la imagen es muy alta: mide ${m.height} px y en ${network} el máximo es ${rule.max_height} px. Exporta más pequeña.`
        : `el video es muy alto: mide ${m.height} px y en ${network} el máximo es ${rule.max_height} px. Exporta más pequeño.`);
    }
  } else if (!m.isImage) say('warn', 'no se pudieron leer las medidas.');

  if (m.sizeBytes != null && rule.max_size_mb && m.sizeBytes > rule.max_size_mb * 1024 * 1024) {
    say('error', `pesa ${weightMb(m.sizeBytes, rule.max_size_mb)} MB y el máximo es ${rule.max_size_mb} MB. Expórtalo con menos peso.`);
  }
  // Neither codec nor fps known: the file was never read (a video picked from Google Drive gives
  // only duration and size, or the phone could not read it). Say so once, instead of «no tiene
  // audio» or nothing at all.
  const unread = !m.isImage && m.videoCodec == null && m.fps == null;
  if (unread && (rule.video_codecs?.length || rule.audio_codecs?.length || rule.min_fps || rule.max_fps)) {
    say('warn', 'no se pudo leer el formato del video (códec y cuadros por segundo). Revísalo a mano.');
  }
  if (!m.isImage && m.fps != null) {
    if (rule.max_fps && m.fps > rule.max_fps + 0.5) say('error', `tiene ${Math.round(m.fps)} cuadros por segundo y el máximo es ${rule.max_fps}.`);
    if (rule.min_fps && m.fps < rule.min_fps - 0.5) say('error', `tiene ${Math.round(m.fps)} cuadros por segundo y el mínimo es ${rule.min_fps}.`);
  }
  if (!m.isImage && m.videoCodec && rule.video_codecs?.length && !codecMatch(m.videoCodec, rule.video_codecs)) {
    say('error', `el formato del video (${m.videoCodec.toUpperCase()}) no lo acepta. Exporta en H.264.`);
  }
  if (!m.isImage && !unread && rule.audio_codecs?.length) {
    if (!m.audioCodec) say('warn', 'el video no tiene audio.');
    else if (!codecMatch(m.audioCodec, rule.audio_codecs)) say('error', `el audio (${m.audioCodec.toUpperCase()}) no lo acepta. Exporta el audio en AAC.`);
  }
  return out;
}

export function copyIssue(network: string, length: number, max: number): Issue | null {
  return length > max ? { level: 'error', text: `${network}: el copy tiene ${length} caracteres y el máximo es ${max}. Acórtalo.` } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Stories and carousels (R4, D-73): the network rules of the formats `story` (a photo or a clip, 9:16) and
// `carousel` (several images, 4:5 or 1:1), in words. Fin de mes goes out as a carousel.
// ---------------------------------------------------------------------------------------------------------------

function fitsAspect(w: number, h: number, rule: FormatRule): boolean {
  if (!rule.aspects?.length) return true;
  const tol = rule.aspect_tolerance ?? 0.03;
  return rule.aspects.some((a) => Math.abs(w / h - ratio(a)) / ratio(a) <= tol);
}


/** A story: a photo or a clip. «La historia dura 75 s: Instagram deja hasta 60 s.» */
export function checkStory(network: string, rule: FormatRule | undefined, m: MediaFacts): Issue[] {
  if (!rule) return [{ level: 'warn', text: `${network}: no hay reglas guardadas para las historias. Revísalo a mano.` }];
  const out: Issue[] = [];
  if (!m.isImage) {
    if (m.durationS == null) out.push({ level: 'warn', text: `${network}: no se pudo leer la duración del clip.` });
    else if (rule.max_duration_s && m.durationS > rule.max_duration_s + 0.5) {
      out.push({ level: 'error', text: `La historia dura ${Math.round(m.durationS)} s: ${network} deja hasta ${rule.max_duration_s} s.` });
    }
  }
  if (m.width && m.height) {
    if (!fitsAspect(m.width, m.height, rule)) {
      out.push({ level: 'error', text: `${network}: la historia es ${shapeOf(m.width, m.height)} (${m.width}×${m.height}) y va vertical ${rule.aspects!.join(' o ')}, por ejemplo 1080×1920.` });
    }
  } else if (!m.isImage) out.push({ level: 'warn', text: `${network}: no se pudieron leer las medidas del clip.` });
  if (m.sizeBytes != null && rule.max_size_mb && m.sizeBytes > rule.max_size_mb * 1024 * 1024) {
    out.push({ level: 'error', text: `${network}: la historia pesa ${weightMb(m.sizeBytes, rule.max_size_mb)} MB y el máximo es ${rule.max_size_mb} MB.` });
  }
  return out;
}

/** A carousel: how many images and each one's shape. «Facebook deja hasta 10 imágenes: este carrusel tiene 12.»
 * `slides` in order; a slide without its file (or not a picture) is said by its number. */
export function checkCarousel(network: string, rule: FormatRule | undefined, slides: (MediaFacts | null)[]): Issue[] {
  if (!rule) return [{ level: 'warn', text: `${network}: no hay reglas guardadas para los carruseles. Revísalo a mano.` }];
  const out: Issue[] = [];
  const n = slides.length;
  const max = rule.max_items;
  const min = rule.min_items ?? 2;
  if (max && n > max) out.push({ level: 'error', text: `${network} deja hasta ${max} imágenes: este carrusel tiene ${n}.` });
  if (n < min) out.push({ level: 'error', text: `${network}: un carrusel lleva al menos ${min} imágenes y este tiene ${n}.` });
  slides.forEach((s, i) => {
    if (!s) {
      out.push({ level: 'error', text: `${network}: la lámina ${i + 1} no tiene imagen.` });
      return;
    }
    if (!s.isImage) {
      out.push({ level: 'error', text: `${network}: la lámina ${i + 1} no es una imagen.` });
      return;
    }
    if (s.width && s.height && !fitsAspect(s.width, s.height, rule)) {
      out.push({ level: 'error', text: `${network}: la lámina ${i + 1} es ${shapeOf(s.width, s.height)} (${s.width}×${s.height}) y en ${network} va ${orList(rule.aspects!)}.` });
    }
    if (s.sizeBytes != null && rule.max_size_mb && s.sizeBytes > rule.max_size_mb * 1024 * 1024) {
      out.push({ level: 'error', text: `${network}: la lámina ${i + 1} pesa ${weightMb(s.sizeBytes, rule.max_size_mb)} MB y el máximo es ${rule.max_size_mb} MB.` });
    }
  });
  return out;
}
