import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { createElement } from 'react';
import { DigestEmail } from '@emails/templates';
import { buildDigest, digestText, type DigestData } from '@/lib/push/digest';
import { looksLikeDateTime } from '@/lib/push/text';

const data: DigestData = {
  inReview: [
    { title: 'Video de la cancha techada (24/10 a las 9:30)', red: false },
    { title: 'Aclaratoria sobre el servicio de agua', red: true },
  ],
  tweetsToApprove: 12,
  changesRequested: ['Carrusel del puente, viernes 14:00', 'Portada del operativo de salud'],
  tweetStock: { daysLeft: 4, low: true },
  eventsWithoutBrief: ['Entrega de la cancha techada de El Mirador', 'Visita al liceo el 25 de octubre', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete'],
};

describe('resumen diario por correo', () => {
  it('cada rol ve solo lo suyo', () => {
    const sup = buildDigest(['supervisor'], data)!;
    expect(sup.sections.map((s) => s.line)).toEqual(['2 piezas por aprobar', '12 tweets por aprobar']);
    const boss = buildDigest(['boss'], data)!;
    expect(boss.sections.map((s) => s.line)).toEqual(['1 pieza en rojo espera por ti']);
    expect(boss.sections[0].titles).toEqual(['Aclaratoria sobre el servicio de agua']);
    const social = buildDigest(['social'], data)!;
    expect(social.sections.map((s) => s.line)).toEqual(['2 piezas con cambios pedidos', 'Quedan 4 días de tweets programados']);
    const disp = buildDigest(['dispatch'], data)!;
    expect(disp.sections[0].line).toBe('7 eventos con la ficha técnica incompleta');
    expect(disp.sections[0].titles).toHaveLength(5);
    expect(disp.sections[0].more).toBe(2);
    expect(disp.subject).toBe('Tu resumen: 7 cosas esperan por ti');
  });

  it('sin pendientes no hay correo', () => {
    const empty: DigestData = { inReview: [], tweetsToApprove: 0, changesRequested: [], tweetStock: { daysLeft: 20, low: false }, eventsWithoutBrief: [] };
    expect(buildDigest(['social', 'supervisor', 'dispatch', 'boss'], empty)).toBeNull();
    expect(buildDigest(['camera'], data)).toBeNull();
    expect(buildDigest(['secretary'], data)).toBeNull();
  });

  it('nunca lleva fechas ni horas, ni en los títulos', async () => {
    for (const roles of [['supervisor'], ['social'], ['dispatch'], ['admin'], ['boss']]) {
      const dg = buildDigest(roles, data)!;
      const text = digestText(dg);
      expect(looksLikeDateTime(text.replace(/Quedan \d+ días de tweets programados/, '')), text).toBe(false);
      expect(text).not.toMatch(/\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}|octubre|viernes/i);
      const html = await render(createElement(DigestEmail, { appName: 'App', name: 'Ana', sections: dg.sections, url: 'https://app.example.test/hoy' }), { plainText: true });
      expect(html).not.toMatch(/\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}|octubre|viernes/i);
      for (const s of dg.sections) expect(html).toContain(s.line);
    }
  });
});
