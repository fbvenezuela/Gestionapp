// What a person reads when the database refuses (src/lib/db/core.ts friendlyDbError), for what Redes por formato
// added (20261029000100_redes_formatos.sql; design R4 §3.1 notes): the feed's deferred uniques, two people at once,
// and the privacy checks of the new texts. The feed's uniques fail at COMMIT: the error still reaches whoever ran the
// transaction (act() waits for the COMMIT inside its try), with its code and the constraint's name.
import { describe, expect, it } from 'vitest';
import { asSystem, CONFLICT_TEXT, friendlyDbError } from '@/lib/db/core';
import { createMemoryDb } from '@/lib/db/pglite';

const err = (code: string, message: string) => Object.assign(new Error(message), { code });

describe('friendlyDbError: lo que dice la base, en palabras', () => {
  it('los dos únicos del feed tienen su texto; los demás siguen con «Eso ya existe.»', () => {
    expect(friendlyDbError(err('23505', 'duplicate key value violates unique constraint "feed_slots_one_place"'))).toBe(
      'Esa pieza acaba de quedar en otro espacio. Mira el feed y vuelve a intentarlo.',
    );
    expect(friendlyDbError(err('23505', 'duplicate key value violates unique constraint "feed_slots_month_num"'))).toBe(
      'Otra persona acaba de usar ese espacio. Mira el feed y vuelve a intentarlo.',
    );
    expect(friendlyDbError(err('23505', 'duplicate key value violates unique constraint "copies_piece_id_length_group_key"'))).toBe('Eso ya existe.');
  });

  it('dos personas a la vez (un choque 40P01 o 40001): que vuelva a intentarlo', () => {
    expect(CONFLICT_TEXT).toBe('Otra persona cambiaba el feed a la vez: vuelve a intentarlo.');
    expect(friendlyDbError(err('40P01', 'deadlock detected'))).toBe(CONFLICT_TEXT);
    expect(friendlyDbError(err('40001', 'could not serialize access due to concurrent update'))).toBe(CONFLICT_TEXT);
  });

  it('los teléfonos en lo que lee Redes y el enlace del sticker', () => {
    const cases: [string, RegExp][] = [
      ['pieces_design_note_no_phone', /^No se guardó: la nota del diseño tiene algo que parece un teléfono, y Redes la lee/],
      ['piece_details_no_phone', /^No se guardó: la tarjeta tiene algo que parece un teléfono, y Redes la lee/],
      ['piece_notices_no_phone', /^No se guardó: el aviso tiene algo que parece un teléfono, y Redes lo lee/],
      ['content_months_label_no_phone', /^No se guardó: el nombre del mes tiene algo que parece un teléfono/],
      ['piece_details_sticker_url', /^El enlace del sticker empieza con https:\/\//],
    ];
    for (const [constraint, text] of cases) {
      expect(friendlyDbError(err('23514', `new row for relation "x" violates check constraint "${constraint}"`)), constraint).toMatch(text);
    }
    // Any other check keeps the generic text.
    expect(friendlyDbError(err('23514', 'new row violates check constraint "pieces_rating_range"'))).toBe('Algún dato no es válido o es muy largo.');
  });

  it('los mensajes propios de la base pasan tal cual (P0001 y los 42501 que empiezan con mayúscula)', () => {
    expect(friendlyDbError(err('P0001', 'Ya en Mes 1 · #4'))).toBe('Ya en Mes 1 · #4');
    expect(friendlyDbError(err('42501', 'Eliminar una pieza es del jefe («Eliminar» en la tarjeta); recuperarla es de administración.'))).toMatch(/^Eliminar una pieza es del jefe/);
    expect(friendlyDbError(err('42501', 'permission denied for table feed_slots'))).toBe('No tienes permiso para hacer esto.');
  });

  it('un único diferido falla al confirmar y el error llega con su código y su nombre', async () => {
    const { db, backend } = await createMemoryDb();
    try {
      const e = await asSystem(backend, async (sql) => {
        const m = (await sql.one<{ id: string }>(`insert into public.content_months (label, ordinal) values ('Mes 1', 1) returning id`))!.id;
        const p = (await sql.one<{ id: string }>(`insert into public.pieces (kind, format, title, content_month_id) values ('photo', 'post', 'Post de prueba', $1) returning id`, [m]))!.id;
        // Both statements pass (the unique waits for the end); the COMMIT refuses.
        await sql.query(`update public.feed_slots set piece_id = $2 where month_id = $1 and num in (1, 2)`, [m, p]);
      }).then(
        () => null,
        (x: Error & { code?: string }) => x,
      );
      expect(e?.code).toBe('23505');
      expect(e?.message).toMatch(/feed_slots_one_place/);
      expect(friendlyDbError(e)).toBe('Esa pieza acaba de quedar en otro espacio. Mira el feed y vuelve a intentarlo.');
      // Nothing of that transaction stayed.
      expect((await db.query<{ n: number }>(`select count(*)::int as n from public.content_months`)).rows[0].n).toBe(0);
    } finally {
      await db.close();
    }
  }, 60_000);
});
