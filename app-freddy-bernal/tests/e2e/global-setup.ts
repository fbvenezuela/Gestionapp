import fs from 'node:fs';
import path from 'node:path';

// The storage state every e2e context starts with (R3, D-47/D-48, design §8.6, U8): on the origins of the two demo
// servers (the strict one and the one with shortcuts, or the deployed ones), this «phone»'s own switch that keeps 360
// from offering tutorials (OFFER_DEVICE_OFF in src/components/tour/tour-core.ts; tests/unit/assistant-offer-core.test.ts
// checks they are the same). playwright.config.ts gives it to every project; newQuietContext() (helpers.ts) to the
// contexts a test opens itself. Only assistant-offer.spec.ts starts without it.
export const QUIET_STATE = path.join(process.cwd(), 'tests', 'e2e', '.state', 'sin-oferta.json');
export const OFFER_OFF_KEY = 'fb:360:oferta:off';

export function e2eOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const port = Number(env.E2E_PORT ?? 3100);
  const base = env.E2E_BASE_URL ?? `http://localhost:${port}`;
  const shortcuts = env.E2E_SHORTCUTS_URL ?? (env.E2E_BASE_URL ? null : `http://localhost:${port + 1}`);
  return [...new Set([base, shortcuts].filter((u): u is string => !!u).map((u) => new URL(u).origin))];
}

export function quietState(env: Record<string, string | undefined> = process.env) {
  return { cookies: [], origins: e2eOrigins(env).map((origin) => ({ origin, localStorage: [{ name: OFFER_OFF_KEY, value: '1' }] })) };
}

// A fresh server has fresh 2FA enrollments: forget secrets from older runs. Then the quiet state.
export default function globalSetup() {
  fs.rmSync(path.join(process.cwd(), 'test-results', '.totp-secrets.json'), { force: true });
  fs.mkdirSync(path.dirname(QUIET_STATE), { recursive: true });
  fs.writeFileSync(QUIET_STATE, JSON.stringify(quietState(), null, 2));
}
