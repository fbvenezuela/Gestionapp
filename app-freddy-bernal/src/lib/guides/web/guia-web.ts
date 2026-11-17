// «Guía de la web para el equipo» (docs/GUIA-WEB.md): what the public web has, section by section, the citizen's
// journey, the test version and who does what. Its chapters are parts 1, 2, 7 and 3 of «Guía de la web y sus flujos»
// (chapter 3 is part 7 and chapter 4 is part 3; 5, 6 and 7 are 3.9 to 3.11 and 8 is 7.8): each section's `pdf`.
// Ported 1:1 from the doc (WF-C, design §4(a)): one source for the doc (src/lib/guides/render-web-md.ts writes it back
// byte for byte), «Ayuda y guías» and 360. Never edit the .md: edit this and run `npm run docs:guides`. Text with the
// screen's labels in «» (exact), the client's words as huecos ([PROGRAMA], [SEMANARIO], [WEB_OFICIAL], [ORGANIZACION])
// that fillClientWords() fills from config/clients/<brand>.json. `wrap`: only for the doc (the length of each of its
// lines); change a text and drop its `wrap`. 360's fields of each section (what, items, tasks, cannot, rules, faq, easy,
// example, why) are filled in the next round; `audience` says to whom 360 explains it (design §4(d)).
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
      what: 'La guía de la web: qué tiene la web del gobernador, sección por sección, cómo la usa la gente y qué hace cada rol en el panel. El detalle de cada pantalla está en el manual de la web y en el manual de atención, y cada flujo va dibujado aparte.',
      items: [
        'Lo que va entre comillas, «así», es el texto exacto que sale en la pantalla.',
        'Cada sección de la web dice qué ve la persona, de qué pantalla del panel sale, qué pasa cuando no hay datos y qué se ve hoy, en la versión de prueba.',
        'Hoy la web y el panel se usan en una versión de prueba: Google no la muestra y todavía no está abierta al público.',
        'Está en «Ayuda y guías», en dos guías: «La web» y «Atención ciudadana».',
      ],
      faq: [
        { q: '¿Qué trae la guía de la web?', a: 'Qué tiene la web, sección por sección, cómo la usa la gente y qué hace cada rol en el panel. El detalle de cada pantalla está en el manual de la web y en el manual de atención, y cada flujo va dibujado aparte.' },
        { q: '¿Qué quiere decir lo que va entre comillas en la guía?', a: 'Que es el texto exacto que sale en la pantalla: así lo encuentras en la web o en el panel.' },
      ],
      easy: 'Es el libro de la web: qué tiene cada página, qué hace la gente y qué hace cada uno en el panel.',
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
      what: 'La web del gobernador, página por página: qué ve la persona, de qué pantalla del panel sale y qué pasa cuando no hay datos. Todas las páginas tienen el mismo marco: arriba, el menú, el pie y la franja de la versión de prueba.',
      items: [
        'Arriba de cada página: el nombre y el cargo del gobernador y los dos botones de la gente, «Hacer un reporte» (en naranja) y «Consultar mi solicitud». En el teléfono, las secciones se abren con «Menú».',
        'El menú de la web: «Inicio», «El gobernador», «Noticias», «[PROGRAMA]», «Atención ciudadana», «Transparencia» y «Canales». Se cambia en «Ajustes del sitio» → «Navegación».',
        'Abajo, el pie: los mismos dos botones, el aviso de emergencias, «Secciones», «Canales oficiales» con «Cómo identificar las cuentas oficiales», las páginas legales y «Acceso del personal», que lleva al panel.',
        'La franja «Versión de prueba en revisión. No es el sitio oficial.» sale arriba de cada página y al final del pie. No se puede cerrar ni se cambia.',
        'El público nunca ve un espacio vacío ni un «Por completar»: eso solo sale en la «Vista previa» del panel, para el equipo.',
        'Las capturas de la guía usan noticias, fotos y textos de ejemplo, para que en la guía no aparezca ninguna noticia real. En la versión de prueba (la demo), la web muestra las noticias de la web oficial.',
      ],
      tasks: [
        { id: 'cambiar-menu-web', title: 'Cambiar el menú de la web', steps: ['«Web» → «Ajustes del sitio» → «Navegación».', '«Agregar enlace»: su «Nombre» y su «Dirección», el final de la dirección, que empieza con «/».', 'Toca «Guardar»: la web lo muestra al momento, sin aprobación.'] },
      ],
      faq: [
        { q: '¿Qué tienen arriba todas las páginas de la web?', a: 'El nombre y el cargo del gobernador, y los dos botones de la gente: «Hacer un reporte» y «Consultar mi solicitud». Debajo va el menú con las secciones.' },
        { q: '¿Qué hay en el pie de la web?', a: 'Los mismos dos botones, el aviso de emergencias, «Secciones» (el menú otra vez), «Canales oficiales», las páginas legales y «Acceso del personal», que lleva al panel.' },
        { q: '¿Cuáles son las secciones del menú de la web?', a: '«Inicio», «El gobernador», «Noticias», «[PROGRAMA]», «Atención ciudadana», «Transparencia» y «Canales». «Gestión y obras» se agrega cuando haya obras publicadas.' },
        { q: '¿Se puede quitar la franja de la versión de prueba?', a: 'No: la franja «Versión de prueba en revisión. No es el sitio oficial.» no se puede cerrar ni se cambia. Sale mientras la web sea de prueba, para que nadie la confunda con la web oficial.' },
        { q: '¿Qué es eso de «Por completar» que sale en la vista previa?', a: 'Un espacio que espera un dato confirmado. Nunca sale al público: solo lo ve el equipo en la «Vista previa».' },
        { q: '¿Las noticias de las capturas de la guía son de verdad?', a: 'No: las capturas usan noticias, fotos y textos de ejemplo, para que en la guía no aparezca ninguna noticia real. En la demo, la web y el panel sí muestran las noticias de la web oficial.' },
      ],
      easy: 'Cada página de la web tiene arriba el nombre del gobernador y dos botones para la gente, un menú con las secciones y un pie con los avisos. La franja de prueba sale siempre.',
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
      what: 'La portada de la web. Se arma por bloques, que salen en este orden: el título grande con el gobernador, «Atención ciudadana», «Últimas publicaciones», «Opinión», «[SEMANARIO]» y «Canales oficiales».',
      items: [
        'Entre «Atención ciudadana» y «Últimas publicaciones» va el bloque «[PROGRAMA]», con la última emisión. Hoy no aparece porque todavía no hay emisiones publicadas: la página del programa lleva al canal de YouTube.',
        'Cuatro bloques están ocultos porque todavía no hay contenido real para ellos: «Gestión en cifras», «Casos atendidos», «Gestión y obras» y «Avisos de servicio».',
        'Qué bloques salen, y en qué orden, se decide en «Web» → «Páginas» → «Inicio». Un bloque oculto lleva la marca «Oculto»; con «Mostrar» vuelve a salir cuando se publica la portada.',
        'El título grande sale del bloque «Portada con foto». Sin foto, sale solo, a lo ancho.',
        '«Últimas publicaciones» y «Opinión» salen de «Noticias y comunicados» (las de tipo «Opinión»); «[SEMANARIO]», de «Documentos», con la categoría «Semanario»; «Canales oficiales», de «Ajustes del sitio».',
        '«Gestión en cifras» sale de «Indicadores»: cada cifra con su fuente y su fecha. Una cifra sin fuente nunca sale.',
        '«Casos atendidos» lo llena la coordinación, desde cada caso en «Atención»; «Gestión y obras», «Obras y acciones», con las últimas tres obras y «Ver todas las obras».',
        '«Avisos de servicio» muestra solo los vigentes, cada uno con «Actualizado el …» y «Vigente hasta el …». Un aviso vencido deja de salir solo.',
        'Un bloque sin contenido no aparece.',
      ],
      tasks: [
        { id: 'mostrar-bloque-portada', title: 'Mostrar u ocultar un bloque de la portada', audience: ['boss'], steps: ['«Web» → «Páginas» → «Inicio».', 'En «Bloques de la página», toca «Ocultar» o «Mostrar» en el bloque.', 'Envía la portada a aprobación: el cambio sale en la web cuando se publica.'] },
      ],
      cannot: {
        admin: [
          'No: tú no cambias la portada ni sus bloques. Eso lo hacen el editor de la web, el aprobador o el jefe, y sale cuando se publica; tú la lees.',
        ],
      },
      rules: [
        'Una cifra sin fuente nunca sale.',
        'Un aviso vencido deja de salir solo.',
        'Un bloque sin contenido no aparece.',
      ],
      faq: [
        { q: '¿Qué bloques tiene la portada de la web?', a: 'Hoy salen el título grande con el gobernador, «Atención ciudadana», «Últimas publicaciones», «Opinión», «[SEMANARIO]» y «Canales oficiales». Otros cuatro están ocultos hasta que haya contenido real.' },
        { q: '¿Por qué no sale el bloque del programa en la portada?', a: 'Porque todavía no hay emisiones publicadas. Mientras tanto, la página del programa lleva al canal oficial de YouTube.' },
        { q: '¿Qué bloques de la portada están ocultos y por qué?', a: '«Gestión en cifras», «Casos atendidos», «Gestión y obras» y «Avisos de servicio»: llevan la marca «Oculto» porque todavía no hay contenido real para ellos.' },
        { q: '¿Se puede poner una cifra sin fuente en «Gestión en cifras»?', a: 'No: una cifra sin fuente nunca sale en la web. Cada cifra va con su fuente y su fecha, en «Indicadores».' },
        { q: '¿Quién pone los casos atendidos en la portada?', a: 'La coordinación de atención, desde cada caso en «Atención». El bloque de la portada está oculto hasta que haya casos publicados.' },
      ],
      easy: 'La portada es una fila de bloques: primero el gobernador, después lo de atención, las noticias, la opinión, el [SEMANARIO] y los canales. Los bloques sin contenido real están ocultos.',
      example: 'Por ejemplo: cuando haya obras publicadas, en «Web» → «Páginas» → «Inicio» se toca «Mostrar» en «Gestión y obras» y se envía la portada a aprobación. Al publicarla, la portada muestra las últimas tres obras.',
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
      what: 'La página del gobernador: el título grande con su nombre, su cargo y su foto, la biografía y la trayectoria, «Material para la prensa» y la «Última actualización».',
      items: [
        'Sale de «Web» → «Páginas» → «El gobernador». El material para la prensa sale de «Documentos», con la categoría «Material para la prensa».',
        'Hoy trae la foto, «Biografía», «Elección y toma de posesión» y «Condecoraciones», traídas de la web oficial, con una línea «Fuente:» que la enlaza.',
        '«Material para la prensa» está oculto: la web oficial no tiene ese material. Sin documentos, esa parte no sale.',
        'Un espacio «Por completar» no sale al público. Una página sin publicar dice «Página en preparación.».',
      ],
      tasks: [
        { id: 'cambiar-pagina-gobernador', title: 'Cambiar algo de la página del gobernador', audience: ['boss'], steps: ['«Web» → «Páginas» → «El gobernador».', 'Cambia el texto y toca «Guardar borrador».', 'Mírala en «Vista previa» y toca «Enviar a aprobación». Sale cuando quien aprueba la publica.'] },
      ],
      cannot: {
        admin: [
          'No: tú no cambias la página del gobernador. La escriben el editor de la web, el aprobador o el jefe, y sale cuando se publica.',
        ],
      },
      faq: [
        { q: '¿Qué sale en la página «El gobernador»?', a: 'El título grande con su nombre, su cargo y su foto, la «Biografía», «Elección y toma de posesión» y «Condecoraciones», y al final la «Última actualización». «Material para la prensa» está oculto.' },
        { q: '¿Por qué no aparece «Material para la prensa»?', a: 'Porque la web oficial no tiene ese material: sin documentos en «Documentos» con esa categoría, esa parte no sale.' },
        { q: '¿Qué ve la gente si una página no está publicada?', a: '«Página en preparación.». Y un espacio «Por completar» nunca sale al público.' },
      ],
      easy: 'Es la página con la biografía del gobernador. Se cambia en «Web» → «Páginas» → «El gobernador», y lo nuevo sale cuando se publica.',
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
      what: 'La página de las obras de la gestión, en dos vistas: «Obras», con tarjetas por estado y filtros, y «Línea de tiempo», por mes. Hoy no está en el menú porque todavía no hay obras publicadas.',
      items: [
        '«Obras» trae tarjetas con su estado («Anunciado», «En ejecución» o «Concluido») y los filtros «Municipio», «Categoría» y «Estado», con «Filtrar». «Línea de tiempo» las ordena por mes y se filtra con «Desde» y «Hasta».',
        'Cada obra tiene su ficha: «Descripción», «Registro fotográfico», «Ubicación», «Beneficiarios» y «Organismo responsable». La «Inversión» y el «Avance» salen solo con su fuente.',
        'En la ficha está el botón «Enviar una observación sobre esta obra»: abre el formulario de atención, con «Sobre esta obra».',
        'Las obras salen de «Web» → «Obras y acciones» («Nueva obra o acción»).',
        'Sin obras dice «Aún no hay obras publicadas.»; con filtros sin resultado, «No hay obras con esos filtros.». Lo que le falta a una ficha simplemente no sale.',
        'Se agrega al menú en «Ajustes del sitio» → «Navegación» cuando haya obras publicadas.',
      ],
      cannot: {
        admin: [
          'No: tú no cargas obras en la web. Las escriben el editor de la web, el aprobador o el jefe en «Obras y acciones»; tú sí agregas «Gestión y obras» al menú, en «Navegación».',
        ],
      },
      rules: [
        'Nunca un monto ni un porcentaje sin su fuente.',
      ],
      faq: [
        { q: '¿Por qué «Gestión y obras» no sale en el menú de la web?', a: 'Porque todavía no hay obras publicadas: la página diría «Aún no hay obras publicadas.». Se agrega en «Ajustes del sitio» → «Navegación» cuando las haya.' },
        { q: '¿La inversión de una obra sale siempre en la web?', a: 'Solo con su fuente: «Agregar la inversión (con su fuente)» pide de dónde sale la cifra. Sin fuente, no se pone.' },
        { q: '¿Cómo manda la gente una observación sobre una obra?', a: 'En la ficha de la obra, con «Enviar una observación sobre esta obra»: el formulario abre en «Observación», con «Sobre esta obra» y su título.' },
      ],
      easy: 'Cuando haya obras publicadas, la gente verá cada obra con su estado, sus fotos y su ficha. Las cifras salen solo con su fuente.',
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
      what: 'La página de noticias: el buscador, los temas más usados, la noticia más nueva en grande y las demás en lista. Al final está el enlace al «[SEMANARIO]».',
      items: [
        'El buscador tiene «Buscar», «Tipo» y el botón «Buscar». En «Tipo» se elige «Noticia», «Comunicado», «Opinión» o «Entrevista».',
        'Cada nota tiene su página con su fecha, su firma, su foto y su texto; al final, las «Fuentes», los temas y el botón «Enviar una observación», y debajo «Noticias relacionadas».',
        'Una columna de «Opinión» dice «Observaciones sobre este artículo» y muestra «Otros artículos de opinión».',
        'El Semanario tiene su página, con cada edición y su «Ver el PDF». Sale de «Documentos», con la categoría «Semanario».',
        'Las noticias salen de «Web» → «Noticias y comunicados».',
        'Sin noticias dice «Aún no hay noticias publicadas.»; una búsqueda sin resultado, «No hay resultados para esa búsqueda.»; sin ediciones, «Aún no hay ediciones publicadas.». Los temas salen solo cuando hay más de uno.',
        'Hoy salen las noticias y las columnas de opinión más recientes de la web oficial. Cada nota termina con «Publicado originalmente en …» y su dirección en la web oficial, porque es una copia.',
      ],
      cannot: {
        admin: [
          'No: tú no escribes noticias. Las escriben el editor de la web, el aprobador o el jefe en «Noticias y comunicados»; tú las lees.',
        ],
      },
      faq: [
        { q: '¿Qué tipos de nota hay en la web?', a: '«Noticia», «Comunicado», «Opinión» y «Entrevista»: se eligen en «Tipo».' },
        { q: '¿Por qué las noticias terminan con «Publicado originalmente en …»?', a: 'Porque en la versión de prueba son una copia de la web oficial: esa línea da su dirección allá.' },
        { q: '¿Dónde está el Semanario en la web?', a: 'Al final de «Noticias» está el enlace al «[SEMANARIO]», con cada edición y su «Ver el PDF». Sale de «Documentos», con la categoría «Semanario».' },
      ],
      easy: 'Es la lista de noticias de la web, con un buscador. Cada nota tiene su página y, al final, un botón para que la gente mande una observación.',
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
      what: 'La página del programa semanal del gobernador: el enlace al canal de YouTube, la «Última emisión» y las «Emisiones anteriores». El video carga solo cuando la persona lo toca.',
      items: [
        'Sale de «Web» → «[PROGRAMA]», un episodio por emisión («Nuevo episodio»). El canal se cambia en «Ajustes del sitio» → «Canal de YouTube del programa».',
        'Una emisión sin video sale con su título y su fecha, sin un reproductor vacío.',
        'Sin emisiones, la página lleva al canal oficial de YouTube, con «Ver las emisiones en YouTube». Sin canal, dice «Aún no hay emisiones publicadas.».',
        'Hoy todavía no hay emisiones publicadas: en el panel, la tarjeta «[PROGRAMA]» de «La web» dice «Nada todavía».',
      ],
      tasks: [
        { id: 'subir-episodio', title: 'Subir el episodio del programa', audience: ['boss'], steps: ['«Web» → «[PROGRAMA]» → «Nuevo episodio» → «Título» → «Crear borrador».', 'Pon la fecha, el código del video de YouTube, la «Duración (minutos)» y la «Foto de portada».', '«Guardar borrador», «Vista previa» y «Enviar a aprobación». Sin código de video, la web no muestra el reproductor.'] },
      ],
      cannot: {
        admin: [
          'No: tú no subes episodios. Los suben el editor de la web, el aprobador o el jefe; tú sí cambias el canal en «Ajustes del sitio».',
        ],
      },
      faq: [
        { q: '¿El video del programa arranca solo?', a: 'No: el video carga solo cuando la persona lo toca.' },
        { q: '¿Por qué la tarjeta del programa dice «Nada todavía»?', a: 'Porque todavía no hay emisiones publicadas. Mientras tanto, la página del programa lleva al canal oficial de YouTube.' },
        { q: '¿Dónde se cambia el canal de YouTube del programa?', a: 'En «Ajustes del sitio» → «Canal de YouTube del programa». En la versión de prueba ese ajuste no se guarda.' },
      ],
      easy: 'Es la página del programa semanal: cada emisión con su video de YouTube. Hoy no hay emisiones, así que lleva al canal.',
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
      what: 'La página de atención de la web, con su propio menú: «Información general», «Nueva solicitud», «Consultar mi solicitud» y «Casos atendidos». Ahí la gente manda y sigue lo que necesita, sin cuenta.',
      items: [
        'Arriba van los botones «Nueva solicitud» y «Consultar mi solicitud», con el aviso de emergencias, y un «Ejemplo de comprobante», para que la persona sepa qué guardar.',
        'Más abajo: «Tipos de solicitud», «Procedimiento» (cuatro pasos, de «Envío de la solicitud» a «Seguimiento»), «Estados de una solicitud», «Denuncias confidenciales» con «Hacer una denuncia», «Preguntas frecuentes», «Otros canales» y «Casos atendidos».',
        'Los seis tipos de solicitud: reporte, petición, observación, sugerencia, reconocimiento y denuncia. Cada uno abre el formulario en su tipo.',
        'Los textos de esta página no se cambian desde el panel. Sí se cambian las preguntas («Web» → «Preguntas frecuentes», grupo «Atención ciudadana») y los contactos («Ajustes del sitio» → «Contactos institucionales»: solo salen los marcados «Verificado»).',
        'En «Web» → «Páginas» también sale «Atención ciudadana», con el chip «No sale en la web»: no la uses, lo que se escribe ahí no sale en la web.',
        'Sin contactos verificados, «Otros canales» muestra «Canal de atención»: «Las solicitudes se reciben únicamente a través de este sitio.», con el aviso contra estafas.',
        'Sin casos publicados no salen «Casos atendidos» ni su botón del menú. Hoy todavía no hay ninguno.',
        'Hoy salen siete preguntas frecuentes que ya venían escritas en la app, no de la web oficial. Se cambian en «Web» → «Preguntas frecuentes».',
      ],
      tasks: [
        { id: 'agregar-pregunta-atencion', title: 'Agregar una pregunta frecuente a la página de atención', audience: ['boss'], steps: ['«Web» → «Preguntas frecuentes» → «Nueva pregunta» → «Crear borrador».', 'Escribe la pregunta y la respuesta, y elige el grupo «Atención ciudadana».', 'Envíala a aprobación: sale en la página de atención cuando se publica.'] },
      ],
      cannot: {
        admin: [
          'No: tú no escribes las preguntas frecuentes. Las escriben el editor de la web, el aprobador o el jefe; tú sí cambias los contactos en «Ajustes del sitio».',
        ],
      },
      faq: [
        { q: '¿Qué ve la gente en la página de Atención ciudadana?', a: 'Los botones «Nueva solicitud» y «Consultar mi solicitud», los «Tipos de solicitud», el «Procedimiento», los «Estados de una solicitud», «Denuncias confidenciales», las «Preguntas frecuentes», «Otros canales» y, cuando haya, «Casos atendidos».' },
        { q: '¿Se le pueden cambiar los textos a la página de atención?', a: 'No se cambian desde el panel. Sí se cambian las preguntas, en «Preguntas frecuentes» (grupo «Atención ciudadana»), y los contactos verificados, en «Ajustes del sitio» → «Contactos institucionales».' },
        { q: '¿Sale en la web lo que se escribe en «Páginas» → «Atención ciudadana»?', a: 'No: esa página lleva el chip «No sale en la web». No la uses: su editor lo avisa arriba, con «Esta página no sale en la web».' },
        { q: '¿Por qué no aparece «Casos atendidos» en la página de atención?', a: 'Porque todavía no hay casos publicados: el botón del menú sale cuando hay al menos uno. Los publica la coordinación desde cada caso.' },
        { q: '¿Qué es el «Ejemplo de comprobante» de la página de atención?', a: 'Una muestra del comprobante que recibe la persona, con su código y su clave de ejemplo, para que sepa qué guardar.' },
        { q: '¿Qué sale en «Otros canales» si no hay contactos verificados?', a: '«Canal de atención»: «Las solicitudes se reciben únicamente a través de este sitio.», seguido del aviso contra estafas.' },
      ],
      easy: 'Es la puerta de la gente: ahí manda un reporte, una petición o una denuncia, y sigue lo suyo con su código y su clave. No hace falta cuenta.',
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
      what: 'La página «Documentos y cifras»: los documentos publicados, cada uno con su «Ver el PDF», y las «Estadísticas de atención ciudadana», que la app cuenta sola con las solicitudes.',
      items: [
        '«Documentos» trae el buscador («Buscar», «Categoría» y el botón «Buscar») y la lista. Salen de «Web» → «Documentos», de todas las categorías.',
        '«Estadísticas de atención ciudadana» se ven por período («Desde el inicio», «Este año» o «Últimos 30 días»): «Recibidas», «Resueltas», «Pendientes», «Vencidas», «Primera respuesta» y «Resolución», las cuentas por tipo, estado, categoría y municipio, y sus «Definiciones».',
        'Las cifras las cuenta la app con las solicitudes de Atención: nadie las escribe. Las denuncias no cuentan por categoría ni por municipio.',
        'Hoy las cifras salen de las solicitudes de ejemplo, y la página lo dice antes de la primera cifra: «Cifras de ejemplo de la versión de prueba, calculadas con solicitudes inventadas.».',
        'Sin documentos dice «Aún no hay documentos publicados.»; sin solicitudes en el período, «No hay solicitudes en este período.».',
      ],
      tasks: [
        { id: 'subir-documento', title: 'Subir un documento a Transparencia', audience: ['boss'], steps: ['«Web» → «Documentos» → «Nuevo documento» → «Título» → «Crear borrador».', 'Elige la «Categoría» y el «Archivo PDF».', 'Envíalo a aprobación: todo documento publicado sale en «Transparencia».'] },
      ],
      cannot: {
        admin: [
          'No: tú no subes documentos. Los suben el editor de la web, el aprobador o el jefe en «Documentos».',
        ],
      },
      faq: [
        { q: '¿Qué hay en Transparencia?', a: 'La página «Documentos y cifras»: los documentos publicados, con su «Ver el PDF», y las «Estadísticas de atención ciudadana» por período.' },
        { q: '¿Quién escribe las cifras de Transparencia?', a: 'Nadie: las cuenta la app con las solicitudes de Atención. En la versión de prueba salen de solicitudes inventadas, y la página lo dice.' },
        { q: '¿Las denuncias salen por municipio en las cifras?', a: 'No: las denuncias no cuentan por categoría ni por municipio.' },
      ],
      easy: 'Ahí la gente ve los documentos de la gestión y cuántas solicitudes llegaron y se resolvieron. Esas cifras las cuenta la app sola.',
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
      what: 'La página «Canales oficiales»: una tarjeta por cuenta, con la marca «verificada» en las confirmadas, y «Cómo identificar las cuentas oficiales», con el aviso contra estafas.',
      items: [
        'Si están verificados, salen también el «Portal institucional» y los «Contactos institucionales». Al final va el aviso de emergencias.',
        'Uno de los consejos es el aviso contra estafas: ningún funcionario pide dinero, claves, códigos de verificación ni datos bancarios.',
        'Sale de «Ajustes del sitio»: «Cuentas en redes», «Canal de YouTube del programa», «Canal de WhatsApp», «Portal institucional» y «Contactos institucionales».',
        'Sin cuentas dice «Las cuentas oficiales se publicarán próximamente.».',
        'Hoy la versión de prueba muestra también las cuentas por confirmar, con una sola línea que dice que están en proceso de confirmación. Cuando la web abra al público, saldrán solo las activas y verificadas.',
      ],
      tasks: [
        { id: 'verificar-cuenta', title: 'Marcar una cuenta de la web como verificada', steps: ['«Web» → «Ajustes del sitio» → «Cuentas en redes».', 'Marca «Verificada» y «Activa» en la cuenta confirmada.', 'Toca «Guardar»: sale en la web al momento. En la versión de prueba las cuentas no se cambian.'] },
      ],
      faq: [
        { q: '¿Qué sale en «Canales»?', a: 'Una tarjeta por cuenta oficial, con la marca «verificada» en las confirmadas, y «Cómo identificar las cuentas oficiales», con el aviso contra estafas.' },
        { q: '¿Por qué en «Canales» salen cuentas que no están verificadas?', a: 'Porque es la versión de prueba: muestra también las cuentas por confirmar, con una línea que dice que están en proceso de confirmación. Cuando la web abra al público, saldrán solo las activas y verificadas.' },
        { q: '¿Qué dice «Canales» si no hay ninguna cuenta?', a: '«Las cuentas oficiales se publicarán próximamente.».' },
      ],
      easy: 'Es la lista de las cuentas oficiales del gobernador, para que la gente sepa cuáles son de verdad y no caiga en estafas.',
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
      what: 'Las páginas legales del pie: «Aviso de privacidad», «Condiciones de participación» y «Accesibilidad». Todas esperan la revisión jurídica.',
      items: [
        'Cada una trae su texto por partes y, al final, «Texto sujeto a revisión jurídica.» («Accesibilidad» dice «Texto sujeto a revisión.»), con su «Última actualización».',
        'Se cambian en «Web» → «Páginas», cada una por su nombre. Tienen espacios «Por completar antes de publicar: …», que no salen al público.',
        'Una página sin publicar dice «Página en preparación.».',
      ],
      cannot: {
        admin: [
          'No: tú no cambias las páginas legales. Las cambian el editor de la web, el aprobador o el jefe en «Páginas».',
        ],
      },
      faq: [
        { q: '¿Cuáles son las páginas legales de la web?', a: '«Aviso de privacidad», «Condiciones de participación» y «Accesibilidad». Salen en el pie.' },
        { q: '¿Las páginas legales ya están listas?', a: 'Todavía no: esperan la revisión jurídica. Tienen espacios «Por completar», que el público no ve, y terminan con «Texto sujeto a revisión jurídica.».' },
      ],
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
      what: 'Lo que ve la persona cuando abre una dirección que no existe: «Esta página no existe», con «Ir al inicio», «Ver noticias» y «Consultar mi solicitud».',
      items: [
        'Debajo dice «La dirección puede estar incompleta o la página ya no está disponible.».',
        'Una dirección vieja de la web oficial, como la de una noticia, lleva sola a su página nueva cuando tiene una redirección. Las noticias copiadas de la web oficial ya la tienen: en «Redirecciones» salen con «De la web vieja».',
        'Si una página no carga por una falla, dice «No se pudo cargar la página», con «Intentar de nuevo» e «Ir al inicio».',
      ],
      faq: [
        { q: '¿Qué pasa si alguien abre el enlace viejo de una noticia de la web oficial?', a: 'Si tiene una redirección, lo lleva solo a su página nueva. Las noticias copiadas de la web oficial ya la tienen, con la etiqueta «De la web vieja». Si no, ve «Esta página no existe».' },
        { q: '¿Qué quiere decir «No se pudo cargar la página»?', a: 'Que la página no cargó por una falla. La persona toca «Intentar de nuevo» o «Ir al inicio».' },
      ],
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
      what: 'Lo que hace la persona que escribe a «Atención ciudadana»: no necesita cuenta ni contraseña, todo funciona en el teléfono y sigue lo suyo con un código y una clave.',
      items: [
        'La persona no se registra: no necesita cuenta ni contraseña. Todo funciona en el teléfono.',
        'La web le habla de usted, y cada respuesta del equipo le sale en su consulta como «Respuesta de Atención ciudadana».',
        'Puede hacer un reporte en cuatro pasos, apoyar un reporte parecido, guardar su comprobante, consultar en qué va, agregar información, hacer una denuncia y ver los casos atendidos.',
      ],
      faq: [
        { q: '¿La gente necesita cuenta para escribirle a Atención ciudadana?', a: 'No: no necesita cuenta ni contraseña, y todo funciona en el teléfono. Sigue lo suyo con el código y la clave de su comprobante.' },
        { q: '¿La web le habla a la gente de tú o de usted?', a: 'De usted. Y cada respuesta del equipo le sale en su consulta como «Respuesta de Atención ciudadana».' },
      ],
      easy: 'La gente manda lo suyo desde el teléfono, sin registrarse, y lo sigue con un código y una clave.',
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
      what: 'Cómo hace la persona un reporte en la web: toca «Hacer un reporte» y llena cuatro pasos, «Tipo», «Lugar», «Detalle» y «Contacto». Al enviar le sale su comprobante.',
      items: [
        'Los cuatro pasos se ven en una barra: «Tipo», «Lugar», «Detalle» y «Contacto». Un paso terminado se puede tocar para volver, y «Atrás» vuelve al anterior.',
        'En «Ubicación exacta (opcional)», «Usar mi ubicación» o «Marcar en el mapa» guardan el punto con el permiso de la persona; «Quitar ubicación» lo borra.',
        'En «Fotos o documentos» van hasta 3 archivos: fotos JPG, PNG o WebP, o documentos PDF.',
        'Los datos de contacto son opcionales: «Enviar como anónimo», o «Nombre», «Correo», «Teléfono» y «Medio de contacto preferido». Con un nombre sale la casilla para autorizar que se publique en «Casos atendidos».',
        'Antes de enviar marca «Leí el aviso de privacidad (se abre en otra pestaña) y acepto el uso de mis datos para atender esta solicitud.».',
        'Lo escrito se guarda en esa pestaña: si la página se recarga, dice «Se recuperó lo que había escrito en esta pestaña.», con «Empezar de nuevo».',
        'Sin señal, la web avisa que no hay conexión: lo escrito queda guardado en el teléfono y, si toca «Enviar», se envía cuando vuelve la señal.',
        'Los demás tipos usan el mismo formulario: «Hacer una petición», «Enviar una observación», «Enviar una sugerencia», «Enviar un reconocimiento» y «Hacer una denuncia». En una observación, una sugerencia o un reconocimiento, el paso 2 se llama «Lugar (si aplica)» y se puede saltar.',
        'Una observación sobre una noticia o una obra: al final de la noticia, «Enviar una observación»; en la ficha de una obra, «Enviar una observación sobre esta obra». El formulario abre en «Observación», con «Sobre esta noticia» o «Sobre esta obra», y «Quitar» la desliga.',
      ],
      tasks: [
        { id: 'hacer-reporte', title: 'Hacer un reporte desde la web (lo que hace la persona)', steps: ['Toca «Hacer un reporte», arriba en naranja. El formulario dice que tiene cuatro pasos y que no necesita registrarse.', 'Paso 1, «Tipo de solicitud»: ya viene marcado «Reporte»; elige la «Categoría», por ejemplo «Agua», y toca «Siguiente».', 'Paso 2, «Lugar»: el «Municipio» es obligatorio en un reporte; el sector y el «Punto de referencia» son opcionales. Toca «Siguiente».', 'Si ya hay reportes abiertos del mismo problema cerca, sale «Reportes parecidos»: «Apoyar este reporte» suma el apoyo, y «No, es otro problema» sigue con el reporte propio.', 'Paso 3, «Detalle de la solicitud»: el «Título» y la «Descripción»; la «Fecha del hecho» es opcional, y van hasta 3 fotos o PDF.', 'Paso 4, «Contacto y envío»: el resumen, con «Cambiar» en cada fila; «Enviar como anónimo» o los datos de contacto, y la casilla del aviso de privacidad.', 'Toca «Enviar»: sale «Solicitud recibida», con el comprobante.'] },
      ],
      faq: [
        { q: '¿La gente puede mandar un reporte sin dar su nombre?', a: 'Sí: los datos de contacto son opcionales. Marca «Enviar como anónimo» y sigue su caso con su código.' },
        { q: '¿Se pierde lo escrito si se va la señal o se recarga la página?', a: 'No: lo escrito se guarda en esa pestaña. Al recargar dice «Se recuperó lo que había escrito en esta pestaña.», con «Empezar de nuevo»; sin señal, queda guardado y se envía cuando vuelve la señal.' },
        { q: '¿El municipio es obligatorio en un reporte?', a: 'Sí, en un reporte el «Municipio» es obligatorio. La «Parroquia, localidad o sector» y el «Punto de referencia» son opcionales.' },
        { q: '¿Qué es la casilla para que salga el nombre de la persona?', a: 'Si la persona deja su nombre, puede autorizar que se publique cuando su solicitud aparezca en «Casos atendidos». Sin esa marca, salen solo sus iniciales.' },
        { q: '¿Cuántas fotos puede mandar la gente con un reporte?', a: 'Hasta 3 archivos: fotos JPG, PNG o WebP, o documentos PDF.' },
        { q: '¿En una sugerencia hay que poner el lugar?', a: 'No hace falta: en una observación, una sugerencia o un reconocimiento, el paso 2 se llama «Lugar (si aplica)» y se puede saltar.' },
      ],
      easy: 'La persona toca «Hacer un reporte», dice qué pasa y dónde, lo describe y lo envía. Le sale un código y una clave para seguirlo.',
      example: 'Por ejemplo: a una vecina no le llega el agua. Toca «Hacer un reporte», elige la categoría «Agua» y su municipio, escribe qué pasa, marca el aviso de privacidad y toca «Enviar»: le sale «Solicitud recibida», con su comprobante.',
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
      what: 'Cuando ya hay reportes abiertos del mismo problema cerca, la persona puede sumarse con «Apoyar este reporte» en vez de mandar otro. Recibe «Apoyo registrado», con su propio código y su propia clave.',
      items: [
        '«Reportes parecidos» dice cuántos hay abiertos cerca, por ejemplo «Hay 2 reportes abiertos del mismo problema cerca de ese lugar.», nunca qué dicen.',
        'El «Comentario» es opcional, y solo lo lee el personal de atención.',
        'Un apoyo no lleva archivos, y los datos de las otras personas no se muestran.',
        'En el panel, el caso cuenta el apoyo, y lo que escribió quien apoyó dice «(solo el equipo)».',
      ],
      tasks: [
        { id: 'apoyar-reporte', title: 'Apoyar un reporte (lo que hace la persona)', steps: ['En «Reportes parecidos», toca «Apoyar este reporte».', 'Si quiere, escribe un «Comentario»: solo lo lee el personal de atención.', 'Los «Datos de contacto (opcional)» y el aviso de privacidad son los mismos del paso 4.', 'Toca «Enviar apoyo»: sale «Apoyo registrado», con un código y una clave propios.'] },
      ],
      faq: [
        { q: '¿Qué es apoyar un reporte?', a: 'Sumarse a un reporte que ya está abierto cerca, del mismo problema: «Apoyar este reporte» → «Enviar apoyo». La persona recibe «Apoyo registrado», con su propio código.' },
        { q: '¿Quien apoya ve lo que escribieron los demás?', a: 'No: solo ve cuántos reportes hay cerca, nunca qué dicen. Y los datos de las otras personas no se muestran.' },
        { q: '¿Quién lee el comentario de un apoyo?', a: 'Solo el personal de atención: en el caso sale con «(solo el equipo)». El comentario es opcional.' },
      ],
      easy: 'Apoyar es decir “a mí también me pasa” en un reporte que ya existe. La persona se suma y recibe su propio código.',
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
      what: 'El comprobante que le sale a la persona al enviar: «Solicitud recibida», con su «Código» y su «Clave». La clave se muestra una sola vez y no se puede recuperar.',
      items: [
        'El recuadro del comprobante trae el «Código» y la «Clave» (cuatro grupos de cuatro letras y números).',
        'Debajo le dice que los guarde ahora: la clave se muestra una sola vez, no se puede recuperar y, sin ella, no es posible consultar la solicitud.',
        'Para guardarlo están «Descargar comprobante (PDF)», «Imprimir» y «Copiar código y clave».',
        'Los archivos suben después, uno por uno, en «Archivos adjuntos»; uno que falla tiene su «Reintentar».',
        '«Próximos pasos» cuenta lo que sigue. Al final están «Consultar mi solicitud» y «Nueva solicitud».',
        'Si la persona no guardó el comprobante, «Nueva solicitud» le pregunta antes, con «Sí, ya los guardé».',
      ],
      cannot: {
        boss: [
          'No: nadie del panel tiene la clave de una solicitud ni la puede recuperar. Si la persona la perdió y dejó un contacto, el personal de atención puede comunicarse con ella; si no, envía una nueva solicitud.',
          'No: yo no doy ni pido códigos ni claves, tampoco los de prueba. La persona los guarda de su comprobante, y los de práctica están en la guía de atención.',
        ],
        admin: [
          'No: nadie del panel tiene la clave de una solicitud ni la puede recuperar. Si la persona la perdió y dejó un contacto, el personal de atención puede comunicarse con ella; si no, envía una nueva solicitud.',
          'No: yo no doy ni pido códigos ni claves, tampoco los de prueba. La persona los guarda de su comprobante, y los de práctica están en la guía de atención.',
        ],
      },
      rules: [
        'Nadie del panel tiene la clave ni la puede recuperar.',
        'Si la persona dejó un correo, le llega el código, nunca la clave.',
      ],
      why: 'La clave no se recupera porque nadie la guarda: así solo la persona puede abrir su solicitud.',
      faq: [
        { q: '¿Qué es el comprobante que le sale a la gente al final?', a: '«Solicitud recibida», con su «Código» y su «Clave», y los botones «Descargar comprobante (PDF)», «Imprimir» y «Copiar código y clave». La clave se muestra una sola vez.' },
        { q: '¿A la persona le llega la clave por correo?', a: 'No: si dejó un correo, le llega el código, nunca la clave. La clave se muestra una sola vez, en el comprobante.' },
        { q: '¿Cómo es la clave del comprobante?', a: 'Cuatro grupos de cuatro letras y números. Se muestra una sola vez y no se puede recuperar.' },
      ],
      easy: 'El comprobante es como el ticket de la solicitud: un código y una clave. Con los dos, la persona ve en qué va; la clave no se puede recuperar.',
      blocks: [
        {
          kind: 'list',
          items: [
            'El título dice «Solicitud recibida». El recuadro «Comprobante · Atención ciudadana · [ORGANIZACION]» trae el «Código» (por ejemplo `AC-2026-K7QM2H`) y la «Clave» (cuatro grupos de cuatro letras y números).',
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
      what: 'Cómo sigue la persona su solicitud: en «Consultar mi solicitud» escribe su «Código» y su «Clave» y ve en qué va, con el historial y las respuestas.',
      items: [
        'Un código o una clave equivocados dan siempre «No hay ninguna solicitud con esos datos.».',
        'Los estados que lee la persona: «Recibida», «En revisión», «Asignada», «En atención», «Requiere información», «Derivada», «Resuelta», «Cerrada» y «No procede».',
        'Si hay otros reportes del mismo problema, lo dice, por ejemplo «Hay 4 reportes más del mismo problema.».',
        'Cuando la marcan «Resuelta», sale «¿Se resolvió el problema?»: «Sí, se resolvió» o «No, todavía no», y «Responder». Con «No, todavía no» escribe «¿Qué falta por resolver?» y la solicitud vuelve a atención.',
        'La clave no se recupera: lo dice la parte «Pérdida de la clave». Si dejó un contacto, el personal de atención puede comunicarse con ella; si no, puede enviar una nueva solicitud.',
        'La persona nunca ve las notas internas, el motivo de un cambio de estado ni quién del personal hizo cada cosa.',
      ],
      tasks: [
        { id: 'consultar-solicitud', title: 'Consultar una solicitud (lo que hace la persona)', steps: ['Toca «Consultar mi solicitud»: está arriba, en el pie y en Atención ciudadana.', 'Escribe el «Código» y la «Clave» tal como están en el comprobante y toca «Consultar».', 'Sale «Su solicitud» con el código, y el recuadro «Estado» dice en qué va y qué quiere decir.', 'Siguen «Datos de su solicitud» y el «Historial de la solicitud», con las respuestas de «Atención ciudadana» y lo que le pidieron.', 'Al terminar, toca «Salir». La consulta se cierra sola a los 30 minutos.'] },
      ],
      faq: [
        { q: '¿Cómo sabe la persona en qué va su solicitud?', a: 'En «Consultar mi solicitud», con el código y la clave de su comprobante: ve el «Estado» y el «Historial de la solicitud», con las respuestas.' },
        { q: '¿Qué estados ve la gente cuando consulta?', a: '«Recibida», «En revisión», «Asignada», «En atención», «Requiere información», «Derivada», «Resuelta», «Cerrada» y «No procede».' },
        { q: '¿Qué le sale si pone mal el código o la clave?', a: 'Siempre lo mismo: «No hay ninguna solicitud con esos datos.».' },
        { q: '¿La consulta se queda abierta?', a: 'Hasta que toca «Salir». Si no, se cierra sola a los 30 minutos.' },
        { q: '¿Cómo confirma la gente que ya le resolvieron?', a: 'Cuando la marcan «Resuelta», su consulta pregunta «¿Se resolvió el problema?»: elige «Sí, se resolvió» o «No, todavía no» y toca «Responder». Con «No, todavía no», escribe «¿Qué falta por resolver?» y vuelve a atención.' },
      ],
      easy: 'La persona escribe su código y su clave en «Consultar mi solicitud» y ve en qué va lo suyo y qué le respondieron.',
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
      what: 'Cómo le agrega la persona un dato a su solicitud: en su consulta, «Agregar información» → «Enviar información». Si le pidieron un dato, esa parte se llama «Responder la solicitud de información».',
      items: [
        'Escribe en «Información adicional» (o en «Su respuesta») y, si hace falta, agrega hasta 3 fotos o documentos.',
        'Al enviar sale «Información enviada al personal de atención.».',
        'Si la solicitud esperaba ese dato, vuelve sola a «En revisión».',
        'Una solicitud «Cerrada» o «No procede» ya no recibe información: la persona envía una nueva.',
      ],
      tasks: [
        { id: 'agregar-informacion', title: 'Agregar información a una solicitud (lo que hace la persona)', steps: ['En la consulta, baja hasta «Agregar información». Si le pidieron un dato, dice «Responder la solicitud de información» y el estado es «Requiere información».', 'Escribe en «Información adicional» (o en «Su respuesta»). Si hace falta, agrega hasta 3 fotos o documentos.', 'Toca «Enviar información». Sale «Información enviada al personal de atención.».'] },
      ],
      faq: [
        { q: 'Cuando la persona manda lo que le pidieron, ¿en qué estado queda?', a: 'Vuelve sola a «En revisión».' },
        { q: '¿Un caso cerrado puede recibir más información de la persona?', a: 'No: una solicitud «Cerrada» o «No procede» ya no recibe información. La persona envía una nueva.' },
      ],
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
      what: 'Cómo hace la persona una denuncia: «Hacer una denuncia», en la portada o en «Denuncias confidenciales». Es confidencial, pide solo el municipio y el sector y nunca el punto en el mapa.',
      items: [
        'El aviso dice que las denuncias son confidenciales: solo las leen el personal encargado de denuncias y la coordinación de atención, su contenido nunca se publica y, si es un delito, hay que acudir también a las autoridades competentes.',
        'El paso 2 se llama «Lugar aproximado»: pide solo el «Municipio» y la «Parroquia, localidad o sector», sin dirección exacta ni ubicación en el mapa.',
        'El comprobante y la consulta repiten el aviso de las denuncias. Los correos nunca dicen «denuncia».',
        'En el panel la leen solo el operador de denuncias y la coordinación. En «Casos atendidos» sale solo «Denuncia atendida en el municipio …».',
      ],
      tasks: [
        { id: 'hacer-denuncia', title: 'Hacer una denuncia (lo que hace la persona)', steps: ['Toca «Hacer una denuncia»: está en la portada y en «Denuncias confidenciales» de Atención ciudadana. También se puede elegir «Denuncia» en el paso 1.', 'En el paso 1 sale el aviso de que las denuncias son confidenciales.', 'En el paso 2, «Lugar aproximado», pone solo el «Municipio» y la «Parroquia, localidad o sector».', 'Los pasos 3 y 4 son como en un reporte. Toca «Enviar».'] },
      ],
      why: 'Una denuncia nunca lleva el punto exacto ni va al mapa, para proteger a quien denuncia.',
      faq: [
        { q: '¿En una denuncia la persona pone la dirección exacta?', a: 'No: en «Lugar aproximado» pone solo el «Municipio» y la «Parroquia, localidad o sector», sin dirección exacta ni ubicación en el mapa.' },
        { q: '¿Los correos de una denuncia dicen que es una denuncia?', a: 'No: los correos nunca dicen «denuncia». En el panel la leen solo el operador de denuncias y la coordinación.' },
        { q: '¿Qué sale en «Casos atendidos» cuando es una denuncia?', a: 'Solo «Denuncia atendida en el municipio …»: de las denuncias solo se indica el municipio, y su contenido nunca se publica.' },
      ],
      easy: 'Una denuncia es privada: la ven solo el operador de denuncias y la coordinación, no lleva dirección exacta y nunca sale en la web, salvo una línea con su municipio cuando se atiende.',
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
      what: 'La página «Casos atendidos» de la web: las solicitudes resueltas que publica la coordinación, sin datos de la persona. Salen sus iniciales, salvo que autorice su nombre.',
      items: [
        'La página dice «Solicitudes resueltas. Por privacidad se publican solo las iniciales de cada persona, salvo que autorice su nombre. De las denuncias solo se indica el municipio.».',
        'Se filtra por «Municipio» o «Categoría» con «Filtrar»; «Quitar filtros» vuelve a todos.',
        'Los casos van agrupados por mes. Cada uno dice su tipo, su categoría y su municipio, el resumen, el nombre o las iniciales y «Resuelta el …».',
        'El botón sale solo cuando hay alguno publicado. Sin casos, la página dice «No hay casos publicados en este momento.», con «Nueva solicitud». Hoy todavía no hay casos publicados.',
      ],
      why: 'Por privacidad: de cada persona salen solo sus iniciales, salvo que autorice su nombre, y de una denuncia solo el municipio.',
      faq: [
        { q: '¿Qué son los casos atendidos de la web?', a: 'Solicitudes resueltas que la coordinación publica en la web, sin datos de la persona: solo sus iniciales, salvo que autorice su nombre.' },
        { q: '¿Quién publica los casos atendidos?', a: 'La coordinación de atención, desde cada caso resuelto, sin datos de la persona.' },
        { q: '¿Qué dice «Casos atendidos» si no hay casos publicados?', a: '«No hay casos publicados en este momento.», con el botón «Nueva solicitud».' },
      ],
      easy: 'Es la vitrina de lo que se resolvió: cada caso contado en pocas palabras, sin datos de la persona.',
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
      what: 'Hoy la web y el panel se usan en una versión de prueba, para conocer la app y practicar cada rol antes de abrir la web al público.',
      items: [
        'En algunas pantallas se llama «demostración» o «demo»: es lo mismo que la versión de prueba.',
        'Arriba de cada página sale la franja «Versión de prueba en revisión. No es el sitio oficial.», y Google no la muestra.',
      ],
      faq: [
        { q: '¿La web ya está abierta al público?', a: 'Todavía no: es una versión de prueba. Google no la muestra y la franja de arriba dice «Versión de prueba en revisión. No es el sitio oficial.».' },
        { q: '¿Para qué sirve la versión de prueba?', a: 'Para conocer la app y practicar cada rol antes de abrir la web al público.' },
      ],
      easy: 'Es un ensayo de la web: sirve para aprender y practicar. Todavía no la ve el público.',
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
      what: 'La versión de prueba es la web del gobernador y el panel del equipo, con su propio enlace, que no es el de la web oficial. Google y los demás buscadores no la muestran.',
      items: [
        'Las noticias, las columnas de opinión, la biografía, las fotos y el Semanario son una copia de la web oficial, [WEB_OFICIAL].',
        'La copia se hace de nuevo de vez en cuando: por eso lo más nuevo de la web oficial no sale aquí enseguida.',
        '«Atención ciudadana» trae solicitudes de ejemplo para practicar, y los comprobantes de prueba se abren en «Consultar mi solicitud».',
        { boss: 'Por ahora no envía correos: los que mandaría quedan en «Ajustes» → «Buzón de correos», que solo ve Administración.', admin: 'Por ahora no envía correos: los que mandaría quedan en «Ajustes» → «Buzón de correos», que solo ves tú.' },
      ],
      faq: [
        { q: '¿La demo y la versión de prueba son lo mismo?', a: 'Sí: en algunas pantallas se llama «demostración» o «demo», y es lo mismo que la versión de prueba.' },
        { q: '¿Por qué no sale la noticia más nueva de la web oficial en la prueba?', a: 'Porque la copia de la web oficial se hace de nuevo de vez en cuando: lo más nuevo no sale aquí enseguida.' },
        { q: '¿La prueba le manda correos a la gente?', a: { boss: 'No: por ahora no envía correos. Los que mandaría quedan en «Ajustes» → «Buzón de correos», que solo ve Administración.', admin: 'No: por ahora no envía correos. Los que mandaría quedan en «Ajustes» → «Buzón de correos», que solo ves tú.' } },
      ],
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
      what: 'Qué es real y qué es de ejemplo en la versión de prueba: lo de la web viene de la web oficial; las personas del panel y las solicitudes son de ejemplo.',
      items: [
        'Viene de la web oficial: el nombre, el cargo y la foto de la portada; en «El gobernador», la «Biografía», «Elección y toma de posesión» y «Condecoraciones»; las noticias y las columnas de «Opinión» más recientes, y la última edición del Semanario.',
        'Es de ejemplo: las personas del panel y las solicitudes de «Atención ciudadana», que llevan «(demo)» en el título, con sus tres comprobantes. Las cifras de «Transparencia» salen de esas solicitudes, y la página lo dice.',
        'Ya venía escrito en la app: siete preguntas frecuentes de «Atención ciudadana», que cuentan cómo funciona la atención.',
        'Todavía no sale: las emisiones del «[PROGRAMA]»; en la portada, «Gestión en cifras», «Casos atendidos», «Gestión y obras» y «Avisos de servicio»; en el menú, «Gestión y obras»; en «El gobernador», «Material para la prensa».',
        'En el panel, cada nota traída de la web oficial lleva arriba el aviso «Traído de la web vieja».',
      ],
      faq: [
        { q: '¿Qué es de verdad y qué es de ejemplo en la web de prueba?', a: 'Lo de la web (noticias, opinión, biografía, fotos y Semanario) viene de la web oficial. Las personas del panel y las solicitudes de «Atención ciudadana» son de ejemplo, y sus siete preguntas frecuentes ya venían escritas en la app.' },
        { q: '¿Qué significa «(demo)» en las solicitudes?', a: 'Que es una solicitud de ejemplo, para practicar: todas las solicitudes de la versión de prueba lo llevan en el título.' },
      ],
      easy: 'Lo que se publica en la web de prueba es copia de la web oficial; la gente y las solicitudes que se ven en el panel son inventadas, para practicar.',
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
      what: 'La franja «Versión de prueba en revisión. No es el sitio oficial.» va arriba de cada página de la web y se repite al final del pie. No se puede cerrar y dice siempre lo mismo.',
      items: [
        'Los formularios de «Atención ciudadana» avisan aparte, arriba: «Versión de prueba. No escriba datos reales.».',
        'Debajo explican que cualquier persona que use la prueba puede ver lo que se envía, y que se borra.',
      ],
      cannot: {
        boss: [
          'No: la franja no se puede cerrar ni cambiar. Dice siempre «Versión de prueba en revisión. No es el sitio oficial.» mientras la web sea de prueba.',
        ],
        admin: [
          'No: la franja no se puede cerrar ni cambiar. Dice siempre «Versión de prueba en revisión. No es el sitio oficial.» mientras la web sea de prueba.',
        ],
      },
      rules: [
        'La franja dice siempre lo mismo y no se puede cerrar.',
      ],
      why: 'Porque cualquiera con el enlace puede entrar a la prueba: nadie debe poder hacerla pasar por la web oficial.',
      faq: [
        { q: '¿Qué es la franja de arriba de la web?', a: 'El aviso de la versión de prueba: «Versión de prueba en revisión. No es el sitio oficial.». Sale arriba de cada página y se repite al final del pie, y no se puede cerrar.' },
        { q: '¿Por qué el formulario de atención dice que no se escriban datos reales?', a: 'Porque es la versión de prueba: lo que se envía lo puede ver cualquier persona que use la prueba, y se borra de vez en cuando.' },
      ],
      easy: 'Es el aviso de arriba que dice que esta web es de prueba. Sale siempre y no se quita.',
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
      what: 'En la versión de prueba, el nombre, el cargo, las cuentas, los contactos y la franja de aviso quedan como están. «Navegación» y «Pie de página» sí se cambian.',
      items: [
        'Arriba de «Ajustes del sitio» dice «Esta demostración muestra el contenido de la web oficial: el nombre, el cargo, las cuentas, los contactos y la franja de aviso quedan como están.».',
        'Si alguien guarda uno de esos ajustes, sale «En esta versión de prueba con el contenido de la web oficial, el nombre, las cuentas, los contactos y la franja de aviso no se cambian.».',
      ],
      why: 'Porque cualquiera con el enlace puede entrar a la prueba, y nadie debe poder hacerla pasar por la web oficial.',
      faq: [
        { q: '¿Por qué hay ajustes del sitio que no se dejan cambiar?', a: 'Porque es la versión de prueba: el nombre, el cargo, las cuentas, los contactos y la franja de aviso quedan como en la web oficial. «Navegación» y «Pie de página» sí se cambian.' },
      ],
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
      what: 'En la versión de prueba se entra al panel con un toque, sin código ni doble factor: es un atajo que solo existe en la prueba.',
      items: [
        'Para empezar: el editor de la web, en «Noticias y comunicados» → «Nueva noticia»; el aprobador, en «Por aprobar» y «Ajustes del sitio»; la coordinación, en la «Bandeja»; auditoría, en «Cifras» y «Registro».',
        { boss: 'Tú entras a tu «Inicio», con «Web» y «Atención» en el menú. Administración entra a «Hoy» y empieza por «Ajustes» → «Equipo».', admin: 'Tú entras a «Hoy» y empiezas por «Ajustes» → «Equipo». El jefe entra a su «Inicio», con «Web» y «Atención» en el menú.' },
        'Las personas de la lista son de ejemplo. Cuando la web abra al público, nadie entra así: cada persona entra con su correo, el código que le llega por correo y Google Authenticator.',
      ],
      tasks: [
        { id: 'entrar-un-toque', title: 'Entrar a la prueba con un toque', steps: ['En la web, toca «Acceso del personal», al final del pie.', 'En la tarjeta «Versión de demostración», baja hasta «La web y la atención ciudadana». Más arriba está el resto del equipo, con «El jefe» y «Administración».', 'Toca la fila de un rol: a la derecha dice «Entrar →». Entras directo, sin código ni doble factor.', 'Para cambiar de rol: «Mi cuenta» (el ícono de la persona, arriba a la derecha) → «Salir».'] },
      ],
      faq: [
        { q: '¿Cómo me cambio de rol en la prueba?', a: '«Mi cuenta», arriba a la derecha → «Salir». Después tocas otro rol en «Versión de demostración».' },
        { q: '¿Con qué roles se practica la web y la atención en la prueba?', a: 'La web, con «Editor de la web» y «Aprobador de la web». La atención, con «Coordinador de atención», los dos «Responsable de área», «Operador de denuncias» y «Consulta y auditoría».' },
        { q: 'Cuando la web abra, ¿se va a seguir entrando con un toque?', a: 'No: nadie entra así. Cada persona entra con su correo, el código que le llega por correo y Google Authenticator.' },
      ],
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
      what: 'Los tres comprobantes de prueba se abren en «Consultar mi solicitud», sin entrar al panel. Sus códigos y sus claves están en la guía de atención: yo no doy ni pido códigos ni claves.',
      items: [
        'Uno es un reporte de un hueco que está «En atención», con tres apoyos y un reporte repetido unido.',
        'Otro es un reporte ya resuelto: la consulta dice «Resuelta» y pregunta «¿Se resolvió el problema?».',
        'El tercero es un reporte que «Requiere información»: se responde en «Responder la solicitud de información».',
        'El número del medio del código es el año en curso.',
        'Con los roles de atención, los mismos tres casos se ven por dentro: en la «Bandeja», se busca su código.',
      ],
      cannot: {
        boss: [
          'No: yo no doy ni pido códigos ni claves, tampoco los de prueba. Están en la guía de atención, en «Ayuda y guías», y se abren en «Consultar mi solicitud».',
        ],
        admin: [
          'No: yo no doy ni pido códigos ni claves, tampoco los de prueba. Están en la guía de atención, en «Ayuda y guías», y se abren en «Consultar mi solicitud».',
        ],
      },
      faq: [
        { q: '¿Para qué son los comprobantes de prueba?', a: 'Para practicar la consulta de la persona en «Consultar mi solicitud», sin entrar al panel, y ver los mismos casos por dentro en la «Bandeja».' },
        { q: '¿Qué es cada uno de los tres comprobantes de prueba?', a: 'Un reporte de un hueco que está «En atención», un reporte ya resuelto y un reporte que «Requiere información». Sus códigos y sus claves están en la guía de atención.' },
      ],
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
      what: 'Lo que se crea o se cambia en la prueba se borra de vez en cuando: la prueba vuelve a lo que traía al empezar.',
      items: [
        'Se borra una noticia, una solicitud, una respuesta o un ajuste. Después vuelven el contenido de la web oficial y las solicitudes de ejemplo, con sus tres comprobantes.',
        'Lo que alguien crea a veces no aparece en la pantalla siguiente, ni desde otra cuenta u otro teléfono: pasa solo en la prueba.',
        'Para practicar entre roles, lo más seguro es usar lo que ya viene cargado: las solicitudes de ejemplo y los tres comprobantes.',
        '«Por aprobar» empieza vacío: dice «No hay nada esperando aprobación. ¡Al día!». Para practicar la aprobación, el editor envía una noticia y quien aprueba la busca ahí.',
        'No escribas datos reales de nadie: lo que se envía en la prueba lo puede ver cualquiera que la use.',
      ],
      faq: [
        { q: '¿Lo que cambio en la prueba se queda?', a: 'No: se borra de vez en cuando, y la prueba vuelve a lo que traía al empezar. Lo recién hecho tampoco se ve siempre desde otra cuenta u otro teléfono.' },
        { q: 'Mandé una noticia a aprobar y no sale en «Por aprobar», ¿qué pasó?', a: 'Es un límite de la prueba: lo recién creado a veces no aparece en la pantalla siguiente, ni desde otra cuenta u otro teléfono. Para practicar entre roles, usa lo que ya viene cargado.' },
        { q: '¿Por qué «Por aprobar» dice «No hay nada esperando aprobación. ¡Al día!»?', a: 'Porque en la prueba empieza vacío. Para practicar, el editor envía una noticia y quien aprueba la busca ahí.' },
      ],
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
      what: 'Quién hace qué en la web y en la atención: cada persona entra con su propio usuario y con doble factor, y estos roles tienen solo «Web» o «Atención» en el menú. El jefe y Administración tienen los dos.',
      items: [
        'Cada persona entra con su usuario y el doble factor: el código que llega por correo y el de Google Authenticator. No hay contraseñas. En la versión de prueba se entra con un toque.',
        'Los roles los da Administración en «Ajustes» → «Equipo» → «Invitar a alguien», en el grupo «Web y atención ciudadana (siempre con doble factor)».',
        'La web tiene dos roles: «Editor de la web», que escribe y envía a aprobación pero no publica, y «Aprobador de la web», que revisa, publica, programa y archiva, y cambia los ajustes del sitio.',
        'La atención tiene cuatro: «Coordinador de atención» (todo lo que llega, denuncias también), «Responsable de área» (lo de su área, nunca denuncias), «Operador de denuncias» (solo las denuncias) y «Consulta y auditoría» (lee sin contactos ni denuncias).',
        { boss: 'Tú tienes «Web» y «Atención»: publicas la web y lees la atención y sus cifras. Administración también tiene los dos, para personas, áreas, plazos y ajustes, y nunca lee un caso ni publica.', admin: 'Tú tienes «Web» y «Atención»: personas, áreas, plazos y ajustes; nunca lees un caso ni publicas. El jefe también tiene los dos: publica la web y lee la atención y sus cifras.' },
        'Las personas de la web y de la atención no tienen el buscador de arriba («Buscar evento o pieza»): busca eventos y piezas, que solo ven el equipo y Administración. Ellas buscan dentro de «Web» o de «Atención».',
      ],
      faq: [
        { q: '¿Quién da los roles de la web y de la atención?', a: { boss: 'Administración, en «Ajustes» → «Equipo» → «Invitar a alguien», con el rol en «Web y atención ciudadana (siempre con doble factor)».', admin: 'Tú, en «Ajustes» → «Equipo» → «Invitar a alguien», con el rol en «Web y atención ciudadana (siempre con doble factor)».' } },
        { q: '¿Por qué a los de la web no les sale el buscador de arriba?', a: 'Porque ese buscador encuentra eventos y piezas, que no son de su trabajo: lo tienen solo el equipo y Administración. Las personas de la web y de la atención no tienen el buscador: buscan dentro de «Web» o de «Atención».' },
        { q: '¿Cómo entran las personas de la web y de la atención al panel?', a: 'Con su correo, el código que les llega por correo y el código de Google Authenticator: siempre con doble factor y sin contraseña.' },
        { q: '¿Qué roles hay para la web y para la atención?', a: 'Para la web, «Editor de la web» y «Aprobador de la web». Para la atención, «Coordinador de atención», «Responsable de área», «Operador de denuncias» y «Consulta y auditoría».' },
      ],
      easy: 'Cada persona de la web o de la atención tiene un solo menú: «Web» para escribir y publicar, o «Atención» para atender lo que manda la gente.',
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
      what: 'El editor de la web escribe: crea contenidos, sube fotos y PDF a la «Biblioteca» y envía a aprobación. Nunca publica.',
      items: [
        'Entra a «La web», con «Inicio», «Por aprobar» y «Biblioteca». Ve todo el contenido, borradores incluidos.',
        'Crea con «Nueva noticia» (u otro tipo) y «Crear borrador», escribe y toca «Guardar borrador». Cada foto va con su «Texto alternativo».',
        'Mira la «Vista previa» y toca «Enviar a aprobación». Puede «Volver a esta versión» en el borrador.',
        'No publica, no entra a «Ajustes del sitio» ni a «Redirecciones» y no ve las solicitudes de la gente.',
      ],
      faq: [
        { q: '¿El editor de la web puede publicar?', a: 'No: el editor escribe y envía a aprobación. Publican el aprobador de la web y el jefe.' },
      ],
      example: 'Por ejemplo: la editora escribe una noticia, le pone una foto de la biblioteca con su texto alternativo, la mira en la vista previa y toca «Enviar a aprobación». Desde ahí espera en «Por aprobar».',
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
      what: 'El aprobador de la web revisa y decide: publica, programa, devuelve con un comentario y archiva. También cambia los ajustes del sitio y las redirecciones.',
      items: [
        'Hace todo lo del editor y, además, tiene «Ajustes del sitio» y «Redirecciones».',
        'En «Por aprobar» mira «Qué cambia si lo publicas» y decide: «Publicar ahora», «Programar» o «Devolver con comentario». También «Archivar» y «Desarchivar».',
        'Cambia la dirección de lo ya publicado: la vieja sigue llevando a la nueva.',
        'Le llega el aviso «Hay contenido de la web por aprobar». No ve las solicitudes de la gente.',
      ],
      faq: [
        { q: '¿Al aprobador le llega aviso de lo que hay por aprobar?', a: { boss: 'Sí: le llega «Hay contenido de la web por aprobar», en la campana y en el teléfono. A ti no te llega: lo ves en la lista de «Por aprobar».', admin: 'Sí: le llega «Hay contenido de la web por aprobar», en la campana y en el teléfono. Al jefe no le llega: lo ve en la lista de «Por aprobar».' } },
        { q: '¿El editor y el aprobador de la web ven lo que manda la gente?', a: 'No: no ven las solicitudes de la gente. Eso es de los roles de «Atención».' },
      ],
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
      what: 'El coordinador de atención ve todo lo que llega, denuncias también, con el contacto de la persona, y dirige la atención: asigna, pone prioridad y fecha, une casos y publica en «Casos atendidos».',
      items: [
        'Entra a «Atención ciudadana», en la «Bandeja». Sus pestañas: «Bandeja», «Tablero», «Mapa», «Cifras», «Áreas y plazos» (para leer) y «Respuestas guardadas».',
        'Asigna a cualquier área, pone la prioridad y la fecha comprometida, une casos iguales y corrige el tipo o la categoría.',
        'Modera, y borra un contacto si la persona lo pide. Arma las «Respuestas guardadas».',
        'Descarga la lista en un archivo que se abre en Excel, con o sin el contacto («Exportar lo que ves (CSV)»).',
        'No cambia las áreas ni los plazos: eso es de Administración.',
      ],
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
      what: 'El responsable de área atiende lo de sus áreas y lo que le asignen: responde a la persona, escribe notas internas, cambia el estado y sube evidencias. Nunca ve una denuncia.',
      items: [
        'Entra a «Atención ciudadana». Sus pestañas: «Bandeja», «Tablero», «Mapa» y «Respuestas guardadas».',
        'No ve los casos de otras áreas: no le salen en la lista.',
        'Ve el contacto de la persona. Asigna dentro de su área o se queda el caso con «Tomar el caso».',
        'No cambia el área, la prioridad ni la fecha: se lo pide a la coordinación. No ve las «Cifras» ni exporta.',
      ],
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
      what: 'El operador de denuncias ve y atiende solo las denuncias, como un responsable de área. En ellas también pone la prioridad y la fecha, y modera.',
      items: [
        'Entra a «Atención ciudadana», con las mismas pestañas del responsable.',
        'Su mapa está vacío: una denuncia nunca lleva el punto exacto.',
        'Una denuncia no tiene área: en su caso, la tarjeta «Área y responsable» dice «Denuncias».',
      ],
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
      what: 'Consulta y auditoría solo lee: ve todo menos las denuncias, que cuentan solo en los totales, y nunca ve un contacto.',
      items: [
        'Sus pestañas: «Bandeja», «Tablero», «Mapa», «Cifras», «Áreas y plazos» y «Registro».',
        'Mira las «Cifras» y el «Registro».',
        'Descarga la lista en un archivo que se abre en Excel, siempre sin contactos («Descargar CSV»).',
      ],
      faq: [
        { q: '¿Qué es el registro de atención?', a: { boss: 'Quién hizo qué y cuándo en la atención: los cambios, los contactos vistos y las exportaciones. Lo leen auditoría y Administración, y no se edita ni se borra.', admin: 'Quién hizo qué y cuándo en la atención: los cambios, los contactos vistos y las exportaciones. Lo lees tú y lo lee auditoría, y no se edita ni se borra.' } },
      ],
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
      what: { boss: 'Tú tienes «Web» y «Atención» en el menú (en el teléfono, en «Más»). En «Web» haces lo mismo que el aprobador; en «Atención» lees como auditoría.', admin: 'El jefe tiene «Web» y «Atención» en el menú. En «Web» hace lo mismo que el aprobador; en «Atención» lee como auditoría.' },
      items: [
        { boss: 'En «Web» publicas, programas, devuelves y archivas, como el aprobador. El aviso de «Por aprobar» no te llega: lo ves en la lista.', admin: 'En «Web» publica, programa, devuelve y archiva, como el aprobador. El aviso de «Por aprobar» no le llega: lo ve en la lista.' },
        { boss: 'En «Atención» lees todo menos las denuncias, sin contactos, y miras las «Cifras». No exportas.', admin: 'En «Atención» lee todo menos las denuncias, sin contactos, y mira las «Cifras». No exporta.' },
      ],
      cannot: {
        boss: [
          'No: tú no exportas la lista de solicitudes. La exportan la coordinación y auditoría.',
          'No: tú no lees las denuncias. Las leen el operador de denuncias y la coordinación; tú las ves solo en los totales.',
          'No: tú no ves el contacto de la persona. Lo ven solo quienes atienden el caso: la coordinación y su responsable.',
          'No: tú no respondes a la gente ni cambias un caso. Lo atienden la coordinación, los responsables de área y el operador de denuncias; tú lo lees, como auditoría.',
        ],
      },
      faq: [
        { q: '¿Por qué no me llega el aviso de lo que hay por aprobar en la web?', a: { boss: 'Porque ese aviso le llega solo al aprobador de la web. Tú lo ves en la lista de «Por aprobar», con cuántos esperan.', admin: 'Porque ese aviso le llega solo al aprobador de la web. El jefe lo ve en la lista de «Por aprobar».' } },
      ],
      easy: { boss: 'En la web eres como el aprobador: publicas lo que manda el equipo de la web. En atención solo lees, sin contactos ni denuncias.', admin: 'En la web el jefe es como el aprobador: publica lo que manda el equipo de la web. En atención solo lee, sin contactos ni denuncias.' },
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
      what: { boss: 'Administración arma lo que hace falta para que la web y la atención funcionen: personas, áreas, plazos y ajustes. Nunca lee un caso ni publica contenido.', admin: 'Tú armas lo que hace falta para que la web y la atención funcionen: personas, áreas, plazos y ajustes. Nunca lees un caso ni publicas contenido.' },
      items: [
        { boss: 'Su «Web» abre «Ajustes del sitio». Lee todo, borradores incluidos, y cambia «Ajustes del sitio» y «Redirecciones». Nunca escribe ni publica contenido.', admin: 'Tu «Web» abre «Ajustes del sitio». Lees todo, borradores incluidos, y cambias «Ajustes del sitio» y «Redirecciones». Nunca escribes ni publicas contenido.' },
        { boss: 'Su «Atención» muestra «Áreas y plazos» y «Registro de atención»: arma las áreas, dice quién está en cada una, pone el área y los días de cada categoría y los plazos. Nunca abre un caso.', admin: 'Tu «Atención» muestra «Áreas y plazos» y «Registro de atención»: armas las áreas, dices quién está en cada una, pones el área y los días de cada categoría y los plazos. Nunca abres un caso.' },
        { boss: 'En «Ajustes» → «Equipo» invita a cada persona y le da su rol. Si alguien perdió el teléfono, toca «Cambiar» en su fila y después «Reiniciar doble factor».', admin: 'En «Ajustes» → «Equipo» invitas a cada persona y le das su rol. Si alguien perdió el teléfono, tocas «Cambiar» en su fila y después «Reiniciar doble factor».' },
        { boss: 'La misma cuenta de Administración no puede ser aprobador de la web ni tener un rol de atención. Sí puede ser editor de la web.', admin: 'Tu cuenta de Administración no puede ser también aprobador de la web ni tener un rol de atención: para eso hace falta otra cuenta. Sí puede ser editor de la web.' },
      ],
      cannot: {
        admin: [
          'No: con tu misma cuenta no puedes ser aprobador de la web ni tener un rol de atención; hace falta otra cuenta. La pantalla dice «Administración no publica la web ni lee las solicitudes ciudadanas: usa otra cuenta.». Sí puedes ser editor de la web.',
          'No: tú no abres casos ni lees solicitudes. Los atienden la coordinación y los responsables de área.',
          'No: tú no escribes ni publicas contenido de la web. Eso lo hacen el editor, el aprobador de la web y el jefe.',
        ],
      },
      faq: [
        { q: 'Si alguien de la web pierde el teléfono del doble factor, ¿quién lo ayuda?', a: { boss: 'Administración: en «Ajustes» → «Equipo», «Cambiar» en la fila de esa persona y después «Reiniciar doble factor».', admin: 'Tú: en «Ajustes» → «Equipo», «Cambiar» en la fila de esa persona y después «Reiniciar doble factor».' } },
        { q: '¿Administración también puede ser aprobadora de la web?', a: { boss: 'No con la misma cuenta: Administración no puede ser aprobador de la web ni tener un rol de atención. Sí puede ser editor de la web.', admin: 'No con tu misma cuenta: hace falta otra. Sí puedes ser editor de la web.' } },
      ],
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
      what: 'Cómo se edita la web, en cinco pasos: crear el borrador, escribir y guardar, mirar la vista previa y enviar a aprobación, que quien aprueba decida y, si algo salió mal, archivar o volver a una versión.',
      items: [
        'La portada y las páginas se arman por bloques: «Agregar un bloque», «Subir», «Bajar» y «Ocultar».',
      ],
      tasks: [
        { id: 'editar-web', title: 'Editar la web en cinco pasos', audience: ['boss'], steps: ['«Web» → el tipo de contenido (por ejemplo «Noticias y comunicados») → «Nueva noticia» → «Título» → «Crear borrador».', 'Escribe y toca «Guardar borrador». Las fotos van desde la biblioteca, siempre con su texto alternativo.', '«Vista previa» para verlo como saldrá → «Enviar a aprobación».', 'Quien aprueba entra a «Por aprobar», mira «Qué cambia si lo publicas» y decide: «Publicar ahora», «Programar» (hora del Táchira) o «Devolver con comentario».', 'Si algo salió mal: «Archivar» lo saca al momento, y «Versiones» → «Volver a esta versión» recupera lo de antes.'] },
      ],
      cannot: {
        admin: [
          'No: tú no editas ni publicas contenido. Lo hacen el editor de la web, el aprobador y el jefe; tú lees todo.',
        ],
      },
      faq: [
        { q: '¿Y si algo salió mal después de publicar?', a: '«Archivar» lo saca de la web al momento, sin borrar nada. Si fue un cambio equivocado, «Versiones» → «Volver a esta versión», y se publica otra vez.' },
      ],
      easy: 'Se escribe un borrador, se mira cómo quedará, se manda a aprobar y quien aprueba lo publica. Si algo sale mal, se archiva o se vuelve a una versión de antes.',
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
      what: 'Cómo se atiende lo que llega, en cinco pasos: la bandeja, revisar y asignar, responderle a la persona, trabajar el caso y resolverlo con su justificación.',
      tasks: [
        { id: 'atender-caso', title: 'Cómo se atiende lo que llega, en cinco pasos (lo hacen la coordinación, las áreas y denuncias)', steps: ['Quien atiende entra a «Atención» → «Bandeja» (o «Tablero»). Lo nuevo está en «Por revisar».', 'Abre el caso, lo lee y lo pasa a «En revisión». Lo asigna con «Guardar asignación», o lo toma con «Tomar el caso».', 'Con «Escribir» → «Respuesta a la persona» le dice que ya la tienen, de usted, como le habla la web. Lo que es solo para el equipo va en «Nota interna»: nunca se mezclan.', 'Lo trabaja («En atención»). Si falta un dato, «Pedir más información». Al terminar, «Subir evidencia».', '«Resuelto» con su justificación. La persona confirma desde su consulta; después, «Cerrado». La coordinación publica en «Casos atendidos» sin datos de la persona.'] },
      ],
      cannot: {
        boss: [
          'No: tú no atiendes los casos. Los atienden la coordinación, los responsables de área y el operador de denuncias; tú los lees.',
        ],
        admin: [
          'No: tú no atiendes casos ni los abres. Los atienden la coordinación, los responsables de área y el operador de denuncias.',
        ],
      },
      faq: [
        { q: '¿En la respuesta a la gente se le habla de tú?', a: 'No: de usted, como le habla la web. Lo que es solo para el equipo va en «Nota interna», y nunca se mezclan.' },
      ],
      easy: 'Llega un caso, alguien lo toma, le avisa a la persona que ya lo tiene, lo resuelve y lo cierra. Lo que es solo del equipo va en notas internas.',
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
      what: 'Lo que nunca se hace con la web y la atención: publicar sin aprobación o con datos inventados, subir a la biblioteca de la web cosas de la gente, contar una denuncia, prometer fechas y copiar contactos.',
      cannot: {
        boss: [
          'No: una foto o un archivo que mandó alguien por Atención nunca va a la biblioteca de la web, que es pública. Los archivos de las solicitudes van aparte, en privado.',
          'No: a la gente no se le prometen fechas ni plazos. La fecha comprometida es interna.',
          'No: el contacto de una persona no sale de su caso, ni a otro funcionario ni a un grupo.',
          'No: de una denuncia no se publica nada, y el nombre de alguien sale solo con su permiso.',
        ],
        admin: [
          'No: una foto o un archivo que mandó alguien por Atención nunca va a la biblioteca de la web, que es pública. Los archivos de las solicitudes van aparte, en privado.',
          'No: a la gente no se le prometen fechas ni plazos. La fecha comprometida es interna.',
          'No: el contacto de una persona no sale de su caso, ni a otro funcionario ni a un grupo.',
          'No: de una denuncia no se publica nada, y el nombre de alguien sale solo con su permiso.',
        ],
      },
      rules: [
        'Nunca se publica sin aprobación, ni con datos inventados: biografía, teléfonos, cuentas o cifras sin fuente.',
        'Nunca se suben a la biblioteca de la web, que es pública, fotos o archivos de la gente que escribe a Atención.',
        'Nunca se cuenta en público algo de una denuncia, ni el nombre de alguien sin su permiso.',
        'Nunca se prometen fechas, plazos ni una atención de emergencia.',
        'Nunca se copia el contacto de una persona fuera de su caso.',
      ],
      why: 'Porque la web es pública y lo que llega a Atención es privado: lo de cada persona se queda en su caso.',
      faq: [
        { q: '¿Qué es lo que nunca se hace con la web y la atención?', a: 'Publicar sin aprobación o con datos inventados, subir a la biblioteca de la web fotos o archivos de la gente, contar algo de una denuncia o un nombre sin permiso, prometer fechas o plazos, y copiar el contacto de una persona fuera de su caso.' },
      ],
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
      what: 'Dónde está el detalle: cada pantalla de «Web», paso a paso, en el manual de la web; cada pantalla de «Atención», en el manual de atención; y cada flujo dibujado, con lo que hay que saber, en los flujos.',
      items: [
        'Están en «Ayuda y guías», en dos guías: «La web» y «Atención ciudadana».',
      ],
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
