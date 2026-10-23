import 'server-only';
import { env } from '../env';

// Publishing behind one interface. Phase 1 ships `manual` (default) and `simulated`.
// Real adapters (Meta, X, TikTok, YouTube) plug in here when each network approves
// the app; until then they refuse. Real publishing also needs PUBLISHING_ENABLED=true
// AND the `publishing.enabled` setting AND an explicit OK from Juan (rule 8).

export type PublishRequest = { publicationId: string; network: string; format: string; copy: string; mediaUrl: string | null; coverUrl: string | null; collaborators: string[] };
export type PublishResult = { ok: true; externalId: string; url: string } | { ok: false; reason: string };

export interface Publisher {
  readonly name: string;
  publish(req: PublishRequest): Promise<PublishResult>;
}

const manual: Publisher = {
  name: 'manual',
  async publish() {
    return { ok: false, reason: 'Publicación manual: descarga el paquete y marca «Ya lo publiqué».' };
  },
};

const simulated: Publisher = {
  name: 'simulated',
  async publish(req) {
    return { ok: true, externalId: `sim-${req.publicationId.slice(0, 8)}`, url: `https://example.com/simulado/${req.network}/${req.publicationId.slice(0, 8)}` };
  },
};

function notConfigured(name: string): Publisher {
  return { name, publish: async () => ({ ok: false, reason: `La conexión con ${name} todavía no está configurada.` }) };
}

export function publisherFor(network: string): Publisher {
  if (!env.publishingEnabled) return manual;
  const choice = process.env[`PUBLISHER_${network === 'instagram' || network === 'facebook' || network === 'threads' ? 'META' : network.toUpperCase()}`] ?? 'manual';
  if (choice === 'simulated') return simulated;
  if (choice === 'manual') return manual;
  return notConfigured(network);
}
