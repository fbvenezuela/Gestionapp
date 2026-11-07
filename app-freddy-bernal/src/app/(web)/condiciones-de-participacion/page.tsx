import type { Metadata } from 'next';
import { BlockPage, blockPageMetadata } from '@/components/web/block-page';

// How reports, petitions, observations and denuncias work, and what is published (D-91, D-92). The internal platform's
// /condiciones is another page.
export const revalidate = 60;

export function generateMetadata(): Promise<Metadata> {
  return blockPageMetadata('condiciones-de-participacion', 'Condiciones de participación');
}

export default function ParticipationTermsPage() {
  return <BlockPage slug="condiciones-de-participacion" fallbackTitle="Condiciones de participación" />;
}
