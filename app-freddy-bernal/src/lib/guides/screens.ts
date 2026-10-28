// The screens of Ayuda (R3, D-42, D-43) for 360's «Ir a…» button, joined into SCREENS (src/lib/assistant/screens.ts).
// Same rule as there: the roles are COPIED from each page's own access check (tests/unit/assistant-screens.test.ts).
// A role's guide answers the pattern /ayuda/[id] until SCREENS reads any [param] (WP-E); its page is ayuda/[rol] and
// lets in the person's own role, the boss and Administración (the page checks it after requireSession()).
// Paso 0 (integrator) fills it; then it is WP-D's.
import type { Screen } from '../assistant/screens';

export const HELP_SCREENS: Screen[] = [
  {
    href: '/ayuda',
    label: 'Ayuda y guías',
    roles: null,
    file: '(panel)/ayuda/page.tsx',
    phrases: ['ayuda y guias', 'guia de mi trabajo', 'guia de tu trabajo', 'tutoriales de mis pantallas'],
    // Not «ayuda» alone: «¿Dónde queda la plaza? Necesito ayuda» is a question about the agenda (assistant-turn.test.ts).
    nav: ['guia', 'guias', 'tutoriales'],
    about: 'en el menú de tu cuenta, arriba a la derecha: la guía de tu trabajo, cada pantalla y los tutoriales',
  },
  {
    href: '/ayuda/flujos',
    label: 'Cómo va el trabajo entre todos',
    roles: null,
    file: '(panel)/ayuda/flujos/page.tsx',
    phrases: ['los flujos del trabajo', 'como va el trabajo entre todos'],
    nav: ['flujos', 'flujogramas'],
    about: 'en Ayuda y guías: cómo pasa el trabajo de un rol a otro',
  },
  {
    href: '/ayuda/administracion',
    label: 'Guía de administración',
    roles: ['admin'],
    file: '(panel)/ayuda/administracion/page.tsx',
    phrases: ['guia de administracion'],
    nav: ['guia de administracion'],
    about: 'en Ayuda y guías',
  },
  // Reached only with a role's slug (/ayuda/redes).
  { href: '/ayuda/[id]', label: 'Abrir la guía del rol', roles: null, file: '(panel)/ayuda/[rol]/page.tsx', phrases: [] },
  // Not a help screen: an event's reading mode, reached only from its event. Here so its tutorial (`lectura`) and the
  // guides' «Cada pantalla» can name it (both must be a SCREENS pattern that canOpen). The page calls requireSession().
  { href: '/eventos/[id]/lectura', label: 'Abrir el modo lectura', roles: null, file: '(panel)/eventos/[id]/lectura/page.tsx', phrases: [] },
];
