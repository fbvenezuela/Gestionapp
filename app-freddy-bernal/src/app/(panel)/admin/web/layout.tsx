import { UploadLimits } from '@/components/cms/upload-form';
import { maxMediaBytes } from '@/lib/web/cms/media-file';

// «Web» (the CMS): the upload forms say the limit this server applies (on the hosting, 4 MB for every file; see
// maxMediaBytes), not a fixed number.
export default function AdminWebLayout({ children }: { children: React.ReactNode }) {
  return <UploadLimits value={{ image: maxMediaBytes('image'), document: maxMediaBytes('document') }}>{children}</UploadLimits>;
}
