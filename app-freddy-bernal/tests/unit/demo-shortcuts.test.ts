import { describe, it, expect, vi, afterEach } from 'vitest';

// Hard rule: testing shortcuts (one-tap sign-in, no 2FA) only exist with the in-memory
// demo database. With a real database they must be off whatever DEMO_SHORTCUTS says.
async function load(envVars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envVars)) {
    if (v === undefined) vi.stubEnv(k, '');
    else vi.stubEnv(k, v);
  }
  return import('@/lib/env');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('demoShortcuts()', () => {
  it('con base real (DATABASE_URL) nunca se activa', async () => {
    for (const flag of [undefined, 'true', '1', 'TRUE', 'yes']) {
      const m = await load({ DATABASE_URL: 'postgres://u:p@db.example.com:6543/postgres', DEMO_SHORTCUTS: flag });
      expect(m.isDemo()).toBe(false);
      expect(m.demoShortcuts()).toBe(false);
    }
  });
  it('en demo está activo por defecto y se apaga con DEMO_SHORTCUTS=false', async () => {
    expect((await load({ DATABASE_URL: undefined, DEMO_SHORTCUTS: undefined })).demoShortcuts()).toBe(true);
    expect((await load({ DATABASE_URL: undefined, DEMO_SHORTCUTS: 'false' })).demoShortcuts()).toBe(false);
  });
});
