import type { NextRequest } from 'next/server';
import { handleUpload } from '@/lib/actions/participation-core';
import { receiptGrant } from '@/lib/web/participation';

// The files of a request, right after «Enviar» (design §4): one per POST (multipart «file»), with the receipt the browser
// just used («reference» and «secret», in the body, never in the address). Checked, cleaned and stored, then registered
// with the receipt as anon; up to 3 with the request. The answer is JSON, so the form can retry a single file.
export async function POST(req: NextRequest) {
  return handleUpload(req, (form) => {
    const reference = form.get('reference');
    const secret = form.get('secret');
    return typeof reference === 'string' && typeof secret === 'string' ? receiptGrant(reference, secret) : null;
  });
}
