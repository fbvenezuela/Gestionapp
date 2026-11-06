import type { NextRequest } from 'next/server';
import { handleUpload, isUuid, lookupGrant } from '@/lib/actions/participation-core';

// The files of «Agregar información» (design §4): one per POST (multipart «file», and «messageId», the message they go
// with), only while the consultation cookie is valid (it lives under /atencion/consultar, so this route sits there too).
export async function POST(req: NextRequest) {
  return handleUpload(
    req,
    () => lookupGrant(),
    (form) => {
      const id = form.get('messageId');
      return isUuid(id) ? id : null;
    },
  );
}
