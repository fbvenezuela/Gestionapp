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
        const want = rule.aspects.join(' o ');
        const shape = actual > 1.05 ? 'horizontal' : actual < 0.95 ? 'vertical' : 'cuadrado';
        say('error', `el video es ${shape} (${m.width}×${m.height}) y aquí va ${want}${rule.aspects.includes('9:16') ? ' (vertical, por ejemplo 1080×1920)' : ''}.`);
      }
    }
    if (rule.min_width && m.width < rule.min_width) say('error', `el ancho es ${m.width} px y el mínimo es ${rule.min_width} px. Exporta en mejor calidad.`);
    if (rule.min_height && m.height < rule.min_height) say('error', `el alto es ${m.height} px y el mínimo es ${rule.min_height} px. Exporta en mejor calidad.`);
    if (rule.max_width && m.width > rule.max_width) say('error', `el ancho es ${m.width} px y el máximo es ${rule.max_width} px. Exporta más pequeño.`);
    if (rule.max_height && m.height > rule.max_height) say('error', `el alto es ${m.height} px y el máximo es ${rule.max_height} px.`);
  } else if (!m.isImage) say('warn', 'no se pudieron leer las medidas.');

  if (m.sizeBytes != null && rule.max_size_mb && m.sizeBytes > rule.max_size_mb * 1024 * 1024) {
    say('error', `pesa ${(m.sizeBytes / 1024 / 1024).toFixed(0)} MB y el máximo es ${rule.max_size_mb} MB. Expórtalo con menos peso.`);
  }
  if (!m.isImage && m.fps != null) {
    if (rule.max_fps && m.fps > rule.max_fps + 0.5) say('error', `tiene ${Math.round(m.fps)} cuadros por segundo y el máximo es ${rule.max_fps}.`);
    if (rule.min_fps && m.fps < rule.min_fps - 0.5) say('error', `tiene ${Math.round(m.fps)} cuadros por segundo y el mínimo es ${rule.min_fps}.`);
  }
  if (!m.isImage && m.videoCodec && rule.video_codecs?.length && !codecMatch(m.videoCodec, rule.video_codecs)) {
    say('error', `el formato del video (${m.videoCodec.toUpperCase()}) no lo acepta. Exporta en H.264.`);
  }
  if (!m.isImage && rule.audio_codecs?.length) {
    if (!m.audioCodec) say('warn', 'el video no tiene audio.');
    else if (!codecMatch(m.audioCodec, rule.audio_codecs)) say('error', `el audio (${m.audioCodec.toUpperCase()}) no lo acepta. Exporta el audio en AAC.`);
  }
  return out;
}

export function copyIssue(network: string, length: number, max: number): Issue | null {
  return length > max ? { level: 'error', text: `${network}: el copy tiene ${length} caracteres y el máximo es ${max}. Acórtalo.` } : null;
}
