import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { QUIET_STATE } from './tests/e2e/global-setup';
import { REAL_DEMO_BANNER, switchOf } from './src/lib/web/real-site';

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
// E2E_FIXTURE=0 leaves the fixture out (no project, no third server): for a run of panel specs on a busy machine.
const fixtureOff = switchOf(process.env.E2E_FIXTURE) === false;
const fixtureUrl = fixtureOff ? null : (process.env.E2E_FIXTURE_URL ?? local(fixturePort));
// The fixture's server is also skipped when the command names its projects (--project, which takes several names, or
// --project=<name>) and none can be «real-fixture»: its tests would not run (a pattern such as «mobile*» keeps it). The
// project list itself never depends on the command: the workers load this file too.
function projectArgs(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--project=')) out.push(argv[i].slice('--project='.length));
    else if (argv[i] === '--project') for (let j = i + 1; j < argv.length && !argv[j].startsWith('-'); j++) out.push(argv[j]);
  }
  return out;
}
const OTHER_PROJECTS = ['office', 'mobile-360', 'shortcuts', 'motion'];
const asked = projectArgs(process.argv);
const fixtureServerNeeded = !!fixtureUrl && (asked.length === 0 || asked.some((p) => !OTHER_PROJECTS.includes(p)));
// Where the fixture's server reads it from (REAL_SITE_DIR): made right before that server starts, one folder per port.
const fixtureDir = path.join(os.tmpdir(), `fb-real-fixture-${fixturePort}`);
// Every context starts with 360's offer of tutorials turned off on this «phone» (tests/e2e/global-setup.ts writes the
// state): no strip covers what a test taps. assistant-offer.spec.ts starts without it.
const mobile = { ...devices['Galaxy S9+'], viewport: { width: 360, height: 760 }, storageState: QUIET_STATE };
// «Menos movimiento» everywhere but in the motion project (design of the new website, §3): no reveal, transition or
// scroll animation is half-way when a test reads, measures or runs axe. A test that needs motion asks for it
// (test.use or page.emulateMedia with reducedMotion 'no-preference': tours.spec.ts and ui-glass.spec.ts, which test
// the panel's moving default) or lives in web-movimiento.spec.ts. Careful: the app's own «Menos movimiento» rule
// (src/app/globals.css) sets transition-duration 0.01ms on EVERY element, and transition-property is «all» by
// default, so under reduce any style change is a one-frame transition: a layout or computed-style read in the same
// frame as a change still gets the old value. Read with expect.poll / toHave…, or after two animation frames.
const still = { ...mobile, reducedMotion: 'reduce' as const };
// The real-content fixture's tests carry this tag (any spec may have one): they run only in «real-fixture», on the
// fixture's server, and never on the invented ones.
const REAL_FIXTURE_TAG = /@real-fixture/;
const MOTION_SPEC = /web-movimiento\.spec\.ts/;
const SHORTCUTS_SPEC = /demo-shortcuts\.spec\.ts/;
// «La oficina» reads where each demo activity sits, so it runs first, on the fresh seed (project «office» below).
const OFFICE_SPEC = /oficina\.spec\.ts/;

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
    // «La oficina» first, on the fresh seed: its tests read which room each demo activity is in, and the main suite
    // moves them (flows.spec sends the school health day's piece to the boss, which takes that activity out of the
    // meeting room it was seeded in; D-103). No other spec reads the office, so running it first changes nothing else.
    // A failure here skips the main suite (Playwright's dependencies): fix the office first.
    { name: 'office', testMatch: OFFICE_SPEC, grepInvert: REAL_FIXTURE_TAG, use: still },
    { name: 'mobile-360', dependencies: ['office'], testIgnore: [SHORTCUTS_SPEC, MOTION_SPEC, OFFICE_SPEC], grepInvert: REAL_FIXTURE_TAG, use: still },
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
        ...(fixtureServerNeeded
          ? [
              server(
                fixturePort,
                { DEMO_SHORTCUTS: 'false', REAL_SITE_CONTENT: '1', REAL_SITE_DIR: fixtureDir, E2E_MEMORY_CACHE: '1' },
                `npx tsx tests/fixtures/real-site/make-snapshot.mts ${JSON.stringify(fixtureDir)} && `,
              ),
            ]
          : []),
      ],
});
