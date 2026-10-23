import fb from '../../config/clients/fb.json';
import specs from '../../config/network-specs.json';

// Client-specific data (brand, categories, formulas, schedules). Nothing about a
// particular client is hard-coded elsewhere; add a new JSON file per client.
export type CategorySeed = { name: string; emoji: string | null; children: { name: string; emoji: string | null }[] };
export type FormulaSeed = { code: string; name: string; description: string; steps: { key: string; label: string; hint: string }[] };
export type ClientConfig = typeof fb;

const clients: Record<string, ClientConfig> = { fb };

export function getClientConfig(brand = process.env.APP_BRAND ?? 'fb'): ClientConfig {
  return clients[brand] ?? fb;
}

export const brand = getClientConfig().brand;
export const networkSpecsSeed = specs.specs;
