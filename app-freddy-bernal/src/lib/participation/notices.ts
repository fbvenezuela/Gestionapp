// The attention desk's two legal notices (copy audit F4): one text each, said the same way on every page of /atencion,
// in the form, the receipt and its PDF, the emails, the server's answers, the site's footer, /canales, the home's
// participation block and the FAQs of the real-content demo. They are not settings of the site: the administrator
// shows them without editing them (/admin/web/ajustes), and the legal pages of config/clients/fb.json quote them word
// for word (tests/unit/participation-words.test.ts checks it). No emergency number is invented: if the client confirms
// the official one, it goes here. Each notice is a lead sentence (shown in bold) and the rest. Pure: the server and the
// browser share it.

export const EMERGENCY_LEAD = 'Esto no es un servicio de emergencias.';
export const EMERGENCY_REST = 'Ante una emergencia o si una vida está en peligro, llame a los servicios de emergencia.';
export const EMERGENCY_NOTICE = `${EMERGENCY_LEAD} ${EMERGENCY_REST}`;

export const DENUNCIA_LEAD = 'Su denuncia es confidencial.';
export const DENUNCIA_REST =
  'Solo la leen el personal encargado de denuncias y la coordinación de atención, y nunca se publica. Si se trata de un delito, acuda también a las autoridades competentes.';
export const DENUNCIA_NOTICE = `${DENUNCIA_LEAD} ${DENUNCIA_REST}`;
