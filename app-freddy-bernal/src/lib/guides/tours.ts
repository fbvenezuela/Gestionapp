// The tutorials (R3, D-45, design §6.3): steps of «mira aquí» on the screen the person is on. The page stays still
// while one runs, so no step says «toca» as an order: «Aquí está «X»: lo tocas cuando cierres el tutorial».
// Texts ≤ 140 letters, in «tú», no concrete dates, no demo data; «» only for labels that exist on screen.
// Paso 0 (integrator): `bienvenida` and `hoy-redes` with provisional texts, so the engine (WP-C) can test the chain.
// WP-D writes the whole catalogue.
import type { Tour } from './types';
import { anchor } from './anchors';

// `screen` of a tutorial that runs on the person's own home (homeFor(roles)): the boss's Inicio, Obras, Municipios or Hoy.
export const HOME_SCREEN = '@home';
// `next` of `bienvenida`: the tutorial of the person's home, resolved per person by toursForRoles() (U2).
export const HOME_NEXT = '@home';

export const TOURS: Tour[] = [
  {
    id: 'bienvenida',
    screen: HOME_SCREEN,
    roles: ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'],
    title: 'Bienvenida',
    next: HOME_NEXT,
    steps: [
      {
        // The side menu on a computer, the bottom bar on the phone (only one of them is visible).
        target: ['nav[aria-label="Menú principal"]', 'nav[aria-label="Menú"]'],
        title: 'Tus pantallas',
        body: 'Aquí están las pantallas de tu trabajo; en el teléfono, abajo. Lo que no cabe en la barra está en «Más».',
      },
      { target: [anchor('create')], title: 'Crear', body: 'En «Crear» está solo lo que tu rol puede crear.' },
      { target: [anchor('bell')], title: 'Avisos', body: 'La campana te avisa de lo que espera por ti en tu trabajo.' },
      { target: [anchor('messages')], title: 'Mensajes', body: 'Aquí le escribes al equipo. El jefe puede leer las conversaciones.' },
      { target: [anchor('account')], title: 'Tu cuenta', body: 'En «Mi cuenta» están tu perfil, el «Modo sol», la ayuda y «Salir».' },
      // With `next`, the engine adds «Ahora tu pantalla de inicio» and the «Seguir» button to this last step.
      { target: ['[data-assistant-button]'], title: '360', body: 'Pregúntale a 360 lo que sea de la plataforma.' },
    ],
  },
  {
    id: 'hoy-redes',
    screen: '/hoy',
    roles: ['social'],
    title: 'Cómo se usa Hoy',
    steps: [
      {
        target: [anchor('waiting')],
        title: 'Lo que espera por ti',
        body: 'En «Lo que espera por mí» está lo tuyo: cambios pedidos, storyboards, material nuevo y lo que falta publicar.',
      },
      { target: [anchor('blocked')], title: 'Trancado', body: 'En «Trancado» está lo que se paró y necesita una mano.' },
      { target: [anchor('today-stats')], title: 'Tus números', body: 'Los números de arriba te dicen cuántos cambios, piezas listas y días de tweets tienes.' },
    ],
  },
];
