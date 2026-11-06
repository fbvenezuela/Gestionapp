import 'server-only';
import net from 'node:net';
import { env } from '../env';

// The private files' malware check (design §6). ATTACHMENT_SCANNER=clamav sends each file to clamd over TCP
// (INSTREAM, CLAMAV_HOST and CLAMAV_PORT, the docker-compose service); none (the default) leaves them «sin_analizar».
// The scan status is the system's (request_attachments' guard refuses it from a person): a new file enters
// «cuarentena» when a scanner is configured and becomes «limpio» or «infectado» after the scan; with no scanner it is
// «sin_analizar». Production (DATABASE_URL) serves only «limpio»; the demo and local work also serve «sin_analizar»,
// with a visible warning. «infectado» and «cuarentena» are never served.

export type ScanStatus = 'cuarentena' | 'limpio' | 'infectado' | 'sin_analizar';
export type ScanResult = { status: 'limpio' } | { status: 'infectado'; signature: string };

export interface AttachmentScanner {
  readonly name: 'clamav';
  scan(bytes: Uint8Array): Promise<ScanResult>;
}

/** The status a file is registered with. */
export function initialScanStatus(scanner: 'clamav' | 'none' = env.attachments.scanner): 'cuarentena' | 'sin_analizar' {
  return scanner === 'clamav' ? 'cuarentena' : 'sin_analizar';
}

export type DownloadGate = { ok: true; warning: string | null } | { ok: false; reason: string };

/** Whether a private file may be served now, and what to tell the person. */
export function downloadGate(status: ScanStatus, mode: 'demo' | 'supabase' = env.dataMode): DownloadGate {
  if (status === 'limpio') return { ok: true, warning: null };
  if (status === 'infectado') return { ok: false, reason: 'El revisor encontró algo peligroso en este archivo: no se puede abrir.' };
  if (status === 'cuarentena') return { ok: false, reason: 'El archivo todavía se está revisando. Vuelve a intentarlo en unos minutos.' };
  return mode === 'supabase'
    ? { ok: false, reason: 'Este archivo no se pudo revisar: no se abre hasta que el revisor lo apruebe.' }
    : { ok: true, warning: 'Archivo sin analizar (versión de prueba): ábrelo solo si confías en él.' };
}

// --- clamd INSTREAM -------------------------------------------------------------------------------------------------
// «zINSTREAM\0», then the file in chunks (each with its length, 4 bytes big-endian), then a zero length; clamd answers
// «stream: OK», «stream: <signature> FOUND» or «… ERROR», ended by a NUL.

export type SocketLike = {
  on(event: 'connect' | 'end' | 'close', fn: () => void): unknown;
  on(event: 'data', fn: (chunk: Buffer) => void): unknown;
  on(event: 'error', fn: (e: Error) => void): unknown;
  write(data: Uint8Array | string): unknown;
  end(): unknown;
  destroy(): unknown;
};
export type ClamavOptions = { host: string; port: number; timeoutMs: number; chunkBytes?: number; connect?: (o: { host: string; port: number }) => SocketLike };

export class ScannerError extends Error {}

/** clamd's raw answer for these bytes (without the NUL). */
export function clamdInstream(bytes: Uint8Array, o: ClamavOptions): Promise<string> {
  const chunk = o.chunkBytes ?? 64 * 1024;
  return new Promise((resolve, reject) => {
    const socket = (o.connect ?? ((x) => net.createConnection(x) as unknown as SocketLike))({ host: o.host, port: o.port });
    const got: Buffer[] = [];
    let settled = false;
    const finish = (err: Error | null, reply?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve(reply!);
    };
    const reply = () => Buffer.concat(got).toString('utf8').split('\0')[0].trim();
    const timer = setTimeout(() => finish(new ScannerError('clamd no respondió a tiempo.')), o.timeoutMs);
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let at = 0; at < bytes.length; at += chunk) {
        const part = bytes.subarray(at, Math.min(at + chunk, bytes.length));
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length);
        socket.write(len);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on('data', (d: Buffer) => {
      got.push(d);
      if (d.includes(0)) finish(null, reply());
    });
    socket.on('end', () => (got.length ? finish(null, reply()) : finish(new ScannerError('clamd cerró sin responder.'))));
    socket.on('close', () => finish(new ScannerError('clamd cerró sin responder.')));
    socket.on('error', (e: Error) => finish(new ScannerError(`clamd: ${e.message}`)));
  });
}

/** clamd's answer as a result; an error answer (size limit, clamd broken) throws, so the file stays in quarantine. */
export function parseClamdReply(reply: string): ScanResult {
  if (/^stream: OK$/.test(reply)) return { status: 'limpio' };
  const found = /^stream: (.+) FOUND$/.exec(reply);
  if (found) return { status: 'infectado', signature: found[1] };
  throw new ScannerError(`clamd respondió: ${reply.slice(0, 200)}`);
}

export function clamavScanner(o: ClamavOptions): AttachmentScanner {
  return { name: 'clamav', scan: async (bytes) => parseClamdReply(await clamdInstream(bytes, o)) };
}

/** The configured scanner, or null with ATTACHMENT_SCANNER=none (files stay «sin_analizar»). */
export function attachmentScanner(): AttachmentScanner | null {
  const a = env.attachments;
  return a.scanner === 'clamav' ? clamavScanner({ host: a.clamavHost, port: a.clamavPort, timeoutMs: a.clamavTimeoutMs }) : null;
}
