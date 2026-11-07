// `npm run build` runs this first («prebuild»): the official site's content for the deployed demo, in .real-site/
// (git-ignored), only when the build is for it (scripts/real-site/settings.ts). Otherwise it removes any stale
// .real-site/ and ends at once. It always ends well: the official site never stops a build (prebuild.ts).
//
//   npm run build                                  as CI and every local build: off, invented content
//   REAL_SITE_CONTENT=1 npm run build              with the official site's content (no DATABASE_URL)
//   NODE_USE_ENV_PROXY=1 REAL_SITE_CONTENT=1 …     the same behind a proxy (Node's fetch needs it to use one)
//   REAL_SITE_BUDGET_S=300 …                       the time it may take (480 s if unset)
//   YOUTUBE_API_KEY=… (optional)                   the official YouTube API when the channel's public feeds do not
//                                                  answer; never logged, kept or written
//
// On Vercel it turns itself on for the production deployment (VERCEL_ENV=production), unless REAL_SITE_CONTENT=0.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getClientConfig } from '../../src/lib/client-config';
import { prebuild } from './prebuild';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

try {
  await prebuild({ appDir: APP, env: process.env, config: getClientConfig() });
} catch (e) {
  // Never half a snapshot, nor an old one, in a build that could not decide.
  fs.rmSync(path.join(APP, '.real-site'), { recursive: true, force: true });
  console.warn(`[contenido real] ⚠ No se pudo preparar el contenido real (${(e as Error).message}): la demo sale con el contenido inventado.`);
}
process.exit(0);
