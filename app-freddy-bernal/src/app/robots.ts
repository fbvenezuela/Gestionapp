import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { robotsFile } from '@/lib/web/seo';
import { siteBaseUrl } from '@/lib/web/site';

// robots.txt (D-95, docs/diagnostico.md problem 5): nothing is crawled until SITE_INDEXABLE=true (production and Juan's
// decision); the panel, the admin, the private lookup and the API never are. The sitemap is announced only when the site
// is indexable. Built with the deployment (changing SITE_INDEXABLE means a new deployment).
export default function robots(): MetadataRoute.Robots {
  return robotsFile({ indexable: env.site.indexable, baseUrl: siteBaseUrl() });
}
