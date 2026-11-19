import type { Role } from '../roles';
import type { Room } from './office';

// Which rooms are each role's own in «La oficina»: they are lit in the drawing and framed in the list. Only the look:
// what each person may change is decided by the database (event_office policies, pieces, publications).
const ROOMS_OF: Partial<Record<Role, Room[]>> = {
  dispatch: ['reception', 'meeting'],
  boss: ['meeting', 'clean_cut', 'approval'],
  camera: ['meeting', 'storyboard', 'recording'],
  social: ['meeting', 'script', 'storyboard', 'brutal_edit', 'copywriting', 'publishing', 'analytics'],
};

export function myRooms(roles: readonly Role[]): Room[] {
  const out = new Set<Room>();
  for (const r of roles) for (const room of ROOMS_OF[r] ?? []) out.add(room);
  return [...out];
}
