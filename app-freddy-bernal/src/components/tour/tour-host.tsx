'use client';

import type { Role } from '@/lib/roles';
import type { Tour } from '@/lib/guides/types';

export type TourHostProps = {
  userId: string;
  // The menu roles (menuRoles: they follow «Ver como»), to pick each step's text.
  roles: Role[];
  // The tutorials of those roles, from toursForRoles() in the panel layout.
  tours: Tour[];
};

// The tutorials' engine (R3, D-45, design §6.1), mounted once by the panel layout next to 360. It starts only from
// ?tutorial=<id> or the window event `fb:tour:start`; never by itself.
// Paso 0 (integrator): nothing yet. WP-C builds it.
export function TourHost(props: TourHostProps) {
  void props;
  return null;
}
