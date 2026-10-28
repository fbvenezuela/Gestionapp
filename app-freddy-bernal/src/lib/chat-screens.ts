// The screens of Mensajes (R3, D-49) for 360's «Ir a…» button and the guides, joined into SCREENS
// (src/lib/assistant/screens.ts). Same rule as there: the roles are COPIED from each page's own access check, and
// tests/unit/assistant-screens.test.ts compares them. An account with Administración is sent away by the pages even
// with a team role (D-49), which these lists cannot say: none of them lists 'admin'.
// Paso 0 (integrator) fills it; then it is WP-B's.
import type { Role } from './roles';
import type { Screen } from './assistant/screens';

const TEAM: Role[] = ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'];

export const CHAT_SCREENS: Screen[] = [
  {
    href: '/mensajes',
    label: 'Mensajes',
    roles: TEAM,
    file: '(panel)/mensajes/page.tsx',
    phrases: ['mis mensajes', 'red interna', 'mensajes del equipo', 'chat del equipo'],
    nav: ['mensajes', 'chat', 'conversaciones'],
    about: 'el sobre de arriba, junto a la campana: tus conversaciones con el equipo',
  },
  {
    href: '/mensajes/nueva',
    label: 'Escribirle a alguien',
    roles: TEAM,
    file: '(panel)/mensajes/nueva/page.tsx',
    phrases: ['escribirle a alguien', 'armar un grupo'],
    nav: ['escribirle a alguien'],
    about: 'en Mensajes: a una persona o a un grupo',
  },
  {
    href: '/mensajes/todas',
    label: 'Todas las conversaciones',
    roles: ['boss'],
    file: '(panel)/mensajes/todas/page.tsx',
    phrases: ['todas las conversaciones'],
    nav: ['todas las conversaciones'],
    about: 'en Mensajes: las conversaciones de todo el equipo, para leerlas',
  },
  {
    href: '/mensajes/permisos',
    label: 'Quién habla con quién',
    roles: ['boss'],
    file: '(panel)/mensajes/permisos/page.tsx',
    phrases: ['quien habla con quien', 'permisos de mensajes'],
    nav: ['quien habla con quien'],
    about: 'en Mensajes: qué roles pueden escribirse',
  },
  // Reached only with an id.
  { href: '/mensajes/[id]', label: 'Abrir la conversación', roles: TEAM, file: '(panel)/mensajes/[id]/page.tsx', phrases: [] },
];
