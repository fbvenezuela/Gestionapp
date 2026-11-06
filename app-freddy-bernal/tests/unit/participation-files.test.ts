// The citizen's files (design §4, §6): the name's extension and the first bytes must agree (a «foto.jpg» that is a PDF,
// a page or a program is refused), 8 MB at most, 3 per send and 12 per request; photos lose their metadata before they
// are stored: the GPS position, the camera, XMP, Photoshop/IPTC (APP13), comments, PNG text chunks and eXIf, with the
// fixtures of tests/unit/fixtures/photos.ts. Then the CSV export's cells (formula injection) and the receipt's PDF,
// written by hand: its header, its objects and its cross-reference table, read back here.
import { describe, expect, it } from 'vitest';
import { ATTACHMENT_LIMITS, attachmentRoom, attachmentStorageKey, cleanAttachment, sniffAttachment, validateAttachment } from '@/lib/participation/files';
import { CSV_SEPARATOR, csvCell, csvRow, toCsv } from '@/lib/participation/csv';
import { receiptPdf, textPdf, winAnsi } from '@/lib/participation/pdf';
import { JPEG, SECRET, WEBP_LOSSY, contains, jpegWithGps, png } from './fixtures/photos';

const PDF = new TextEncoder().encode('%PDF-1.4\n%demo\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const ok = (name: string, bytes: Uint8Array) => validateAttachment({ name, bytes });

describe('qué archivo es: la extensión y los primeros bytes', () => {
  it('JPG, PNG, WebP y PDF por sus bytes; nada más', () => {
    expect(sniffAttachment(JPEG)?.mime).toBe('image/jpeg');
    expect(sniffAttachment(png())?.mime).toBe('image/png');
    expect(sniffAttachment(WEBP_LOSSY)?.mime).toBe('image/webp');
    expect(sniffAttachment(PDF)?.mime).toBe('application/pdf');
    for (const other of ['GIF89a....', '<html><script>alert(1)</script>', 'MZ\x90\x00programa', '<svg xmlns="http://www.w3.org/2000/svg"/>']) {
      expect(sniffAttachment(new TextEncoder().encode(other)), other).toBeNull();
    }
    expect(sniffAttachment(new Uint8Array(0))).toBeNull();
  });

  it('se acepta lo que coincide; lo demás, con su motivo en palabras de la persona', () => {
    expect(ok('foto.jpg', JPEG)).toMatchObject({ ok: true, type: { ext: 'jpg' } });
    expect(ok('FOTO.JPEG', JPEG)).toMatchObject({ ok: true, type: { ext: 'jpg' } });
    expect(ok('plano.png', png())).toMatchObject({ ok: true, type: { ext: 'png' } });
    expect(ok('acta.pdf', PDF)).toMatchObject({ ok: true, type: { ext: 'pdf', kind: 'pdf' } });
    // The name says photo, the bytes say PDF (or a page): refused.
    expect(ok('foto.jpg', PDF)).toMatchObject({ ok: false, error: expect.stringMatching(/no es lo que dice su nombre/) });
    expect(ok('foto.png', new TextEncoder().encode('<html></html>'))).toMatchObject({ ok: false });
    expect(ok('documento.pdf', JPEG)).toMatchObject({ ok: false });
    // Types that are not accepted, whatever their bytes.
    for (const name of ['programa.exe', 'pagina.html', 'dibujo.svg', 'video.mp4', 'sin-extension', 'foto.jpg.exe']) {
      expect(ok(name, JPEG), name).toMatchObject({ ok: false, error: expect.stringMatching(/no se acepta/) });
    }
    expect(ok('vacio.jpg', new Uint8Array(0))).toMatchObject({ ok: false, error: 'El archivo está vacío.' });
    const big = new Uint8Array(ATTACHMENT_LIMITS.maxBytes + 1);
    big.set(JPEG.subarray(0, 3));
    expect(ok('grande.jpg', big)).toMatchObject({ ok: false, error: expect.stringMatching(/8 MB/) });
  });

  it('3 por envío y 12 por solicitud; un nombre al azar con su extensión', () => {
    expect(ATTACHMENT_LIMITS).toEqual({ maxBytes: 8 * 1024 * 1024, perSend: 3, perRequest: 12 });
    expect(attachmentRoom({ thisSend: 0, request: 0 })).toBe(3);
    expect(attachmentRoom({ thisSend: 2, request: 2 })).toBe(1);
    expect(attachmentRoom({ thisSend: 0, request: 11 })).toBe(1);
    expect(attachmentRoom({ thisSend: 3, request: 3 })).toBe(0);
    expect(attachmentRoom({ thisSend: 0, request: 12 })).toBe(0);
    const t = (validateAttachment({ name: 'a.png', bytes: png() }) as { type: Parameters<typeof attachmentStorageKey>[0] }).type;
    expect(attachmentStorageKey(t)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/);
    expect(attachmentStorageKey(t, 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE')).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png');
  });
});

describe('la limpieza de las fotos', () => {
  it('JPEG: se van el EXIF con GPS (APP1), XMP, MPF, Photoshop/IPTC (APP13), los comentarios y lo de después del final', () => {
    const dirty = jpegWithGps();
    for (const s of [SECRET, 'Exif', 'xmpmeta', '8BIM', 'MPF']) expect(contains(dirty, s), s).toBe(true);
    const check = validateAttachment({ name: 'foto.jpg', bytes: dirty });
    expect(check.ok).toBe(true);
    const r = cleanAttachment(dirty, (check as { type: Parameters<typeof cleanAttachment>[1] }).type);
    expect(r).toMatchObject({ ok: true, width: 4, height: 3 });
    const bytes = (r as { bytes: Uint8Array }).bytes;
    for (const s of [SECRET, 'Exif', 'xmpmeta', '8BIM', 'MPF']) expect(contains(bytes, s), s).toBe(false);
    expect(sniffAttachment(bytes)?.mime).toBe('image/jpeg');
  });

  it('PNG: se van tEXt, iTXt (XMP), zTXt y eXIf, y lo de después del final', () => {
    const dirty = png(true);
    expect(contains(dirty, SECRET)).toBe(true);
    const r = cleanAttachment(dirty, (validateAttachment({ name: 'plano.png', bytes: dirty }) as { type: Parameters<typeof cleanAttachment>[1] }).type);
    expect(r).toMatchObject({ ok: true, width: 4, height: 3 });
    const bytes = (r as { bytes: Uint8Array }).bytes;
    for (const s of [SECRET, 'tEXt', 'iTXt', 'zTXt', 'eXIf']) expect(contains(bytes, s), s).toBe(false);
    expect(Buffer.from(bytes).equals(Buffer.from(png(false)))).toBe(true);
  });

  it('lo que no se puede limpiar sin tocar los píxeles se rechaza (el teléfono la vuelve a preparar); un PDF queda como vino', () => {
    const rotated = png(true, 6);
    const type = (validateAttachment({ name: 'a.png', bytes: rotated }) as { type: Parameters<typeof cleanAttachment>[1] }).type;
    expect(cleanAttachment(rotated, type)).toMatchObject({ ok: false, error: expect.stringMatching(/No pudimos preparar esa foto/) });
    expect(cleanAttachment(JPEG.slice(0, 40), { mime: 'image/jpeg', ext: 'jpg', kind: 'image', photo: 'jpeg' })).toMatchObject({ ok: false });
    const pdf = cleanAttachment(PDF, { mime: 'application/pdf', ext: 'pdf', kind: 'pdf' });
    expect(pdf).toMatchObject({ ok: true, width: null, height: null });
    expect((pdf as { bytes: Uint8Array }).bytes).toBe(PDF);
  });
});

describe('las celdas del CSV', () => {
  it('lo que empieza con = + - @, tabulador o retorno lleva un apóstrofo: nunca se ejecuta como fórmula', () => {
    expect(csvCell('=HYPERLINK("http://x","clic")')).toBe(`"'=HYPERLINK(""http://x"",""clic"")"`);
    expect(csvCell('+58 000')).toBe("'+58 000");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\t=1')).toBe("'\t=1");
    expect(csvCell('\r=1')).toBe(`"'\r=1"`);
    expect(csvCell('Hueco en la vía (demo)')).toBe('Hueco en la vía (demo)');
  });

  it('comillas, separador y saltos de línea entre comillas; números, sí/no, fechas y vacíos', () => {
    expect(CSV_SEPARATOR).toBe(';');
    expect(csvCell('uno; dos')).toBe('"uno; dos"');
    expect(csvCell('dice "hola"')).toBe('"dice ""hola"""');
    expect(csvCell('línea 1\nlínea 2')).toBe('"línea 1\nlínea 2"');
    expect(csvCell('a,b')).toBe('a,b');
    expect(csvCell('a,b', ',')).toBe('"a,b"');
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(1.5)).toBe('1.5');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(true)).toBe('sí');
    expect(csvCell(false)).toBe('no');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(new Date(Date.UTC(2026, 10, 6, 12)))).toBe('2026-11-06T12:00:00.000Z');
    expect(csvRow(['a', '=b', 3])).toBe("a;'=b;3");
  });

  it('el archivo: BOM de UTF-8 (Excel en español lee bien las tildes), «;» y CRLF', () => {
    const out = toCsv(['Código', 'Título'], [['AC-2026-K7QM2H', '=mal'], ['AC-2026-ZZZZZZ', 'Agua; luz']]);
    expect(out.startsWith('﻿')).toBe(true);
    expect(out).toBe('﻿Código;Título\r\nAC-2026-K7QM2H;\'=mal\r\nAC-2026-ZZZZZZ;"Agua; luz"\r\n');
    expect(toCsv(['a'], [], { bom: false })).toBe('a\r\n');
  });
});

// Reads a PDF back the way a reader does: header, startxref → xref table → each object at its offset.
function readPdf(bytes: Uint8Array) {
  const s = Buffer.from(bytes).toString('latin1');
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(s)?.[1]);
  const xref = s.slice(startxref);
  const [, first, count] = /^xref\n(\d+) (\d+)\n/.exec(xref)!.map(Number);
  const entries = xref.split('\n').slice(2, 2 + count);
  const size = Number(/\/Size (\d+)/.exec(xref)![1]);
  return { s, startxref, first, count, entries, size };
}

describe('el PDF escrito a mano', () => {
  it('cabecera, tabla de referencias con desplazamientos exactos, trailer y startxref', () => {
    const bytes = textPdf([{ text: 'Hola (demo)', size: 14, bold: true }, { text: 'Línea dos: ¿qué tal? «sí» ñ' }], { title: 'Prueba', createdAt: new Date(Date.UTC(2026, 10, 6)) });
    const { s, startxref, first, count, entries, size } = readPdf(bytes);
    expect(s.startsWith('%PDF-1.4\n%')).toBe(true);
    expect(s.slice(startxref, startxref + 4)).toBe('xref');
    expect(first).toBe(0);
    expect(size).toBe(count);
    expect(entries[0]).toBe('0000000000 65535 f ');
    for (let id = 1; id < count; id++) {
      expect(entries[id], `entrada ${id}`).toMatch(/^\d{10} 00000 n $/);
      const at = Number(entries[id].slice(0, 10));
      expect(s.slice(at, at + `${id} 0 obj`.length), `objeto ${id}`).toBe(`${id} 0 obj`);
    }
    // 20 bytes per entry (10 + space + 5 + space + n + space + LF).
    expect((`${entries[1]}\n`).length).toBe(20);
    // The content stream's /Length is its real length.
    const m = /<< \/Length (\d+) >>\nstream\n/.exec(s)!;
    const start = m.index + m[0].length;
    expect(s.slice(start + Number(m[1]), start + Number(m[1]) + '\nendstream'.length)).toBe('\nendstream');
    // Plain ASCII after the binary marker line; accents as WinAnsi octal escapes.
    expect([...s.slice(15)].every((c) => c.charCodeAt(0) < 128)).toBe(true);
    expect(s).toContain('(L\\355nea dos: \\277qu\\351 tal? \\253s\\355\\273 \\361) Tj');
    expect(s).toContain('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding');
    expect(s).toContain('/CreationDate (D:20261106000000Z)');
  });

  it('paréntesis y barras escapados; lo que no está en WinAnsi sale como «?»; los espacios finos de Intl, como espacios', () => {
    expect(winAnsi('a b c')).toEqual([97, 32, 98, 32, 99]);
    expect(winAnsi('€ “”')).toEqual([0x80, 32, 0x93, 0x94]);
    expect(winAnsi('😀')).toEqual([0x3f]);
    const s = Buffer.from(textPdf([{ text: 'a (b) \\ c' }], { title: 't' })).toString('latin1');
    expect(s).toContain('(a \\(b\\) \\\\ c) Tj');
  });

  it('el texto largo se corta en líneas y en páginas', () => {
    const long = Array.from({ length: 140 }, (_, i) => ({ text: `Línea ${i + 1} con algo de texto para llenar la página (demo)` }));
    const { s } = readPdf(textPdf(long, { title: 'Largo' }));
    expect(/\/Count (\d+)/.exec(s)![1]).toBe('3');
    const one = readPdf(textPdf([{ text: 'palabra '.repeat(200) }], { title: 'Ancho' })).s;
    expect((one.match(/ Tj ET/g) ?? []).length).toBeGreaterThan(10);
  });

  it('el comprobante: código, clave, cómo consultarlo y el aviso de emergencias', () => {
    const s = Buffer.from(
      receiptPdf({ siteName: 'Gobernación (demo)', reference: 'AC-2026-K7QM2H', secret: 'K7QM-2HXP-9WRT-4BNE', typeLabel: 'Reporte', sentAt: '6 de noviembre de 2026, 2:30 p. m.', lookupUrl: 'https://ejemplo.test/atencion/consultar' }),
    ).toString('latin1');
    for (const t of ['(AC-2026-K7QM2H) Tj', '(K7QM-2HXP-9WRT-4BNE) Tj', '(Tipo: Reporte) Tj', '/Title (Comprobante AC-2026-K7QM2H)']) expect(s).toContain(t);
    expect(s).toContain('servicio de emergencias');
    const reprint = Buffer.from(receiptPdf({ siteName: 'x', reference: 'AC-2026-K7QM2H', secret: null, typeLabel: 'Reporte', sentAt: 'hoy', lookupUrl: '/atencion/consultar', support: true })).toString('latin1');
    expect(reprint).not.toContain('(Clave) Tj');
    expect(reprint).toContain('Te sumaste a un reporte abierto');
  });
});
