// The importer of the old site (scripts/web-import/pii.ts): emails, phone numbers and ID card numbers come out of the
// texts with a mark, and nothing that only looks like one (an amount, a date, a year range, a company's RIF) is
// touched. Every address, number and name here is invented.
import { describe, it, expect } from 'vitest';
import { hrefCarriesPii, isRealPhone, realPhonesIn, scrubText } from '../../scripts/web-import/pii';
import { REMOVED_MARKS } from '@/lib/web/import-marks';

const { email: EMAIL, phone: PHONE, id: ID } = REMOVED_MARKS;

describe('correos', () => {
  it('se quitan, también escritos con (arroba) o [at], y queda la marca', () => {
    expect(scrubText('Inscripciones: persona.inventada@correo.test hasta el viernes.')).toEqual({
      text: `Inscripciones: ${EMAIL} hasta el viernes.`,
      found: { emails: 1, phones: 0, ids: 0 },
    });
    expect(scrubText('Escribir a club_deportivo (arroba) correo.test o a club[at]otro.test').text).toBe(`Escribir a ${EMAIL} o a ${EMAIL}`);
    expect(scrubText('MAYUSCULAS@CORREO.TEST.').text).toBe(`${EMAIL}.`);
  });

  it('una cuenta de una red (@usuario) o algo sin dominio no es un correo', () => {
    for (const s of ['Síguelo en @CuentaInventada', 'usuario@localhost', 'precio 3@4', 'a @ b']) expect(scrubText(s).text, s).toBe(s);
  });
});

describe('teléfonos', () => {
  it('los de Venezuela, escritos de todas las formas, con su 0 o con el 58', () => {
    for (const p of ['0414-555.01.99', '(0276) 555-1234', '+58 414 555 0199', '04145550199', '0276.555.0101', '0800-555-0123', '+57 1 555 0199']) {
      expect(scrubText(`Llamar al ${p} para más datos`).text, p).toBe(`Llamar al ${PHONE} para más datos`);
    }
    expect(scrubText('Al 0414-555.01.99 o al 0424 555 0198').found.phones).toBe(2);
  });

  it('no son teléfonos: montos, fechas, años, expedientes, un RIF ni cifras de una nota', () => {
    for (const s of [
      'Inversión de 1.500.000 bolívares para 1200 familias', 'Bs. 2.500.000,50', 'el 15/03/2024', 'el 2024-03-15', 'plan 2019-2025',
      'periodo 2020 - 2026', 'RIF J-30123456-7', 'expediente 2026-000123', '1500000', 'código 2026000123', 'la ruta 7 tiene 12 km',
    ]) {
      expect(realPhonesIn(s), s).toEqual([]);
      expect(scrubText(s).text, s).toBe(s);
    }
    expect(isRealPhone('2761234567')).toBe(false);
    expect(isRealPhone('02761234567')).toBe(true);
  });
});

describe('cédulas', () => {
  it('con su letra (V- o E-) o después de «C.I.» o «cédula»: la palabra queda, el número no', () => {
    expect(scrubText('el ciudadano, V-12.345.678, fue atendido').text).toBe(`el ciudadano, ${ID}, fue atendido`);
    expect(scrubText('titular de la C.I. 12.345.678').text).toBe(`titular de la C.I. ${ID}`);
    expect(scrubText('cédula de identidad N° V-9.876.543.').text).toBe(`cédula de identidad N° ${ID}.`);
    expect(scrubText('E-81234567').found.ids).toBe(1);
  });

  it('un RIF de empresa o una versión no son cédulas', () => {
    for (const s of ['RIF J-30123456-7', 'versión 2.0.1', 'Vitamina D3', 'TV 1234567 canales']) expect(scrubText(s).text, s).toBe(s);
  });
});

describe('enlaces que llevan datos', () => {
  it('mailto, tel, WhatsApp, un correo o un teléfono dentro de la dirección', () => {
    expect(hrefCarriesPii('mailto:alguien@correo.test')).toBe('emails');
    expect(hrefCarriesPii('tel:04145550199')).toBe('phones');
    expect(hrefCarriesPii('https://wa.me/584145550199')).toBe('phones');
    expect(hrefCarriesPii('https://api.whatsapp.com/send?phone=584145550199')).toBe('phones');
    expect(hrefCarriesPii('https://ejemplo.test/form?correo=alguien%40correo.test')).toBe('emails');
    expect(hrefCarriesPii('https://ejemplo.test/llamar?n=0414-555-0199')).toBe('phones');
  });

  it('una dirección normal, con números largos de una red o de una foto, no', () => {
    for (const h of [
      'https://www.facebook.com/perfil-inventado-100079248706206', 'https://x.com/cuenta/status/1453456789012345678', '/2026/11/una-nota',
      'https://sitio-viejo.test/wp-content/uploads/2026/11/photo_5145562651487309270_w.jpg', 'https://ejemplo.test/2026-11-06/nota',
    ]) {
      expect(hrefCarriesPii(h), h).toBeNull();
    }
  });
});
