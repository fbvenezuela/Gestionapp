import Link from 'next/link';
import { ChevronRight, Users, Tags, PenLine, Clock, Video, Palette, Inbox, History, Bot, HardDrive, SlidersHorizontal } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { storageProvider } from '@/lib/storage/provider';
import { PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'Ajustes' };

const ITEMS = [
  { href: '/ajustes/equipo', label: 'Equipo', detail: 'Invitar personas, roles, doble factor y sesiones', icon: Users },
  { href: '/ajustes/categorias', label: 'Categorías', detail: 'La lista de categorías del contenido', icon: Tags },
  { href: '/ajustes/formulas', label: 'Fórmulas de copies', detail: 'FAB, PAS, AIDA y las que agregues', icon: PenLine },
  { href: '/ajustes/horarios', label: 'Horarios de tweets', detail: 'Franjas y cuántos por día', icon: Clock },
  { href: '/ajustes/redes', label: 'Reglas por red', detail: 'Duración, medidas y peso de video de cada red', icon: Video },
  { href: '/ajustes/contenido', label: 'Cupo y pilares', detail: 'El cupo del mes por formato, los pilares y las piezas eliminadas', icon: SlidersHorizontal },
  { href: '/ajustes/marca', label: 'Marca', detail: 'Nombre, colores y logos', icon: Palette },
  { href: '/ajustes/asistente', label: 'Asistente', detail: 'Lo que sabe, cómo contesta y cómo le va', icon: Bot },
  { href: '/ajustes/buzon', label: 'Buzón de correos', detail: 'Los correos que la plataforma generó', icon: Inbox },
  { href: '/ajustes/registro', label: 'Registro de cambios', detail: 'Quién cambió qué y cuándo', icon: History },
];

// Only when files go to Drive (STORAGE_PROVIDER=drive); otherwise Ajustes stays as it was.
const DRIVE_ITEM = { href: '/ajustes/drive', label: 'Google Drive', detail: 'Dónde se guardan los videos, conexión y prueba', icon: HardDrive };

export default async function SettingsPage() {
  await requireRole('admin');
  const items = storageProvider() === 'drive' ? [...ITEMS.slice(0, 7), DRIVE_ITEM, ...ITEMS.slice(7)] : ITEMS;
  return (
    <>
      <PageHeader title="Ajustes" />
      <Card>
        <ul className="divide-y divide-border">
          {items.map(({ href, label, detail, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <Icon className="h-5 w-5 shrink-0 text-text-2" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-sm text-text-2">{detail}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
