// The attention desk's two legal notices (copy audit F4): one text each, said the same way on every page of /atencion,
// in the form, the receipt and its PDF, the emails and the server's answers. The client's config says the same words
// in «site.emergency_notice» and «site.denuncia_notice» (config/clients/fb.json), so the site's footer and /canales,
// which read those settings, match them; tests/unit/participation-words.test.ts checks both stay equal. No emergency
// number is invented: if the client confirms the official one, it goes here and in those two settings. Each notice is
// a lead sentence (shown in bold) and the rest. Pure: the server and the browser share it.

export const EMERGENCY_LEAD = 'Esto no es un servicio de emergencias.';
export const EMERGENCY_REST = 'Ante una emergencia o si una vida está en peligro, llame a los servicios de emergencia.';
export const EMERGENCY_NOTICE = `${EMERGENCY_LEAD} ${EMERGENCY_REST}`;

export const DENUNCIA_LEAD = 'Su denuncia es confidencial.';
export const DENUNCIA_REST =
  'Solo la leen el personal encargado de denuncias y la coordinación de atención, y nunca se publica. Si se trata de un delito, acuda también a las autoridades competentes.';
export const DENUNCIA_NOTICE = `${DENUNCIA_LEAD} ${DENUNCIA_REST}`;
