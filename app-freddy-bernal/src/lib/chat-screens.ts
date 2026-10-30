// The screens of Mensajes (R3, R5: channels, D-79) for 360's «Ir a…» button and the guides, joined into SCREENS
// (src/lib/assistant/screens.ts). Same rule as there: the roles are COPIED from each page's own access check, and
// tests/unit/assistant-screens.test.ts compares them. An account with Administración is sent away by the pages even
// with a team role (D-49), which these lists cannot say: none of them lists 'admin'.
import type { Role } from './roles';
import type { Screen } from './assistant/screens';

const TEAM: Role[] = ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'];

export const CHAT_SCREENS: Screen[] = [
  {
    href: '/mensajes',
    label: 'Mensajes',
    roles: TEAM,
    file: '(panel)/mensajes/page.tsx',
    phrases: ['mis mensajes', 'red interna', 'mensajes del equipo', 'chat del equipo', 'mis canales'],
    nav: ['mensajes', 'chat', 'canales'],
    about: 'el sobre de arriba, junto a la campana: tus canales con el equipo',
  },
  {
    href: '/mensajes/canales/nuevo',
    label: 'Nuevo canal',
    roles: ['boss'],
    file: '(panel)/mensajes/canales/nuevo/page.tsx',
    phrases: ['nuevo canal', 'crear un canal', 'armar un canal'],
    nav: ['nuevo canal'],
    about: 'en Mensajes: armar un canal y elegir quién va',
  },
  // Reached only with an id.
  { href: '/mensajes/[id]', label: 'Abrir el canal', roles: TEAM, file: '(panel)/mensajes/[id]/page.tsx', phrases: [] },
  { href: '/mensajes/[id]/editar', label: 'Editar el canal', roles: ['boss'], file: '(panel)/mensajes/[id]/editar/page.tsx', phrases: [] },
];
