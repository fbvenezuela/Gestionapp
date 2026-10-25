// «Probar» in Ajustes → Google Drive: each step the server (and then the admin's browser) tried,
// and what it means in plain words. Pure, so the texts are tested without Google.

export type DriveCheckKey = 'config' | 'connection' | 'space' | 'folder' | 'write' | 'read' | 'direct';
export type DriveCheckLevel = 'ok' | 'warn' | 'fail';

export type DriveCheckStep = {
  key: DriveCheckKey;
  level: DriveCheckLevel;
  // A short code: not_connected, expired, bad_key, busy, full, refused, mismatch, missing, ...
  code?: string;
  missing?: string[];
  account?: string;
  usage?: number;
  limit?: number | null;
  // For «direct»: the server's own sentence (finishDriveProbe).
  message?: string;
};

export function gb(bytes: number): string {
  const g = bytes / 1024 ** 3;
  if (g >= 10) return `${Math.round(g)} GB`;
  if (g >= 1) return `${g.toFixed(1).replace('.', ',')} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

const PROBLEM: Record<string, string> = {
  not_connected: 'Drive no está conectado. Toca «Conectar Drive».',
  expired: 'Se venció el permiso de Google. Toca «Conectar Drive» otra vez; no se pierde nada.',
  auth: 'Se venció el permiso de Google. Toca «Conectar Drive» otra vez; no se pierde nada.',
  bad_key: 'Cambió la clave que guarda el permiso (DRIVE_TOKEN_KEY o SESSION_SECRET). Toca «Conectar Drive» otra vez.',
  busy: 'Google no respondió. Intenta en un momento.',
  full: 'Drive está lleno. Libera espacio en la cuenta de Google (Drive, Gmail y Fotos comparten los 15 GB).',
  not_found: 'La carpeta de la plataforma ya no está en Drive. Toca «Conectar Drive» otra vez para crearla de nuevo.',
  refused: 'Drive no aceptó el archivo de prueba. Avísale a quien mantiene la plataforma.',
  not_configured: 'Faltan variables en Vercel. Revisa docs/DRIVE.md, paso B.',
  budget: 'Este mes ya se usó todo el cupo de transferencia. Vuelve a probar el mes que viene o sube el tope.',
  bad_key_format: 'DRIVE_TOKEN_KEY no sirve: tienen que ser 32 bytes en base64. Corrígela en Vercel o bórrala.',
  mismatch: 'El archivo de prueba volvió distinto. Avísale a quien mantiene la plataforma.',
};

const problem = (code: string | undefined) => PROBLEM[code ?? ''] ?? PROBLEM.busy;

/** One plain sentence for one step. `folder` = the root folder's name. */
export function checkLine(s: DriveCheckStep, folder: string): string {
  switch (s.key) {
    case 'config':
      if (s.level === 'ok') return 'Las variables de Vercel están completas.';
      if (s.missing?.length) return `Falta llenar en Vercel: ${s.missing.join(', ')}. Ponlas en Settings → Environment Variables (solo Production) y vuelve a publicar.`;
      return problem(s.code);
    case 'connection':
      return s.level === 'ok' ? `Google responde. Cuenta: ${s.account || 'sin correo'}.` : problem(s.code);
    case 'space': {
      const used = s.usage ?? 0;
      const base = s.limit ? `Espacio: ${gb(used)} usados de ${gb(s.limit)}.` : `Espacio: ${gb(used)} usados.`;
      if (s.level === 'ok') return base;
      const pct = s.limit ? Math.round((used / s.limit) * 100) : 0;
      if (s.level === 'warn') return `${base} Ya va en ${pct} %: pronto hay que liberar espacio (Drive, Gmail y Fotos comparten los 15 GB).`;
      return `Drive está casi lleno (${pct} %). Libera espacio antes de subir más.`;
    }
    case 'folder':
      return s.level === 'ok' ? `La carpeta «${folder}» está lista.` : problem(s.code);
    case 'write':
      if (s.level === 'ok') return 'Se subió un archivo de prueba.';
      return s.code === 'full' ? 'Drive está lleno: no entró ni el archivo de prueba.' : problem(s.code);
    case 'read':
      return s.level === 'ok' ? 'Se leyó de vuelta, igualito, y se mandó a la papelera.' : problem(s.code);
    case 'direct':
      return s.message || (s.level === 'ok' ? 'Las subidas van del teléfono directo a Drive.' : 'Google no deja subir directo desde este navegador.');
  }
}

export type CheckSummary = { level: DriveCheckLevel; title: string; todo: string | null };

/** The headline: all good, works with a warning, or the first thing to fix. */
export function checkSummary(steps: DriveCheckStep[], folder: string): CheckSummary {
  const fail = steps.find((s) => s.level === 'fail');
  if (fail) return { level: 'fail', title: 'Falta algo para que Drive funcione', todo: checkLine(fail, folder) };
  const warn = steps.find((s) => s.level === 'warn');
  if (warn) return { level: 'warn', title: 'Drive funciona, con un aviso', todo: checkLine(warn, folder) };
  return { level: 'ok', title: 'Todo bien: Drive está listo', todo: null };
}

/** Space level from Google's numbers: warning at 80 %, stop at 95 %. */
export function spaceLevel(usage: number, limit: number | null): DriveCheckLevel {
  if (!limit) return 'ok';
  const r = usage / limit;
  return r >= 0.95 ? 'fail' : r >= 0.8 ? 'warn' : 'ok';
}

// What the status chip says for drive_status().status.
export const DRIVE_STATE: Record<'ok' | 'expired' | 'error' | 'disconnected', { label: string; tone: 'ok' | 'warn' | 'danger' }> = {
  ok: { label: 'Conectado', tone: 'ok' },
  expired: { label: 'Se venció el permiso', tone: 'danger' },
  error: { label: 'Hay que volver a conectar', tone: 'danger' },
  disconnected: { label: 'Sin conectar', tone: 'warn' },
};
