// The Site type's new fields (wave 0 of the new website, design §2.8, §5.8 and G2): «Autoridades competentes», the
// official content's read date, the logo slot and the slogan, with their defaults. What the site already had loads
// exactly as before; the authorities are read but cannot be saved in one step (a second person publishes them, WP2).
import { describe, expect, it } from 'vitest';
import {
  AUTHORITIES_KEY, AUTHORITIES_SCHEMA, SITE_SETTING_SCHEMAS, brandIdentityOf, defaultSettings, normalizeSite, publicAuthorities, type Site,
} from '@/lib/web/site-settings';

const opts = (demo: boolean) => ({ demo, indexable: false, baseUrl: 'https://web.prueba.test/' });
const OLD_FIELDS = [
  'demo', 'indexable', 'baseUrl', 'name', 'title', 'region', 'greeting', 'wordmark', 'programName', 'weeklyName', 'navigation', 'legal', 'about',
  'accounts', 'sameAs', 'youtube', 'portal', 'whatsapp', 'contacts', 'demoBanner', 'person', 'organization',
];
const NEW_FIELDS = ['authorities', 'realReadAt', 'identity', 'slogan'];
const old = (s: Site) => Object.fromEntries(OLD_FIELDS.map((k) => [k, s[k as keyof Site]]));
const AUTH = (extra: Record<string, unknown> = {}) => ({ nombre: 'Autoridad de prueba (demo)', telefono: '0800-000-0000', verificado: true, activa: true, ...extra });

describe('los campos nuevos del sitio, con sus valores por omisión', () => {
  it('lo de antes se lee igual: los mismos campos, con o sin los ajustes guardados, y nada nuevo los cambia', () => {
    for (const demo of [true, false]) {
      const empty = normalizeSite({}, opts(demo));
      expect(Object.keys(empty).sort()).toEqual([...OLD_FIELDS, ...NEW_FIELDS].sort());
      // What the seed stores is the starting values: the same site.
      expect(old(normalizeSite(defaultSettings(), opts(demo)))).toEqual(old(empty));
      // A stored list of authorities (good or bad) never touches the rest.
      for (const authorities of [[AUTH()], 'no es una lista', [{ nombre: '' }]]) {
        expect(old(normalizeSite({ ...defaultSettings(), [AUTHORITIES_KEY]: authorities }, opts(demo)))).toEqual(old(empty));
      }
    }
  });

  it('por omisión: ninguna autoridad, sin fecha de lectura, sin logo y sin eslogan (el aspecto de hoy)', () => {
    const s = normalizeSite({}, opts(true));
    expect([s.authorities, s.realReadAt, s.identity, s.slogan]).toEqual([[], null, null, null]);
    expect(normalizeSite({}, { ...opts(true), realReadAt: '2026-11-18T10:17:00.000Z' }).realReadAt).toBe('2026-11-18T10:17:00.000Z');
  });
});

describe('«Autoridades competentes»', () => {
  it('la web muestra solo las verificadas y activas; el teléfono como enlace tel: y el enlace solo https', () => {
    const list = [
      AUTH(),
      AUTH({ nombre: 'Sin verificar (demo)', verificado: false }),
      AUTH({ nombre: 'Inactiva (demo)', activa: false }),
      { nombre: 'Con enlace (demo)', enlace: 'https://autoridad.prueba.test/denuncias', nota: 'Atiende todos los días (demo).', verificado: true, activa: true },
    ];
    expect(publicAuthorities({ [AUTHORITIES_KEY]: list })).toEqual([
      { nombre: 'Autoridad de prueba (demo)', telefono: '0800-000-0000', telHref: 'tel:08000000000', enlace: null, nota: null },
      { nombre: 'Con enlace (demo)', telefono: null, telHref: null, enlace: 'https://autoridad.prueba.test/denuncias', nota: 'Atiende todos los días (demo).' },
    ]);
    expect(normalizeSite({ [AUTHORITIES_KEY]: list }, opts(false)).authorities).toHaveLength(2);
    expect(publicAuthorities({ [AUTHORITIES_KEY]: [AUTH({ telefono: '+58 (276) 000-0000' })] })[0].telHref).toBe('tel:+582760000000');
    // A landline as it is usually written, with its area code in parentheses.
    expect(publicAuthorities({ [AUTHORITIES_KEY]: [AUTH({ telefono: '(0276) 000-0000' })] })[0].telHref).toBe('tel:02760000000');
  });

  it('solo tel: y https: entran: un enlace http o javascript, o un teléfono con letras, no tienen la forma y no se muestra ninguna', () => {
    for (const bad of [{ enlace: 'http://autoridad.prueba.test' }, { enlace: 'javascript:alert(1)' }, { telefono: 'llame ya' }, { telefono: '12' }, { nombre: 'X' }]) {
      expect(AUTHORITIES_SCHEMA.safeParse([AUTH(bad)]).success, JSON.stringify(bad)).toBe(false);
      expect(publicAuthorities({ [AUTHORITIES_KEY]: [AUTH(bad)] })).toEqual([]);
    }
    expect(AUTHORITIES_SCHEMA.safeParse([AUTH({ telefono: '123' })]).success).toBe(true);
  });

  it('no se guardan en un paso desde los ajustes: no están entre los ajustes de la pantalla (las publica una segunda persona)', () => {
    expect(Object.keys(SITE_SETTING_SCHEMAS)).not.toContain(AUTHORITIES_KEY);
  });
});

describe('el espacio del logo (brand.identity) y el eslogan', () => {
  const file = (name: string) => ({ src: `/marca/${name}.png`, src2x: `/marca/${name}@2x.png`, width: 160, height: 48 });

  it('sin brand.identity, el aspecto de hoy; con ella, sus archivos de /marca/ y lo que falte vacío', () => {
    expect(brandIdentityOf({})).toBeNull();
    expect(brandIdentityOf({ identity: null })).toBeNull();
    const id = brandIdentityOf({ identity: { logo: { primary: file('logo-primario'), white: file('logo-blanco') }, slogan: 'Un eslogan de prueba (demo)' } })!;
    expect(id.logo.primary?.src).toBe('/marca/logo-primario.png');
    expect(id.logo.black).toBeNull();
    expect(id.mark).toEqual({ primary: null, white: null });
    expect(id.slogan).toBe('Un eslogan de prueba (demo)');
    expect(id.pattern).toBeNull();
  });

  it('un archivo fuera de /marca/ o que no es PNG, o un valor raro: se ignora y queda el aspecto de hoy', () => {
    for (const bad of [{ logo: { primary: { src: 'https://otro.test/logo.png', width: 10, height: 10 } } }, { logo: { primary: { ...file('logo'), src: '/marca/logo.svg' } } }, 'logo']) {
      expect(brandIdentityOf({ identity: bad }), JSON.stringify(bad)).toBeNull();
    }
  });

  it('la configuración del cliente de hoy no trae identidad: la web sale como hoy', () => {
    const s = normalizeSite({}, opts(true));
    expect(s.identity).toBeNull();
    expect(s.slogan).toBeNull();
  });
});
