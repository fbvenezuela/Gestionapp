// The model chain (manual §9) with a fake fetch: no network.
import { describe, it, expect, vi } from 'vitest';
import { chat, ChainError, keyDiagnostics, parseChain, reasoningEffort, waitFrom, type ChatMessage } from '@/lib/assistant/providers';

const MSGS: ChatMessage[] = [{ role: 'user', content: 'di hola' }];
const ENV = { GEMINI_API_KEY: 'AIzaFAKE-gemini-0000', GROQ_API_KEY: 'gsk_FAKE_groq_0000', OPENAI_API_KEY: 'sk-FAKE-openai-0000' };

type Reply = { status: number; body: unknown; headers?: Record<string, string> };
function fakeFetch(script: (url: string, body: Record<string, unknown>, n: number) => Reply) {
  const calls: { url: string; body: Record<string, unknown>; auth: string }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ url: String(url), body, auth: String((init?.headers as Record<string, string>)?.Authorization ?? '') });
    const r = script(String(url), body, calls.length);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', ...(r.headers ?? {}) } });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}
const ok = (content: string) => ({ status: 200, body: { choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 3 } } });

describe('la cadena se lee del secreto', () => {
  it('proveedor:modelo separados por comas; parte en el PRIMER «:»; ignora vacíos', () => {
    expect(parseChain(' gemini:gemini-3.5-flash-lite , groq:openai/gpt-oss-20b,, openrouter:meta-llama/llama-4:free ,raro')).toEqual([
      { provider: 'gemini', model: 'gemini-3.5-flash-lite', raw: 'gemini:gemini-3.5-flash-lite' },
      { provider: 'groq', model: 'openai/gpt-oss-20b', raw: 'groq:openai/gpt-oss-20b' },
      { provider: 'openrouter', model: 'meta-llama/llama-4:free', raw: 'openrouter:meta-llama/llama-4:free' },
      { provider: 'raro', model: '', raw: 'raro' },
    ]);
    expect(parseChain('')).toEqual([]);
    expect(parseChain(undefined)).toEqual([]);
  });

  it('el esfuerzo de razonamiento va por familia; al que no razona, nada', () => {
    expect(reasoningEffort('openai/gpt-oss-120b')).toEqual({ reasoning_effort: 'low' });
    expect(reasoningEffort('qwen/qwen3-32b')).toEqual({ reasoning_effort: 'none' });
    expect(reasoningEffort('llama-3.3-70b-versatile')).toEqual({});
  });
});

describe('429, 400 y errores', () => {
  it('429 → pasa al siguiente eslabón YA, sin esperar', async () => {
    const sleep = vi.fn(async () => {});
    const f = fakeFetch((url) => (url.includes('googleapis') ? { status: 429, body: { error: { message: 'quota' } }, headers: { 'retry-after': '2' } } : ok('hola')));
    const r = await chat(MSGS, { chain: parseChain('gemini:gemini-3.5-flash,groq:llama-3.3-70b'), env: ENV, fetchImpl: f.fn, sleep });
    expect(r.text).toBe('hola');
    expect(r.link).toBe('groq:llama-3.3-70b');
    expect(f.calls).toHaveLength(2);
    expect(sleep).not.toHaveBeenCalled();
    expect(f.calls[1].auth).toBe(`Bearer ${ENV.GROQ_API_KEY}`);
  });

  it('si TODOS dan 429 y el primero que se libera pide ≤ 6 s: una sola espera y otra vuelta', async () => {
    const sleep = vi.fn(async () => {});
    const f = fakeFetch((url, _b, n): Reply => {
      if (n > 2) return ok('hola otra vez');
      const groq = url.includes('groq');
      return { status: 429, body: { error: { message: groq ? 'Please try again in 1.5s' : 'slow down' } }, headers: groq ? {} : { 'retry-after': '4' } };
    });
    const r = await chat(MSGS, { chain: parseChain('gemini:gemini-3.5-flash,groq:llama-3.3-70b'), env: ENV, fetchImpl: f.fn, sleep });
    expect(r.text).toBe('hola otra vez');
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1500 + 250);
  });

  it('nunca espera dos veces: si siguen en 429, error con el motivo de cada eslabón', async () => {
    const sleep = vi.fn(async () => {});
    const f = fakeFetch(() => ({ status: 429, body: { error: { message: 'retry in 2s' } } }));
    const err = await chat(MSGS, { chain: parseChain('gemini:gemini-3.5-flash,groq:llama-3.3-70b'), env: ENV, fetchImpl: f.fn, sleep }).catch((e) => e);
    expect(err).toBeInstanceOf(ChainError);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(f.calls).toHaveLength(4);
  });

  it('no espera si el que antes se libera pide más de 6 s', async () => {
    const sleep = vi.fn(async () => {});
    const f = fakeFetch(() => ({ status: 429, body: {}, headers: { 'retry-after': '30' } }));
    await expect(chat(MSGS, { chain: parseChain('groq:llama-3.3-70b'), env: ENV, fetchImpl: f.fn, sleep })).rejects.toBeInstanceOf(ChainError);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('400 por el parámetro de razonamiento → se repite SIN él (no se da por caído)', async () => {
    const f = fakeFetch((_u, body) =>
      'reasoning_effort' in body ? { status: 400, body: { error: { message: "Unsupported parameter: 'reasoning_effort'" } } } : ok('sin razonar'),
    );
    const r = await chat(MSGS, { chain: parseChain('groq:openai/gpt-oss-20b'), env: ENV, fetchImpl: f.fn });
    expect(r.text).toBe('sin razonar');
    expect(f.calls[0].body.reasoning_effort).toBe('low');
    expect(f.calls[1].body).not.toHaveProperty('reasoning_effort');
  });

  it('vacío es fallo solo si tampoco pidió herramientas', async () => {
    const tool = { status: 200, body: { choices: [{ message: { content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'mis_pendientes', arguments: '{}' } }] } }] } };
    const f1 = fakeFetch(() => tool);
    const r = await chat(MSGS, { chain: parseChain('groq:llama-3.3-70b'), env: ENV, fetchImpl: f1.fn });
    expect(r.toolCalls[0].function.name).toBe('mis_pendientes');
    const f2 = fakeFetch(() => ({ status: 200, body: { choices: [{ message: { content: '  ' } }] } }));
    const e = await chat(MSGS, { chain: parseChain('groq:llama-3.3-70b'), env: ENV, fetchImpl: f2.fn }).catch((x) => x);
    expect(String(e.message)).toContain('respondió vacío');
  });

  it('el error final nombra CADA eslabón y su motivo', async () => {
    const f = fakeFetch((url) => (url.includes('openai.com') ? { status: 404, body: { error: { code: 'model_not_found' } } } : ok('x')));
    const e = (await chat(MSGS, {
      chain: parseChain('openai:gpt-viejo,anthropic:claude,mistral:mistral-small,groq'),
      env: { OPENAI_API_KEY: ENV.OPENAI_API_KEY },
      fetchImpl: f.fn,
    }).catch((x) => x)) as ChainError;
    expect(e).toBeInstanceOf(ChainError);
    expect(e.reasons).toHaveLength(4);
    expect(e.message).toContain('openai:gpt-viejo: HTTP 404');
    expect(e.message).toContain('model_not_found');
    expect(e.message).toContain('anthropic:claude: Proveedor desconocido');
    expect(e.message).toContain('mistral:mistral-small: Falta el secreto MISTRAL_API_KEY');
    expect(e.message).toContain('groq: Falta el modelo');
  });

  it('cadena vacía: error claro, sin llamar a nadie', async () => {
    const f = fakeFetch(() => ok('x'));
    await expect(chat(MSGS, { chain: [], env: ENV, fetchImpl: f.fn })).rejects.toThrow(/vacía/);
    expect(f.calls).toHaveLength(0);
  });

  it('cuánto pide esperar: cabecera retry-after o «try again in 1.2s» / «retry in 300ms»', () => {
    expect(waitFrom(new Headers({ 'retry-after': '3' }), {})).toBe(3000);
    expect(waitFrom(new Headers(), { error: { message: 'Please try again in 1.2s.' } })).toBe(1200);
    expect(waitFrom(new Headers(), { error: { message: 'retry in 300ms' } })).toBe(300);
    expect(waitFrom(new Headers(), {})).toBe(2000);
  });
});

describe('diagnóstico de claves: nombres, nunca valores', () => {
  const SECRET = 'gsk_super_secreto_que_no_se_imprime_123';

  it('si falta, dice los nombres parecidos que sí existen y nunca el valor', async () => {
    const env = { GROQ_KEY: SECRET, GROQ_API_KEY_OLD: SECRET, OTHER: 'x' };
    const e = (await chat(MSGS, { chain: parseChain('groq:llama-3.3-70b'), env, fetchImpl: fakeFetch(() => ok('x')).fn }).catch((x) => x)) as ChainError;
    expect(e.message).toContain('Falta el secreto GROQ_API_KEY');
    expect(e.message).toContain('GROQ_KEY');
    expect(e.message).toContain('GROQ_API_KEY_OLD');
    expect(e.message).not.toContain(SECRET);
    expect(e.message).not.toContain('OTHER');
  });

  it('si no empieza por el prefijo del proveedor, lo dice sin mostrarla', async () => {
    const e = (await chat(MSGS, { chain: parseChain('gemini:gemini-3.5-flash'), env: { GEMINI_API_KEY: 'pegada-a-medias-123456' }, fetchImpl: fakeFetch(() => ok('x')).fn }).catch((x) => x)) as ChainError;
    expect(e.message).toContain('GEMINI_API_KEY no empieza por AIza');
    expect(e.message).not.toContain('pegada-a-medias');
  });

  it('si el proveedor repite la clave en su error, se tapa', async () => {
    const f = fakeFetch(() => ({ status: 401, body: { error: { message: `Incorrect API key provided: ${ENV.OPENAI_API_KEY}` } } }));
    const e = (await chat(MSGS, { chain: parseChain('openai:gpt-5-mini'), env: ENV, fetchImpl: f.fn }).catch((x) => x)) as ChainError;
    expect(e.message).toContain('HTTP 401');
    expect(e.message).not.toContain(ENV.OPENAI_API_KEY);
  });

  it('para el panel: qué claves existen, con o sin prefijo correcto, sin valores', () => {
    const d = keyDiagnostics(parseChain('gemini:a,groq:b,groq:c,raro:x'), { GEMINI_API_KEY: ' AIzaX ', GROQ_TOKEN: SECRET });
    expect(d).toEqual([
      { provider: 'gemini', keyEnv: 'GEMINI_API_KEY', present: true, prefixOk: true, spaces: true, similar: [], known: true },
      { provider: 'groq', keyEnv: 'GROQ_API_KEY', present: false, prefixOk: null, spaces: false, similar: ['GROQ_TOKEN'], known: true },
      { provider: 'raro', keyEnv: '', present: false, prefixOk: null, spaces: false, similar: [], known: false },
    ]);
    expect(JSON.stringify(d)).not.toContain(SECRET);
  });

  it('el turno tiene un tope de tiempo: pasado el plazo no se pregunta a nadie más (ni se espera un 429)', async () => {
    const f = fakeFetch(() => ok('tarde'));
    const e = (await chat(MSGS, { chain: parseChain('groq:llama-3.3-70b,openai:gpt-5-mini'), env: ENV, fetchImpl: f.fn, deadline: Date.now() - 1 }).catch((x) => x)) as ChainError;
    expect(e).toBeInstanceOf(ChainError);
    expect(f.calls).toHaveLength(0);
    expect(e.message).toContain('sin tiempo');
    const sleep = vi.fn(async () => {});
    const g = fakeFetch(() => ({ status: 429, body: { error: { message: 'slow' } }, headers: { 'retry-after': '5' } }));
    await chat(MSGS, { chain: parseChain('groq:llama-3.3-70b'), env: ENV, fetchImpl: g.fn, sleep, deadline: Date.now() + 2000 }).catch(() => null);
    expect(sleep).not.toHaveBeenCalled(); // waiting 5 s would pass the turn's budget
  });
});
