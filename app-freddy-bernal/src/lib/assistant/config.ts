// The assistant's factory material, from config/assistant (nothing about the client here:
// brand data arrives at runtime from app_settings). No 'server-only' import: seedClient
// also runs from scripts/seed-client.mts.
import knowledgeJson from '../../../config/assistant/knowledge.json';
import scriptsJson from '../../../config/assistant/scripts.json';
import personaJson from '../../../config/assistant/persona.json';
import rolesJson from '../../../config/assistant/roles.json';
import { getClientConfig } from '../client-config';
import type { Role } from '../roles';
import { contract, neutralIntro } from './text';

export type FactoryKnowledge = { key: string; roles: Role[] | null; title: string; body: string; tags: string[] };
export type FactoryScript = {
  key: string;
  roles: Role[] | null;
  topic: string;
  triggers: string[];
  always: boolean;
  script: string;
  notes: string;
};
export type Persona = { who: string; personality: string; language: string; style: string[]; never: string[] };
export type RoleBrief = { label: string; oficio: string; sugeridas: string[] };

export const FACTORY_KNOWLEDGE = knowledgeJson.knowledge as FactoryKnowledge[];
export const FACTORY_SCRIPTS = scriptsJson.scripts as FactoryScript[];
export const PERSONA = personaJson as unknown as Persona;
export const ROLE_BRIEFS = rolesJson.roles as Partial<Record<Role, RoleBrief>>;

// Name, emoji and intro: defaults from config/clients/<brand>.json → assistant; the panel
// stores overrides in app_settings 'assistant' (same shape).
export type AssistantProfile = { name: string; emoji: string; intro: string };

export function defaultProfile(brandKey?: string): AssistantProfile {
  const a = (getClientConfig(brandKey) as { assistant?: Partial<AssistantProfile> }).assistant ?? {};
  return {
    name: a.name?.trim() || 'Asistente',
    emoji: a.emoji?.trim() || '',
    intro: a.intro?.trim() || 'Soy el asistente del equipo. Te ayudo con la plataforma.',
  };
}

/**
 * The panel's values over the config defaults. A field the panel saved EMPTY means empty: no
 * emoji → the button shows the name's initial; no intro → a neutral one with the current name
 * (never the config intro, which presents the assistant by its default name).
 */
export function mergeProfile(stored: unknown, brandKey?: string): AssistantProfile {
  const d = defaultProfile(brandKey);
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<Record<keyof AssistantProfile, unknown>>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : null);
  const name = str(s.name) || d.name;
  const emoji = str(s.emoji) ?? d.emoji;
  const intro = str(s.intro) || (str(s.intro) === '' || name !== d.name ? neutralIntro(name) : d.intro);
  return { name, emoji, intro };
}

/** Suggested first questions for the window, per role (the person's roles, de-duplicated). */
export function suggestedQuestions(roles: Role[], bossLabel = 'el jefe'): string[] {
  const out: string[] = [];
  for (const r of roles) for (const q of ROLE_BRIEFS[r]?.sugeridas ?? []) {
    const text = contract(q.replaceAll('[JEFE]', bossLabel));
    if (!out.includes(text)) out.push(text);
  }
  return out.slice(0, 4);
}
