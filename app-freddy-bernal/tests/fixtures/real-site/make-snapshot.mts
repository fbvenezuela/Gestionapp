// Writes the real-content fixture into a folder laid out like the .real-site/ a demo build writes (snapshot.json and
// media/), made by the app's own build code against the INVENTED site of snapshot-site.ts (fixtureSnapshot). A server
// reads it with REAL_SITE_DIR=<folder> (src/lib/web/real-site.ts). Nothing leaves the machine, and nothing of it is
// committed: it is made again each time, from the build code of the day.
//
//   npm run fixture:real-site -- <folder>        (default: <system temp>/fb-real-fixture)
//
// The Playwright project «real-fixture» runs it before it starts its server (playwright.config.ts).
import os from 'node:os';
import path from 'node:path';
import { writeRealSite } from '../../../scripts/real-site/cache';
import { fixtureSnapshot } from './snapshot-site';

const out = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'fb-real-fixture'));
const { snapshot: s, files, hosts } = await fixtureSnapshot();
writeRealSite(out, s, files);
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
console.log(
  `[contenido de prueba] ${out}: ${s.report.news} noticias, ${s.report.opinion} de opinión, ${s.report.episodes} emisiones, ` +
    `${s.report.documents} Semanario, ${s.report.photos} fotos (${kb(s.report.mediaBytes ?? 0)}); sitios pedidos (todos falsos): ${hosts.join(', ')}`,
);
for (const k of s.report.skipped) console.log(`[contenido de prueba]   fuera: ${k.ref} (${k.reason})`);
