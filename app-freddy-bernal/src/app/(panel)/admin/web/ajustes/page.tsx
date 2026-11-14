import { redirect } from 'next/navigation';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { CmsNav } from '@/components/cms/chrome';
import { AccountsForm, ChannelForm, ContactsForm, FooterForm, IdentityForm, NavigationForm, TextSettingForm } from '@/components/cms/settings-forms';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { reviewQueue, siteSettingRows, webCaps } from '@/lib/data/web-admin';
import { ADMIN_WEB } from '@/lib/web/cms/kinds';
import { joinNotes, NOTED_KEYS, NOTES_KEY } from '@/lib/web/cms/setting-notes';
import { defaultSettings } from '@/lib/web/site-settings';
import { DENUNCIA_NOTICE, EMERGENCY_NOTICE } from '@/lib/participation/notices';
import { realContentShown } from '@/lib/web/real-site';

export const metadata = { title: 'Ajustes del sitio · Web' };

// The website's settings (design §3): what the database lets change to Administración, the web's publisher and the boss
// (can_manage_site). A setting that was never saved shows the client's starting value (config/clients/fb.json «web»).
// The two legal notices are shown, not edited: they are one fixed text each (src/lib/participation/notices.ts), the same
// in the footer, /canales, the forms, the receipt, its PDF and the emails, so a change here could not reach them all.
export default async function SiteSettingsPage() {
  const s = await requireRole('admin', 'web_publisher', 'boss', 'writer');
  const data = await db(s, async (sql) => ({ caps: await webCaps(sql), rows: await siteSettingRows(sql), waiting: (await reviewQueue(sql)).length }));
  if (!data.caps.canManageSite) redirect(noPermissionUrl(ADMIN_WEB.home));
  const saved = Object.fromEntries(data.rows.map((r) => [r.key, r.value]));
  const v = { ...defaultSettings(), ...saved } as Record<string, unknown>;
  // The internal notes live apart (not public): each one goes back beside its account or channel.
  const notes = (saved[NOTES_KEY] ?? {}) as Record<string, unknown>;
  for (const key of NOTED_KEYS) v[key] = joinNotes(key, v[key], notes[key]);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title="Ajustes del sitio" subtitle="Lo que se guarda aquí sale en la web al momento (no pasa por aprobación)." back={{ href: ADMIN_WEB.home, label: 'La web' }} />
      <CmsNav current="ajustes" caps={data.caps} waiting={data.waiting} />
      {realContentShown() ? (
        <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[15px] font-medium text-warn">
          Esta demostración muestra el contenido de la web oficial: el nombre, el cargo, las cuentas, los contactos y la franja de aviso quedan como están.
        </p>
      ) : null}
      <NavigationForm value={v['site.navigation']} />
      <FooterForm value={v['site.footer']} />
      <ContactsForm value={v['site.contacts']} />
      <AccountsForm value={v['site.social_accounts']} />
      <ChannelForm settingKey="site.whatsapp_channel" title="Canal de WhatsApp" subtitle="El canal oficial de difusión, cuando exista y esté verificado." value={v['site.whatsapp_channel']} />
      <ChannelForm settingKey="site.institutional_portal" title="Portal institucional" subtitle="El portal de la institución: sale en la web solo verificado." value={v['site.institutional_portal']} />
      <ChannelForm settingKey="site.youtube_channel" title="Canal de YouTube del programa" subtitle="El canal donde sale el programa semanal." value={v['site.youtube_channel']} />
      <IdentityForm identity={v['site.identity']} structured={v['site.structured_data']} />
      <Card>
        <CardHeader
          title="Avisos legales"
          subtitle="Son textos fijos: salen iguales en el pie de la web, en «Canales», en los formularios de Atención, en el comprobante y su PDF y en los correos. No se cambian aquí, para que digan lo mismo en todas partes: si hace falta cambiar uno, avísale a quien instaló la app."
        />
        <CardBody>
          <dl className="flex flex-col gap-3 text-[15px]">
            <div>
              <dt className="font-semibold">Aviso de emergencias</dt>
              <dd className="text-text-2">{EMERGENCY_NOTICE}</dd>
            </div>
            <div>
              <dt className="font-semibold">Aviso de las denuncias</dt>
              <dd className="text-text-2">{DENUNCIA_NOTICE}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>
      <TextSettingForm settingKey="site.demo_banner" title="Aviso de la versión de prueba" subtitle="La franja fija de la versión de prueba (solo sale en la demostración)." value={v['site.demo_banner']} max={200} />
    </div>
  );
}
