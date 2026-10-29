// npx tsx scripts/make-demo-thumbs.mts — draws the small pictures of Redes in the demo (R4, design §7.1 item 8) into
// src/lib/db/demo-assets/redes-*.jpg. Run once; the files are kept in the repository and the seed reads them
// (src/lib/db/seed-parts/redes.ts). INVENTED and abstract: gradients and shapes in the brand's tones (taken from
// src/app/tokens.css, never written here), no people, faces, places or text. A canvas JPEG carries no EXIF.
// Same pictures every time (a fixed pseudo-random sequence per file). Uses Playwright's Chromium: set
// PW_CHROMIUM_PATH=/opt/pw-browsers/chromium in Claude's container. Writes only inside src/lib/db/demo-assets.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const OUT = path.join(root, 'src', 'lib', 'db', 'demo-assets');
const MAX_BYTES = 256 * 1024;

// The light theme's colors (the first :root block of tokens.css), by token name.
function brandTones(): Record<string, string> {
  const css = fs.readFileSync(path.join(root, 'src', 'app', 'tokens.css'), 'utf8');
  const start = css.indexOf(':root');
  const block = css.slice(start, css.indexOf('}', start));
  const tones: Record<string, string> = {};
  for (const m of block.matchAll(/--c-([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)) tones[m[1]] = m[2];
  return tones;
}

type Spec = { file: string; w: number; h: number; seed: number; palette: string[] };

function specs(t: Record<string, string>): Spec[] {
  const need = ['accent', 'accent-ink', 'accent-soft', 'bg-tint-1', 'bg-tint-2', 'bg-tint-3', 'bg-wash', 'ok', 'ok-soft', 'warn', 'warn-soft', 'slate'];
  for (const k of need) if (!t[k]) throw new Error(`tokens.css sin --c-${k}`);
  const olive = [t['bg-tint-1'], t.accent, t['accent-ink'], t['bg-tint-3']];
  const sun = [t['bg-tint-2'], t.warn, t['warn-soft'], t.accent];
  const leaf = [t['bg-tint-3'], t.ok, t['ok-soft'], t['accent-ink']];
  const dusk = [t['bg-wash'], t.slate, t.accent, t['bg-tint-2']];
  const soft = [t['accent-soft'], t['bg-tint-1'], t.accent, t['bg-wash']];
  return [
    { file: 'redes-post-1.jpg', w: 256, h: 320, seed: 11, palette: olive },
    { file: 'redes-post-2.jpg', w: 256, h: 320, seed: 12, palette: sun },
    { file: 'redes-post-3.jpg', w: 256, h: 320, seed: 13, palette: leaf },
    { file: 'redes-post-4.jpg', w: 256, h: 320, seed: 14, palette: soft },
    { file: 'redes-reel-1.jpg', w: 180, h: 320, seed: 21, palette: dusk },
    { file: 'redes-reel-2.jpg', w: 180, h: 320, seed: 22, palette: leaf },
    { file: 'redes-reel-3.jpg', w: 180, h: 320, seed: 23, palette: sun },
    { file: 'redes-yt-1.jpg', w: 320, h: 180, seed: 31, palette: olive },
    { file: 'redes-slide-1.jpg', w: 256, h: 320, seed: 41, palette: soft },
    { file: 'redes-slide-2.jpg', w: 256, h: 320, seed: 42, palette: olive },
    { file: 'redes-slide-3.jpg', w: 256, h: 320, seed: 43, palette: sun },
    { file: 'redes-slide-4.jpg', w: 256, h: 320, seed: 44, palette: leaf },
  ];
}

// Runs in the page: a gradient, then soft circles and a band. Returns the JPEG as a data URL. Kept as plain source
// text: tsx would wrap a real function with helpers the page does not have.
const DRAW = `(s) => {
  let state = (s.seed * 2654435761) % 4294967296;
  const rand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const c = document.createElement('canvas');
  c.width = s.w;
  c.height = s.h;
  const g = c.getContext('2d');
  const [a, b, d, e] = s.palette;
  const grad = g.createLinearGradient(0, 0, s.w * rand(), s.h);
  grad.addColorStop(0, a);
  grad.addColorStop(1, e);
  g.fillStyle = grad;
  g.fillRect(0, 0, s.w, s.h);
  for (let i = 0; i < 5; i++) {
    g.globalAlpha = 0.25 + rand() * 0.4;
    g.fillStyle = [b, d, a, e][i % 4];
    g.beginPath();
    g.arc(s.w * rand(), s.h * rand(), Math.min(s.w, s.h) * (0.15 + rand() * 0.35), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 0.35;
  g.fillStyle = b;
  g.save();
  g.translate(s.w / 2, s.h / 2);
  g.rotate((rand() - 0.5) * 1.2);
  g.fillRect(-s.w, -s.h * 0.06, s.w * 2, s.h * 0.12);
  g.restore();
  g.globalAlpha = 1;
  return c.toDataURL('image/jpeg', 0.82);
}`;

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>miniaturas</title>');
  for (const s of specs(brandTones())) {
    const url = (await page.evaluate(`(${DRAW})(${JSON.stringify(s)})`)) as string;
    const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    if (bytes.length > MAX_BYTES) throw new Error(`${s.file} pesa ${bytes.length} bytes`);
    fs.writeFileSync(path.join(OUT, s.file), bytes);
    console.log(`Escrito: src/lib/db/demo-assets/${s.file} (${s.w}×${s.h}, ${bytes.length} bytes)`);
  }
} finally {
  await browser.close();
}
