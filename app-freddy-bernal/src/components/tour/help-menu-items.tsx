'use client';

import type { Tour } from '@/lib/guides/types';

// In «Mi cuenta», after «Mi perfil y avisos» (R3, D-46, design §5.2): «Ayuda y guías» and one «Ver el tutorial…»
// button per tutorial available on this screen. Receives the person's tutorials from the panel layout.
// Paso 0 (integrator): nothing yet. WP-C builds it (with its `help-menu` anchor).
export function HelpMenuItems(props: { tours: Tour[] }) {
  void props;
  return null;
}
