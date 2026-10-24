// The model chain (manual §9). Models live in a secret (ASISTENTE_MODELOS), not in the
// code: providers retire models without notice, and the fix is changing the secret.
// Every provider speaks the OpenAI-compatible chat API. Anthropic is NOT here (no service
// in Venezuela since 12/11/2026). Keys are read by name and never printed.

export type ProviderId = 'gemini' | 'groq' | 'openai' | 'openrouter' | 'mistral';

export const PROVIDERS: Record<ProviderId, { url: string; keyEnv: string; prefix?: string; maxTokensField: 'max_tokens' | 'max_completion_tokens' }> = {
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', keyEnv: 'GEMINI_API_KEY', prefix: 'AIza', maxTokensField: 'max_tokens' },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', keyEnv: 'GROQ_API_KEY', prefix: 'gsk_', maxTokensField: 'max_completion_tokens' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', keyEnv: 'OPENAI_API_KEY', prefix: 'sk-', maxTokensField: 'max_completion_tokens' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', keyEnv: 'OPENROUTER_API_KEY', prefix: 'sk-or-', maxTokensField: 'max_tokens' },
  mistral: { url: 'https://api.mistral.ai/v1/chat/completions', keyEnv: 'MISTRAL_API_KEY', maxTokensField: 'max_tokens' },
};

export type Link = { provider: string; model: string; raw: string };

/** "gemini:gemini-x, groq:openai/gpt-oss-20b" → links. Splits on the FIRST colon (OpenRouter models may carry more). */
export function parseChain(s: string | undefined | null): Link[] {
  return String(s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((raw) => {
      const i = raw.indexOf(':');
      return i < 0 ? { provider: raw.toLowerCase(), model: '', raw } : { provider: raw.slice(0, i).trim().toLowerCase(), model: raw.slice(i + 1).trim(), raw };
    });
}

/** Little reasoning, with each family's own word; models that don't reason get nothing. */
export function reasoningEffort(model: string): Record<string, string> {
  if (/gpt-oss|(^|\/)o\d|gpt-5/i.test(model)) return { reasoning_effort: 'low' };
  if (/qwen/i.test(model)) return { reasoning_effort: 'none' };
  if (/gemini-(2\.5|[3-9])/i.test(model)) return { reasoning_effort: 'low' };
  return {};
}

// USD per million tokens (input, output), only to estimate spend against the monthly cap.
// Verify against each provider's price page before trusting them.
const PRICES: [RegExp, number, number][] = [
  [/flash-lite/i, 0.3, 2.5],
  [/gemini.*flash/i, 0.75, 3.75],
  [/gemini.*pro/i, 2.5, 15],
  [/gpt-oss|llama|qwen|mixtral|gemma/i, 0.15, 0.75],
  [/gpt-5-nano/i, 0.05, 0.4],
  [/gpt-5-mini|mini/i, 0.25, 2],
  [/mistral-small|ministral/i, 0.1, 0.3],
];

export function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICES.find(([re]) => re.test(model));
  const [pi, po] = p ? [p[1], p[2]] : [1.5, 6];
  return (tokensIn * pi + tokensOut * po) / 1_000_000;
}

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
export type ToolSpec = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };

export type ChatOptions = {
  tools?: ToolSpec[];
  maxTokens?: number;
  temperature?: number;
  chain?: Link[];
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  /** Epoch ms after which no link is tried and a call in flight is cut (the turn's budget). */
  deadline?: number;
};

export type ChatResult = {
  text: string;
  toolCalls: ToolCall[];
  link: string; // "provider:model" that answered
  provider: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number };
};

export class ChainError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super(`Ningún modelo respondió. ${reasons.join(' | ') || 'La cadena de modelos está vacía.'}`);
    this.reasons = reasons;
  }
}

class LinkError extends Error {
  waitMs: number | null;
  constructor(message: string, waitMs: number | null = null) {
    super(message);
    this.waitMs = waitMs;
  }
}

/** Names of secrets that look like the missing one (NEVER their values). */
export function similarKeyNames(keyEnv: string, provider: string, env: Record<string, string | undefined>): string[] {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return Object.keys(env)
    .filter((k) => k !== keyEnv && env[k] !== undefined)
    .filter((k) => norm(k).includes(norm(provider)) || norm(k) === norm(keyEnv))
    .sort();
}

export type KeyDiagnosis = { provider: string; keyEnv: string; present: boolean; prefixOk: boolean | null; spaces: boolean; similar: string[]; known: boolean };

/** What the panel shows in «Cómo va»: which keys exist, never their values. */
export function keyDiagnostics(chain: Link[], env: Record<string, string | undefined> = process.env): KeyDiagnosis[] {
  const seen = new Set<string>();
  const out: KeyDiagnosis[] = [];
  for (const l of chain) {
    if (seen.has(l.provider)) continue;
    seen.add(l.provider);
    const p = PROVIDERS[l.provider as ProviderId];
    if (!p) {
      out.push({ provider: l.provider, keyEnv: '', present: false, prefixOk: null, spaces: false, similar: [], known: false });
      continue;
    }
    const v = env[p.keyEnv];
    out.push({
      provider: l.provider,
      keyEnv: p.keyEnv,
      present: !!v && !!v.trim(),
      prefixOk: v && p.prefix ? v.trim().startsWith(p.prefix) : null,
      spaces: !!v && v !== v.trim(),
      similar: v ? [] : similarKeyNames(p.keyEnv, l.provider, env),
      known: true,
    });
  }
  return out;
}

function keyFor(link: Link, env: Record<string, string | undefined>): { url: string; key: string; field: 'max_tokens' | 'max_completion_tokens' } {
  const p = PROVIDERS[link.provider as ProviderId];
  if (!p) throw new LinkError(`Proveedor desconocido: ${link.provider}. Usa gemini, groq, openai, openrouter o mistral.`);
  if (!link.model) throw new LinkError(`Falta el modelo después de «${link.provider}:».`);
  const raw = env[p.keyEnv];
  if (!raw || !raw.trim()) {
    const similar = similarKeyNames(p.keyEnv, link.provider, env);
    throw new LinkError(`Falta el secreto ${p.keyEnv}. Parecidos: ${similar.join(', ') || 'ninguno'}.`);
  }
  if (raw !== raw.trim()) throw new LinkError(`${p.keyEnv} tiene espacios al principio o al final: ¿se pegó con espacios?`);
  if (p.prefix && !raw.startsWith(p.prefix)) throw new LinkError(`${p.keyEnv} no empieza por ${p.prefix}: ¿se pegó con espacios o a medias?`);
  return { url: p.url, key: raw, field: p.maxTokensField };
}

/** How long a 429 asks to wait: retry-after header, or "try again in 1.2s" / "retry in 43ms" in the body. */
export function waitFrom(headers: Headers, body: unknown): number {
  const h = Number(headers.get('retry-after'));
  if (Number.isFinite(h) && h > 0) return Math.ceil(h * 1000);
  const text = JSON.stringify(body ?? '');
  const m = /(?:try again|retry) in\s*([\d.]+)\s*(ms|s)\b/i.exec(text);
  if (m) return Math.ceil(Number(m[1]) * (m[2].toLowerCase() === 'ms' ? 1 : 1000));
  return 2000;
}

// Provider errors sometimes echo part of the key ("Incorrect API key provided: sk-ab***"): mask it.
function maskSecrets(s: string, key?: string): string {
  const out = key ? s.split(key).join('[clave]') : s;
  return out.replace(/(AIza|gsk_|sk-or-|sk-)[A-Za-z0-9_*.-]{4,}/g, '[clave]');
}

function short(v: unknown, key?: string) {
  return maskSecrets(JSON.stringify(v ?? ''), key).slice(0, 200);
}

async function callLink(link: Link, messages: ChatMessage[], o: ChatOptions, env: Record<string, string | undefined>): Promise<ChatResult> {
  const { url, key, field } = keyFor(link, env);
  const timeLeft = () => (o.deadline === undefined ? Infinity : o.deadline - Date.now());
  if (timeLeft() <= 0) throw new LinkError('sin tiempo para preguntar');
  const doFetch = o.fetchImpl ?? fetch;
  const body: Record<string, unknown> = {
    model: link.model,
    messages,
    [field]: o.maxTokens ?? 700,
    temperature: o.temperature ?? 0.6,
    ...reasoningEffort(link.model),
  };
  if (o.tools?.length) {
    body.tools = o.tools;
    body.tool_choice = 'auto';
  }
  const send = async () => {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1, Math.min(o.timeoutMs ?? 25_000, timeLeft()))),
    });
    const json: unknown = await res.json().catch(() => ({}));
    return { res, json };
  };

  let { res, json } = await send();
  // A 400 about a parameter this family doesn't take: repeat without it (instead of calling the link down).
  for (let i = 0; i < 2 && res.status === 400; i++) {
    const msg = short(json, key);
    if ('reasoning_effort' in body && /reasoning/i.test(msg)) delete body.reasoning_effort;
    else if ('temperature' in body && /temperature/i.test(msg)) delete body.temperature;
    else break;
    ({ res, json } = await send());
  }
  if (res.status === 429) throw new LinkError(`HTTP 429 ${short(json, key)}`, waitFrom(res.headers, json));
  if (!res.ok) throw new LinkError(`HTTP ${res.status} ${short(json, key)}`);

  const j = json as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const m = j.choices?.[0]?.message ?? {};
  const toolCalls = (m.tool_calls ?? []).filter((c) => c?.function?.name);
  const text = String(m.content ?? '').trim();
  // Empty is a failure only when it did not ask for tools either.
  if (!text && !toolCalls.length) throw new LinkError('respondió vacío');
  return {
    text,
    toolCalls,
    link: link.raw,
    provider: link.provider,
    model: link.model,
    usage: { prompt_tokens: j.usage?.prompt_tokens ?? 0, completion_tokens: j.usage?.completion_tokens ?? 0 },
  };
}

/**
 * Asks the chain in order. 429 → next link right away. If EVERY link said 429 and the one
 * that frees up first asks for 6 s or less, wait once and go round once more (never twice).
 * Never ends in silence: the final error carries every link's reason.
 */
export async function chat(messages: ChatMessage[], o: ChatOptions = {}): Promise<ChatResult> {
  const env = o.env ?? process.env;
  const chain = o.chain ?? [];
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const reasons: string[] = [];
  for (let pass = 0; pass < 2; pass++) {
    const waits: (number | null)[] = [];
    for (const link of chain) {
      try {
        return await callLink(link, messages, o, env);
      } catch (e) {
        const err = e as LinkError;
        const msg = maskSecrets(String(err?.message ?? e).replace(/^Error:\s*/, ''));
        reasons.push(`${link.raw}: ${msg}`);
        waits.push(err instanceof LinkError ? err.waitMs : null);
        console.error(`[asistente] falló ${link.raw}: ${msg}`);
      }
    }
    const all429 = waits.length > 0 && waits.every((w) => w !== null);
    const soonest = all429 ? Math.min(...(waits as number[])) : Infinity;
    const fits = o.deadline === undefined || Date.now() + soonest + 250 < o.deadline;
    if (pass === 0 && all429 && soonest <= 6000 && fits) {
      reasons.push(`se esperó ${soonest} ms`);
      await sleep(soonest + 250);
      continue;
    }
    break;
  }
  throw new ChainError(reasons);
}
