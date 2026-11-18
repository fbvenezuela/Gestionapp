// How people ask what a word of «Palabras de la app» means (WF-C, 17/11, design §4(b)): the names as they say them
// («short», «story», «la cuadrícula», «el texto de abajo», «los recuadritos de colores», «9:16», «1080x1920»), the
// frames («¿qué es…?», «¿qué significa…?», «¿qué quiere decir…?», «X, ¿qué es eso?», «explícame X», «¿quiénes son…?» for
// Administración), with where it is said around it («… en redes», «… en un post», «… de un evento», «la de redes»), and
// typed in a hurry («q signfica», «kiere desir»). A «¿cómo…?» with the same word still goes to how it is done, and a
// label or a field that only has the word stays its own question. The words' easy text and example are the glossary's
// own (src/lib/guides/glossary.ts), the ones 360 says when asked «más fácil» or «un ejemplo».
import { describe, it, expect } from 'vitest';
import type { Role } from '@/lib/roles';
import { GLOSSARY } from '@/lib/guides';
import { facetsOf } from '@/lib/guides/explain';
import { askedTerm, bestAnswer, findAnswers, readable } from '@/lib/assistant/answers/engine';

const ROLES: Role[] = ['social', 'boss', 'camera', 'dispatch', 'politics', 'ivt', 'admin'];

describe('los nombres y las maneras de preguntar de cada palabra', () => {
  it('cada palabra tiene su fácil y su ejemplo en el glosario, y son los de 360', () => {
    for (const g of GLOSSARY) {
      expect(g.easy, g.id).toBeTruthy();
      expect(g.example, g.id).toBeTruthy();
      const f = facetsOf(`palabra:${g.id}`)!;
      expect(f.easy, g.id).toEqual(g.easy);
      expect(f.example, g.id).toEqual(g.example);
    }
    // The names people use (design §4(b)).
    const aka = new Map(GLOSSARY.map((g) => [g.id, g.aka]));
    expect(aka.get('reel-y-short')).toContain('short');
    expect(aka.get('caption')).toContain('texto de abajo');
    expect(aka.get('hook-y-cta')).toEqual(expect.arrayContaining(['hook', 'cta']));
    expect(aka.get('feed')).toContain('cuadrícula');
    expect(aka.get('semaforo')).toContain('semáforo');
    expect(aka.get('trancado')).toContain('trancado');
    expect(aka.get('numeros-y-medidas')).toEqual(expect.arrayContaining(['9:16', '85/280', '1080x1920']));
    // Never a name that is another thing of the app.
    const all = GLOSSARY.flatMap((g) => g.aka);
    for (const not of ['historia', 'historias', 'programado', 'llamado a la acción', 'demo']) expect(all, not).not.toContain(not);
  });

  it('dicho como lo dice la gente, es la palabra', () => {
    const asked: [Role, string, string][] = [
      ['social', '¿qué es un short?', 'reel-y-short'],
      ['boss', '¿qué es un ril?', 'reel-y-short'],
      ['social', '¿qué es un story?', 'historia-y-sticker'],
      ['boss', '¿qué es una historia en redes?', 'historia-y-sticker'],
      ['camera', '¿qué es la cuadrícula?', 'feed'],
      ['dispatch', '¿qué significa el texto de abajo?', 'caption'],
      ['social', '¿qué es un gancho?', 'hook-y-cta'],
      ['social', '¿qué es un sello?', 'texto-del-arte'],
      ['dispatch', 'que significan los recuadritos de colores', 'etiquetas'],
      ['camera', '¿qué significa 1080x1920?', 'numeros-y-medidas'],
      ['social', '¿qué quiere decir 1:1?', 'numeros-y-medidas'],
      ['boss', 'q significa tanda de tweets', 'tanda'],
      ['social', 'q significa motivo rapido', 'motivos-rapidos'],
      ['dispatch', 'q es un aviso de cumplimiento', 'avisos-de-cumplimiento'],
      ['social', 'que es el semaforo de aprobacion', 'semaforo'],
      ['camera', 'que significan verde amarillo y rojo en las piezas', 'semaforo'],
      ['social', 'que significa programar una publicacion', 'programar'],
      ['boss', '¿qué son las estrellitas?', 'receptividad'],
      ['ivt', '¿qué es un story board?', 'storyboard'],
      // (Redes' answer about «Repartir de nuevo» does not say what a tanda is: the word does.)
      ['social', '¿Qué es una tanda?', 'tanda'],
    ];
    for (const [r, q, id] of asked) expect(askedTerm(q, [r])?.id, `${r}: ${q}`).toBe(`palabra:${id}`);
  });

  it('con lo de alrededor («en redes», «en un post», «de un evento», «la de redes», «¿qué es eso?», «explícame…»)', () => {
    const asked: [Role, string, string][] = [
      ['ivt', 'pieza que es? la de redes', 'pieza'],
      ['social', 'q son los sellos en un post', 'texto-del-arte'],
      ['dispatch', '¿Qué es la ficha técnica de un evento?', 'ficha-tecnica'],
      ['social', 'que significa 4:5 en un post', 'numeros-y-medidas'],
      ['camera', 'q significa 1080x1920 al lado del video', 'numeros-y-medidas'],
      ['boss', 'motivos rapidos que es eso', 'motivos-rapidos'],
      ['admin', 'feed q es eso', 'feed'],
      ['social', 'campos de la tarjeta que es eso', 'campos'],
      ['boss', 'q es atencion en mi menu', 'web-y-atencion'],
      ['boss', 'que es web, lo que sale en el menu', 'web-y-atencion'],
      ['camera', 'explicame la nota para el editor', 'nota-para-el-editor'],
      ['ivt', 'explicame el dialogo fab', 'dialogo-fab'],
      ['social', 'explícame qué es un copy', 'copy'],
      ['boss', '¿y qué es el feed en la app?', 'feed'],
    ];
    for (const [r, q, id] of asked) expect(askedTerm(q, [r])?.id, `${r}: ${q}`).toBe(`palabra:${id}`);
  });

  it('«¿quién es…?» y «¿quiénes son…?» de Administración', () => {
    for (const [r, q] of [
      ['social', 'administracion quienes son'],
      ['ivt', 'quien es administracion'],
      ['camera', '¿quiénes son los de administración?'],
    ] as [Role, string][])
      expect(askedTerm(q, [r])?.id, `${r}: ${q}`).toBe('palabra:administracion');
    // Another «¿quién es…?» is not a word: «¿quién es el que aprueba?».
    expect(askedTerm('¿quién es el que aprueba?', ['social'])).toBeNull();
  });

  it('escrito apurado o dictado: «q signfica», «kiere desir», «esplícame»', () => {
    expect(readable('que signfica feed')).toBe('que significa feed');
    expect(readable('q sinifica trancado')).toBe('que significa trancado');
    expect(readable('que kiere desir cta')).toBe('que quiere decir cta');
    expect(readable('esplicame el storyboard')).toBe('explicame el storyboard');
    expect(askedTerm('que signfica feed', ['camera'])?.id).toBe('palabra:feed');
    expect(askedTerm('que kiere desir cta', ['social'])?.id).toBe('palabra:hook-y-cta');
  });

  it('lo que no es la palabra sigue con su respuesta', () => {
    for (const [r, q] of [
      ['social', '¿qué es lo que va a decir en el storyboard?'],
      ['social', '¿qué significa «Sin programar»?'],
      ['social', '¿qué es el título?'],
      ['boss', '¿qué significan las etiquetas de esta lista?'],
      ['social', '¿qué es eso?'],
      ['boss', '¿qué es la feria del pueblo?'],
    ] as [Role, string][])
      expect(askedTerm(q, [r]), `${r}: ${q}`).toBeNull();
  });

  it('un «¿cómo…?» con la palabra va a cómo se hace', () => {
    for (const [r, q] of [
      ['social', '¿cómo subo un short?'],
      ['social', '¿cómo armo la cuadrícula?'],
      ['social', '¿cómo escribo el texto de abajo?'],
      ['social', '¿cómo pongo un sticker?'],
      ['camera', '¿cómo dejo la nota de grabación?'],
      ['boss', '¿cómo cambio el nivel de aprobación?'],
    ] as [Role, string][]) {
      expect(askedTerm(q, [r]), `${r}: ${q}`).toBeNull();
      const m = findAnswers(q, { roles: [r], limit: 8 }).find((x) => x.entry.kind === 'term');
      expect(m?.confidence ?? 'none', `${r}: ${q}`).not.toBe('strong');
    }
  });
});

describe('las palabras de las pantallas dichas de otra forma (SHORTHAND) y los sinónimos', () => {
  it('el más y el menos del modo lectura agrandan y achican la letra; «el Más» solo es el botón de la barra', () => {
    expect(readable('pa que son el menos y el mas')).toContain('el achica letra y el agranda letra');
    expect(readable('para que sirven el mas y el menos')).toContain('el agranda letra y el achica letra');
    expect(readable('el mas de la letra')).toContain('agranda letra');
    expect(readable('que hay en el mas')).not.toContain('letra');
    const m = bestAnswer('pa que son el menos y el mas', { roles: ['boss'] })!;
    expect(m.text).toMatch(/letra/);
  });

  it('las flechitas son las flechas; la cajita es la del nivel; el muñeco es el muñequito de Mi cuenta', () => {
    expect(readable('para que son las flechitas')).toBe('paraque son las flechas');
    expect(readable('donde esta la cajita')).toBe('donde esta la cajita nivel');
    expect(readable('la cajita del nivel')).toBe('la cajita del nivel');
    expect(readable('la cajita no me deja cambiar el color')).toBe('la cajita nivel no me deja cambiar el color');
    expect(readable('el muñeco de arriba')).toBe('el munequito de arriba');
    expect(bestAnswer('¿para qué es el muñeco de arriba?', { roles: ['ivt'] })!.text).toMatch(/Mi cuenta/);
  });

  it('«la cajita» de otra cosa y «el más y el menos» de otra cosa siguen siendo lo suyo', () => {
    // (With what box it is, that box: the list «Antes de aprobar», the search, a text.)
    for (const q of ['marco la cajita de antes de aprobar y no pasa nada', 'la cajita de texto no me deja escribir', 'donde esta la cajita para buscar'])
      expect(readable(q), q).not.toContain('nivel');
    expect(bestAnswer('marco la cajita de antes de aprobar y no pasa nada', { roles: ['boss'] })!.text).toMatch(/«Antes de aprobar»/);
    // (The most and the least of something else: results, not the letter.)
    expect(readable('cual post tuvo el mas y el menos de me gusta')).not.toContain('letra');
    expect(readable('que hacen el mas y el menos en el modo lectura')).toContain('el agranda letra y el achica letra');
    expect(bestAnswer('cual post tuvo el mas y el menos de me gusta', { roles: ['social'] })!.text).not.toMatch(/letra|Modo sol/);
  });

  it('un short es un reel y el caption es el copy largo', () => {
    const short = bestAnswer('¿cómo subo un short?', { roles: ['social'] })!;
    expect(short.text).toMatch(/reel|Short|video/i);
    const caption = bestAnswer('¿el caption es el copy largo?', { roles: ['dispatch'] })!;
    expect(caption.text).toMatch(/copy largo/);
  });

  it('cada nombre de cada palabra, por cada rol, como lo pregunta la gente («X, ¿qué es?», «explícame X»)', () => {
    const bad: string[] = [];
    for (const g of GLOSSARY)
      for (const name of new Set(g.aka))
        for (const q of [`${name}, ¿qué es?`, `explícame ${name}`])
          for (const r of ROLES) {
            if (r === 'admin' && /\b(?:mensajes?|canal(?:es)?|globitos?)\b/.test(name)) continue;
            const t = askedTerm(q, [r]);
            // (An answer written for this role for exactly that question says it better: «¿qué es el feed?» of the IVT.)
            const own = !t && bestAnswer(q, { roles: [r] })?.entry.roles?.includes(r);
            if (t?.id !== `palabra:${g.id}` && !own) bad.push(`${r} · ${q} → ${t?.id ?? 'nada'}`);
          }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });
});
