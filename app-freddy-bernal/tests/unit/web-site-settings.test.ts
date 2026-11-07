// The site's settings as the public pages show them (web_settings over the client's config, docs/diagnostico.md
// problem 3): one list of accounts for the footer, /canales and the structured data. In production only verified
// accounts; the test version also shows the unverified ones (marked «sin verificar»); an inactive account never (the
// abandoned YouTube channel is never the program's); the institutional portal only when verified; a bad value falls
// back to the start.
import { describe, expect, it } from 'vitest';
import { getClientConfig } from '@/lib/client-config';
import { channelShown, defaultSettings, navLabel, normalizeSite } from '@/lib/web/site-settings';

const opts = (demo: boolean) => ({ demo, indexable: false, baseUrl: 'https://web.prueba.test/' });

describe('los canales: una sola regla en toda la web', () => {
  it('channelShown: nunca inactivo; verificado siempre; sin verificar solo en la versión de prueba', () => {
    expect(channelShown({ verified: true, active: true }, false)).toBe(true);
    expect(channelShown({ verified: false, active: true }, false)).toBe(false);
    expect(channelShown({ verified: false, active: true }, true)).toBe(true);
    expect(channelShown({ verified: true, active: false }, true)).toBe(false);
  });

  it('con la configuración del cliente: la demo muestra las cuentas sin verificar, marcadas; la producción ninguna', () => {
    const demo = normalizeSite({}, opts(true));
    const prod = normalizeSite({}, opts(false));
    expect(demo.accounts.length).toBeGreaterThan(3);
    expect(demo.accounts.every((a) => a.verified === false)).toBe(true);
    expect(prod.accounts).toEqual([]);
    expect(prod.sameAs).toEqual([]);
    expect(demo.sameAs).toEqual([]);
  });

  it('el canal de YouTube viejo (inactivo) nunca sale; el del programa es el activo', () => {
    const demo = normalizeSite({}, opts(true));
    const urls = demo.accounts.map((a) => a.url.toLowerCase());
    expect(urls.some((u) => u.endsWith('/@freddybernaloficial'))).toBe(false);
    expect(demo.youtube?.url).toBe('https://www.youtube.com/@FreddyBernal.oficial');
    expect(normalizeSite({}, opts(false)).youtube).toBeNull();
    for (const inactive of getClientConfig().web.settings['site.social_accounts'].filter((a) => a.active === false)) {
      expect(urls, inactive.handle).not.toContain(inactive.url.toLowerCase());
    }
  });

  it('el portal institucional solo verificado, también en la demo', () => {
    expect(normalizeSite({}, opts(true)).portal).toBeNull();
    const portal = { label: 'Portal', url: 'https://portal.prueba.test', verified: true };
    expect(normalizeSite({ 'site.institutional_portal': portal }, opts(false)).portal?.url).toBe('https://portal.prueba.test');
  });

  it('sameAs: solo cuentas verificadas y activas, sin repetir', () => {
    const accounts = [
      { network: 'x', handle: '@a', url: 'https://x.com/a', verified: true, active: true },
      { network: 'x', handle: '@a', url: 'https://x.com/a', verified: true, active: true },
      { network: 'threads', handle: '@b', url: 'https://www.threads.com/@b', verified: true, active: false },
      { network: 'tiktok', handle: '@c', url: 'https://www.tiktok.com/@c', verified: false, active: true },
    ];
    expect(normalizeSite({ 'site.social_accounts': accounts }, opts(true)).sameAs).toEqual(['https://x.com/a']);
  });

  it('solo https: una cuenta con http o javascript: no tiene la forma y se usa la lista inicial', () => {
    const bad = [{ network: 'x', handle: '@a', url: 'javascript:alert(1)', verified: true, active: true }];
    const s = normalizeSite({ 'site.social_accounts': bad }, opts(false));
    expect(s.accounts.every((a) => a.url.startsWith('https://'))).toBe(true);
  });
});

describe('lo demás de los ajustes', () => {
  it('la navegación por defecto: las ocho secciones en su orden', () => {
    const s = normalizeSite({}, opts(true));
    expect(s.navigation.map((n) => n.label)).toEqual(['Inicio', 'El gobernador', 'Gestión', 'Noticias', 'Reporte Bernal', 'Atención ciudadana', 'Transparencia', 'Canales']);
    expect(navLabel(s, '/actualidad', 'x')).toBe('Noticias');
    expect(navLabel(s, '/reporte-bernal', 'x')).toBe('Reporte Bernal');
    expect(navLabel(s, '/no-esta', 'Otro')).toBe('Otro');
  });

  it('una navegación con una dirección de afuera no tiene la forma: se usa la inicial', () => {
    const s = normalizeSite({ 'site.navigation': [{ label: 'Malo', path: 'https://otro.test' }] }, opts(true));
    expect(s.navigation[0]).toEqual({ label: 'Inicio', path: '/' });
  });

  it('el aviso de la versión de prueba, el de emergencias y la identidad salen de la configuración', () => {
    const s = normalizeSite({}, opts(true));
    expect(s.demoBanner).toBe('Versión de prueba. El contenido es de ejemplo.');
    expect(s.weeklyName).toBe(getClientConfig().brand.weeklyName);
    expect(s.emergencyNotice).toMatch(/no es un servicio de emergencias/i);
    expect(s.wordmark).toContain(s.name);
    expect(s.baseUrl).toBe('https://web.prueba.test');
    expect(s.contacts).toEqual([]);
    expect(s.whatsapp).toBeNull();
    expect(Object.keys(defaultSettings())).toContain('site.identity');
  });
});
