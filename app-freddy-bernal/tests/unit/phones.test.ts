// One phone detector for everything that keeps a third party's phone away from Redes and Grabación (revisión de la
// ola D): numbers written with dots, slashes or underscores too, never an amount with dots for thousands or a date.
// All data here is invented.
import { describe, it, expect } from 'vitest';
import { isPhoneRun, mainPhoneMessage, mainTextPhone, phonesIn, withoutPhones } from '@/lib/domain/phones';
import { fichaTab, beforeSpeaking } from '@/lib/domain/ficha-tab';
import { eventFromObra } from '@/lib/domain/ficha-event';
import { dialogContactProblem, dialogPhones, type ObraDialogInput } from '@/lib/domain/obra-dialog';
import { OBRA_FIELDS, REPORT_FIELDS } from '@/lib/domain/ficha-fields';

describe('lo que parece un teléfono', () => {
  it('con puntos, barras o guiones bajos, como se escriben en Venezuela', () => {
    expect(phonesIn('Llamar al enlace 0414.555.0199')).toEqual(['0414.555.0199']);
    expect(phonesIn('Sra. de prueba (vocera) 0276.555.0101 (demo)')).toEqual(['0276.555.0101']);
    expect(phonesIn('0414-555.01.99')).toEqual(['0414-555.01.99']);
    expect(phonesIn('0414/555/0199 o 0414_555_0199')).toEqual(['0414/555/0199', '0414_555_0199']);
    expect(phonesIn('tel:0414.555.0177.')).toEqual(['0414.555.0177']);
    expect(phonesIn('Local 555.0199')).toEqual(['555.0199']);
  });

  it('los de siempre: guiones, espacios, paréntesis, + y once números seguidos', () => {
    expect(phonesIn('Llamar al 0414-123 45 67 o al (0276) 555-1234.')).toEqual(['0414-123 45 67', '(0276) 555-1234']);
    expect(phonesIn('+58 414 555 0199, 04145550199 y +584145550199')).toEqual(['+58 414 555 0199', '04145550199', '+584145550199']);
  });

  it('no son teléfonos: montos con puntos de miles, fechas, cifras sin separar y un RIF', () => {
    for (const s of ['Inversión de 1.500.000 para 1200 familias', '1.500.000 - 2.000.000', '1.500.000.000', 'Bs. 1.500.000,50', '1500000', '(1500000)',
      'desde 15/03/2024', 'el 15.03.2024', 'el 2024-03-15', 'RIF J-30123456-7', 'Muro de 120 m\n3500 m2']) {
      expect(phonesIn(s), s).toEqual([]);
      expect(withoutPhones(s), s).toBe(s);
    }
    expect(isPhoneRun('1.500.000')).toBe(false);
    expect(isPhoneRun('0414.555.0199')).toBe(true);
  });

  it('withoutPhones los quita enteros, sin dejar pedazos', () => {
    expect(withoutPhones('Llamar al enlace 0414.555.0199')).toBe('Llamar al enlace');
    expect(withoutPhones('Avisar al 0414-555.01.99 (demo)')).toBe('Avisar al (demo)');
    expect(withoutPhones('Su hija, al 0414.555.0101')).not.toMatch(/\d/);
  });
});

describe('la pestaña «Ficha de obra», el brief del evento y «Antes de hablar» sin teléfonos con puntos', () => {
  const row = {
    name: 'Puente de prueba (demo)', municipality: 'Torbes', works: 'Puente de 25 m.',
    next_action: 'Coordinar con la vocera, tel. 0414.555.0199', pending_needs: 'Vocera de prueba (demo) 0276.555.0101',
    investment: '1.500.000', marks: {},
  };

  it('Redes y Grabación (sin contactos) no reciben el número', () => {
    const tab = fichaTab('obra', row, null, { contacts: false });
    const text = JSON.stringify(tab);
    for (const phone of ['0414.555.0199', '555.0199', '0276.555.0101', '555.0101']) expect(text, phone).not.toContain(phone);
    expect(text).toContain('1.500.000');
    expect(text).toContain('Coordinar con la vocera');
  });

  it('el evento que nace de la ficha tampoco', () => {
    const e = JSON.stringify(eventFromObra(row));
    expect(e).not.toContain('555.0199');
    expect(e).toContain('Coordinar con la vocera');
  });

  it('«Antes de hablar» nunca muestra un teléfono (la pantalla del iPad puede salir en cámara)', () => {
    const items = beforeSpeaking('obra', { reporter_name: 'Vecina de prueba (demo)', representative: 'Su hija, al 0414.555.0101', liaison_name: '', boss_should_know: 'Llamar al 0414-555.01.99', marks: {} });
    expect(JSON.stringify(items)).not.toMatch(/555|01\.99/);
    expect(items.map((i) => i.value)).toContain('Su hija, al');
  });
});

describe('«Lo que voy a decir» no se guarda con un teléfono con puntos', () => {
  const BRAND = { greeting: 'Buenos días (demo)', closings: ['Seguimos trabajando (demo)'] };
  const input = { name: 'Puente de prueba (demo)', municipality: 'Torbes', investment: '1.500.000', people_count: 1200, families_count: 300 } as unknown as ObraDialogInput;

  it('se rechaza 0414.555.0177; la inversión de la ficha no', () => {
    expect(dialogPhones('Llamen al 0414.555.0177.')).toEqual(['0414.555.0177']);
    expect(dialogContactProblem('Llamen al 0414.555.0177.', input, BRAND, null)).toContain('parece un teléfono (0414.555.0177)');
    expect(dialogContactProblem('Llamen al 0414-555.01.99.', input, BRAND, null)).toContain('parece un teléfono (0414-555.01.99)');
    expect(dialogContactProblem('La inversión es de 1.500.000 bolívares para 1200 personas.', input, BRAND, null)).toBeNull();
  });
});

describe('la parte principal de una ficha nunca lleva un teléfono', () => {
  it('dice qué campo y dónde va el teléfono', () => {
    const hit = mainTextPhone(OBRA_FIELDS, { name: 'Obra (demo)', next_action: 'Llamar al 0414.555.0199', investment: '1.500.000' });
    expect(hit).toEqual({ key: 'next_action', label: 'Próxima acción o compromiso', phones: ['0414.555.0199'] });
    expect(mainPhoneMessage('obra', hit!)).toContain('«Teléfono del enlace comunitario»');
    expect(mainPhoneMessage('obra', hit!)).toContain('escríbela con puntos: 1.500.000');
  });

  it('montos, fechas y los campos de contactos no cuentan', () => {
    expect(mainTextPhone(OBRA_FIELDS, { investment: '1.500.000', problem_since: '15/03/2024', engineer_phone: '0414.555.0199', liaison_phone: '0414-5550199' })).toBeNull();
    expect(mainTextPhone(REPORT_FIELDS, { description: 'Se reúnen 1.200 vecinos.', reporter_phone: '0414.555.0199' })).toBeNull();
    expect(mainTextPhone(REPORT_FIELDS, { observations: 'Contacto: 0276.555.0101' })?.key).toBe('observations');
  });
});
