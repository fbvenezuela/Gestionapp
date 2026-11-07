import type { Metadata } from 'next';
import { BlockPage, blockPageMetadata } from '@/components/web/block-page';
import { JsonLd } from '@/components/web/json-ld';
import { organizationJsonLd, personJsonLd } from '@/lib/web/seo';
import { getSite } from '@/lib/web/site';

// El gobernador (design §2, docs/diagnostico.md problem 4): who he is, written so search engines understand it: the page
// the editors fill from the administrator (the biography and the trajectory are «por completar» slots until they are
// verified, which the public never sees; nothing invented) and the Person + GovernmentOrganization structured data.
export const revalidate = 60;

export function generateMetadata(): Promise<Metadata> {
  return blockPageMetadata('gobernador', 'El gobernador');
}

export default async function GovernorPage() {
  const site = await getSite();
  return (
    <>
      <BlockPage slug="gobernador" fallbackTitle="El gobernador" />
      <JsonLd data={[personJsonLd(site), organizationJsonLd(site)]} />
    </>
  );
}
