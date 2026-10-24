// The assistant's window (src/components/assistant): its pure logic and the rules its code
// must keep (docs/ASISTENTE.md «La ventana», manual §12).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  ASSISTANT_URL,
  FAILED_TEXT,
  MAX_QUESTION,
  MAX_STORED,
  NOTE,
  addMessage,
  canSend,
  clearThread,
  emptyThread,
  faceOf,
  fromApi,
  goToText,
  inProgress,
  isDemo,
  liftFrom,
  parseThread,
  readRaw,
  safeGoTo,
  threadKey,
  writeThread,
  type SessionKV,
} from '@/components/assistant/core';
import { stickyBox } from '@/components/assistant/assistant-widget';
import { MAX_QUESTION as SERVER_MAX } from '@/lib/assistant';
import { DEGRADED_TEXT, DEGRADED_UNNOTIFIED } from '@/lib/assistant/brain';

const U1 = 'user-1';
const U2 = 'user-2';
const CONV = '123e4567-e89b-42d3-a456-426614174000';

function store(broken = false): SessionKV & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => {
      if (broken) throw new Error('SecurityError');
      return data[k] ?? null;
    },
    setItem: (k, v) => {
      if (broken) throw new Error('QuotaExceededError');
      data[k] = v;
    },
    removeItem: (k) => {
      if (broken) throw new Error('SecurityError');
      delete data[k];
    },
  };
}

describe('el hilo vive en sessionStorage, con la persona y el ámbito', () => {
  it('se guarda y se lee de nuevo al cambiar de página (misma pestaña)', () => {
    const s = store();
    let t = addMessage(emptyThread(U1), { who: 'persona', text: '¿qué tengo pendiente?' });
    t = { ...addMessage(t, { who: 'asistente', text: 'Tienes 2 pendientes.', goTo: { href: '/hoy', label: 'Hoy' }, model: 'local' }), conversationId: CONV };
    writeThread(s, t);
    expect(Object.keys(s.data)).toEqual([threadKey(U1)]);
    expect(threadKey(U1)).toContain('equipo');
    const back = parseThread(readRaw(s, threadKey(U1)), U1);
    expect(back.conversationId).toBe(CONV);
    expect(back.messages.map((m) => m.text)).toEqual(['¿qué tengo pendiente?', 'Tienes 2 pendientes.']);
    expect(back.messages[1].goTo).toEqual({ href: '/hoy', label: 'Hoy' });
    expect(inProgress(back)).toBe(true);
    expect(isDemo(back)).toBe(true);
  });

  it('el hilo de otra persona (o de otro ámbito) no se enseña aunque sea la misma pestaña', () => {
    const s = store();
    writeThread(s, addMessage(emptyThread(U1), { who: 'persona', text: 'hola' }));
    expect(parseThread(readRaw(s, threadKey(U2)), U2).messages).toEqual([]);
    // Even if someone copies U1's thread under U2's key, the stored owner doesn't match.
    s.data[threadKey(U2)] = s.data[threadKey(U1)];
    expect(parseThread(readRaw(s, threadKey(U2)), U2).messages).toEqual([]);
    const otherScope = JSON.stringify({ ...JSON.parse(s.data[threadKey(U1)]), scope: 'visitante' });
    expect(parseThread(otherScope, U1).messages).toEqual([]);
  });

  it('«Empezar de nuevo» suelta el hilo y el id de la conversación (la base no se toca)', () => {
    const s = store();
    writeThread(s, { ...addMessage(emptyThread(U1), { who: 'persona', text: 'hola' }), conversationId: CONV });
    clearThread(s, U1);
    const t = parseThread(readRaw(s, threadKey(U1)), U1);
    expect(t.messages).toEqual([]);
    expect(t.conversationId).toBeNull();
    expect(inProgress(t)).toBe(false);
  });

  it('sin almacenamiento (modo privado) no truena y lo recuerda mientras dure la visita', () => {
    const s = store(true);
    const t = addMessage(emptyThread('user-private'), { who: 'persona', text: 'hola' });
    expect(() => writeThread(s, t)).not.toThrow();
    expect(parseThread(readRaw(s, threadKey('user-private')), 'user-private').messages).toHaveLength(1);
    expect(() => clearThread(s, 'user-private')).not.toThrow();
    expect(parseThread(readRaw(s, threadKey('user-private')), 'user-private').messages).toEqual([]);
    expect(() => readRaw(null, 'x')).not.toThrow();
  });

  it('basura, JSON roto o mensajes raros no rompen la ventana', () => {
    expect(parseThread('{no es json', U1)).toEqual(emptyThread(U1));
    expect(parseThread(JSON.stringify({ v: 2, userId: U1, scope: 'equipo', messages: [] }), U1).messages).toEqual([]);
    const raw = JSON.stringify({
      v: 1,
      userId: U1,
      scope: 'equipo',
      conversationId: 'no-es-un-id',
      messages: [{ id: 'a', who: 'persona', text: 'ok' }, { id: 'b', who: 'hacker', text: 'x' }, null, { id: 'c', who: 'asistente', text: 'y', goTo: { href: 'javascript:alert(1)', label: 'Ir' } }],
    });
    const t = parseThread(raw, U1);
    expect(t.conversationId).toBeNull();
    expect(t.messages.map((m) => m.id)).toEqual(['a', 'c']);
    expect(t.messages[1].goTo).toBeUndefined();
  });

  it('guarda como mucho los últimos mensajes (el hilo real lo tiene el servidor)', () => {
    let t = emptyThread(U1);
    for (let i = 0; i < MAX_STORED + 10; i++) t = addMessage(t, { who: 'persona', text: `m${i}` });
    expect(t.messages).toHaveLength(MAX_STORED);
    expect(t.messages.at(-1)?.text).toBe(`m${MAX_STORED + 9}`);
    expect(new Set(t.messages.map((m) => m.id)).size).toBe(MAX_STORED);
  });
});

describe('lo que dice el servidor', () => {
  const ok = { respuesta: 'Me llamo Nube.', ambito: 'equipo', modelo: 'local', ms: 4, degradado: false, hizo: [], ir: { href: '/hoy', label: 'Hoy' }, conversacion: CONV };

  it('una respuesta normal trae su botón «Ir a…» y la conversación', () => {
    expect(fromApi(200, ok)).toEqual({ ok: true, text: 'Me llamo Nube.', degraded: false, goTo: { href: '/hoy', label: 'Hoy' }, model: 'local', conversationId: CONV });
  });

  it('degradado del servidor: el mismo aviso, sin botón', () => {
    const r = fromApi(200, { ...ok, respuesta: DEGRADED_TEXT, degradado: true, modelo: 'ninguno' });
    expect(r).toMatchObject({ ok: true, degraded: true, goTo: null, text: DEGRADED_TEXT });
  });

  it('si no responde (sin señal, 500, respuesta ilegible) se ve el mismo aviso de degradado, sin decir que avisó', () => {
    for (const [status, body] of [[0, null], [500, null], [502, { error: 'Bad gateway' }], [200, { nada: true }], [200, { respuesta: '   ' }]] as const) {
      const r = fromApi(status, body);
      expect(r).toEqual({ ok: false, text: FAILED_TEXT, degraded: true, goTo: null, retry: true });
    }
    // The server's own «already told the team» sentence is not reused: nobody was told.
    expect(FAILED_TEXT).not.toMatch(/avis[eé] al equipo/i);
    expect(FAILED_TEXT).toBe(DEGRADED_UNNOTIFIED);
  });

  it('las negativas del servidor se dicen tal cual (sin sesión lleva a entrar)', () => {
    expect(fromApi(401, { error: 'Tienes que entrar de nuevo.' })).toEqual({ ok: false, text: 'Tienes que entrar de nuevo.', degraded: false, goTo: { href: '/entrar', label: 'Entrar de nuevo' }, retry: false });
    expect(fromApi(403, { error: 'El asistente es solo para el equipo.' })).toMatchObject({ ok: false, degraded: false, text: 'El asistente es solo para el equipo.', retry: false });
    expect(fromApi(400, { error: 'La pregunta es muy larga (máximo 1500 caracteres).' })).toMatchObject({ ok: false, degraded: false, retry: false });
    expect(fromApi(404, { error: 'El asistente está apagado.' })).toMatchObject({ ok: false, text: 'El asistente está apagado.' });
  });

  it('el botón «Ir a…» solo lleva a pantallas de la app', () => {
    expect(safeGoTo({ href: '/piezas/123', label: 'Abrir la pieza' })).toEqual({ href: '/piezas/123', label: 'Abrir la pieza' });
    for (const href of ['https://otro.sitio', '//otro.sitio/x', 'javascript:alert(1)', '/\\otro', '/a b', '', 42]) expect(safeGoTo({ href, label: 'Ir' })).toBeNull();
    expect(safeGoTo({ href: '/hoy', label: '  ' })).toBeNull();
    expect(safeGoTo(null)).toBeNull();
    expect(goToText('Hoy')).toBe('Ir a Hoy');
    expect(goToText('Abrir la pieza')).toBe('Abrir la pieza');
    // The 401 button reads «Entrar de nuevo», never «Ir a Entrar de nuevo».
    expect(goToText(fromApi(401, {}).goTo!.label)).toBe('Entrar de nuevo');
  });

  it('enviar se desactiva mientras espera, vacío o por encima del tope (el mismo del servidor)', () => {
    expect(MAX_QUESTION).toBe(SERVER_MAX);
    expect(canSend('hola', false)).toBe(true);
    expect(canSend('hola', true)).toBe(false);
    expect(canSend('   ', false)).toBe(false);
    expect(canSend('x'.repeat(MAX_QUESTION), false)).toBe(true);
    expect(canSend('x'.repeat(MAX_QUESTION + 1), false)).toBe(false);
  });
});

describe('el botón', () => {
  it('tiene cara: el emoji, o la inicial del nombre', () => {
    expect(faceOf({ name: 'Nube', emoji: '🤖' })).toBe('🤖');
    expect(faceOf({ name: 'ñapa', emoji: '' })).toBe('Ñ');
    expect(faceOf({ name: '  ', emoji: null })).toBe('?');
  });

  it('sube por encima de las barras pegadas abajo («Guardar»), y nada más', () => {
    expect(liftFrom([])).toBe(0);
    expect(
      liftFrom([
        { position: 'sticky', bottom: '80px', height: 56, visible: true },
        { position: 'sticky', bottom: '80px', height: 150.4, visible: true },
        { position: 'sticky', bottom: 'auto', height: 300, visible: true }, // sticky to the top
        { position: 'static', bottom: '0px', height: 500, visible: true },
        { position: 'sticky', bottom: '16px', height: 900, visible: false },
      ]),
    ).toBe(231);
  });

  // /agenda/nuevo at 360 × 760: «Enviar propuesta» is a 56 px bar, sticky 80 px from the bottom.
  // The button rests 76 px up (over the bottom bar), 48 px tall, and keeps 12 px from a bar.
  const VH = 760;
  const bar = (top: number) => stickyBox('sticky', '80px', { top, bottom: top + 56 }, VH, 76);

  it('sobre la barra pegada abajo, mientras se llena el formulario', () => {
    expect(liftFrom([bar(VH - 80 - 56)])).toBe(136); // the button rests 148 px up: clear of the bar
  });

  it('sube con la barra cuando se suelta, y baja a su sitio cuando la barra queda más arriba', () => {
    // While the bar rises over the button's resting spot, the button rides on it, without jumps.
    expect(liftFrom([bar(VH - 100 - 56)])).toBe(156);
    expect(liftFrom([bar(VH - 129 - 56)])).toBe(185);
    // At the end of the page the bar rests 136 px from the bottom (main's padding + the spacer),
    // clear of the button's resting spot (76 + 48 + 12): the button goes back down, under the
    // bar, and covers neither the bar nor the field above it. Also with sub-pixel scrolling.
    expect(liftFrom([bar(VH - 136 - 56)])).toBe(0);
    expect(liftFrom([bar(VH - 135.75 - 56)])).toBe(0);
    // A short form: the bar rests far up the screen and the button stays down, in the empty room.
    expect(liftFrom([bar(VH - 310 - 56)])).toBe(0);
  });

  it('en la compu igual: 24 px de base y la barra pegada a 16 px', () => {
    const desk = (above: number) => stickyBox('sticky', '16px', { top: 1000 - above - 56, bottom: 1000 - above }, 1000, 24);
    expect(liftFrom([desk(16)])).toBe(72);
    expect(liftFrom([desk(96)])).toBe(0); // resting: main's 2rem + the spacer
  });

  it('una barra que ya subió, fuera de la pantalla o pegada arriba no cuenta', () => {
    expect(liftFrom([bar(200)])).toBe(0);
    expect(liftFrom([bar(VH + 10)])).toBe(0);
    expect(liftFrom([bar(-100)])).toBe(0);
    expect(liftFrom([stickyBox('sticky', 'auto', { top: 600, bottom: 700 }, VH, 76)])).toBe(0);
    expect(liftFrom([stickyBox('static', '80px', { top: 600, bottom: 656 }, VH, 76)])).toBe(0);
  });
});

describe('reglas del código de la ventana', () => {
  const widget = fs.readFileSync('src/components/assistant/assistant-widget.tsx', 'utf8');
  const mount = fs.readFileSync('src/components/assistant/assistant-mount.tsx', 'utf8');
  const all = fs.readdirSync('src/components/assistant').map((f) => fs.readFileSync(`src/components/assistant/${f}`, 'utf8')).join('\n');

  it('la altura del botón se recalcula al desplazar la página, como mucho una vez por cuadro', () => {
    expect(widget).toMatch(/addEventListener\('scroll', schedule, \{ passive: true \}\)/);
    expect(widget).toMatch(/if \(!frame\) frame = requestAnimationFrame\(update\)/);
    expect(widget).toContain("removeEventListener('scroll', schedule)");
  });

  it('no lee datos de nadie: solo llama a /api/asistente', () => {
    const fetches = widget.match(/fetch\(([^,)]+)/g) ?? [];
    expect(fetches).toEqual(['fetch(ASSISTANT_URL']);
    expect(ASSISTANT_URL).toBe('/api/asistente');
    expect(widget).not.toMatch(/from '@\/lib\/(db|data|assistant|auth)/);
    expect(widget).not.toMatch(/localStorage/);
  });

  it('accesible: diálogo con nombre, aviso fijo, tope en el campo, foco y botón que marca', () => {
    expect(widget).toContain('Dialog.Trigger'); // aria-expanded + aria-controls on the button
    expect(widget).toContain('Dialog.Title');
    expect(widget).toContain('{profile.name}'); // name and face come from the settings, not the code
    expect(widget).toContain('{NOTE}');
    expect(NOTE).toBe('No escribas aquí fechas, horas ni direcciones de la agenda.');
    expect(widget).toContain('maxLength={MAX_QUESTION}');
    expect(widget).toContain('disabled={!canSend(text, waiting)}');
    expect(widget).toContain('Empezar de nuevo');
    expect(widget).toMatch(/aria-label="Cerrar"/);
    expect(widget).toMatch(/role="log"/);
    expect(widget).toContain('está escribiendo');
    expect(widget).not.toMatch(/outline-none/); // the global focus ring stays visible
    expect(widget).toContain('safe-area-inset-bottom'); // above the phone's bottom bar
  });

  it('el botón no tapa el final de la página: deja un espacio igual o mayor que lo que sobresale', () => {
    // Phone: the button goes from 76 px to 76 + 48 = 124 px above the bottom; main pads 72 px.
    const base = Number(/--asst-base:calc\(env\(safe-area-inset-bottom\)_\+_(\d+)px\)/.exec(widget)?.[1]);
    const height = /\bh-12\b/.test(widget) ? 48 : NaN;
    const css = fs.readFileSync('src/app/globals.css', 'utf8');
    const mainPad = Number(/\.safe-bottom\s*\{\s*padding-bottom:\s*calc\(env\(safe-area-inset-bottom\)\s*\+\s*(\d+)px\)/.exec(css)?.[1]);
    const spacer = /data-assistant-spacer="" className="h-(\d+)\b/.exec(widget);
    expect(spacer).not.toBeNull();
    expect(mainPad + Number(spacer![1]) * 4).toBeGreaterThanOrEqual(base + height + 8);
  });

  it('el montaje revisa lo mismo que /api/asistente y no hay nada del cliente escrito a mano', () => {
    expect(mount).toContain('env.assistant.enabled');
    expect(mount).toContain('isTeamMember');
    expect(mount).toContain('mfaOk');
    expect(mount).toContain('db(s,');
    const brand = JSON.parse(fs.readFileSync('config/clients/fb.json', 'utf8')) as { brand: { clientName: string } };
    for (const w of [brand.brand.clientName, ...brand.brand.clientName.split(' ').filter((x) => x.length > 3)]) {
      expect(all).not.toContain(w);
    }
  });
});
