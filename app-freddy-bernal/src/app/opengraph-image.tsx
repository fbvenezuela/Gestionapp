import { ImageResponse } from 'next/og';
import { brand } from '@/lib/client-config';
import { tokenPalette } from '@/lib/web/palette';

// The default image for sharing the website on social networks and messaging apps (pages without a photo of their own;
// at the root so its address is a stable «/opengraph-image»: inside the (web) group Next adds a hash to it;
// docs/diagnostico.md problem 4): the name and the office in letters, in the brand's colors read from tokens.css. No
// photo, no invented logo. Generated once when the app is built (next/og), 1200 × 630.

export const alt = `${brand.clientName} · ${brand.clientTitle}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const c = await tokenPalette();
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: c.ivory,
          padding: '72px 80px',
          color: c.charcoal,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: c.action }} />
          <div style={{ fontSize: 30, fontWeight: 600, color: c.accentInk, letterSpacing: 2, textTransform: 'uppercase' }}>{brand.region}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 112, fontWeight: 700, lineHeight: 1, letterSpacing: -3 }}>{brand.clientName}</div>
          <div style={{ marginTop: 24, fontSize: 52, fontWeight: 500, color: c.text2 }}>{brand.clientTitle}</div>
        </div>
        <div style={{ display: 'flex', height: 14, width: '100%' }}>
          <div style={{ flex: 3, background: c.olive }} />
          <div style={{ flex: 1, background: c.action }} />
        </div>
      </div>
    ),
    size,
  );
}
