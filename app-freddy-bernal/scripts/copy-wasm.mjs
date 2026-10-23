// Copies the MediaInfo WASM (reads video duration, size, fps and codecs in the browser)
// to /public so the browser can load it. Runs after npm install.
import fs from 'node:fs';
import path from 'node:path';

// The UMD script is loaded at runtime (not bundled) because bundlers trip on its WASM import.
const files = [
  [path.join('node_modules', 'mediainfo.js', 'dist', 'MediaInfoModule.wasm'), path.join('public', 'mediainfo', 'MediaInfoModule.wasm')],
  [path.join('node_modules', 'mediainfo.js', 'dist', 'umd', 'index.min.js'), path.join('public', 'mediainfo', 'mediainfo.min.js')],
];
for (const [src, dst] of files) {
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
