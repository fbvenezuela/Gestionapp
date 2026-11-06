import type { Metadata } from 'next';
import { BlockPage, blockPageMetadata } from '@/components/web/block-page';

// What the website does so anyone can use it, and how to report what does not work (D-91).
export const revalidate = 60;

export function generateMetadata(): Promise<Metadata> {
  return blockPageMetadata('accesibilidad', 'Accesibilidad');
}

export default function AccessibilityPage() {
  return <BlockPage slug="accesibilidad" fallbackTitle="Accesibilidad" />;
}
