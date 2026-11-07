// The attention desk's legal notices (copy audit F4): one text each, said the same way on every page of /atencion, in
// the form, the receipt and its PDF, the emails, the server's answers, the site's footer, /canales, the home's
// participation block and the FAQs of the real-content demo. They are not settings of the site: the administrator
// shows them without editing them (/admin/web/ajustes), and the legal pages of config/clients/fb.json quote them word
// for word (tests/unit/participation-words.test.ts checks it). No emergency number is invented: if the client confirms
// the official one, it goes here. The two main ones are a lead sentence (shown in bold) and the rest. Pure: the server
// and the browser share it.

export const EMERGENCY_LEAD = 'Esto no es un servicio de emergencias.';
export const EMERGENCY_REST = 'Ante una emergencia o si una vida está en peligro, llame a los servicios de emergencia.';
export const EMERGENCY_NOTICE = `${EMERGENCY_LEAD} ${EMERGENCY_REST}`;

// Said of every denuncia (also where the reader has not made one: the FAQ, the conditions, /atencion). Its content is
// never published; «Casos atendidos» says only that one was attended, and in which municipality (PUBLICATION_NOTICE).
export const DENUNCIA_LEAD = 'Las denuncias son confidenciales.';
export const DENUNCIA_REST =
  'Solo las leen el personal encargado de denuncias y la coordinación de atención. Su contenido nunca se publica. Si se trata de un delito, acuda también a las autoridades competentes.';
export const DENUNCIA_NOTICE = `${DENUNCIA_LEAD} ${DENUNCIA_REST}`;

/** What is published of a request: the privacy notice, the conditions, /atencion and the form say it this way. */
export const PUBLICATION_NOTICE =
  'Su solicitud no se publica. Cuando se resuelve, puede publicarse un resumen sin datos personales en «Casos atendidos», con sus iniciales o, si usted lo autoriza, con su nombre.';

/** Against impersonation (/canales, /atencion). */
export const ANTI_FRAUD_NOTICE =
  'Ningún funcionario de la Gobernación solicita dinero, claves, códigos de verificación ni datos bancarios. Desconfíe de quien lo haga en su nombre.';

/** Where a denuncia happened: the form's place step, the form without JavaScript, the server's check and /atencion. */
export const DENUNCIA_PLACE = 'En una denuncia se indica solo el municipio y el sector, sin dirección exacta ni ubicación en el mapa.';

/** What happens to the photos people attach (the form and its files' hint). */
export const PHOTO_CLEANING = 'Antes de enviarlas, se eliminan de las fotos la ubicación y los datos de la cámara.';
