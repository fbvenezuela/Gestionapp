// The attention desk's CSV export (design §5): UTF-8 with its BOM and «;» between cells, what Excel in Spanish opens
// straight away with the accents right (a «,» would also be the decimal separator), lines ending in CRLF. A cell that
// starts with = + - @, a tab or a carriage return gets a ' in front, so a spreadsheet never runs it as a formula (a
// citizen's text is written by anyone: «=HYPERLINK(…)» must stay text). Pure: the same rule on the server and in tests.

export const CSV_SEPARATOR = ';';
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell, escaped. Numbers and booleans as they are; dates as ISO; text guarded and quoted when it needs it. */
export function csvCell(value: unknown, separator = CSV_SEPARATOR): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /["\r\n]/.test(s) || s.includes(separator) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(cells: readonly unknown[], separator = CSV_SEPARATOR): string {
  return cells.map((c) => csvCell(c, separator)).join(separator);
}

/** The whole file: the BOM, the header row and the rows, CRLF. */
export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[], opts: { separator?: string; bom?: boolean } = {}): string {
  const sep = opts.separator ?? CSV_SEPARATOR;
  const lines = [csvRow(header, sep), ...rows.map((r) => csvRow(r, sep))];
  return `${opts.bom === false ? '' : '﻿'}${lines.join('\r\n')}\r\n`;
}
