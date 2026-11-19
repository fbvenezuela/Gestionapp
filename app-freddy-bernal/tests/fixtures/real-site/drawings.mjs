// INVENTED pictures for the real-content fixture (snapshot-site.ts): drawn scenes in the brand's colours, with no people,
// no faces, no real place and no photo of anyone, rendered from SVG to JPEG with the sharp the app installs. Used only
// to make the fixture (never by the app).
// The scenes come from the invented snapshot the web guide's screenshots used (19/11/2026, wave 0 of the new website).
import { createRequire } from 'node:module';

const sharp = createRequire(import.meta.url)('sharp');

const W = 1600;
const H = 1067;
const C = {
  olive: '#7F8630', oliveDark: '#565B1F', oliveMid: '#959C45', oliveLight: '#BFC47A', olivePale: '#E2E5C2',
  orange: '#E8691E', orangeSoft: '#F3A15F', peach: '#F7D2AE', cream: '#F8F3E7', sand: '#EADFC8', stone: '#D3CAB6',
  green1: '#3F6B34', green2: '#55813F', green3: '#6F9A4E', green4: '#8FB264', wood: '#8A6542', woodDark: '#5B4129',
  terracotta: '#B45A34', charcoal: '#3C4047', grey: '#8A8F96', lightGrey: '#D9DBDD', white: '#FFFFFF', red: '#C23B2C',
  water: '#5B9BC2', waterLight: '#A7CDE2', glass: '#7FA3BC',
};

/** A small seeded random (the same picture every run). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => Number(n).toFixed(1);

function skyDef(id, stops) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
}
function glowDef(id, color) {
  return `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="0.55"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
}
/** Jagged Andean ridges. */
function peaks(rnd, baseY, minH, maxH, count, color, w = W, h = H) {
  const step = (w + 100) / count;
  let d = `M -50 ${h} L -50 ${f(baseY - rnd() * minH)}`;
  for (let i = 0; i < count; i++) {
    const x0 = -50 + i * step;
    d += ` L ${f(x0 + step * (0.3 + rnd() * 0.4))} ${f(baseY - (minH + rnd() * (maxH - minH)))}`;
    d += ` L ${f(x0 + step)} ${f(baseY - rnd() * minH * 0.7)}`;
  }
  return `<path d="${d} L ${w + 50} ${h} Z" fill="${color}"/>`;
}
/** Soft rolling hills. */
function hills(rnd, baseY, amp, count, color, w = W, h = H) {
  const step = (w + 200) / count;
  let x = -100;
  let y = baseY - rnd() * amp * 0.5;
  let d = `M -100 ${h} L -100 ${f(y)}`;
  for (let i = 0; i < count; i++) {
    const nx = x + step;
    const ny = baseY - rnd() * amp * 0.5;
    d += ` Q ${f(x + step / 2)} ${f(Math.min(y, ny) - amp * (0.5 + rnd() * 0.5))} ${f(nx)} ${f(ny)}`;
    x = nx;
    y = ny;
  }
  return `<path d="${d} L ${w + 100} ${h} Z" fill="${color}"/>`;
}
function cloud(x, y, s, o = 0.9) {
  return `<g fill="#fff" opacity="${o}"><ellipse cx="${x}" cy="${y}" rx="${70 * s}" ry="${26 * s}"/><ellipse cx="${x - 40 * s}" cy="${y - 14 * s}" rx="${38 * s}" ry="${28 * s}"/><ellipse cx="${x + 22 * s}" cy="${y - 24 * s}" rx="${44 * s}" ry="${34 * s}"/></g>`;
}
function tree(x, y, s, c1 = C.green2, c2 = C.green1) {
  return `<g><rect x="${f(x - 6 * s)}" y="${f(y - 40 * s)}" width="${f(12 * s)}" height="${f(40 * s)}" fill="${C.woodDark}"/><circle cx="${f(x)}" cy="${f(y - 70 * s)}" r="${f(38 * s)}" fill="${c1}"/><circle cx="${f(x - 26 * s)}" cy="${f(y - 52 * s)}" r="${f(26 * s)}" fill="${c2}"/><circle cx="${f(x + 24 * s)}" cy="${f(y - 50 * s)}" r="${f(28 * s)}" fill="${c2}" opacity="0.9"/></g>`;
}
function house(x, base, w, h, wall, roof = C.terracotta, door = C.woodDark) {
  const rh = h * 0.45;
  return `<g><rect x="${f(x)}" y="${f(base - h)}" width="${f(w)}" height="${f(h)}" fill="${wall}"/><polygon points="${f(x - w * 0.08)},${f(base - h)} ${f(x + w / 2)},${f(base - h - rh)} ${f(x + w * 1.08)},${f(base - h)}" fill="${roof}"/><rect x="${f(x + w * 0.42)}" y="${f(base - h * 0.55)}" width="${f(w * 0.18)}" height="${f(h * 0.55)}" fill="${door}"/><rect x="${f(x + w * 0.12)}" y="${f(base - h * 0.75)}" width="${f(w * 0.18)}" height="${f(h * 0.25)}" fill="${C.glass}"/><rect x="${f(x + w * 0.7)}" y="${f(base - h * 0.75)}" width="${f(w * 0.18)}" height="${f(h * 0.25)}" fill="${C.glass}"/></g>`;
}
function wrap(defs, body, w = W, h = H) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;
}
const skyRect = (id) => `<rect width="${W}" height="${H}" fill="url(#${id})"/>`;

// --- The scenes ----------------------------------------------------------------------------------------------------------
/** An Andean valley with a small town at sunrise (the home's picture; also inside the weekly's cover). */
function valleyBody(p = 'v') {
  const r = rng(11);
  const town = [];
  const rt = rng(5);
  for (let i = 0; i < 14; i++) {
    if (i === 7) continue;
    const x = 480 + i * 46 + rt() * 8;
    const base = 772 + Math.sin(i / 2.4) * 10 + rt() * 8;
    town.push(house(x, base, 34 + rt() * 14, 28 + rt() * 14, [C.cream, C.sand, C.peach, '#F3E9D2'][i % 4]));
  }
  town.push(`<rect x="796" y="650" width="40" height="122" fill="${C.cream}"/><rect x="808" y="676" width="16" height="24" rx="8" fill="${C.glass}"/><polygon points="789,650 816,600 843,650" fill="${C.terracotta}"/>`);
  const trees = [];
  for (let i = 0; i < 9; i++) trees.push(tree(120 + i * 170 + r() * 40, 980 + r() * 40, 0.9 + r() * 0.5, C.green2, C.green1));
  // A road that winds up from the front to the town: a band that narrows with the distance.
  const left = [];
  const right = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const cx = 800 + 150 * Math.sin(Math.PI * 1.4 * t) * (1 - t * 0.6);
    const y = H + 20 - t * (H + 20 - 772);
    const w = 260 * (1 - t) + 12 * t;
    left.push(`${f(cx - w / 2)},${f(y)}`);
    right.unshift(`${f(cx + w / 2)},${f(y)}`);
  }
  const road = `<polygon points="${[...left, ...right].join(' ')}" fill="${C.sand}" opacity="0.95"/>`;
  return {
    defs: skyDef(`${p}sky`, [[0, '#F2C08E'], [0.5, '#F8DDBF'], [1, '#FBF0DF']]) + glowDef(`${p}glow`, '#F6B072'),
    body:
      `<rect width="${W}" height="${H}" fill="url(#${p}sky)"/>` +
      `<circle cx="1090" cy="420" r="300" fill="url(#${p}glow)"/><circle cx="1090" cy="420" r="92" fill="${C.orangeSoft}"/>` +
      cloud(330, 230, 1.3, 0.7) + cloud(1380, 180, 1.0, 0.6) +
      peaks(r, 560, 120, 300, 7, '#C7B8B4') +
      peaks(r, 650, 90, 220, 9, '#9EA49E') +
      hills(r, 760, 120, 5, '#8C9441') +
      town.join('') +
      hills(r, 900, 110, 4, C.olive) +
      road +
      trees.join('') +
      hills(r, 1010, 70, 3, C.oliveDark),
  };
}
function valley() {
  const v = valleyBody();
  return wrap(v.defs, v.body);
}
/** A public building with columns on a plaza (the governor's page). */
function building() {
  const r = rng(21);
  const cols = [];
  for (let i = 0; i < 8; i++) {
    const x = 405 + i * 112;
    cols.push(`<rect x="${x}" y="470" width="44" height="300" fill="${C.cream}"/><rect x="${x + 30}" y="470" width="14" height="300" fill="${C.stone}" opacity="0.7"/><rect x="${x - 8}" y="456" width="60" height="16" fill="${C.cream}"/><rect x="${x - 8}" y="762" width="60" height="14" fill="${C.cream}"/>`);
  }
  const wins = [];
  for (let i = 0; i < 7; i++) wins.push(`<rect x="${470 + i * 112}" y="520" width="30" height="70" rx="15" fill="#5E6A73"/><rect x="${470 + i * 112}" y="640" width="30" height="90" fill="#5E6A73"/>`);
  const steps = [0, 1, 2, 3].map((i) => `<rect x="${340 - i * 30}" y="${776 + i * 22}" width="${920 + i * 60}" height="22" fill="${i % 2 ? '#D8CFBC' : '#E4DCCB'}"/>`).join('');
  const tiles = [];
  for (let i = 0; i < 18; i++) tiles.push(`<line x1="${f(800 + (i - 9) * 40)}" y1="864" x2="${f(800 + (i - 9) * 180)}" y2="${H}" stroke="#D2C7B0" stroke-width="3"/>`);
  return wrap(
    skyDef('sky', [[0, '#A9CBE0'], [1, '#EEF3EE']]),
    skyRect('sky') + cloud(260, 200, 1.4) + cloud(1300, 150, 1.1) +
      peaks(r, 520, 60, 160, 8, '#B9C6CE') +
      `<rect x="0" y="560" width="${W}" height="320" fill="${C.green3}"/>` +
      `<rect x="330" y="400" width="940" height="380" fill="${C.sand}"/>` +
      `<polygon points="310,404 800,250 1290,404" fill="${C.cream}"/><polygon points="370,392 800,272 1230,392" fill="${C.sand}"/>` +
      `<circle cx="800" cy="342" r="34" fill="${C.olive}"/><circle cx="800" cy="342" r="22" fill="${C.cream}"/>` +
      `<rect x="310" y="400" width="980" height="22" fill="${C.cream}"/>` +
      wins.join('') + cols.join('') +
      `<rect x="752" y="640" width="96" height="136" fill="${C.woodDark}"/><rect x="752" y="640" width="96" height="14" fill="${C.wood}"/>` +
      steps +
      `<rect x="0" y="864" width="${W}" height="${H - 864}" fill="#E6DCC6"/>` + tiles.join('') +
      tree(150, 860, 1.9, C.green2, C.green1) + tree(1460, 860, 2.0, C.green2, C.green1) + tree(300, 880, 1.3, C.green3, C.green2) + tree(1310, 885, 1.3, C.green3, C.green2) +
      `<g fill="${C.charcoal}"><rect x="236" y="700" width="8" height="190"/><circle cx="240" cy="696" r="16" fill="#F6EBC8"/><rect x="1356" y="700" width="8" height="190"/><circle cx="1360" cy="696" r="16" fill="#F6EBC8"/></g>`,
  );
}

/** A town square with swings, a slide, benches and street lamps, among trees and the houses around it. */
function plaza() {
  const r = rng(31);
  const walls = ['#F4C7A1', '#BFD9E6', '#CFE0B6', '#F6E7C2', '#E9C1C1', '#D7E3C9', '#F3D9A6', '#F8F3E7', '#BFD9E6'];
  const houses = [];
  for (let i = 0; i < 9; i++) houses.push(house(30 + i * 176, 652, 152, 112 + ((i * 29) % 44), walls[i]));
  // The square's tiles, running to the back.
  const tiles = [];
  for (let i = 0; i < 17; i++) tiles.push(`<line x1="${f(800 + (i - 8) * 80)}" y1="690" x2="${f(800 + (i - 8) * 250)}" y2="${H}" stroke="#D2C7B0" stroke-width="3"/>`);
  for (let k = 1; k < 7; k++) tiles.push(`<line x1="0" y1="${f(690 + Math.pow(k / 6, 1.5) * (H - 690))}" x2="${W}" y2="${f(690 + Math.pow(k / 6, 1.5) * (H - 690))}" stroke="#D2C7B0" stroke-width="3"/>`);
  const bushes = [];
  for (let i = 0; i < 16; i++) bushes.push(`<circle cx="${f(20 + i * 104 + r() * 20)}" cy="${f(668 + r() * 6)}" r="${f(26 + r() * 10)}" fill="${i % 2 ? C.green2 : C.green3}"/>`);
  const lamp = (x, base, s) =>
    `<g><rect x="${f(x - 6 * s)}" y="${f(base - 300 * s)}" width="${f(12 * s)}" height="${f(300 * s)}" fill="${C.charcoal}"/>` +
    `<rect x="${f(x - 18 * s)}" y="${f(base - 16 * s)}" width="${f(36 * s)}" height="${f(16 * s)}" rx="${f(3 * s)}" fill="${C.charcoal}"/>` +
    `<circle cx="${f(x)}" cy="${f(base - 322 * s)}" r="${f(46 * s)}" fill="#F6EBC8" opacity="0.5"/>` +
    `<path d="M ${f(x - 20 * s)} ${f(base - 300 * s)} L ${f(x + 20 * s)} ${f(base - 300 * s)} L ${f(x + 28 * s)} ${f(base - 346 * s)} L ${f(x - 28 * s)} ${f(base - 346 * s)} Z" fill="#F6EBC8" stroke="${C.charcoal}" stroke-width="${f(5 * s)}"/>` +
    `<rect x="${f(x - 34 * s)}" y="${f(base - 358 * s)}" width="${f(68 * s)}" height="${f(14 * s)}" rx="${f(4 * s)}" fill="${C.charcoal}"/></g>`;
  const bench = (x, g, s) =>
    `<g><rect x="${f(x + 18 * s)}" y="${f(g - 112 * s)}" width="${f(10 * s)}" height="${f(70 * s)}" fill="${C.charcoal}"/><rect x="${f(x + 192 * s)}" y="${f(g - 112 * s)}" width="${f(10 * s)}" height="${f(70 * s)}" fill="${C.charcoal}"/>` +
    `<rect x="${f(x)}" y="${f(g - 116 * s)}" width="${f(220 * s)}" height="${f(18 * s)}" rx="${f(4 * s)}" fill="${C.wood}"/><rect x="${f(x)}" y="${f(g - 90 * s)}" width="${f(220 * s)}" height="${f(18 * s)}" rx="${f(4 * s)}" fill="${C.wood}"/>` +
    `<rect x="${f(x - 8 * s)}" y="${f(g - 56 * s)}" width="${f(236 * s)}" height="${f(20 * s)}" rx="${f(4 * s)}" fill="${C.woodDark}"/>` +
    `<rect x="${f(x + 14 * s)}" y="${f(g - 38 * s)}" width="${f(14 * s)}" height="${f(38 * s)}" fill="${C.charcoal}"/><rect x="${f(x + 192 * s)}" y="${f(g - 38 * s)}" width="${f(14 * s)}" height="${f(38 * s)}" fill="${C.charcoal}"/></g>`;
  const swing = (x) =>
    `<g><line x1="${x}" y1="572" x2="${x}" y2="826" stroke="${C.charcoal}" stroke-width="5"/><line x1="${x + 64}" y1="572" x2="${x + 64}" y2="826" stroke="${C.charcoal}" stroke-width="5"/>` +
    `<rect x="${x - 10}" y="822" width="84" height="16" rx="5" fill="${C.orange}"/></g>`;
  const rungs = [];
  for (let k = 0; k < 7; k++) rungs.push(`<rect x="1036" y="${700 + k * 34}" width="52" height="8" fill="${C.oliveDark}"/>`);
  return wrap(
    skyDef('sky', [[0, '#A6C9DE'], [1, '#EFF3EC']]),
    skyRect('sky') + cloud(330, 170, 1.2) + cloud(1260, 120, 1.0) +
      peaks(r, 450, 100, 250, 7, '#A9BBC6') + hills(r, 540, 90, 5, C.green4) +
      houses.join('') +
      tree(70, 700, 1.9) + tree(1530, 700, 2.0) +
      `<rect x="0" y="660" width="${W}" height="${H - 660}" fill="#E6DCC6"/>` + tiles.join('') +
      `<rect x="0" y="652" width="${W}" height="38" fill="${C.green3}"/>` + bushes.join('') +
      `<ellipse cx="575" cy="912" rx="250" ry="34" fill="#D9C49A"/>` +
      `<rect x="370" y="556" width="410" height="18" rx="6" fill="${C.olive}"/>` +
      `<g stroke="${C.oliveDark}" stroke-width="16" stroke-linecap="round"><line x1="392" y1="566" x2="340" y2="910"/><line x1="392" y1="566" x2="444" y2="910"/><line x1="758" y1="566" x2="706" y2="910"/><line x1="758" y1="566" x2="810" y2="910"/></g>` +
      swing(486) + swing(612) +
      `<rect x="1028" y="664" width="10" height="268" fill="${C.oliveDark}"/><rect x="1086" y="664" width="10" height="268" fill="${C.oliveDark}"/>` + rungs.join('') +
      `<rect x="1020" y="652" width="140" height="18" rx="4" fill="${C.olive}"/><rect x="1020" y="602" width="10" height="56" fill="${C.oliveDark}"/><rect x="1150" y="602" width="10" height="56" fill="${C.oliveDark}"/><rect x="1020" y="600" width="140" height="10" rx="4" fill="${C.oliveDark}"/>` +
      `<path d="M 1150 652 L 1190 652 Q 1240 840 1390 896 L 1390 930 L 1356 930 Q 1206 870 1150 672 Z" fill="${C.orange}"/><path d="M 1166 660 Q 1222 852 1380 910" stroke="${C.orangeSoft}" stroke-width="8" fill="none"/>` +
      `<rect x="1234" y="800" width="12" height="130" fill="${C.oliveDark}"/>` +
      lamp(900, 930, 1.0) + lamp(230, 1000, 1.1) + lamp(1460, 1010, 1.1) +
      bench(60, 1050, 1.1) + bench(1250, 1060, 1.1),
  );
}

/** A small rural clinic with an ambulance. */
function clinic() {
  const r = rng(41);
  return wrap(
    skyDef('sky', [[0, '#B2D0E2'], [1, '#F0F4EE']]),
    skyRect('sky') + cloud(300, 180, 1.2) + cloud(1200, 140, 1.4) +
      peaks(r, 520, 110, 260, 7, '#A6B9C4') + hills(r, 620, 120, 5, C.green3) + hills(r, 700, 80, 4, C.green2) +
      `<rect x="250" y="470" width="760" height="300" fill="#FBFAF6"/><rect x="250" y="470" width="760" height="26" fill="${C.olive}"/><polygon points="230,472 630,380 1030,472" fill="#E4E0D4"/>` +
      `<rect x="290" y="560" width="120" height="110" fill="${C.glass}"/><rect x="450" y="560" width="120" height="110" fill="${C.glass}"/><rect x="830" y="560" width="120" height="110" fill="${C.glass}"/>` +
      `<rect x="620" y="580" width="140" height="190" fill="#8DA9B8"/><rect x="600" y="540" width="180" height="22" fill="${C.oliveDark}"/>` +
      `<rect x="650" y="410" width="80" height="80" rx="10" fill="#FFF"/><rect x="682" y="420" width="16" height="60" fill="${C.green2}"/><rect x="660" y="442" width="60" height="16" fill="${C.green2}"/>` +
      `<rect x="0" y="770" width="${W}" height="${H - 770}" fill="#D6CDB8"/><rect x="0" y="770" width="${W}" height="10" fill="#C3B9A2"/>` +
      `<g><rect x="1030" y="640" width="420" height="190" rx="22" fill="#FFF"/><path d="M1030 700 L1030 660 Q1030 640 1050 640 L1150 640 L1150 700 Z" fill="#FFF"/><rect x="1050" y="660" width="80" height="60" rx="8" fill="${C.glass}"/><rect x="1180" y="664" width="110" height="56" rx="6" fill="${C.glass}"/><rect x="1030" y="740" width="420" height="24" fill="${C.orange}"/><rect x="1340" y="676" width="54" height="54" rx="6" fill="#FFF" stroke="${C.green2}" stroke-width="4"/><rect x="1361" y="684" width="12" height="38" fill="${C.green2}"/><rect x="1348" y="697" width="38" height="12" fill="${C.green2}"/><rect x="1210" y="626" width="60" height="16" rx="6" fill="${C.orange}"/><circle cx="1110" cy="832" r="38" fill="${C.charcoal}"/><circle cx="1110" cy="832" r="16" fill="#BFC3C8"/><circle cx="1370" cy="832" r="38" fill="${C.charcoal}"/><circle cx="1370" cy="832" r="16" fill="#BFC3C8"/></g>` +
      tree(130, 790, 1.8) + tree(1530, 760, 1.4, C.green3, C.green2),
  );
}

/** An athletics track in front of empty stands. */
function track() {
  const seats = [];
  for (let row = 0; row < 6; row++) {
    seats.push(`<rect x="0" y="${300 + row * 40}" width="${W}" height="40" fill="${row % 2 ? '#C9CDD1' : '#B7BCC1'}"/>`);
    for (let i = 0; i < 40; i++) seats.push(`<rect x="${10 + i * 40}" y="${306 + row * 40}" width="26" height="16" rx="4" fill="${[C.olive, C.orangeSoft, C.cream][(i + row) % 3]}"/>`);
  }
  const lanes = [];
  for (let i = 0; i <= 6; i++) lanes.push(`<ellipse cx="800" cy="1180" rx="${1240 - i * 70}" ry="${560 - i * 52}" fill="none" stroke="#F8F3E7" stroke-width="5"/>`);
  return wrap(
    skyDef('sky', [[0, '#9EC4DB'], [1, '#E9F1F0']]),
    skyRect('sky') + cloud(1300, 120, 1.1) +
      `<rect x="120" y="60" width="14" height="250" fill="${C.charcoal}"/><rect x="80" y="40" width="94" height="44" fill="${C.lightGrey}"/><rect x="1466" y="60" width="14" height="250" fill="${C.charcoal}"/><rect x="1426" y="40" width="94" height="44" fill="${C.lightGrey}"/>` +
      `<polygon points="0,300 ${W},300 ${W},270 0,270" fill="#A3A8AE"/>` + seats.join('') +
      `<rect x="0" y="540" width="${W}" height="30" fill="#8C9399"/>` +
      `<rect x="0" y="570" width="${W}" height="${H - 570}" fill="${C.green3}"/>` +
      `<ellipse cx="800" cy="1180" rx="1300" ry="600" fill="#C4683F"/>` + lanes.join('') +
      `<ellipse cx="800" cy="1180" rx="820" ry="250" fill="${C.green3}"/><ellipse cx="800" cy="1180" rx="760" ry="215" fill="${C.green2}" opacity="0.5"/>` +
      `<g fill="#F8F3E7"><rect x="470" y="900" width="10" height="70"/><rect x="560" y="880" width="10" height="70"/></g>`,
  );
}

/** A first-aid tent with cones on a field. */
function firstAid() {
  const r = rng(61);
  const cone = (x, y, s) => `<g><polygon points="${x - 26 * s},${y} ${x},${y - 80 * s} ${x + 26 * s},${y}" fill="${C.orange}"/><polygon points="${x - 15 * s},${y - 34 * s} ${x - 9 * s},${y - 50 * s} ${x + 9 * s},${y - 50 * s} ${x + 15 * s},${y - 34 * s}" fill="#FFF"/><rect x="${x - 36 * s}" y="${y - 4 * s}" width="${72 * s}" height="${10 * s}" fill="${C.orange}"/></g>`;
  const scallop = [];
  for (let i = 0; i < 10; i++) scallop.push(`<path d="M ${380 + i * 84} 470 Q ${422 + i * 84} 510 ${464 + i * 84} 470 Z" fill="${C.orange}"/>`);
  return wrap(
    skyDef('sky', [[0, '#A9CCE0'], [1, '#EFF3EC']]),
    skyRect('sky') + cloud(1250, 160, 1.3) +
      peaks(r, 520, 120, 280, 7, '#A9BAC5') + hills(r, 640, 90, 5, C.green4) +
      `<rect x="0" y="640" width="${W}" height="${H - 640}" fill="${C.green3}"/>` +
      `<polygon points="380,470 480,330 1120,330 1220,470" fill="${C.orange}"/><polygon points="480,330 800,300 1120,330" fill="#D8591A"/>` + scallop.join('') +
      `<g fill="${C.charcoal}"><rect x="392" y="470" width="12" height="320"/><rect x="1196" y="470" width="12" height="320"/><rect x="520" y="470" width="10" height="250"/><rect x="1070" y="470" width="10" height="250"/></g>` +
      `<rect x="560" y="640" width="480" height="20" fill="${C.wood}"/><rect x="580" y="660" width="12" height="130" fill="${C.woodDark}"/><rect x="1008" y="660" width="12" height="130" fill="${C.woodDark}"/>` +
      `<rect x="640" y="560" width="150" height="80" rx="10" fill="#FFF" stroke="${C.lightGrey}" stroke-width="4"/><rect x="705" y="574" width="20" height="52" fill="${C.orange}"/><rect x="689" y="590" width="52" height="20" fill="${C.orange}"/>` +
      `<rect x="830" y="590" width="150" height="50" rx="8" fill="${C.olive}"/>` +
      cone(250, 900, 1.2) + cone(420, 960, 1.4) + cone(1240, 950, 1.3) + cone(1400, 890, 1.1) + cone(820, 1010, 1.2) +
      tree(120, 680, 1.6) + tree(1500, 690, 1.7),
  );
}

/** An empty meeting room with a long table and a screen. */
function meetingRoom() {
  const r = rng(71);
  const chairs = [];
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const lx = 560 - t * 330;
    const rx = 1040 + t * 330;
    const y = 560 + t * 380;
    const s = 0.8 + t * 0.9;
    chairs.push(`<rect x="${f(lx - 70 * s)}" y="${f(y - 40 * s)}" width="${f(60 * s)}" height="${f(90 * s)}" rx="${f(12 * s)}" fill="#3F444B"/>`);
    chairs.push(`<rect x="${f(rx + 10 * s)}" y="${f(y - 40 * s)}" width="${f(60 * s)}" height="${f(90 * s)}" rx="${f(12 * s)}" fill="#3F444B"/>`);
  }
  const items = [];
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    const y = 560 + t * 380;
    items.push(`<rect x="${f(600 - t * 300)}" y="${f(y - 40)}" width="${f(16 + t * 14)}" height="${f(46 + t * 30)}" rx="6" fill="#BFE0EE"/><rect x="${f(985 + t * 280)}" y="${f(y - 20)}" width="${f(60 + t * 40)}" height="${f(40 + t * 20)}" fill="#FFF" stroke="${C.lightGrey}" stroke-width="2"/>`);
  }
  return wrap(
    skyDef('sky', [[0, '#A9CBE0'], [1, '#EEF3EE']]) + `<clipPath id="win"><rect x="60" y="150" width="300" height="420"/></clipPath>`,
    `<rect width="${W}" height="${H}" fill="#EFE8DA"/><rect x="0" y="740" width="${W}" height="${H - 740}" fill="#C7B595"/>` +
      `<g clip-path="url(#win)"><rect x="60" y="150" width="300" height="420" fill="url(#sky)"/>` + peaks(r, 470, 60, 170, 4, '#9FB2BE', 420, 570) + hills(r, 540, 40, 3, C.green3, 420, 570) + `</g>` +
      `<rect x="60" y="150" width="300" height="420" fill="none" stroke="${C.cream}" stroke-width="14"/><line x1="210" y1="150" x2="210" y2="570" stroke="${C.cream}" stroke-width="10"/>` +
      `<rect x="560" y="150" width="480" height="270" rx="10" fill="${C.charcoal}"/><g fill="${C.oliveLight}"><rect x="620" y="320" width="50" height="70"/><rect x="700" y="280" width="50" height="110"/><rect x="780" y="300" width="50" height="90"/><rect x="860" y="240" width="50" height="150"/><rect x="940" y="260" width="50" height="130"/></g><rect x="620" y="200" width="180" height="16" fill="${C.orangeSoft}"/>` +
      `<polygon points="620,540 980,540 1420,1067 180,1067" fill="${C.wood}"/><polygon points="620,540 980,540 990,556 610,556" fill="${C.woodDark}"/>` +
      chairs.join('') + items.join('') +
      `<rect x="1380" y="180" width="160" height="260" fill="${C.green3}" opacity="0.25"/><circle cx="1460" cy="560" r="70" fill="${C.green2}"/><rect x="1420" y="600" width="80" height="140" fill="${C.terracotta}"/>`,
  );
}

/** An excavator cleaning a stream bed. */
function streamBed() {
  const r = rng(91);
  return wrap(
    skyDef('sky', [[0, '#A6C8DC'], [1, '#EDF2EC']]),
    skyRect('sky') + cloud(400, 160, 1.2) +
      peaks(r, 470, 100, 240, 7, '#A7B8C2') + hills(r, 560, 120, 5, C.green3) +
      `<rect x="0" y="560" width="${W}" height="${H - 560}" fill="#9D8A68"/>` +
      `<path d="M 640 560 C 700 700 420 820 560 ${H} L 1060 ${H} C 960 860 1000 700 760 560 Z" fill="${C.water}"/><path d="M 700 600 C 730 720 560 830 660 ${H} L 760 ${H} C 680 860 800 720 740 600 Z" fill="${C.waterLight}" opacity="0.6"/>` +
      `<ellipse cx="1150" cy="900" rx="160" ry="50" fill="#7B6A4F"/><ellipse cx="380" cy="960" rx="170" ry="50" fill="#7B6A4F"/>` +
      tree(160, 640, 1.8) + tree(330, 610, 1.3, C.green3, C.green2) + tree(1480, 640, 1.9) + tree(1320, 600, 1.2, C.green3, C.green2) +
      `<g><rect x="1060" y="760" width="380" height="70" rx="35" fill="${C.charcoal}"/><circle cx="1100" cy="795" r="22" fill="#6B7076"/><circle cx="1400" cy="795" r="22" fill="#6B7076"/><rect x="1090" y="620" width="320" height="140" rx="12" fill="#E8A21E"/><rect x="1250" y="520" width="150" height="130" rx="10" fill="#E8A21E"/><rect x="1270" y="540" width="110" height="80" rx="6" fill="${C.glass}"/><rect x="1090" y="700" width="320" height="16" fill="${C.charcoal}" opacity="0.5"/>` +
      `<path d="M 1140 640 L 960 470 L 880 500" stroke="#D99216" stroke-width="44" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M 880 500 L 830 690" stroke="#D99216" stroke-width="34" fill="none" stroke-linecap="round"/><path d="M 790 680 L 880 700 L 860 770 L 800 760 Z" fill="${C.charcoal}"/><circle cx="960" cy="470" r="14" fill="${C.charcoal}"/><circle cx="880" cy="500" r="12" fill="${C.charcoal}"/></g>`,
  );
}

/** A street of colourful houses in a mountain town. */
function street() {
  const r = rng(101);
  const walls = ['#F4C7A1', '#BFD9E6', '#CFE0B6', '#F6E7C2', '#E9C1C1', '#D7E3C9', '#F3D9A6'];
  const houses = [];
  let x = -20;
  for (let i = 0; i < 7; i++) {
    const w = 210 + (i % 3) * 30;
    const h = 250 + ((i * 37) % 60);
    const base = 800;
    houses.push(`<rect x="${x}" y="${base - h}" width="${w}" height="${h}" fill="${walls[i % walls.length]}"/><polygon points="${x - 14},${base - h} ${x + w / 2},${base - h - 70} ${x + w + 14},${base - h}" fill="${C.terracotta}"/>`);
    for (let k = 0; k < 6; k++) houses.push(`<path d="M ${x - 6 + k * (w / 6 + 4)} ${base - h + 2} q ${w / 24} 14 ${w / 12} 0" stroke="#9B4A28" stroke-width="4" fill="none"/>`);
    houses.push(`<rect x="${x + w * 0.38}" y="${base - 150}" width="${w * 0.24}" height="150" fill="${C.woodDark}"/><rect x="${x + w * 0.1}" y="${base - h + 60}" width="${w * 0.22}" height="80" fill="${C.glass}"/><rect x="${x + w * 0.68}" y="${base - h + 60}" width="${w * 0.22}" height="80" fill="${C.glass}"/>`);
    houses.push(`<g stroke="#FFF" stroke-width="4">${[1, 2, 3].map((k) => `<line x1="${x + w * 0.1 + k * w * 0.055}" y1="${base - h + 60}" x2="${x + w * 0.1 + k * w * 0.055}" y2="${base - h + 140}"/>`).join('')}</g>`);
    houses.push(`<rect x="${x + w * 0.05}" y="${base - 46}" width="44" height="46" fill="${C.terracotta}"/><circle cx="${x + w * 0.05 + 22}" cy="${base - 58}" r="26" fill="${C.green2}"/>`);
    x += w + 6;
  }
  return wrap(
    skyDef('sky', [[0, '#A5C8DD'], [1, '#EEF3EE']]),
    skyRect('sky') + cloud(1200, 130, 1.2) + peaks(r, 460, 120, 300, 6, '#9FB3C0') + hills(r, 540, 80, 5, C.green3) +
      houses.join('') +
      `<rect x="0" y="800" width="${W}" height="60" fill="#D9D2C4"/><rect x="0" y="860" width="${W}" height="${H - 860}" fill="#9EA2A6"/><g fill="#F3EFE6">${[0, 1, 2, 3, 4, 5].map((k) => `<rect x="${60 + k * 280}" y="960" width="150" height="14"/>`).join('')}</g>` +
      `<rect x="1460" y="560" width="10" height="300" fill="${C.charcoal}"/><path d="M 1465 566 q 50 -10 70 30" stroke="${C.charcoal}" stroke-width="8" fill="none"/><circle cx="1535" cy="604" r="14" fill="#F6EBC8"/>`,
  );
}

/** A pedestrian suspension bridge over a river. */
function bridge() {
  const r = rng(141);
  const hangers = [];
  for (let i = 1; i < 30; i++) {
    const x = 300 + i * 34;
    const t = (x - 300) / 1000;
    const cableY = 360 + 4 * 190 * t * (1 - t) * 1 + 0;
    const y = 360 + 190 * (1 - Math.pow(2 * t - 1, 2));
    hangers.push(`<line x1="${f(x)}" y1="${f(y)}" x2="${f(x)}" y2="600" stroke="${C.charcoal}" stroke-width="3"/>`);
    void cableY;
  }
  return wrap(
    skyDef('sky', [[0, '#A2C6DB'], [1, '#EDF3EE']]),
    skyRect('sky') + cloud(300, 170, 1.2) + cloud(1350, 120, 0.9) +
      peaks(r, 470, 120, 280, 7, '#A1B3BF') + hills(r, 580, 120, 5, C.green3) +
      `<rect x="0" y="620" width="${W}" height="${H - 620}" fill="${C.water}"/><path d="M 0 700 Q 400 680 800 720 T 1600 700" stroke="${C.waterLight}" stroke-width="10" fill="none" opacity="0.7"/><path d="M 0 820 Q 400 800 800 840 T 1600 820" stroke="${C.waterLight}" stroke-width="10" fill="none" opacity="0.6"/>` +
      `<path d="M 0 600 L 330 600 Q 300 760 0 900 Z" fill="${C.green2}"/><path d="M ${W} 600 L 1270 600 Q 1300 760 ${W} 900 Z" fill="${C.green2}"/>` +
      tree(120, 640, 1.8) + tree(1480, 640, 1.9) + tree(240, 630, 1.2, C.green3, C.green2) +
      hangers.join('') +
      `<path d="M 300 360 Q 800 740 1300 360" stroke="${C.charcoal}" stroke-width="8" fill="none"/>` +
      `<rect x="280" y="330" width="40" height="290" fill="${C.oliveDark}"/><rect x="1280" y="330" width="40" height="290" fill="${C.oliveDark}"/><rect x="270" y="320" width="60" height="20" fill="${C.olive}"/><rect x="1270" y="320" width="60" height="20" fill="${C.olive}"/>` +
      `<rect x="260" y="596" width="1080" height="22" fill="${C.wood}"/><rect x="260" y="560" width="1080" height="6" fill="${C.woodDark}"/>` +
      `<g fill="${C.woodDark}">${Array.from({ length: 28 }, (_, i) => `<rect x="${270 + i * 39}" y="560" width="5" height="38"/>`).join('')}</g>`,
  );
}

/** The weekly's invented cover (a page of a made-up newspaper: its texts say it is an example). */
function weeklyCover() {
  const PW = 960;
  const PH = 1280;
  const v = valleyBody('c');
  const bars = (x, y, w, n, gap = 22) =>
    Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${y + i * gap}" width="${i === n - 1 ? w * 0.6 : w}" height="9" rx="4" fill="#B9B6AD"/>`).join('');
  const font = `font-family="Inter, 'DejaVu Sans', sans-serif"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}"><defs>${v.defs}</defs>` +
    `<rect width="${PW}" height="${PH}" fill="#FBFAF5"/>` +
    `<rect x="0" y="0" width="${PW}" height="170" fill="${C.olive}"/>` +
    `<text x="48" y="96" ${font} font-size="64" font-weight="800" fill="#FFF" letter-spacing="1">SEMANARIO</text>` +
    `<text x="48" y="146" ${font} font-size="34" font-weight="600" fill="${C.olivePale}">Edición de prueba (demo)</text>` +
    `<rect x="0" y="170" width="${PW}" height="44" fill="${C.oliveDark}"/>` +
    `<text x="48" y="200" ${font} font-size="22" font-weight="500" fill="#FFF">6 de noviembre de 2026 · Ejemplar inventado para la versión de prueba</text>` +
    `<text x="48" y="290" ${font} font-size="50" font-weight="800" fill="#25282C">Texto de ejemplo para</text>` +
    `<text x="48" y="350" ${font} font-size="50" font-weight="800" fill="#25282C">la portada (demo)</text>` +
    bars(48, 384, 864, 3, 24) +
    `<svg x="48" y="470" width="864" height="430" viewBox="0 120 1600 800" preserveAspectRatio="xMidYMid slice">${v.body}</svg>` +
    `<rect x="48" y="920" width="270" height="20" rx="5" fill="${C.orange}"/>` + bars(48, 956, 270, 8) +
    `<rect x="345" y="920" width="270" height="20" rx="5" fill="${C.olive}"/>` + bars(345, 956, 270, 8) +
    `<rect x="642" y="920" width="270" height="20" rx="5" fill="${C.oliveMid}"/>` + bars(642, 956, 270, 8) +
    `<rect x="0" y="1160" width="${PW}" height="120" fill="${C.olivePale}"/>` +
    `<text x="48" y="1232" ${font} font-size="26" font-weight="600" fill="${C.oliveDark}">Contenido inventado (demo). No es el Semanario oficial.</text>` +
    `</svg>`;
}


const SCENES = {
  valle: valley, edificio: building, plaza, ambulatorio: clinic, pista: track, 'primeros-auxilios': firstAid,
  'sala-reuniones': meetingRoom, cauce: streamBed, calle: street, puente: bridge, 'portada-semanario': weeklyCover,
};
export const SCENE_NAMES = Object.keys(SCENES);

/** A scene as a JPEG of `width` px (its own proportions; with `height`, cropped to fill it).
 * @param {string} name
 * @param {{ width: number; height?: number; quality?: number }} opts
 * @returns {Promise<Uint8Array>} */
export async function drawJpeg(name, { width, height, quality = 72 }) {
  const make = SCENES[name];
  if (!make) throw new Error(`no hay una escena «${name}»`);
  const img = sharp(Buffer.from(make()), { density: 72 }).resize(height ? { width, height, fit: 'cover' } : { width });
  return new Uint8Array(await img.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }).toBuffer());
}
