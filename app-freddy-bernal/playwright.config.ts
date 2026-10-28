import { defineConfig, devices } from '@playwright/test';
import { QUIET_STATE } from './tests/e2e/global-setup';

// Two demo servers: one STRICT (code by email + 2FA, like production) and one with the
// testing shortcuts on (one-tap sign-in, no 2FA). The main suite runs on the strict one.
// Against a deployed URL (E2E_BASE_URL) no local servers start: the shortcuts project runs
// only if E2E_SHORTCUTS_URL is also given, and the strict suite is meaningful only when that
// deployment has DEMO_SHORTCUTS=false.
const port = Number(process.env.E2E_PORT ?? 3100);
const shortcutsPort = port + 1;
const shortcutsUrl = process.env.E2E_SHORTCUTS_URL ?? (process.env.E2E_BASE_URL ? null : `http://localhost:${shortcutsPort}`);
// Every context starts with 360's offer of tutorials turned off on this «phone» (tests/e2e/global-setup.ts writes the
// state): no strip covers what a test taps. assistant-offer.spec.ts starts without it.
const mobile = { ...devices['Galaxy S9+'], viewport: { width: 360, height: 760 }, storageState: QUIET_STATE };

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
    locale: 'es-VE',
    timezoneId: 'America/Caracas',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
    // Full Chromium in headless mode, not the headless shell: the shell has no Push API, so the
    // phone-notifications card would not show its «Activar avisos» state in CI.
    channel: process.env.PW_CHROMIUM_PATH ? undefined : 'chromium',
  },
  projects: [
    { name: 'mobile-360', testIgnore: /demo-shortcuts\.spec\.ts/, use: mobile },
    ...(shortcutsUrl ? [{ name: 'shortcuts', testMatch: /demo-shortcuts\.spec\.ts/, use: { ...mobile, baseURL: shortcutsUrl } }] : []),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        { command: `npx next start -p ${port}`, port, env: { DEMO_SHORTCUTS: 'false' }, reuseExistingServer: !process.env.CI, timeout: 120_000 },
        { command: `npx next start -p ${shortcutsPort}`, port: shortcutsPort, env: { DEMO_SHORTCUTS: 'true' }, reuseExistingServer: !process.env.CI, timeout: 120_000 },
      ],
});
