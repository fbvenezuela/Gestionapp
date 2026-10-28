// npm run docs:guides — writes docs/GUIA-POR-ROL.md, docs/FLUJOS.md and docs/GUIA-ADMINISTRACION.md from the one source
// in src/lib/guides (R3, D-42). Never edit those .md files by hand: edit src/lib/guides and run this again.
// Writes only inside docs/ and sends nothing to anyone (the guides are not sent, 25/10).
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_GUIDE, FLOWS, SHARED, TOURS, allGuides } from '../src/lib/guides/index';
import { renderAllDocs } from '../src/lib/guides/render-md';

const root = path.resolve(import.meta.dirname, '..');
const docs = renderAllDocs({ shared: SHARED, guides: allGuides(), flows: FLOWS, tours: TOURS, admin: ADMIN_GUIDE });
for (const [file, text] of Object.entries(docs)) {
  const full = path.join(root, file);
  const before = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  if (before === text) {
    console.log(`Sin cambios: ${file}`);
    continue;
  }
  fs.writeFileSync(full, text);
  console.log(`Escrito: ${file}`);
}
