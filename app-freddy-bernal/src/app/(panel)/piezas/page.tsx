import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';

// «Piezas» became Redes by format (R4, D-60): the board and its sections. Old links and the boss's door land there;
// each piece keeps its address (/piezas/[id]), which notifications, Mensajes, 360, Buscar, Publicar and Hoy use.
export default async function PiecesPage() {
  await requireRole('admin', 'social', 'boss');
  redirect('/redes');
}
