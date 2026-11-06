import { redirect } from 'next/navigation';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { CmsNav } from '@/components/cms/chrome';
import { AccountsForm, ChannelForm, ContactsForm, FooterForm, IdentityForm, NavigationForm, TextSettingForm } from '@/components/cms/settings-forms';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { reviewQueue, siteSettingRows, webCaps } from '@/lib/data/web-admin';
import { ADMIN_WEB } from '@/lib/web/cms/kinds';
import { joinNotes, NOTED_KEYS, NOTES_KEY } from '@/lib/web/cms/setting-notes';
import { defaultSettings } from '@/lib/web/site-settings';

export const metadata = { title: 'Ajustes del sitio · Web' };

// The website's settings (design §3): what the database lets change to Administración, the web's publisher and the boss
// (can_manage_site). A setting that was never saved shows the client's starting value (config/clients/fb.json «web»).
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
      <NavigationForm value={v['site.navigation']} />
      <FooterForm value={v['site.footer']} />
      <ContactsForm value={v['site.contacts']} />
      <AccountsForm value={v['site.social_accounts']} />
      <ChannelForm settingKey="site.whatsapp_channel" title="Canal de WhatsApp" subtitle="El canal oficial de difusión, cuando exista y esté verificado." value={v['site.whatsapp_channel']} />
      <ChannelForm settingKey="site.institutional_portal" title="Portal institucional" subtitle="El portal de la institución: sale en la web solo verificado." value={v['site.institutional_portal']} />
      <ChannelForm settingKey="site.youtube_channel" title="Canal de YouTube del programa" subtitle="El canal donde sale el programa semanal." value={v['site.youtube_channel']} />
      <IdentityForm identity={v['site.identity']} structured={v['site.structured_data']} />
      <TextSettingForm settingKey="site.emergency_notice" title="Aviso de emergencias" subtitle="Sale en cada formulario de Atención: esto no es un servicio de emergencias." value={v['site.emergency_notice']} max={400} />
      <TextSettingForm settingKey="site.denuncia_notice" title="Aviso de las denuncias" subtitle="Lo que se le dice a quien hace una denuncia." value={v['site.denuncia_notice']} max={400} />
      <TextSettingForm settingKey="site.demo_banner" title="Aviso de la versión de prueba" subtitle="La franja fija de la versión de prueba (solo sale en la demostración)." value={v['site.demo_banner']} max={200} />
    </div>
  );
}
