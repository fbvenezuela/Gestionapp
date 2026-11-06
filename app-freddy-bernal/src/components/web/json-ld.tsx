import { jsonLdHtml, type JsonLd as Data } from '@/lib/web/seo';

// Structured data for search engines (schema.org JSON-LD). The only raw markup of the website: data, never content, built
// by seo.ts from the site's settings and the item's checked fields, and serialized with jsonLdHtml, which escapes «<»,
// «>» and «&» so nothing inside can close the script (the guide in node_modules/next/dist/docs, «JSON-LD»). A data
// block: browsers never run it, and the CSP does not apply to it.
export function JsonLd({ data }: { data: Data | Data[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }} />;
}
