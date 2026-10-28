// The storyboard's blocks merge by id (src/lib/domain/storyboard-merge.ts): when Redes and the boss each add a block
// at the same time both stay, only what someone removed is removed, and a block both changed is named. Invented data.
import { describe, it, expect } from 'vitest';
import { mergeBlocks, type BoardBlock } from '@/lib/domain/storyboard-merge';

const b = (id: string | undefined, shot: string, bossLine = ''): BoardBlock => ({ id, shot, angle: '', bossLine, broll: '', fact: '', factSource: '' });
const shots = (r: { blocks: BoardBlock[] }) => r.blocks.map((x) => x.shot);

describe('mergeBlocks', () => {
  const A = b('a', 'Plano general');
  const B = b('b', 'Plano medio');

  it('cada uno agrega un bloque a la vez: quedan los dos, sin borrar ninguno', () => {
    // Redes saved first (its block «Toma de Redes» is now in the database); the boss saves his own new block.
    const cur = [A, b('r1', 'Toma de Redes (demo)')];
    const r = mergeBlocks([A], [A, b(undefined, 'Primer plano del jefe (demo)')], cur);
    expect(r.remove).toEqual([]);
    expect(r.overlap).toEqual([]);
    expect(shots(r)).toEqual(['Plano general', 'Toma de Redes (demo)', 'Primer plano del jefe (demo)']);
    expect(r.blocks.find((x) => x.shot === 'Toma de Redes (demo)')!.id).toBe('r1');
  });

  it('solo se borra lo que esta persona quitó; un bloque que no tocó queda como lo dejó el otro', () => {
    const cur = [b('a', 'Plano general', 'Frase que cambió Redes'), B];
    const r = mergeBlocks([A, B], [A], cur);
    expect(r.remove).toEqual(['b']);
    expect(r.blocks).toEqual([b('a', 'Plano general', 'Frase que cambió Redes')]);
    expect(r.overlap).toEqual([]);
  });

  it('los dos cambiaron el mismo bloque: gana el último y se nombra; quitó uno que el otro cambió: se nombra también', () => {
    const cur = [b('a', 'Plano de Redes'), b('b', 'Plano medio', 'Frase de Redes')];
    const r = mergeBlocks([A, B], [b('a', 'Plano del jefe')], cur);
    expect(shots(r)).toEqual(['Plano del jefe']);
    expect(r.remove).toEqual(['b']);
    expect(new Set(r.overlap)).toEqual(new Set(['a', 'b']));
  });

  it('cambió un bloque que el otro quitó: vuelve como bloque nuevo; si no lo tocó, se va', () => {
    const r = mergeBlocks([A, B], [b('a', 'Plano general cambiado'), B], [B]);
    expect(r.blocks).toEqual([b(undefined, 'Plano general cambiado'), B]);
    expect(r.overlap).toEqual(['a']);
    expect(mergeBlocks([A, B], [A, B], [B]).blocks).toEqual([B]);
  });

  it('el orden: el de esta persona si lo cambió; si no, el que hay ahora (el otro lo cambió)', () => {
    expect(shots(mergeBlocks([A, B], [B, A], [A, B, b('c', 'Dron')]))).toEqual(['Plano medio', 'Plano general', 'Dron']);
    expect(shots(mergeBlocks([A, B], [A, B, b(undefined, 'Nuevo')], [B, A]))).toEqual(['Plano medio', 'Plano general', 'Nuevo']);
    expect(shots(mergeBlocks([A, B], [b(undefined, 'Primero'), A, B], [B, A]))).toEqual(['Primero', 'Plano medio', 'Plano general']);
    expect(shots(mergeBlocks([A, B], [A, b(undefined, 'En medio'), B], [B, A]))).toEqual(['Plano medio', 'Plano general', 'En medio']);
    expect(shots(mergeBlocks([A, B], [A, b(undefined, 'En medio'), B], [A, B]))).toEqual(['Plano general', 'En medio', 'Plano medio']);
  });

  it('sin base (el primer guardado): la lista es de quien guarda', () => {
    const r = mergeBlocks([A, B], [B, b(undefined, 'Nuevo')], [A, B]);
    expect(r.remove).toEqual(['a']);
    expect(shots(r)).toEqual(['Plano medio', 'Nuevo']);
    expect(r.overlap).toEqual([]);
  });
});
