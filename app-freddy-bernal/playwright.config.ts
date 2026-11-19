import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { QUIET_STATE } from './tests/e2e/global-setup';
import { REAL_DEMO_BANNER } from './src/lib/web/real-site';

// A build with the official site's content (.real-site/, or REAL_SITE_DIR at build time; D-101) prerendered its pages
// with it, and REAL_SITE_CONTENT=0 changes only what a server seeds, not those pages: the tests would read real content
// where they expect the invented one. They need a build without it (`npm run build`, which also removes .real-site/).
// The prerendered home says which content it was built with (the real content's band).
const builtHome = path.resolve('.next/server/app/index.html');
if (
  !process.env.E2E_BASE_URL &&
  (fs.existsSync(path.resolve('.real-site')) || (fs.existsSync(builtHome) && fs.readFileSync(builtHome, 'utf8').includes(REAL_DEMO_BANNER)))
) {
  throw new Error('La construcción tiene el contenido real (.real-site/ o REAL_SITE_DIR al construir): corre `npm run build` sin ellos antes de las pruebas.');
}

// The demo servers: one STRICT (code by email + 2FA, like production), one with the testing shortcuts on (one-tap
// sign-in, no 2FA) and one that shows the INVENTED real-content fixture (D-101's mode on the made-up texts and drawn
// photos of tests/fixtures/real-site/snapshot-site.ts). The main suite runs on the strict one. Against a deployed URL
// (E2E_BASE_URL) no local servers start: the shortcuts and fixture projects run only if E2E_SHORTCUTS_URL or
// E2E_FIXTURE_URL is also given, and the strict suite is meaningful only when that deployment has DEMO_SHORTCUTS=false.
const port = Number(process.env.E2E_PORT ?? 3100);
const shortcutsPort = port + 1;
const fixturePort = port + 2;
const local = (p: number) => (process.env.E2E_BASE_URL ? null : `http://localhost:${p}`);
const shortcutsUrl = process.env.E2E_SHORTCUTS_URL ?? local(shortcutsPort);
const fixtureUrl = process.env.E2E_FIXTURE_URL ?? local(fixturePort);
// Where the fixture's server reads it from (REAL_SITE_DIR): made right before that server starts, one folder per port.
const fixtureDir = path.join(os.tmpdir(), `fb-real-fixture-${fixturePort}`);
// Every context starts with 360's offer of tutorials turned off on this «phone» (tests/e2e/global-setup.ts writes the
// state): no strip covers what a test taps. assistant-offer.spec.ts starts without it.
const mobile = { ...devices['Galaxy S9+'], viewport: { width: 360, height: 760 }, storageState: QUIET_STATE };
// «Menos movimiento» everywhere but in the motion project (design of the new website, §3): no reveal, transition or
// scroll animation is half-way when a test reads, measures or runs axe. A test that needs motion asks for it
// (page.emulateMedia({ reducedMotion: 'no-preference' })) or lives in web-movimiento.spec.ts.
const still = { ...mobile, reducedMotion: 'reduce' as const };
// The real-content fixture's tests carry this tag (any spec may have one): they run only in «real-fixture», on the
// fixture's server, and never on the invented ones.
const REAL_FIXTURE_TAG = /@real-fixture/;
const MOTION_SPEC = /web-movimiento\.spec\.ts/;
const SHORTCUTS_SPEC = /demo-shortcuts\.spec\.ts/;

// The servers' shared settings. TRUST_PROXY_HEADERS: the test runner stands for the platform's proxy, giving each test
// a network of its own with x-real-ip (src/lib/participation/keys.ts trusts that header only on Vercel or with this
// variable).
const server = (p: number, env: Record<string, string>, before = '') => ({
  command: `${before}npx next start -p ${p}`,
  port: p,
  env: { TRUST_PROXY_HEADERS: 'true', ...env },
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
});

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
    { name: 'mobile-360', testIgnore: [SHORTCUTS_SPEC, MOTION_SPEC], grepInvert: REAL_FIXTURE_TAG, use: still },
    ...(shortcutsUrl ? [{ name: 'shortcuts', testMatch: SHORTCUTS_SPEC, use: { ...still, baseURL: shortcutsUrl } }] : []),
    // The real-content mode on the invented fixture: today the home (web-portada.spec.ts); WP3 tests its first screen
    // with the photo here.
    ...(fixtureUrl ? [{ name: 'real-fixture', testIgnore: [SHORTCUTS_SPEC, MOTION_SPEC], grep: REAL_FIXTURE_TAG, use: { ...still, baseURL: fixtureUrl } }] : []),
    // The web's motion (WP1's web-movimiento.spec.ts), with the phone's motion on.
    { name: 'motion', testMatch: MOTION_SPEC, use: { ...mobile, reducedMotion: 'no-preference' as const } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        // REAL_SITE_CONTENT=0: these two seed the invented content (src/lib/web/real-site.ts); a build with the
        // official site's is refused above, since its prerendered pages would show it anyway.
        server(port, { DEMO_SHORTCUTS: 'false', REAL_SITE_CONTENT: '0' }),
        server(shortcutsPort, { DEMO_SHORTCUTS: 'true', REAL_SITE_CONTENT: '0' }),
        // The fixture's server: the fixture is made first (the build code against the invented site), then the
        // real-content mode reads it (REAL_SITE_DIR), with its pages and data cached in its own memory only
        // (E2E_MEMORY_CACHE: next.config.ts), so it renders them from its own database instead of serving the build's
        // invented ones, and never writes into the shared .next.
        server(
          fixturePort,
          { DEMO_SHORTCUTS: 'false', REAL_SITE_CONTENT: '1', REAL_SITE_DIR: fixtureDir, E2E_MEMORY_CACHE: '1' },
          `npx tsx tests/fixtures/real-site/make-snapshot.mts ${JSON.stringify(fixtureDir)} && `,
        ),
      ],
});
