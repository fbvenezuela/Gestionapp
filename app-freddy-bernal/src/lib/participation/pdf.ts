// A small text-only PDF written by hand (design §4: «Descargar comprobante», generated in the browser, no library):
// A4 pages, Helvetica and Helvetica-Bold (standard fonts every reader has, nothing embedded) in WinAnsi, so Spanish
// accents, ñ, ¿ ¡ « » come out right. Text is escaped and every byte above 127 goes as an octal escape: the file is
// plain ASCII, its cross-reference table carries exact offsets (tests/unit/participation-pdf.test.ts reads it back).
// Also the demo's placeholder documents (seed-parts/web.ts). No Node imports.

export type PdfLine = { text: string; size?: number; bold?: boolean; gap?: number };

const PAGE = { width: 595, height: 842, margin: 56 };
// Unicode → WinAnsi (cp1252) for the 0x80–0x9F block; 0xA0–0xFF are Latin-1 as they are.
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89,
  0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** One WinAnsi byte per character; the narrow and thin spaces Intl writes in times become spaces; the rest, «?». */
export function winAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text.normalize('NFC')) {
    const c = ch.codePointAt(0)!;
    if (c === 0x202f || c === 0x2009 || c === 0x2007 || c === 0x00a0) out.push(0x20);
    else if (c >= 0x20 && c <= 0x7e) out.push(c);
    else if (c >= 0xa1 && c <= 0xff) out.push(c);
    else if (CP1252[c]) out.push(CP1252[c]);
    else if (c === 0x09) out.push(0x20);
    else out.push(0x3f);
  }
  return out;
}

/** A PDF literal string: ( ) and \ escaped, bytes above 127 (and below 32) as octal. */
function pdfString(text: string): string {
  let s = '(';
  for (const b of winAnsi(text)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += `\\${String.fromCharCode(b)}`;
    else if (b < 0x20 || b > 0x7e) s += `\\${b.toString(8).padStart(3, '0')}`;
    else s += String.fromCharCode(b);
  }
  return `${s})`;
}

// Helvetica is about half an em wide on average; 0.55 keeps wrapped lines inside the margins.
function wrap(text: string, size: number, bold: boolean): string[] {
  const max = Math.max(10, Math.floor((PAGE.width - 2 * PAGE.margin) / (size * (bold ? 0.58 : 0.55))));
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= max) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
      while (line.length > max) {
        lines.push(line.slice(0, max));
        line = line.slice(max);
      }
    }
    lines.push(line);
  }
  return lines;
}

const pdfDate = (d: Date) => `D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;

/** The PDF of these lines (wrapped, paginated), with its title in the document's properties. */
export function textPdf(lines: PdfLine[], meta: { title: string; createdAt?: Date }): Uint8Array {
  // Lay out: one content stream per page.
  const pages: string[][] = [[]];
  let y = PAGE.height - PAGE.margin;
  for (const l of lines) {
    const size = l.size ?? 11;
    const lead = Math.round(size * 1.35);
    y -= l.gap ?? 0;
    for (const part of wrap(l.text, size, !!l.bold)) {
      if (y - lead < PAGE.margin) {
        pages.push([]);
        y = PAGE.height - PAGE.margin;
      }
      y -= lead;
      if (part) pages[pages.length - 1].push(`BT /${l.bold ? 'F2' : 'F1'} ${size} Tf ${PAGE.margin} ${y} Td ${pdfString(part)} Tj ET`);
    }
  }

  // Objects: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, 5 info, then a page and its content per page.
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 6 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objects[5] = `<< /Title ${pdfString(meta.title)} /Producer (FB Operaciones 360) /CreationDate (${pdfDate(meta.createdAt ?? new Date())}) >>`;
  pages.forEach((ops, i) => {
    const stream = ops.join('\n');
    objects[pageIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  // Everything above is ASCII: a character is a byte, so string lengths are the offsets.
  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}

export type ReceiptInput = {
  siteName: string;
  reference: string;
  // Shown once, on the screen and in this file; never stored (only its HMAC). Null: a reprint without it.
  secret: string | null;
  typeLabel: string;
  sentAt: string;
  lookupUrl: string;
  // A support of an open report («¿Te sumas?»): its own receipt, following that case.
  support?: boolean;
  createdAt?: Date;
};

/** «Descargar comprobante»: the reference, the secret and how to follow the request. */
export function receiptPdf(r: ReceiptInput): Uint8Array {
  const lines: PdfLine[] = [
    { text: 'Comprobante de tu solicitud', size: 20, bold: true },
    { text: r.siteName, size: 11, gap: 2 },
    { text: r.support ? `Te sumaste a un reporte abierto (${r.typeLabel}).` : `Tipo: ${r.typeLabel}`, size: 12, gap: 18 },
    { text: `Enviado: ${r.sentAt}`, size: 12 },
    { text: 'Código', size: 11, gap: 18 },
    { text: r.reference, size: 18, bold: true },
  ];
  if (r.secret) lines.push({ text: 'Clave', size: 11, gap: 10 }, { text: r.secret, size: 18, bold: true });
  lines.push(
    { text: `Guarda el código y la clave: con los dos consultas tu solicitud en ${r.lookupUrl}`, size: 11, gap: 18 },
    { text: 'La clave no se puede recuperar ni la tiene nadie del equipo. No la compartas: quien la tenga ve lo que escribiste.', size: 11, gap: 4 },
    { text: 'Esto no es un servicio de emergencias: si hay una emergencia o una vida en peligro, llama a los servicios de emergencia.', size: 10, gap: 14 },
  );
  return textPdf(lines, { title: `Comprobante ${r.reference}`, createdAt: r.createdAt });
}
