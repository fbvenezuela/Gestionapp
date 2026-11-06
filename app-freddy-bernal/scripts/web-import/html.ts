// A small HTML reader for the old site's articles (WordPress «content.rendered»): it turns the markup into a tree that
// convert.ts walks. It never runs or keeps anything it reads: scripts, styles, forms and frames are read only to be
// left out. It follows the parts of the HTML rules that matter for an article (a paragraph closes when a block starts,
// a list item closes the one before, void elements, comments, entities, raw text elements, misnested tags) and is
// tolerant: broken markup gives a usable tree, never an exception. Pure, no dependencies (the repository adds none).

export type HtmlText = { type: 'text'; text: string };
export type HtmlElement = { type: 'element'; tag: string; attrs: Record<string, string>; children: HtmlNode[] };
export type HtmlNode = HtmlText | HtmlElement;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'keygen', 'frame', 'basefont', 'bgsound']);
// Their content is not markup: it is skipped up to the closing tag (an iframe keeps its attributes, never its content).
const RAW = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'template', 'plaintext', 'svg', 'math']);
// A start tag of one of these closes an open <p> (HTML: «close a p element»).
const CLOSES_P = new Set([
  'address', 'article', 'aside', 'blockquote', 'center', 'details', 'dialog', 'dir', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer',
  'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'li', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul', 'dd', 'dt',
]);
// The search for an open element stops at these (HTML's «scope»).
const SCOPE = new Set(['#root', 'table', 'td', 'th', 'caption', 'template', 'button', 'object', 'marquee', 'applet', 'html']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const LIST_STOPS = new Set([...SCOPE, 'ul', 'ol']);
const DL_STOPS = new Set([...SCOPE, 'dl']);
const TABLE_STOPS = new Set(['#root', 'table']);
const ROW_STOPS = new Set(['#root', 'table', 'tr']);
const TABLE_PARTS = new Set(['tr', 'td', 'th', 'tbody', 'thead', 'tfoot', 'caption', 'colgroup']);
const ROOT_ONLY = new Set(['#root']);

// --- Entities ------------------------------------------------------------------------------------------------------
// The named ones an article can carry (Latin-1, the typographic ones WordPress and Word write); numeric ones always.
// The invisible ones are written by their code point, so they can be told apart here.
const cp = (n: number) => String.fromCodePoint(n);
const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: cp(0xa0), ensp: cp(0x2002), emsp: cp(0x2003), thinsp: cp(0x2009), zwnj: cp(0x200c),
  zwj: cp(0x200d), lrm: cp(0x200e), rlm: cp(0x200f), shy: cp(0xad), ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', dagger: '†',
  Dagger: '‡', bull: '•', hellip: '…', permil: '‰', prime: '′', Prime: '″', lsaquo: '‹', rsaquo: '›', oline: '‾', frasl: '⁄', euro: '€',
  trade: '™', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', check: '✓', minus: '−', times: '×', divide: '÷', iexcl: '¡',
  cent: '¢', pound: '£', curren: '¤', yen: '¥', brvbar: '¦', sect: '§', uml: '¨', copy: '©', ordf: 'ª', laquo: '«', not: '¬',
  reg: '®', macr: '¯', deg: '°', plusmn: '±', sup2: '²', sup3: '³', acute: '´', micro: 'µ', para: '¶', middot: '·', cedil: '¸', sup1: '¹',
  ordm: 'º', raquo: '»', frac14: '¼', frac12: '½', frac34: '¾', iquest: '¿', Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä',
  Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç', Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï',
  ETH: 'Ð', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø', Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û',
  Uuml: 'Ü', Yacute: 'Ý', THORN: 'Þ', szlig: 'ß', agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
  ccedil: 'ç', egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï', eth: 'ð', ntilde: 'ñ',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø', ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý',
  thorn: 'þ', yuml: 'ÿ', OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ', fnof: 'ƒ', circ: 'ˆ', tilde: '˜',
};
// Numeric references 128–159 mean Windows-1252 (what Word pastes), as the HTML rules say.
const CP1252: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ',
  0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›',
  0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

function fromCodePoint(n: number): string {
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return cp(0xfffd);
  if (CP1252[n]) return CP1252[n];
  if ((n < 0x20 && n !== 0x09 && n !== 0x0a && n !== 0x0d) || (n >= 0x7f && n < 0xa0)) return '';
  return String.fromCodePoint(n);
}

/** «&amp;», «&#8220;», «&#x201C;» → their characters; an unknown name stays as written. */
export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#[0-9]{1,8};?|#[xX][0-9a-fA-F]{1,7};?|[a-zA-Z][a-zA-Z0-9]{1,31};)/g, (m, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      return fromCodePoint(Number.parseInt(body.slice(hex ? 2 : 1).replace(';', ''), hex ? 16 : 10));
    }
    return NAMED[body.slice(0, -1)] ?? m;
  });
}

// --- The tree --------------------------------------------------------------------------------------------------------
export function parseHtml(html: string): HtmlElement {
  const root: HtmlElement = { type: 'element', tag: '#root', attrs: {}, children: [] };
  const stack: HtmlElement[] = [root];
  const top = () => stack[stack.length - 1];
  const src = typeof html === 'string' ? html : '';
  const n = src.length;

  const addText = (raw: string) => {
    if (!raw) return;
    const text = decodeEntities(raw);
    const kids = top().children;
    const last = kids[kids.length - 1];
    if (last && last.type === 'text') last.text += text;
    else kids.push({ type: 'text', text });
  };
  /** The index in the stack of the nearest open `tag`, or -1 when one of `stops` (or the root) comes first. */
  const findOpen = (tag: string, stops: ReadonlySet<string>): number => {
    for (let k = stack.length - 1; k > 0; k--) {
      const t = stack[k].tag;
      if (t === tag) return k;
      if (stops.has(t)) return -1;
    }
    return -1;
  };
  const popTo = (k: number) => {
    if (k > 0) stack.length = k;
  };

  const start = (tag: string, attrs: Record<string, string>) => {
    if (CLOSES_P.has(tag)) popTo(findOpen('p', SCOPE));
    if (tag === 'li') popTo(findOpen('li', LIST_STOPS));
    if (tag === 'dt' || tag === 'dd') popTo(Math.max(findOpen('dt', DL_STOPS), findOpen('dd', DL_STOPS)));
    if (tag === 'tr') popTo(findOpen('tr', TABLE_STOPS));
    if (tag === 'td' || tag === 'th') popTo(Math.max(findOpen('td', ROW_STOPS), findOpen('th', ROW_STOPS)));
    if (HEADINGS.has(tag) && HEADINGS.has(top().tag)) stack.pop();
    if (tag === 'a') popTo(findOpen('a', SCOPE));
    const el: HtmlElement = { type: 'element', tag, attrs, children: [] };
    top().children.push(el);
    if (!VOID.has(tag)) stack.push(el);
  };
  const end = (tag: string) => {
    if (tag === 'br') {
      top().children.push({ type: 'element', tag: 'br', attrs: {}, children: [] });
      return;
    }
    if (VOID.has(tag)) return;
    // A closing tag never reaches out of a table cell it was not opened in; the table's own tags close their parts.
    const stops = tag === 'table' ? ROOT_ONLY : TABLE_PARTS.has(tag) ? TABLE_STOPS : SCOPE;
    popTo(findOpen(tag, stops));
  };

  const NAME = /[a-zA-Z][a-zA-Z0-9:-]*/y;
  let i = 0;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      addText(src.slice(i));
      break;
    }
    if (lt > i) addText(src.slice(i, lt));
    i = lt;
    if (src.startsWith('<!--', i)) {
      const close = src.indexOf('-->', i + 4);
      i = close < 0 ? n : close + 3;
      continue;
    }
    const next = src[i + 1];
    if (next === '!' || next === '?') {
      const close = src.indexOf('>', i + 2);
      i = close < 0 ? n : close + 1;
      continue;
    }
    if (next === '/') {
      NAME.lastIndex = i + 2;
      const m = NAME.exec(src);
      const close = src.indexOf('>', i + 2);
      if (close < 0) break; // an unfinished tag at the end is dropped
      if (m) end(m[0].toLowerCase());
      i = close + 1;
      continue;
    }
    NAME.lastIndex = i + 1;
    const m = NAME.exec(src);
    if (!m) {
      addText('<');
      i++;
      continue;
    }
    const tag = m[0].toLowerCase();
    // Attributes, up to the «>» that ends the tag (a «>» inside quotes does not).
    const attrs: Record<string, string> = {};
    let j = NAME.lastIndex;
    for (;;) {
      while (j < n && /\s/.test(src[j])) j++;
      if (j >= n) break;
      if (src[j] === '>') {
        j++;
        break;
      }
      if (src[j] === '/') {
        j += src[j + 1] === '>' ? 2 : 1;
        if (src[j - 1] === '>') break;
        continue;
      }
      let k = j;
      while (k < n && !/[\s"'>/=]/.test(src[k])) k++;
      if (k === j) {
        j++; // a stray quote or «=»
        continue;
      }
      const name = src.slice(j, k).toLowerCase();
      j = k;
      while (j < n && /\s/.test(src[j])) j++;
      let value = '';
      if (src[j] === '=') {
        j++;
        while (j < n && /\s/.test(src[j])) j++;
        const q = src[j];
        if (q === '"' || q === "'") {
          const close = src.indexOf(q, j + 1);
          value = src.slice(j + 1, close < 0 ? n : close);
          j = close < 0 ? n : close + 1;
        } else {
          let e = j;
          while (e < n && !/[\s>]/.test(src[e])) e++;
          value = src.slice(j, e);
          j = e;
        }
      }
      if (!(name in attrs) && name.length <= 60) attrs[name] = decodeEntities(value).slice(0, 4000);
    }
    i = j;
    if (RAW.has(tag)) {
      // Skip to its closing tag (any letter case); an iframe keeps its attributes for convert.ts, never its content.
      const closeTag = new RegExp(`</${tag}[\\s/>]`, 'gi');
      closeTag.lastIndex = i;
      const close = closeTag.exec(src);
      if (CLOSES_P.has(tag)) popTo(findOpen('p', SCOPE));
      top().children.push({ type: 'element', tag, attrs, children: [] });
      if (!close) break;
      const gt = src.indexOf('>', close.index);
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    start(tag, attrs);
  }
  return root;
}

/** The text of a subtree, as it reads (entities already decoded), without collapsing spaces. */
export function textOf(node: HtmlNode): string {
  if (node.type === 'text') return node.text;
  if (node.tag === 'br') return '\n';
  return node.children.map(textOf).join('');
}

export function classesOf(el: HtmlElement): string[] {
  return (el.attrs.class ?? '').split(/\s+/).filter(Boolean);
}

export function hasClass(el: HtmlElement, re: RegExp): boolean {
  return classesOf(el).some((c) => re.test(c));
}

/** Every element of a subtree (itself included) that passes `test`, in document order. */
export function findAll(node: HtmlNode, test: (el: HtmlElement) => boolean): HtmlElement[] {
  const out: HtmlElement[] = [];
  const walk = (x: HtmlNode) => {
    if (x.type !== 'element') return;
    if (test(x)) out.push(x);
    x.children.forEach(walk);
  };
  walk(node);
  return out;
}
