// The screens of Redes by format (R4, D-60) for 360's «Ir a…» button and the guides, joined into SCREENS
// (src/lib/assistant/screens.ts). Same rule as there: the roles are COPIED from each page's own access check, and
// tests/unit/assistant-screens.test.ts compares them. The board itself (/redes) stays with the base screens.
import type { Screen } from './assistant/screens';
import { FORMAT, formatFromSlug } from './domain/redes';

export const REDES_SCREENS: Screen[] = [
  {
    href: '/redes/feed',
    label: 'El feed del mes',
    roles: ['admin', 'social', 'boss'],
    file: '(panel)/redes/feed/page.tsx',
    phrases: ['el feed', 'feed preview', 'armar el feed', 'orden del feed', 'el feed del mes'],
    nav: ['feed'],
    about: 'en Redes: los 24 espacios del mes, en el orden en que se publican, del #1 abajo a la derecha al #24',
  },
  {
    href: '/redes/buscar',
    label: 'Buscar en Redes',
    roles: ['admin', 'social', 'boss'],
    file: '(panel)/redes/buscar/page.tsx',
    phrases: ['buscar en redes'],
    nav: ['buscar en redes'],
    about: 'en Redes: títulos, copies, avisos y tweets, por formato',
  },
  {
    href: '/ajustes/contenido',
    label: 'Cupo y pilares',
    roles: ['admin'],
    file: '(panel)/ajustes/contenido/page.tsx',
    phrases: ['cupo del mes', 'los pilares', 'cupo y pilares'],
    nav: ['cupo', 'pilares', 'cupo y pilares'],
    about: 'en Ajustes: cuántas piezas de cada formato por mes, los pilares y las piezas eliminadas',
  },
  // A section (/redes/reels, /redes/posts…): reached from the board, its bar or a tool, by its format's address (360's
  // button names the section itself: redesSectionLabel). After the static screens above, so /redes/feed and
  // /redes/buscar are never taken for a section.
  { href: '/redes/[formato]', label: 'Una sección de Redes', roles: ['admin', 'social', 'boss'], file: '(panel)/redes/[formato]/page.tsx', phrases: [] },
];

/** The label of 360's button to one section: /redes/fin-de-mes → «Fin de mes» (it reads «Ir a Fin de mes»); null for
 * any other address. */
export function redesSectionLabel(href: string): string | null {
  const m = /^\/redes\/([^/?#]+)/.exec(href);
  const f = m ? formatFromSlug(m[1]) : null;
  return f ? FORMAT[f].plural : null;
}
