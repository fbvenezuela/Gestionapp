// «Guía de la web para el equipo» (docs/GUIA-WEB.md): what the public web has, section by section, the citizen's
// journey, the test version and who does what. Its chapters are parts 1, 2, 7 and 3 of «Guía de la web y sus flujos»
// (chapter 3 is part 7 and chapter 4 is part 3; 5, 6 and 7 are 3.9 to 3.11 and 8 is 7.8): each section's `pdf`.
// Ported 1:1 from the doc (WF-C, design §4(a)): one source for the doc (src/lib/guides/render-web-md.ts writes it back
// byte for byte), «Ayuda y guías» and 360. Never edit the .md: edit this and run `npm run docs:guides`. Text with the
// screen's labels in «» (exact), the client's words as huecos ([PROGRAMA], [SEMANARIO], [WEB_OFICIAL]) that
// fillClientWords() fills from config/clients/<brand>.json. `wrap`: only for the doc (the length of each of its lines);
// change a text and drop its `wrap`. 360's fields of each section (what, items, tasks, cannot, rules, faq, easy, example,
// why) are filled in the next round; `audience` says to whom 360 explains it (design §4(d)).
import type { WebDoc } from '../types';

export const GUIA_WEB: WebDoc = {
  id: 'guia-web',
  file: 'docs/GUIA-WEB.md',
  title: 'Guía de la web para el equipo',
  date: '09/11/2026',
  width: 119,
  sections: [
    {
      id: 'guia-web',
      pdf: '0.0',
      title: 'Guía de la web para el equipo',
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: 'Esta guía cuenta qué tiene la web del gobernador, sección por sección, y cómo la usa la gente. También dice qué hace cada rol en el panel. El detalle de cada pantalla del panel está en dos manuales: el **manual de la web** (escribir y publicar) y el **manual de atención** (atender solicitudes).', wrap: [110, 118, 81] },
        { kind: 'p', text: 'Hoy la web y el panel se usan en una **versión de prueba** (ver [§prueba-que-es]). Google no la muestra. Todavía no está abierta al público. Lo que va entre comillas, «así», es el texto exacto que sale en la pantalla.' },
      ],
    },
    {
      id: 'la-web',
      pdf: '1.0',
      title: 'La web, sección por sección',
      heading: { level: 2, num: '1.' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'note',
          paras: [
            '**Las capturas de esta guía.** Usan noticias, fotos y textos de ejemplo, para que en la guía no aparezca ninguna noticia real. En la web y en el panel se ven las noticias, las columnas de opinión, las fotos, la biografía y el Semanario de la web oficial (ver [§prueba-real-y-ejemplo]).',
          ],
        },
        { kind: 'p', text: 'Todas las páginas tienen el mismo marco:' },
        {
          kind: 'list',
          items: [
            '**Arriba:** el nombre y el cargo del gobernador, y los dos botones de la gente: **«Hacer un reporte»** (en naranja) y **«Consultar mi solicitud»**. En el teléfono, los botones van en su propia fila, debajo del nombre. En la computadora van al lado del nombre. En el teléfono, las secciones se abren con **«Menú»** y se cierran con «Cerrar». En la computadora van en una barra, debajo del nombre.',
            '**El menú:** las secciones de la web. Hoy son «Inicio», «El gobernador», «Noticias», «[PROGRAMA]», «Atención ciudadana», «Transparencia» y «Canales». El menú se cambia en «Ajustes del sitio» → «Navegación». Ahí se agrega «Gestión y obras» cuando haya obras publicadas (ver [§gestion-y-obras]).',
            '**Abajo, el pie:** los mismos dos botones. Debajo, el aviso «Esto no es un servicio de emergencias. Ante una emergencia o si una vida está en peligro, llame a los servicios de emergencia.». Después vienen «Secciones» (el menú otra vez) y «Canales oficiales», con el enlace «Cómo identificar las cuentas oficiales». Al final van las páginas legales y «Acceso del personal», que lleva al panel.',
            '**La franja de la versión de prueba:** «Versión de prueba en revisión. No es el sitio oficial.». Sale arriba de cada página y se repite al final del pie. No se puede cerrar (ver [§la-franja]).',
          ],
        },
        { kind: 'p', text: 'Cada sección de abajo dice qué ve la persona y de qué pantalla del panel sale. También dice qué pasa cuando no hay datos. El párrafo **Hoy** de cada sección cuenta lo que se ve ahora, en la versión de prueba. El público nunca ve un espacio vacío ni un «Por completar»: eso solo sale en la «Vista previa» del panel.' },
      ],
    },
    {
      id: 'inicio',
      pdf: '1.1',
      title: 'Inicio',
      heading: { level: 3, num: '1.1' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: '**Qué ve la persona.** La portada se arma por bloques. Hoy salen en este orden:' },
        {
          kind: 'steps',
          items: [
            '**El título grande:** el nombre del gobernador y, debajo, su cargo. Al lado va su foto, la de la portada de la web oficial.',
            '**«Atención ciudadana»:** el botón grande «Hacer un reporte» y cuatro más: «Hacer una petición», «Enviar una observación», «Hacer una denuncia» y «Consultar mi solicitud». Debajo dice «También puede enviar sugerencias y reconocimientos.» y repite el aviso de emergencias.',
            '**«Últimas publicaciones»:** la noticia más nueva en grande y tres más, con «Ver todas las noticias».',
            '**«Opinión»:** dos columnas, las más nuevas, una al lado de la otra, con «Ver más artículos de opinión».',
            '**«[SEMANARIO]»:** la última edición, con «Ver todas las ediciones».',
            '**«Canales oficiales»:** las cuentas, con «Cómo identificar las cuentas oficiales».',
          ],
        },
        { kind: 'p', text: 'Entre «Atención ciudadana» y «Últimas publicaciones» va el bloque **«[PROGRAMA]»**: la última emisión, con «Ver todas las emisiones» y el enlace al canal de YouTube. Hoy no aparece, porque todavía no hay emisiones publicadas (ver [§programa]).' },
        { kind: 'p', text: 'Hay cuatro bloques más. Hoy están ocultos, porque todavía no hay contenido real para ellos:' },
        {
          kind: 'list',
          items: [
            '**«Gestión en cifras»:** cada cifra con su fuente y su fecha.',
            '**«Casos atendidos»:** los tres últimos, con «Ver todos los casos».',
            '**«Gestión y obras»:** las últimas tres obras, con «Ver todas las obras».',
            '**«Avisos de servicio»:** solo los vigentes, cada uno con «Actualizado el …» y «Vigente hasta el …».',
          ],
        },
        { kind: 'p', text: '**De dónde sale.** Qué bloques salen, y en qué orden, se decide en «Web» → «Páginas» → «Inicio» (ver el manual de la web, punto 6). Ahí, un bloque oculto lleva la marca «Oculto». Con «Mostrar» vuelve a salir. Lo de adentro de cada bloque sale de su propia pantalla:', wrap: [95, 115, 53] },
        {
          kind: 'table',
          head: ['Bloque', 'Lo llena'],
          rows: [
            ['El título grande', 'El bloque «Portada con foto» de la misma página'],
            ['«[PROGRAMA]»', '«[PROGRAMA]» (los episodios)'],
            ['«Últimas publicaciones»', '«Noticias y comunicados»'],
            ['«Opinión»', '«Noticias y comunicados», las de tipo «Opinión»'],
            ['«[SEMANARIO]»', '«Documentos», con la categoría «Semanario»'],
            ['«Canales oficiales»', '«Ajustes del sitio»'],
            ['«Gestión en cifras»', '«Indicadores»'],
            ['«Casos atendidos»', 'La coordinación, desde cada caso en «Atención»'],
            ['«Gestión y obras»', '«Obras y acciones»'],
            ['«Avisos de servicio»', '«Avisos de servicio»'],
          ],
        },
        { kind: 'p', text: '**Sin datos.** Un bloque sin contenido no aparece. Sin foto, el título grande sale solo, a lo ancho. Una cifra sin fuente nunca sale. Un aviso vencido deja de salir solo.' },
      ],
    },
    {
      id: 'el-gobernador',
      pdf: '1.2',
      title: 'El gobernador',
      heading: { level: 3, num: '1.2' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: '**Qué ve la persona.** Arriba, el título grande con el nombre, el cargo y la foto del gobernador. Debajo van la biografía y la trayectoria. Después, «Material para la prensa»: cada documento con «Ver el PDF», y el enlace «Ver todos los documentos». Al final, «Última actualización» con su fecha.', wrap: [111, 113, 69] },
        { kind: 'p', text: '**De dónde sale.** «Web» → «Páginas» → «El gobernador». El material sale de «Documentos», con la categoría «Material para la prensa».' },
        { kind: 'p', text: '**Sin datos.** Un espacio «Por completar» no sale al público. Sin documentos, no sale «Material para la prensa». Una página sin publicar dice «Página en preparación.».' },
        { kind: 'p', text: '**Hoy.** La foto es la de la web oficial. Debajo salen «Biografía», «Elección y toma de posesión» y «Condecoraciones», traídas de la web oficial. Después va una línea «Fuente:» que enlaza la web oficial. «Material para la prensa» está oculto: la web oficial no tiene ese material.' },
      ],
    },
    {
      id: 'gestion-y-obras',
      pdf: '1.3',
      title: 'Gestión y obras',
      heading: { level: 3, num: '1.3' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: '**Qué ve la persona.** Dos vistas de las mismas obras. «Obras» trae tarjetas con su estado («Anunciado», «En ejecución» o «Concluido») y los filtros «Municipio», «Categoría» y «Estado», con el botón «Filtrar». «Línea de tiempo» las ordena por mes y se filtra con «Desde» y «Hasta».', wrap: [108, 118, 53] },
        { kind: 'p', text: 'Cada obra tiene su ficha: «Descripción», «Registro fotográfico», «Ubicación», «Beneficiarios» y «Organismo responsable». La «Inversión» y el «Avance» salen solo con su fuente. Siguen las fechas y la «Última actualización». Al lado está el botón «Enviar una observación sobre esta obra».' },
        { kind: 'p', text: '**De dónde sale.** «Web» → «Obras y acciones».' },
        { kind: 'p', text: '**Sin datos.** «Aún no hay obras publicadas.». Con filtros sin resultado: «No hay obras con esos filtros.». Lo que le falta a una ficha simplemente no sale.' },
        { kind: 'p', text: '**Hoy.** Todavía no hay obras publicadas: la página dice «Aún no hay obras publicadas.». Por eso no está en el menú. Se agrega en «Ajustes del sitio» → «Navegación» cuando haya obras.', wrap: [116, 66] },
      ],
    },
    {
      id: 'noticias',
      pdf: '1.4',
      title: 'Noticias',
      heading: { level: 3, num: '1.4' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: '**Qué ve la persona.** Arriba, el buscador: «Buscar», «Tipo» y el botón «Buscar». Debajo, los temas más usados, cada uno como un botón. La noticia más nueva sale en grande y las demás en lista. Al final está el enlace al «[SEMANARIO]» («Ediciones en PDF.»).' },
        {
          kind: 'list',
          items: [
            'En «Tipo» se elige «Noticia», «Comunicado», «Opinión» o «Entrevista».',
            'Cada nota tiene su página con su fecha, su firma, su foto y su texto. Al final van las «Fuentes» y los temas, y el botón «Enviar una observación». Debajo salen «Noticias relacionadas».',
            'Una columna de «Opinión» dice «Observaciones sobre este artículo» y muestra «Otros artículos de opinión».',
            'El Semanario tiene su propia página, con cada edición y su «Ver el PDF».',
          ],
        },
        { kind: 'p', text: '**De dónde sale.** «Web» → «Noticias y comunicados». El Semanario sale de «Documentos», con la categoría «Semanario».' },
        { kind: 'p', text: '**Sin datos.** «Aún no hay noticias publicadas.». Una búsqueda sin resultado: «No hay resultados para esa búsqueda.». Sin ediciones: «Aún no hay ediciones publicadas.». Los temas salen solo cuando hay más de uno.' },
        { kind: 'p', text: '**Hoy.** Salen las noticias y las columnas de «Opinión» más recientes de la web oficial, con sus fotos. Los temas son las secciones de la web oficial. Cada nota termina con «Publicado originalmente en …» y su dirección en la web oficial. El Semanario trae su última edición, con el PDF.', wrap: [117, 103, 64] },
      ],
    },
    {
      id: 'programa',
      pdf: '1.5',
      title: '[PROGRAMA]',
      heading: { level: 3, num: '1.5' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: '**Qué ve la persona.** Arriba, el nombre del programa y una línea que dice que es el programa semanal del gobernador. Debajo va el enlace al canal de YouTube. Primero sale la «Última emisión» y después las «Emisiones anteriores». El video carga solo cuando la persona lo toca.', wrap: [117, 120, 37] },
        { kind: 'p', text: '**De dónde sale.** «Web» → «[PROGRAMA]» (un episodio por emisión). El canal se cambia en «Ajustes del sitio» → «Canal de YouTube del programa».' },
        { kind: 'p', text: '**Sin datos.** Una emisión sin video sale con su título y su fecha, sin un reproductor vacío. Sin emisiones, la página lleva al canal: «Las emisiones de [PROGRAMA] se publican en el canal oficial de YouTube.», con el botón «Ver las emisiones en YouTube». Sin canal, dice «Aún no hay emisiones publicadas.».' },
        { kind: 'p', text: '**Hoy.** Todavía no hay emisiones publicadas. La página lleva al canal oficial de YouTube, como en la captura. En el panel, la tarjeta «[PROGRAMA]» de «La web» dice «Nada todavía».' },
      ],
    },
    {
      id: 'atencion-ciudadana',
      pdf: '1.6',
      title: 'Atención ciudadana',
      heading: { level: 3, num: '1.6' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: '**Qué ve la persona.** Arriba, un menú propio: «Información general», «Nueva solicitud», «Consultar mi solicitud» y «Casos atendidos». Después vienen los botones «Nueva solicitud» y «Consultar mi solicitud», con el aviso de emergencias debajo. También sale un «Ejemplo de comprobante». Más abajo, por partes:' },
        {
          kind: 'list',
          items: [
            '«Tipos de solicitud»: los seis, cada uno abre el formulario en su tipo.',
            '«Procedimiento»: cuatro pasos, de «Envío de la solicitud» a «Seguimiento».',
            '«Estados de una solicitud»: el camino de siempre, de «Recibida» a «Resuelta», con lo que quiere decir cada paso. También nombra «Requiere información» y «Derivada».',
            '«Denuncias confidenciales», con el botón «Hacer una denuncia».',
            '«Preguntas frecuentes».',
            '«Otros canales».',
            '«Casos atendidos», con el botón «Ver casos atendidos».',
          ],
        },
        { kind: 'p', text: 'Sus otras páginas, en el mismo menú:' },
        {
          kind: 'list',
          items: [
            '«Nueva solicitud»: el formulario (ver [§hacer-un-reporte]).',
            '«Consultar mi solicitud»: la consulta (ver [§consultar]).',
            '«Casos atendidos»: las solicitudes resueltas que se publican (ver [§ver-casos-atendidos]).',
          ],
        },
        { kind: 'p', text: '**De dónde sale.** Los textos de esta página no se cambian desde el panel. Lo que sí se cambia:' },
        {
          kind: 'list',
          items: [
            'Las preguntas: «Web» → «Preguntas frecuentes», grupo «Atención ciudadana».',
            'Los contactos: «Ajustes del sitio» → «Contactos institucionales». Solo salen los marcados «Verificado».',
            'Los casos: los publica la coordinación desde «Atención».',
          ],
        },
        { kind: 'p', text: 'En «Web» → «Páginas» también aparece «Atención ciudadana», con el chip «No sale en la web». No la uses: lo que se escribe ahí no sale en la web (su editor lo avisa arriba: «Esta página no sale en la web», sin «Vista previa» ni «Enviar a aprobación»).' },
        { kind: 'p', text: '**Sin datos.** Sin preguntas, no sale esa parte. Sin contactos verificados, «Otros canales» muestra «Canal de atención»: «Las solicitudes se reciben únicamente a través de este sitio.», seguido del aviso contra estafas. Sin casos publicados, no salen «Casos atendidos» ni su botón del menú.', wrap: [120, 120, 48] },
        { kind: 'p', text: '**Hoy.** Salen siete preguntas frecuentes sobre cómo funciona la atención. No vienen de la web oficial: ya venían escritas en la app, y se cambian en «Web» → «Preguntas frecuentes». Todavía no hay casos publicados, así que «Casos atendidos» no sale en el menú de la página.' },
      ],
    },
    {
      id: 'transparencia',
      pdf: '1.7',
      title: 'Transparencia',
      heading: { level: 3, num: '1.7' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: '**Qué ve la persona.** La página se llama «Documentos y cifras» y tiene dos partes:' },
        {
          kind: 'list',
          items: [
            '«Documentos»: el buscador («Buscar», «Categoría» y el botón «Buscar») y la lista. Cada documento tiene su «Ver el PDF».',
            '«Estadísticas de atención ciudadana»: se elige el período («Desde el inicio», «Este año» o «Últimos 30 días»). Salen «Recibidas», «Resueltas», «Pendientes», «Vencidas», «Primera respuesta» y «Resolución». Siguen las cuentas por tipo, por estado, por categoría y por municipio. Debajo están las «Definiciones».',
          ],
        },
        { kind: 'p', text: '**De dónde sale.** Los documentos, de «Web» → «Documentos» (todas las categorías). Las cifras las cuenta la app con las solicitudes de Atención: nadie las escribe.', wrap: [115, 47] },
        { kind: 'p', text: '**Sin datos.** «Aún no hay documentos publicados.». Sin solicitudes en el período: «No hay solicitudes en este período.». Las denuncias no cuentan por categoría ni por municipio.' },
        { kind: 'p', text: '**Hoy.** En «Documentos» está la última edición del Semanario. Las cifras salen de las solicitudes de ejemplo (ver [§prueba-real-y-ejemplo]). Por eso, antes de la primera cifra dice «Cifras de ejemplo de la versión de prueba, calculadas con solicitudes inventadas.».' },
      ],
    },
    {
      id: 'canales',
      pdf: '1.8',
      title: 'Canales',
      heading: { level: 3, num: '1.8' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: '**Qué ve la persona.** «Canales oficiales», con una tarjeta por cuenta. La cuenta confirmada lleva la marca «verificada». Si están verificados, salen también el «Portal institucional» y los «Contactos institucionales». Después viene «Cómo identificar las cuentas oficiales», con cuatro consejos. Uno es el aviso contra estafas: «Ningún funcionario de la Gobernación solicita dinero, claves, códigos de verificación ni datos bancarios. Desconfíe de quien lo haga en su nombre.». Al final va el aviso de emergencias.', wrap: [107, 118, 120, 119, 46] },
        { kind: 'p', text: '**De dónde sale.** «Ajustes del sitio»: «Cuentas en redes», «Canal de YouTube del programa», «Canal de WhatsApp», «Portal institucional» y «Contactos institucionales».' },
        { kind: 'p', text: '**Sin datos.** «Las cuentas oficiales se publicarán próximamente.».' },
        { kind: 'p', text: '**Hoy.** La versión de prueba muestra también las cuentas que faltan por confirmar. Arriba va una sola línea: «Estas cuentas están en proceso de confirmación.» o «Las cuentas sin la marca de verificación están en proceso de confirmación.». La marca «verificada» ya viene puesta y no se cambia (ver [§prueba-lo-que-no-se-cambia]). Cuando la web abra al público, el equipo marca «Verificada» en «Ajustes del sitio» → «Cuentas en redes». Entonces saldrán solo las cuentas activas y verificadas.' },
      ],
    },
    {
      id: 'paginas-legales',
      pdf: '1.9',
      title: 'Las páginas legales',
      heading: { level: 3, num: '1.9' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: 'Son tres y salen en el pie: «Aviso de privacidad», «Condiciones de participación» y «Accesibilidad».' },
        { kind: 'p', text: '**Qué ve la persona.** El texto por partes y, al final, «Texto sujeto a revisión jurídica.». En «Accesibilidad» dice «Texto sujeto a revisión.». Debajo va la «Última actualización».' },
        { kind: 'p', text: '**De dónde sale.** «Web» → «Páginas», cada una por su nombre. Todas esperan la revisión jurídica: tienen espacios «Por completar antes de publicar: …».' },
        { kind: 'p', text: '**Sin datos.** Los espacios «Por completar» no salen. Una página sin publicar dice «Página en preparación.».' },
      ],
    },
    {
      id: 'direccion-que-no-existe',
      pdf: '1.10',
      title: 'Una dirección que no existe',
      heading: { level: 3, num: '1.10' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: '**Qué ve la persona.** «Esta página no existe» y «La dirección puede estar incompleta o la página ya no está disponible.». Debajo están los botones «Ir al inicio» y «Ver noticias», y el enlace «Consultar mi solicitud».' },
        {
          kind: 'list',
          items: [
            'Una dirección de la web oficial de hoy, como la de una noticia vieja, lleva sola a su página nueva cuando tiene una redirección (ver el manual de la web, punto 14). Las noticias copiadas de la web oficial ya la tienen: en «Redirecciones» salen con la etiqueta «De la web vieja», que quiere decir que se hicieron solas al copiar la noticia.',
            'Si una página no carga por una falla, dice «No se pudo cargar la página», con «Intentar de nuevo» e «Ir al inicio».',
          ],
        },
      ],
    },
    {
      id: 'recorrido',
      pdf: '2.0',
      title: 'El recorrido del ciudadano',
      heading: { level: 2, num: '2.' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: 'Esto es lo que ve la persona que escribe. No necesita cuenta ni contraseña. Todo funciona en el teléfono. La web le habla de usted. En su consulta, cada respuesta sale como «Respuesta de Atención ciudadana».' },
      ],
    },
    {
      id: 'hacer-un-reporte',
      pdf: '2.1',
      title: 'Hacer un reporte (los cuatro pasos)',
      heading: { level: 3, num: '2.1' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'steps',
          items: [
            'Toca **«Hacer un reporte»**, arriba en naranja. Se abre el formulario con el título «Hacer un reporte» y la línea «El formulario tiene cuatro pasos. No necesita registrarse.». En la versión de prueba, arriba dice «Versión de prueba. No escriba datos reales.».',
            '**Paso 1, «Tipo de solicitud».** En «Seleccione una opción» ya está marcado «Reporte». Elige la «Categoría», por ejemplo «Agua». Toca **«Siguiente»**.',
            '**Paso 2, «Lugar».** Elige el «Municipio»: en un reporte es obligatorio. «Parroquia, localidad o sector» y «Punto de referencia» son opcionales. En «Ubicación exacta (opcional)», «Usar mi ubicación» o «Marcar en el mapa» guardan el punto con el permiso de la persona. «Quitar ubicación» lo borra. Toca **«Siguiente»**.',
            'Si ya hay reportes abiertos del mismo problema cerca, sale **«Reportes parecidos»**, con cuántos hay: por ejemplo, «Hay 2 reportes abiertos del mismo problema cerca de ese lugar.». **«Apoyar este reporte»** suma el apoyo (ver [§apoyar-un-reporte]). **«No, es otro problema»** sigue con el reporte propio.',
            '**Paso 3, «Detalle de la solicitud».** Escribe el «Título» y la «Descripción». La «Fecha del hecho» es opcional. En «Fotos o documentos» van hasta 3 archivos: fotos JPG, PNG o WebP, o documentos PDF. Toca **«Siguiente»**.',
            '**Paso 4, «Contacto y envío».** Arriba sale el resumen («Tipo», «Lugar» y «Detalle»), con «Cambiar» en cada fila. En «Datos de contacto (opcional)», marca «Enviar como anónimo» o llena «Nombre», «Correo», «Teléfono» y «Medio de contacto preferido». Con un nombre aparece la casilla «Autorizo que se publique mi nombre si mi solicitud aparece en «Casos atendidos».». Marca «Leí el aviso de privacidad (se abre en otra pestaña) y acepto el uso de mis datos para atender esta solicitud.».',
            'Toca **«Enviar»**. Sale «Solicitud recibida», con el comprobante (ver [§comprobante]).',
          ],
          wrap: { 0: [117, 117, 23], 2: [113, 114, 89], 5: [113, 113, 116, 114, 25] },
        },
        { kind: 'p', text: 'Para tener en cuenta:' },
        {
          kind: 'list',
          items: [
            '«Atrás» vuelve al paso anterior. En la barra de pasos («Tipo», «Lugar», «Detalle» y «Contacto»), un paso terminado se puede tocar para volver.',
            'Lo escrito se guarda en esa pestaña. Si la página se recarga, dice «Se recuperó lo que había escrito en esta pestaña.», con «Empezar de nuevo».',
            'Sin señal dice «Sin conexión. Lo escrito queda guardado en este dispositivo. Si toca «Enviar», se enviará cuando vuelva la señal.».',
            'Los demás tipos usan el mismo formulario: «Hacer una petición», «Enviar una observación», «Enviar una sugerencia», «Enviar un reconocimiento» y «Hacer una denuncia». En una observación, una sugerencia o un reconocimiento, el paso 2 se llama «Lugar (si aplica)» y se puede saltar.',
          ],
          wrap: { 0: [114, 27] },
        },
        { kind: 'p', text: '**Una observación sobre una noticia o una obra:**' },
        {
          kind: 'steps',
          items: [
            'Al final de una noticia, toca «Enviar una observación». En la ficha de una obra, «Enviar una observación sobre esta obra».',
            'El formulario abre en «Observación». Arriba dice «Sobre esta noticia» o «Sobre esta obra», con su título. «Quitar» la desliga.',
            'Sigue los cuatro pasos de arriba.',
          ],
        },
      ],
    },
    {
      id: 'apoyar-un-reporte',
      pdf: '2.2',
      title: 'Apoyar un reporte',
      heading: { level: 3, num: '2.2' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'steps',
          items: [
            'En «Reportes parecidos», toca **«Apoyar este reporte»**.',
            'El «Comentario» es opcional: solo lo lee el personal de atención.',
            'Los «Datos de contacto (opcional)» y el aviso de privacidad son los mismos del paso 4.',
            'Toca **«Enviar apoyo»**. Sale «Apoyo registrado», con un código y una clave propios.',
          ],
        },
        { kind: 'p', text: 'Un apoyo no lleva archivos. Los datos de las otras personas no se muestran. En el panel, el caso cuenta el apoyo y lo que escribió la persona dice «(solo el equipo)».' },
      ],
    },
    {
      id: 'comprobante',
      pdf: '2.3',
      title: 'El comprobante: código y clave',
      heading: { level: 3, num: '2.3' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            'El título dice «Solicitud recibida». El recuadro «Comprobante · Atención ciudadana · Gobernación del estado Táchira» trae el «Código» (por ejemplo `AC-2026-K7QM2H`) y la «Clave» (cuatro grupos de cuatro letras y números).',
            'Debajo: «Guárdelos ahora. La clave se muestra una sola vez y no se puede recuperar. Sin ella no es posible consultar la solicitud. No la comparta.».',
            'Hay botones para guardarlo: «Descargar comprobante (PDF)», «Imprimir» y «Copiar código y clave».',
            'Los archivos suben después, uno por uno, en «Archivos adjuntos». Uno que falla tiene su botón «Reintentar».',
            '«Próximos pasos» cuenta lo que sigue. Al final están «Consultar mi solicitud» y «Nueva solicitud».',
            'Si la persona no guardó el comprobante, «Nueva solicitud» pregunta antes: «Antes de continuar, guarde su código y su clave. No se pueden recuperar.», con «Sí, ya los guardé».',
          ],
        },
        { kind: 'p', text: 'Nadie del panel tiene la clave ni la puede recuperar. Si la persona dejó un correo, le llega el código, nunca la clave. Por ahora la versión de prueba no envía correos.' },
      ],
    },
    {
      id: 'consultar',
      pdf: '2.4',
      title: 'Consultar la solicitud',
      heading: { level: 3, num: '2.4' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'steps',
          items: [
            'Toca **«Consultar mi solicitud»**. Está arriba, en el pie y en Atención ciudadana.',
            'Escribe el «Código» y la «Clave» tal como están en el comprobante. Toca **«Consultar»**.',
            'Sale «Su solicitud» con el código. Debajo van el tipo, la categoría, el municipio y el día en que se envió.',
            'El recuadro «Estado» dice en qué va y qué quiere decir.',
            'Siguen «Datos de su solicitud» y el «Historial de la solicitud», con las respuestas de «Atención ciudadana» y lo que le pidieron.',
            'Al terminar, toca **«Salir»**. La consulta se cierra sola a los 30 minutos.',
          ],
        },
        { kind: 'p', text: 'Para tener en cuenta:' },
        {
          kind: 'list',
          items: [
            'Un código o una clave equivocados dan siempre «No hay ninguna solicitud con esos datos.».',
            'La clave no se recupera. Lo dice la parte «Pérdida de la clave», en la misma página de la consulta.',
            'Los estados que lee la persona son «Recibida», «En revisión», «Asignada», «En atención», «Requiere información», «Derivada», «Resuelta», «Cerrada» y «No procede».',
            'Si hay otros reportes del mismo problema, lo dice, por ejemplo: «Hay 4 reportes más del mismo problema.».',
            'Cuando la marcan «Resuelta», sale «La solicitud fue marcada como resuelta», con la pregunta «¿Se resolvió el problema?». La persona elige «Sí, se resolvió» o «No, todavía no» y toca «Responder». Con «No, todavía no» se le pide «¿Qué falta por resolver?» y la solicitud vuelve a atención.',
          ],
        },
      ],
    },
    {
      id: 'agregar-informacion',
      pdf: '2.5',
      title: 'Agregar información',
      heading: { level: 3, num: '2.5' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'steps',
          items: [
            'En la consulta, baja hasta **«Agregar información»**. Si le pidieron un dato, esa parte se llama «Responder la solicitud de información» y el estado dice «Requiere información».',
            'Escribe en «Información adicional» (o en «Su respuesta»). Si hace falta, agrega hasta 3 fotos o documentos.',
            'Toca **«Enviar información»**. Sale «Información enviada al personal de atención.».',
          ],
        },
        { kind: 'p', text: 'Si la solicitud esperaba ese dato, vuelve sola a «En revisión». Una solicitud «Cerrada» o «No procede» ya no recibe información: la persona envía una nueva.' },
      ],
    },
    {
      id: 'hacer-una-denuncia',
      pdf: '2.6',
      title: 'Hacer una denuncia',
      heading: { level: 3, num: '2.6' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'steps',
          items: [
            'Toca **«Hacer una denuncia»**: está en la portada y en «Denuncias confidenciales» de Atención ciudadana. También se puede elegir «Denuncia» en el paso 1.',
            'En el paso 1 sale el aviso: «Las denuncias son confidenciales. Solo las leen el personal encargado de denuncias y la coordinación de atención. Su contenido nunca se publica. Si se trata de un delito, acuda también a las autoridades competentes.».',
            'El paso 2 se llama «Lugar aproximado». Pide solo el «Municipio» y la «Parroquia, localidad o sector», y dice «En una denuncia se indica solo el municipio y el sector, sin dirección exacta ni ubicación en el mapa.».',
            'Los pasos 3 y 4 son como en un reporte. Toca **«Enviar»**.',
          ],
        },
        { kind: 'p', text: 'El comprobante y la consulta repiten el aviso de las denuncias. Los correos nunca dicen «denuncia». En el panel la leen solo el operador de denuncias y la coordinación. En «Casos atendidos» sale solo «Denuncia atendida en el municipio …».' },
      ],
    },
    {
      id: 'ver-casos-atendidos',
      pdf: '2.7',
      title: 'Los casos atendidos',
      heading: { level: 3, num: '2.7' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'steps',
          items: [
            'En Atención ciudadana, toca **«Casos atendidos»**. El botón sale solo cuando hay alguno publicado.',
            'La página dice «Solicitudes resueltas. Por privacidad se publican solo las iniciales de cada persona, salvo que autorice su nombre. De las denuncias solo se indica el municipio.».',
            'Elige «Municipio» o «Categoría» y toca **«Filtrar»**. «Quitar filtros» vuelve a todos.',
            'Los casos van agrupados por mes. Cada uno dice su tipo, su categoría y su municipio. Siguen el resumen, el nombre o las iniciales y «Resuelta el …».',
          ],
        },
        { kind: 'p', text: 'Los publica la coordinación desde cada caso, sin datos de la persona (ver el manual de atención, punto 12). Sin casos, la página dice «No hay casos publicados en este momento.», con el botón «Nueva solicitud». Hoy todavía no hay casos publicados.' },
      ],
    },
    {
      id: 'version-de-prueba',
      pdf: '7.0',
      title: 'La versión de prueba',
      heading: { level: 2, num: '3.' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: 'Hoy la web y el panel se usan en una versión de prueba. Sirve para conocer la app y practicar cada rol antes de abrir la web al público.' },
      ],
    },
    {
      id: 'prueba-que-es',
      pdf: '7.1',
      title: 'Qué es',
      heading: { level: 3, num: '3.1' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            'Es la web del gobernador y el panel del equipo. Se abre con su propio enlace, que no es el de la web oficial.',
            'En algunas pantallas se llama «demostración» o «demo»: es lo mismo que la versión de prueba.',
            'Arriba de cada página va la franja «Versión de prueba en revisión. No es el sitio oficial.» (ver [§la-franja]).',
            'Google y los demás buscadores no la muestran.',
            'Las noticias, las columnas de opinión, la biografía, las fotos y el Semanario son una copia de la web oficial, [WEB_OFICIAL].',
            'Esa copia se hace de nuevo de vez en cuando. Por eso lo más nuevo de la web oficial no sale aquí enseguida.',
            '«Atención ciudadana» trae solicitudes de ejemplo para practicar. Los tres comprobantes de prueba se abren en «Consultar mi solicitud» (ver [§comprobantes-de-prueba]).',
            'Por ahora la versión de prueba no envía correos. Los que mandaría quedan en «Ajustes» → «Buzón de correos», que solo ve Administración.',
          ],
        },
      ],
    },
    {
      id: 'prueba-real-y-ejemplo',
      pdf: '7.2',
      title: 'Qué es real y qué es de ejemplo',
      heading: { level: 3, num: '3.2' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            '**Viene de la web oficial:** el nombre, el cargo y la foto de la portada. En «El gobernador», la «Biografía», «Elección y toma de posesión» y «Condecoraciones», con su fuente. Las noticias y las columnas de «Opinión» más recientes, con sus fotos. La última edición del Semanario.',
            '**Es de ejemplo:** las personas del panel (ver [§entrar-con-un-toque]). También las solicitudes de «Atención ciudadana», 60 en total, que llevan «(demo)» en el título, con sus tres comprobantes (ver [§comprobantes-de-prueba]). Las cifras de «Transparencia» salen de esas solicitudes, y la página lo dice.',
            '**Ya venía escrito en la app:** siete preguntas frecuentes de «Atención ciudadana». Cuentan cómo funciona la atención.',
            '**Todavía no sale:** las emisiones del «[PROGRAMA]»: su página lleva al canal oficial de YouTube. En la portada, «Gestión en cifras», «Casos atendidos», «Gestión y obras» y «Avisos de servicio». En el menú, «Gestión y obras». En «El gobernador», «Material para la prensa». Para ellos todavía no hay contenido real (ver [§inicio], [§el-gobernador] y [§programa]).',
          ],
        },
        { kind: 'p', text: 'En el panel, cada nota traída de la web oficial lleva arriba el aviso «Traído de la web vieja».' },
      ],
    },
    {
      id: 'la-franja',
      pdf: '7.3',
      title: 'La franja',
      heading: { level: 3, num: '3.3' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            'Arriba de cada página de la web va la franja «Versión de prueba en revisión. No es el sitio oficial.». Se repite al final del pie.',
            'No se puede cerrar. Tampoco se cambia: dice siempre lo mismo (ver [§prueba-lo-que-no-se-cambia]).',
            'Los formularios de «Atención ciudadana» avisan aparte, arriba: «Versión de prueba. No escriba datos reales.». Debajo explican que cualquier persona que use la prueba puede ver lo que se envía. También dicen que se borra.',
          ],
        },
      ],
    },
    {
      id: 'prueba-lo-que-no-se-cambia',
      pdf: '7.4',
      title: 'Lo que no se cambia',
      heading: { level: 3, num: '3.4' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            'Arriba de «Ajustes del sitio» dice «Esta demostración muestra el contenido de la web oficial: el nombre, el cargo, las cuentas, los contactos y la franja de aviso quedan como están.».',
            'Si alguien guarda uno de esos ajustes, sale «En esta versión de prueba con el contenido de la web oficial, el nombre, las cuentas, los contactos y la franja de aviso no se cambian.».',
            '«Navegación» y «Pie de página» sí se cambian.',
            'La razón: cualquiera con el enlace puede entrar a la prueba. Nadie debe poder hacerla pasar por la web oficial.',
          ],
          wrap: { 0: [118, 64] },
        },
      ],
    },
    {
      id: 'entrar-con-un-toque',
      pdf: '7.5',
      title: 'Entrar con un toque',
      heading: { level: 3, num: '3.5' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'steps',
          items: [
            'En la web, toca «Acceso del personal», al final del pie.',
            'En la tarjeta «Versión de demostración», baja hasta «La web y la atención ciudadana». Más arriba está el resto del equipo, con «El jefe» y «Administración».',
            'Toca la fila de un rol: a la derecha dice «Entrar →».',
            'Entras directo, sin código ni doble factor. Es un atajo que solo existe en la prueba.',
            'Para cambiar de rol, toca «Mi cuenta» (el ícono de la persona, arriba a la derecha) y después «Salir».',
          ],
        },
        {
          kind: 'table',
          head: ['En la lista', 'Entra a', 'Para empezar'],
          rows: [
            ['Editor de la web', '«La web»', '«Noticias y comunicados» → «Nueva noticia»'],
            ['Aprobador de la web', '«La web»', '«Por aprobar» y «Ajustes del sitio»'],
            ['Coordinador de atención', '«Atención ciudadana», la bandeja', 'Busca `DEMR01` en la «Bandeja»'],
            ['Responsable de área · Servicios públicos', '«Atención ciudadana», solo su área', '`DEMR02` y `DEMR03` son de su área'],
            ['Responsable de área · Vialidad y transporte', '«Atención ciudadana», solo su área', '`DEMR01` es de su área'],
            ['Operador de denuncias', '«Atención ciudadana», solo denuncias', 'Las denuncias de ejemplo'],
            ['Consulta y auditoría', '«Atención ciudadana», para leer', '«Cifras» y «Registro»'],
            ['El jefe', 'Su «Inicio»', '«Web» y «Atención», en el menú'],
            ['Administración', '«Hoy»', '«Ajustes» → «Equipo»'],
          ],
        },
        { kind: 'p', text: 'Las personas de la lista son de ejemplo. Cuando la web abra al público, nadie entra así: cada persona entra con su correo, el código que le llega por correo y Google Authenticator.' },
      ],
    },
    {
      id: 'comprobantes-de-prueba',
      pdf: '7.6',
      title: 'Los comprobantes de prueba',
      heading: { level: 3, num: '3.6' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: 'Se abren en «Consultar mi solicitud», sin entrar al panel. El número del medio del código es el año en curso.' },
        {
          kind: 'table',
          head: ['Código', 'Clave', 'Qué es'],
          rows: [
            ['`AC-2026-DEMR01`', '`K7QM-2HXP-9WRT-4BNE`', 'Un reporte de un hueco que está «En atención», con tres apoyos y un reporte repetido unido'],
            ['`AC-2026-DEMR02`', '`R3PS-W8N2-DEMV-7QKA`', 'Un reporte ya resuelto: la consulta dice «Resuelta» y pregunta «¿Se resolvió el problema?»'],
            ['`AC-2026-DEMR03`', '`H4JX-5ZTB-9CNF-W2YE`', 'Un reporte que «Requiere información»: se responde en «Responder la solicitud de información»'],
          ],
        },
        { kind: 'p', text: 'Con los roles de atención, los mismos tres casos se ven por dentro: en la «Bandeja», busca su código.' },
      ],
    },
    {
      id: 'prueba-lo-que-se-borra',
      pdf: '7.7',
      title: 'Lo que se borra',
      heading: { level: 3, num: '3.7' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            'Lo que creas o cambias en la prueba se borra de vez en cuando: una noticia, una solicitud, una respuesta o un ajuste.',
            'Entonces la prueba vuelve a lo que traía al empezar: el contenido de la web oficial y las solicitudes de ejemplo, con sus tres comprobantes.',
            'Lo que alguien crea a veces no aparece en la pantalla siguiente, ni desde otra cuenta u otro teléfono. Pasa solo en la prueba.',
            'Por eso, para practicar entre roles, lo más seguro es usar lo que ya viene cargado: las solicitudes de ejemplo y los tres comprobantes.',
            '«Por aprobar» empieza vacío: dice «No hay nada esperando aprobación. ¡Al día!». Para practicar la aprobación, el editor envía una noticia y quien aprueba la busca ahí. Si no aparece, es ese límite de la prueba.',
            'No escribas datos reales de nadie: lo que se envía en la prueba lo puede ver cualquiera que la use.',
          ],
        },
      ],
    },
    {
      id: 'quien-hace-que',
      pdf: '3.0',
      title: 'Quién hace qué',
      heading: { level: 2, num: '4.' },
      audience: ['boss', 'admin'],
      blocks: [
        { kind: 'p', text: 'Cada persona entra con su propio usuario y con doble factor: un código que llega por correo y otro que da Google Authenticator, una aplicación gratuita que se instala en el teléfono. No hay contraseñas. En la versión de prueba se entra con un toque, sin código (ver [§entrar-con-un-toque]). Administración da los roles en «Ajustes» → «Equipo» → «Invitar a alguien», en el grupo «Web y atención ciudadana (siempre con doble factor)». Estos roles solo tienen «Web» o «Atención» en el menú.', wrap: [112, 106, 116, 119, 11] },
        {
          kind: 'table',
          head: ['Rol', 'Menú', 'En una línea'],
          rows: [
            ['Editor de la web', '«Web»', 'Escribe y envía a aprobación. No publica'],
            ['Aprobador de la web', '«Web»', 'Revisa, publica, programa y archiva. Cambia los ajustes del sitio'],
            ['Coordinador de atención', '«Atención»', 'Todo lo que llega, denuncias también'],
            ['Responsable de área', '«Atención»', 'Lo de su área. Nunca denuncias'],
            ['Operador de denuncias', '«Atención»', 'Solo las denuncias'],
            ['Consulta y auditoría', '«Atención»', 'Lee sin contactos ni denuncias'],
            ['El jefe', '«Web» y «Atención»', 'Publica la web. Lee la atención y sus cifras'],
            ['Administración', '«Web» y «Atención»', 'Personas, áreas, plazos y ajustes. Nunca lee un caso ni publica'],
          ],
        },
      ],
    },
    {
      id: 'rol-editor',
      pdf: '3.1',
      title: 'Editor de la web',
      heading: { level: 3, num: '4.1' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            '**Entra a** «La web». Ve las pestañas «Inicio», «Por aprobar» y «Biblioteca».',
            '**Ve** todo el contenido, borradores incluidos.',
            '**Hace:** crea un contenido («Nueva noticia», «Crear borrador») y lo escribe («Guardar borrador»). Sube fotos y PDF a la «Biblioteca», cada foto con su «Texto alternativo». Mira la «Vista previa» y toca «Enviar a aprobación». Puede «Volver a esta versión» en el borrador.',
            '**No hace:** no publica. No entra a «Ajustes del sitio» ni a «Redirecciones». No ve las solicitudes de la gente.',
          ],
        },
      ],
    },
    {
      id: 'rol-aprobador',
      pdf: '3.2',
      title: 'Aprobador de la web',
      heading: { level: 3, num: '4.2' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            '**Entra a** «La web». Además de las pestañas del editor, tiene «Ajustes del sitio» y «Redirecciones».',
            '**Hace** todo lo del editor. En «Por aprobar» mira «Qué cambia si lo publicas» y decide: «Publicar ahora», «Programar» o «Devolver con comentario». También «Archivar» y «Desarchivar». Cambia la dirección de lo ya publicado.',
            '**Le llega** el aviso «Hay contenido de la web por aprobar».',
            '**No hace:** no ve las solicitudes de la gente.',
          ],
        },
      ],
    },
    {
      id: 'rol-coordinador',
      pdf: '3.3',
      title: 'Coordinador de atención',
      heading: { level: 3, num: '4.3' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            '**Entra a** «Atención ciudadana», en la «Bandeja». Sus pestañas: «Bandeja», «Tablero», «Mapa», «Cifras», «Áreas y plazos» (para leer) y «Respuestas guardadas».',
            '**Ve** todo lo que llega, las denuncias también, con el contacto de la persona.',
            '**Hace:** asigna a cualquier área. Pone la prioridad y la fecha comprometida. Une casos iguales y corrige el tipo o la categoría. Modera y borra un contacto si la persona lo pide. Publica en «Casos atendidos». Descarga la lista en un archivo que se abre en Excel, con o sin el contacto («Exportar lo que ves (CSV)»). Arma las «Respuestas guardadas».',
            '**No hace:** no cambia las áreas ni los plazos: eso es de Administración.',
          ],
          wrap: { 2: [118, 114, 115] },
        },
      ],
    },
    {
      id: 'rol-responsable',
      pdf: '3.4',
      title: 'Responsable de área',
      heading: { level: 3, num: '4.4' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            '**Entra a** «Atención ciudadana». Sus pestañas: «Bandeja», «Tablero», «Mapa» y «Respuestas guardadas».',
            '**Ve** lo de sus áreas y lo que le asignen. Nunca una denuncia. No ve los casos de otras áreas: no le salen en la lista.',
            '**Hace:** responde a la persona y escribe notas internas. Cambia el estado y sube evidencias. Ve el contacto. Asigna dentro de su área o se queda el caso con «Tomar el caso».',
            '**No hace:** no cambia el área, la prioridad ni la fecha: eso lo pide a la coordinación. No ve las «Cifras» ni exporta.',
          ],
        },
      ],
    },
    {
      id: 'rol-operador-denuncias',
      pdf: '3.5',
      title: 'Operador de denuncias',
      heading: { level: 3, num: '4.5' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            '**Entra a** «Atención ciudadana», con las mismas pestañas del responsable.',
            '**Ve** solo las denuncias. Su mapa está vacío: una denuncia nunca lleva el punto exacto.',
            '**Hace** lo mismo que un responsable. En las denuncias, además, pone la prioridad y la fecha. También modera.',
            'Una denuncia no tiene área: en su caso, la tarjeta «Área y responsable» dice «Denuncias».',
          ],
        },
      ],
    },
    {
      id: 'rol-auditoria',
      pdf: '3.6',
      title: 'Consulta y auditoría',
      heading: { level: 3, num: '4.6' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            '**Entra a** «Atención ciudadana». Sus pestañas: «Bandeja», «Tablero», «Mapa», «Cifras», «Áreas y plazos» y «Registro».',
            '**Ve** todo menos las denuncias, que cuentan solo en los totales. Nunca ve un contacto.',
            '**Hace:** solo lee. Mira las «Cifras» y el «Registro». Descarga la lista en un archivo que se abre en Excel, siempre sin contactos («Descargar CSV»).',
          ],
        },
      ],
    },
    {
      id: 'rol-jefe',
      pdf: '3.7',
      title: 'El jefe',
      heading: { level: 3, num: '4.7' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            '**Entra a** su «Inicio». En el menú tiene «Web» y «Atención», además de sus otras secciones (en el teléfono, en «Más»).',
            '**En «Web»** hace lo mismo que el aprobador: publica, programa, devuelve y archiva. El aviso de «Por aprobar» no le llega: lo ve en la lista.',
            '**En «Atención»** es como auditoría: lee todo menos las denuncias, sin contactos, y mira las «Cifras». No exporta.',
          ],
        },
      ],
    },
    {
      id: 'rol-administracion',
      pdf: '3.8',
      title: 'Administración',
      heading: { level: 3, num: '4.8' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            '**Entra a** «Hoy». Su «Web» abre «Ajustes del sitio». Su «Atención» muestra «Áreas y plazos» y «Registro de atención».',
            '**En «Web»:** lee todo, borradores incluidos. Cambia «Ajustes del sitio» y «Redirecciones». Nunca escribe ni publica contenido.',
            '**En «Atención»:** arma las áreas y dice quién está en cada una. Pone el área y los días de cada categoría, y los plazos. Lee el «Registro». Nunca abre un caso.',
            '**En «Ajustes» → «Equipo»:** invita a cada persona y le da su rol. Si alguien perdió el teléfono, toca «Cambiar» en la fila de esa persona y después «Reiniciar doble factor».',
            'La misma cuenta de Administración no puede ser aprobador de la web ni tener un rol de atención. Sí puede ser editor de la web.',
          ],
        },
      ],
    },
    {
      id: 'editar-en-5-pasos',
      pdf: '3.9',
      title: 'Cómo se edita la web (5 pasos)',
      heading: { level: 2, num: '5.' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'steps',
          items: [
            '**«Web»** → el tipo de contenido (por ejemplo «Noticias y comunicados») → «Nueva noticia» → «Título» → «Crear borrador».',
            'Escribe y toca **«Guardar borrador»**. Las fotos van desde la biblioteca, siempre con su **texto alternativo**.',
            '**«Vista previa»** para verlo como saldrá → **«Enviar a aprobación»**.',
            'Quien aprueba entra a **«Por aprobar»**, mira **«Qué cambia si lo publicas»** y decide: **«Publicar ahora»**, **«Programar»** (hora del Táchira) o **«Devolver con comentario»**.',
            'Si algo salió mal: **«Archivar»** lo saca al momento, y **«Versiones»** → «Volver a esta versión» recupera lo de antes.',
          ],
        },
        { kind: 'p', text: 'La portada y las páginas se arman por **bloques** («Agregar un bloque», «Subir», «Bajar», «Ocultar»). El detalle está en el manual de la web.', wrap: [101, 39] },
      ],
    },
    {
      id: 'atender-en-5-pasos',
      pdf: '3.10',
      title: 'Cómo se atiende lo que llega (5 pasos)',
      heading: { level: 2, num: '6.' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'steps',
          items: [
            '**«Atención»** → **«Bandeja»** (o «Tablero»). Lo nuevo está en «Por revisar».',
            'Abre el caso, léelo y pásalo a **«En revisión»**. Asígnalo con **«Guardar asignación»** o «Tomar el caso».',
            '**«Escribir»** → **«Respuesta a la persona»** para decirle que ya la tienen. Escríbele de usted, como le habla la web. Lo que es solo para ustedes va en **«Nota interna»**: nunca las mezcles.',
            'Trabájalo («En atención»). Si falta un dato, **«Pedir más información»**. Al terminar, **«Subir evidencia»**.',
            '**«Resuelto»** con su justificación. La persona confirma desde su consulta; después, **«Cerrado»**. La coordinación publica en **«Casos atendidos»** sin datos de la persona.',
          ],
        },
        { kind: 'p', text: 'El manual de atención trae el detalle: los estados, los motivos, las denuncias, las cifras, la exportación y la moderación.' },
      ],
    },
    {
      id: 'lo-que-nunca-se-hace',
      pdf: '3.11',
      title: 'Lo que nunca se hace',
      heading: { level: 2, num: '7.' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            'Publicar sin aprobación, o publicar datos inventados (biografía, teléfonos, cuentas, cifras sin fuente).',
            'Subir a la biblioteca de la web (que es pública) fotos o archivos de la gente que escribe a Atención.',
            'Contar en público algo de una denuncia, o el nombre de alguien sin su permiso.',
            'Prometer fechas, plazos o una atención de emergencia.',
            'Copiar el contacto de una persona fuera de su caso.',
          ],
        },
      ],
    },
    {
      id: 'donde-esta-el-detalle',
      pdf: '7.8',
      title: 'Dónde está el detalle',
      heading: { level: 2, num: '8.' },
      audience: ['boss', 'admin'],
      blocks: [
        {
          kind: 'list',
          items: [
            'Cada pantalla de «Web», paso a paso: el manual de la web.',
            'Cada pantalla de «Atención», paso a paso: el manual de atención.',
            'Cada flujo dibujado, con lo que hay que saber: los flujos de la web y de la atención ciudadana.',
          ],
        },
      ],
    },
  ],
};
