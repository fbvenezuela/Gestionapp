# La plataforma de Freddy Bernal: la idea completa

Actualizado: 22/10/2026 (noche: §4 y §5 nuevos, §11 con lo que faltaba de los audios del 12 y 14/10 y de los grupos). Lo armó Juan con lo que pidió Hillary (Impulso Digital) entre el 12 y el 22 de octubre. El texto literal de cada pedido está en `requisitos-originales.md`. Lo que está por decidir está en `PENDIENTES.md`. El modelo visual, en `DISENO.md`.

## 1. Para quién y para qué
- **Cliente:** Freddy Bernal, gobernador del Táchira (Venezuela). Sus videos y mensajes abren con «¡Saludos, Táchira!». Canal de YouTube @FreddyBernal.oficial, cuenta de X @freddybernal_ve. El programa de videos se llama «Reporte Bernal 2.0».
- **Quién lo contrata:** B360 Digital (Leo), que lleva al cliente. **Impulso Digital** (Hillary y Oscar) hace la estrategia y gestiona las redes. **Juan** lleva YouTube, la página web y esta plataforma.
- **El problema:** el despacho y el equipo no tienen un lugar central. Los reportes de la gente, las denuncias, las ayudas, la agenda y el contenido de redes van por WhatsApp, papel y cuentas sueltas. La gestión se hace pero no se ve.
- **La idea:** una sola plataforma con dos caras:
  1. **Una cara pública (la web del gobernador):** muestra la gestión día a día y permite a cualquier persona reportar un problema, hacer una denuncia o pedir una ayuda, y ver en tiempo real lo que se va atendiendo.
  2. **Una cara interna (el panel del equipo):** el estudio de contenido de redes, la agenda del gobernador y los paneles para atender reportes, denuncias y ayudas.

## 2. Principios que no se negocian
1. **Simple, muy simple.** Hillary: la gente del equipo «es muy poco didáctica con la tecnología» y se confundiría con muchas pestañas. Pocos botones, textos cortos, una línea de tiempo en vez de menús. La persona que reporta lo hace en los menos pasos posibles.
2. **Para un celular modesto y una conexión mala.** Pensada para Android de gama baja y conexiones lentas o que se cortan: páginas livianas, imágenes comprimidas antes de subir y PWA instalable.
3. **Todo en cuentas del cliente**, nunca en las de Juan: Vercel, Supabase, Google y Metricool con el correo del cliente, y Juan como usuario administrador. Nunca claves compartidas por chat.
4. **Privacidad y seguridad desde el primer día.** Hay datos de personas (teléfonos, direcciones, denuncias con víctimas e implicados). Ver §9.
5. **Lo que se publica es verdad.** Las fotos «mejoradas» con IA solo corrigen luz, nitidez y encuadre. Nunca agregan ni quitan nada de lo que muestra la foto, y la original se guarda siempre.

## 3. Los módulos

### 3.1 Estudio de contenido (interno; es lo que Hillary pide ya)
Inspirado en el «estudio de contenido» que ya se hizo para otra clienta (Mila). Es para el equipo de redes: Hillary, Nesmaury, Larissa, Yessica y Fernando Alvarado, que revisa lo político.
- **Programador de tweets conectado con Metricool**
  - Se pega en un cuadro de texto una tanda de tweets (unos 150 al mes) y la plataforma los separa sola.
  - Les reparte fechas y horas solas, a partir del día de carga: 4 o 5 diarios, a horas que tengan sentido y que se puedan configurar.
  - Permite agregar una imagen de referencia a cada tweet, como muestra de que lo que se dice es real.
  - Se revisa y se le da a **«Programar»**: todo se manda a Metricool sin poner fecha por fecha.
  - Avisa en la plataforma cuando falten 5 o 6 días para que se acaben los tweets programados, para preparar la siguiente tanda.
- **Métricas por publicación.** Cada publicación muestra:
  - la hora en que se publicó;
  - el formato (reel, carrusel, foto, tweet, short);
  - el link;
  - las visualizaciones y la interacción, en tiempo real si Metricool lo permite;
  - un análisis corto con IA de por qué puede estar funcionando o no.
- **Biblioteca de videos conectada con Google Drive.** Los videos que edita Hillary aparecen en la plataforma y el equipo los descarga desde ahí. La biblioteca incluye el copy, la portada y los hashtags de cada uno.
- **Categorías:** todo el contenido usa la lista de categorías de Hillary del 20/10, en `requisitos-originales.md`: Gestión y obras, Bienestar social, Formación, Orden y comunidad, Economía y producción, Identidad tachirense, Deporte y recreación, Ambiente y Gobierno, con sus subcategorías.
- **Aprobación:** antes de programar, una vista para que Fernando Alvarado (supervisión política) apruebe o comente.

### 3.2 Trazabilidad de la gestión (pública; la sección estrella de la web)
- Una **línea de tiempo** que se va construyendo sola con lo que se hace cada día: obras, entregas, visitas, reuniones.
- Cada entrada lleva:
  - un título corto (máximo 80 a 100 caracteres, para que no dé flojera leerlo);
  - foto o video;
  - fecha;
  - municipio o parroquia;
  - una etiqueta de categoría.
- **Filtro solo por día o fecha.** No por etiqueta: Hillary no quiere que se vuelva un enredo visual. Sin filtro se ve la línea de tiempo completa, lo más nuevo primero.
- **Perfil «redactor»:** puede crear y editar entradas pero **no borrar**. Lo usaría por ejemplo el equipo de William, director de política y participación ciudadana, que lleva a los voceros de los 29 municipios y las 66 parroquias.
- Al subir una foto «horrible» de celular, la plataforma ofrece la versión mejorada con el prompt maestro de imagen de Hillary (ver §2.5 y `PENDIENTES.md`).

### 3.3 Reportes de servicios públicos con mapa (público)
- La persona abre el mapa, marca su ubicación (o la toma el GPS) y elige qué pasa:
  - hueco en la vía;
  - falla de luz;
  - acueducto o agua;
  - tubería rota o filtración;
  - otro.
  Puede agregar una foto. Son tres pasos como mucho.
- Recibe una **notificación inmediata** de que el reporte entró y queda en una lista de prioridades.
- **No puede repetir el mismo reporte más de tres veces**: el mismo problema en el mismo sitio. Lo que ya está reportado cerca se le muestra para que lo apoye en vez de duplicarlo, hasta que se solucione.
- Un **operador de reportes viales y servicios** lo atiende desde el panel con estos estados: recibido, en revisión, asignado, en ejecución y resuelto. Cuando se resuelve, sube la foto del después.

### 3.4 Denuncias (pública para hacerlas, privada para leerlas)
- Formulario con:
  - naturaleza de la denuncia y categoría;
  - implicados y víctima;
  - pruebas adjuntas (foto, video o documento);
  - ubicación;
  - contacto de quien denuncia, con la opción de dejarlo anónimo;
  - quién se haría cargo.
- Mensaje al enviar: si la denuncia es grave, lo correcto es acudir también a las autoridades competentes, con los datos de contacto.
- Lo atiende un **operador de denuncias**. **Nada de una denuncia es público**: ni nombres, ni pruebas, ni ubicación exacta. En público solo aparece algo como «denuncia atendida en el municipio X», sin datos personales.

### 3.5 Ayudas (pública para pedirlas)
- Formulario con:
  - nombre;
  - dónde vive;
  - teléfono y correo;
  - qué necesita (prótesis, medicinas, silla de ruedas…);
  - por dónde prefiere que lo contacten.
- Lo atiende un **operador de ayudas**, que registra cada entrega.
- Sirve también para saber puntualmente a quién se está ayudando y sacar reportes.

### 3.6 «Lo que se va atendiendo» en tiempo real (en las tres secciones públicas)
- Arriba de cada sección (reportes, denuncias y ayudas) va un **feed en vivo** de lo que se resuelve. Por ejemplo: mientras alguien escribe su solicitud, le van llegando avisos como «A Jesús P. ya se le entregó la prótesis dental» o «Reparado el hueco de la calle 5 de Capacho».
- Cada sección tiene dos partes: donde se hace la solicitud y donde se ve lo atendido. Las dos están conectadas a la trazabilidad.
- Los nombres de beneficiarios salen **solo con su permiso**. Si no, se muestran sus iniciales. Decisión pendiente: ver `PENDIENTES.md`.
- Las personas que llenan esto ya existen: hay un cuerpo de personas dedicado a eso. Hace falta darles sus usuarios.

### 3.7 Agenda del gobernador (interna)
- El **despacho** (secretarías, por ejemplo la de Economía) carga en un solo lugar los eventos y las solicitudes de audiencia, con categoría (Economía, Salud, Transporte…), fecha, lugar y quién lo pide.
- El gobernador (o quien él diga) **califica de 1 a 10 la importancia** de cada evento, acepta o rechaza, y arma su agenda.
- Funciona como un planificador: vista de día, semana y mes, sin choques de horario. Al aceptar un evento, puede generar una entrada de trazabilidad y una pieza de contenido.
- Hillary lo propuso porque la secretaría de Economía dijo que no tienen un lugar de organización centralizado. Ya se había conversado con Leo.

### 3.8 La web del gobernador (pública)
- Se rehace la página desde cero, cuando lleguen los accesos al dominio y al hosting. Esos accesos los tiene el Ing. Pedro Poller.
- La portada lleva:
  - un mensaje corto;
  - la trazabilidad;
  - accesos grandes a «Reportar», «Denunciar» y «Pedir ayuda»;
  - lo atendido hoy;
  - sus videos de YouTube.
- **SEO:** hoy en Google sale un futbolista con el mismo nombre. La web tiene que posicionar a «Freddy Bernal, gobernador del Táchira»:
  - datos estructurados de persona y organización;
  - Search Console;
  - sitemap;
  - títulos y descripciones correctos;
  - enlaces con YouTube y las redes.

## 4. Quién usa qué (roles; actualizado con §10.3 y §11)
Cada persona tiene **su propio usuario** aunque varias compartan el mismo rol: así se sabe quién hizo qué y cada una
tiene su doble factor. Lo que Hillary llamó «un solo perfil» para redes es **un solo rol** con los mismos permisos
para las cuatro (ver `PENDIENTES.md`).

| Rol | Quién | Qué puede hacer |
|---|---|---|
| Administrador | Juan, Hillary | Todo: usuarios, roles, configuración, borrar (borrado lógico, con registro) |
| Jefe | Freddy Bernal (y quien él diga) | Vista completa con dos entradas, **Política** y **Digital**. Agenda en calendario, fichas, calificar eventos de 1 a 10, aceptar o rechazar, ropa |
| Director de despacho | el director de despacho | Crear eventos y llenar la ficha técnica (fecha, hora, lugar, cómo llegar, de qué es la obra, responsables, qué se logra) |
| Secretaría | secretarías (por ejemplo Economía) | Proponer eventos y pedir audiencias; ve solo lo suyo |
| Redes | Hillary, Nesmaury, Larissa, Yessica (un solo rol, todas hacen de todo) | Eventos **sin fecha ni hora**, storyboard y lo que va a decir, material, piezas, copies, tweets, publicar, resultados |
| Supervisión política | Fernando Alvarado | Ver todo lo que se va a publicar, aprobar o pedir cambios |
| Grabación | quien graba cada evento | Ver la ficha de su evento (lo necesario para llegar) y subir el material en tres partes |
| Redactor de trazabilidad | equipo de William y los voceros de los 29 municipios y 66 parroquias | Crear y editar entradas de trazabilidad y obras, **sin borrar** |
| Operador de reportes | personas designadas | Atender y cambiar el estado de los reportes de servicios |
| Operador de denuncias | personas designadas | Leer y atender denuncias (datos protegidos) |
| Operador de ayudas | personas designadas | Atender solicitudes y registrar entregas |
| Ciudadano | cualquiera | Reportar, denunciar, pedir ayuda, ver **lo suyo** y lo atendido. Sin cuenta, o con una muy simple |

## 5. El orden en que se construye (actualizado el 22/10 noche)
Juan le dijo a Hillary el 22/10: «mañana probamos y así a inicios de la semana que viene está listo para empezar a
usarse». Por eso la primera entrega es la **plataforma interna** con la cadena de producción, y la web pública va
después (siguen siendo las dos entregas pendientes).

1. **Fase 0: la base** (jueves 22 y viernes 23). Proyecto, cuentas conectadas (GitHub, Supabase, Vercel, Resend),
   usuarios y roles, categorías, diseño del modelo de Stitch con colores provisionales, datos de demostración
   inventados y versión de prueba en línea.
2. **Fase 1: lo que el equipo usa el lunes 26/10.** Agenda (calendario para el jefe y el despacho, lista sin fecha ni
   hora para redes) con la ficha técnica y el storyboard; material por evento en tres partes y registro por día;
   copies con fórmula en tres largos; tweets de la semana desde un documento; piezas, aprobación de Fernando y
   publicación **validada** (manual con link y captura); resultados por publicación cargados a mano o por archivo.
3. **Fase 2: publicar y medir solos.** Publicación automática por la API de cada red (Meta, X, TikTok, YouTube) a
   medida que aprueben los permisos; métricas automáticas, «a qué hora nos va mejor» y análisis con IA; sala de
   revisión con comentarios en el segundo exacto; conexión con el Drive del cliente.
4. **Fase 3: la web pública.** Portada con indicadores, trazabilidad y obras (redactores de William), reportes con
   mapa y su panel, ayudas, denuncias, lo atendido en vivo, prensa y YouTube, SEO. En un dominio de prueba hasta que
   lleguen los accesos del dominio.
5. **Fase 4:** solicitudes de audiencia y calificación de 1 a 10 completa, ropa, cuentas oficiales, equipos técnicos,
   tweets sugeridos desde la trazabilidad, fotos mejoradas con IA.
6. **Fase 5:** endurecimiento de seguridad, paso a producción en su dominio y dejarla lista para replicar con otros
   clientes (§11.6).

## 6. Tecnología (la misma que la plataforma de Juan)
- Next.js 16 (App Router) con React 19 y TypeScript, Tailwind 4, componentes tipo shadcn/Radix, zod y lucide.
- Supabase:
  - Postgres con Row Level Security en **todas** las tablas;
  - Auth;
  - Storage con buckets públicos y privados;
  - Realtime para los feeds en vivo;
  - PostGIS si hace falta buscar reportes cercanos.
- Despliegue en Vercel, en la cuenta del cliente.
- Mapas con MapLibre o Leaflet y OpenStreetMap, sin costo por uso. Google Maps solo si se decide pagarlo.
- ~~Metricool por su API~~ → **publicar con la API de cada red** (Hillary, 22/10: Metricool «no sería una buena
  opción para hacer la API»). Meta (Instagram, Facebook y Threads), X, TikTok y YouTube, cada una detrás de un
  adaptador con modo simulación y modo manual. Metricool, si acaso, solo para leer métricas (por decidir).
- Video grande (material crudo y finales): almacenamiento por partes que aguante cortes de señal. Dónde vive (Supabase
  Storage, Google Drive del cliente o un almacenamiento sin costo de salida) está por decidir en `PENDIENTES.md`.
- Google Drive API con la cuenta del cliente: leer y ordenar la carpeta por días que ya usa Hillary.
- **GitHub** (código), **Vercel** (versiones: una de prueba por cada cambio y la de producción) y **Resend** (correos
  del equipo: invitaciones, códigos de entrada y avisos). Detalle en el prompt maestro.
- IA, en el servidor y nunca con claves en el navegador:
  - análisis de métricas;
  - sugerencias de categoría;
  - mejora de fotos con el prompt maestro de Hillary.
  Hace falta una clave de API: la suscripción de Claude no sirve para eso.
- Correo transaccional (por ejemplo Resend) y notificaciones push web. WhatsApp o SMS solo si el cliente lo paga.
- Antispam en los formularios públicos (Cloudflare Turnstile o similar) y límites por persona y por IP.
- Pruebas con Vitest y Playwright, incluidas pruebas de accesibilidad.

## 7. Integraciones y cuentas que hacen falta (todas del cliente)
- Vercel, Supabase y GitHub (repositorio privado). Resend, con un dominio verificado para enviar.
- Dominio y DNS: los tiene Pedro Poller.
- Apps de desarrollador de Meta, X, TikTok y Google (YouTube y Drive), con las cuentas del cliente. Cada una pide su
  revisión o su plan: ver `PENDIENTES.md`.
- Metricool, con las redes conectadas (Hillary ya conectó las del iPad). Solo si se decide usarlo para métricas.
- Todas las cuentas que se abran se anotan en `docs/CUENTAS.md` (servicio, correo, plan, quién es administrador, si
  tiene doble factor). **Nunca la clave.** Oscar las pasa a su base de datos de cuentas.
- Google Cloud, para la API de Drive.
- Proveedor de IA (clave de API).
- Correo transaccional y Turnstile.
- Más adelante: Google Search Console y Analytics.

## 8. Lo que se entrega además del código
- `docs/ARQUITECTURA.md`: tablas, roles, flujo de cada módulo y por qué se eligió cada cosa.
- `docs/COSTOS.md`: lista de herramientas y cuentas con su costo mensual estimado y qué es opcional. Hillary la pidió para que la cubra el cliente.
- `docs/SEGURIDAD.md`: qué se hizo para blindar la plataforma.
- Guía corta de uso por rol, con capturas, para el equipo.

## 9. Seguridad y datos personales (blindar)
- **RLS en todas las tablas**, probada con pruebas automáticas: un rol no ve lo que no le toca. Los datos de denuncias y ayudas van en tablas y buckets privados, con URLs firmadas y vencimiento corto.
- **Registro de auditoría** de cada cambio: quién, qué y cuándo. El redactor no borra. El borrado es lógico y solo lo hace el administrador.
- **Doble factor obligatorio** para todo el personal y sesiones que caducan.
- Datos de contacto de denuncias y ayudas cifrados en la base. Se pide solo lo necesario: nunca afiliación política ni datos que no hagan falta para atender.
- Aviso de privacidad y casilla de consentimiento en cada formulario público. Se define cuánto tiempo se guardan los datos.
- Antispam, límites de envío y validación de archivos (tipo, tamaño, sin metadatos de ubicación en lo público).
- Copias de seguridad automáticas y procedimiento para restaurarlas.
- Secretos solo en variables de entorno. Nada de claves en el repositorio ni en el navegador.

## 10. Lo que Hillary agregó el 22/10 (17:45–17:54): cómo trabajan de verdad
Esto cambia y amplía lo de arriba. Si algo choca, manda esto.

### 10.1 La cadena de producción (de la agenda al video publicado)
1. **Ficha técnica de cada evento.** La llena el **director de despacho**, que habla con los lugares a donde va el
   jefe. Lleva:
   - a dónde se va, a qué hora y por dónde se llega;
   - de qué es la obra, quién la dirige, quién es el encargado y qué se está logrando.
   Es la base de todo.
2. **Storyboard.** Hillary (project manager) arma desde la ficha los planos, los ángulos y lo que el jefe va a
   decir. Se guarda en la misma ficha y el jefe lo lee en su iPad.
3. **Grabación.** Quien graba entrega el material ya limpio de tiempos y tomas muertas, separado en tres: **el jefe
   hablando**, **dron** y **tomas de apoyo**. La plataforma debe tener dónde subirlo por evento y bajarlo desde ahí.
4. **Registro por día, como el Drive del cliente.** Una carpeta por día; dentro, una carpeta por evento u obra con
   sus materiales. Es lo que Hillary usa hoy para hacer los videos. La plataforma lo replica o se conecta a ese Drive.
5. **Copies desde la ficha, con fórmula.**
   - Hillary elige la fórmula: **FAB** (características, ventajas, beneficios), **PAS** (problema, agitación,
     solución) o **AIDA** (atención, interés, deseo, acción). Las fórmulas se pueden editar.
   - De cada fórmula salen **tres largos**: Instagram, TikTok y Facebook; Threads (más corto); y X (el más corto).
6. **Publicar.** Se carga la portada y el video final y se programa: que salga solo en cada red.
   - **Ojo:** con la clienta Mila, Metricool falló. Videos que no subían a Facebook por la calidad, a TikTok por la
     medida y a Instagram por la duración. Hillary cree que **Metricool no sirve para la API**.
   - Alternativas, a decidir en `PENDIENTES.md`:
     - publicar directo con la API de cada red (Meta para Instagram, Facebook y Threads; TikTok; X; YouTube);
     - o validar y convertir el video a lo que pide cada red antes de mandarlo.
   - Lo que no puede faltar: comprobar medida, duración, peso y calidad **antes** de programar, y decir en palabras
     qué falla.

### 10.2 Tweets: un documento por semana
- **Hay que copiar la plataforma de Mila** (el estudio de contenido que ya existe) y agregarle X.
- Las muchachas hacen los tweets en ChatGPT y suben **un solo documento a la semana**. La plataforma lo parte en
  tweets y los programa en horarios distintos durante la semana, por la cuenta de X.
- Esto reemplaza la idea de pegar el texto en un cuadro: ahora es subir un archivo, y se puede mantener el cuadro.

### 10.3 Perfiles (cambia la tabla de §4)
- **Gestión de redes:** un solo perfil compartido para las cuatro personas del equipo; todos hacen de todo. Hillary
  reparte después.
- **El jefe:** vista completa, con dos partes al entrar:
  - **Política:** la agenda, los eventos a nivel comunal, la planificación y la **ropa**.
  - **Digital:** todo lo de contenido y redes.
- **Director de despacho:** crea y llena las fichas de los eventos.
- **Quien graba:** sube el material de cada evento.

### 10.4 La agenda del jefe (parte política)
- Como Google Calendar: vista de mes, semana y día con todas las horas. Cada evento ocupa lo que dura.
- Dentro de cada evento va su ficha técnica, para que el jefe sepa a dónde va.
- **Privacidad por seguridad:** el equipo de comunicaciones **no ve la fecha ni la hora** de los eventos. Los ve
  como una lista (a dónde va y de qué se trata) y puede cargar en la ficha el storyboard y lo que va a decir. El jefe
  los ve en calendario. Esto se cumple en la base (RLS), no solo en la pantalla.
- Se mantiene lo de §3.7: el despacho carga y el jefe califica de 1 a 10.

### 10.5 Ropa (parte política)
- Una sección «Ropa» con su ropa: fotos de cada prenda, cargada al comprarla.
- Para cada evento, la plataforma recomienda qué ponerse según la situación. La referencia es la app «Alta», que
  Hillary usa para combinar ropa.
- Es lo más complejo: va en una fase tardía y empieza simple (catálogo + combinaciones guardadas + sugerencia por tipo
  de evento).

### 10.6 Las dos entregas que siguen pendientes
1. **La plataforma interna** (el estudio de contenido y la producción) para el equipo.
2. **El sitio web** del gobernador.

Las dos con lo de este documento. El orden de §5 sigue: primero el estudio de contenido (ahora con los copies, el
documento semanal de tweets y la publicación con validación), después la parte pública.

## 11. Lo que faltaba (audios del 12 y 14/10 y grupos del 20 al 22/10)
Revisado el 22/10 en la noche. Si choca con algo de arriba, manda esto (y `requisitos-originales.md` por encima).

### 11.1 La web pública: cada quien ve lo suyo
- **Nadie ve los reportes de otros.** El ciudadano ve los suyos y su estado; el panel interno ve todos. En público
  solo sale lo **atendido**, sin datos personales (§3.6).
- Esto cambia §3.3 («lo que ya está reportado cerca se le muestra»): para no duplicar, se le dice solo algo como «Ya
  hay 2 reportes de un hueco a menos de 100 m. ¿Te sumas?», sin fotos, textos ni nombres de nadie. Ver
  `PENDIENTES.md`.
- **Reportar sin crear cuenta**, dejando un comentario. Si deja un teléfono o correo, le avisa cuando se resuelva; si
  crea su perfil, lo ve ahí.
- **Antes del mapa, dos o tres preguntas** (qué pasa, dónde estás) y el mapa se abre ya filtrado, como el ejemplo de la
  gobernación de Nueva York que mencionó Hillary.
- Lo que se reporta es todo lo de gestión pública: agua, luz, postes, huecos y lo demás de la lista.
- Las ayudas son muchas: 400 a 500 cada dos o tres días, más de 1000 personas a la semana (prótesis, operaciones…).
  Hoy llegan por los lives y los comentarios. El formulario y el panel tienen que aguantar ese volumen.

### 11.2 La portada: indicadores en vivo
- La portada de la web son **indicadores de lo hecho**: «tantas casas entregadas», «tantas personas ayudadas», «tantas
  prótesis entregadas», «tantas obras».
- Al tocar uno se ve la lista en tiempo real (con el permiso de cada persona, o con iniciales).
- **Obras:** una sección propia. Los voceros y la gente de prensa de los municipios tienen su perfil y cargan sus
  obras. Son casi 400 en marcha y hoy no se publica ninguna. Es la misma idea que la trazabilidad (§3.2), con
  estado y avance de cada obra.

### 11.3 X con movimiento
- X casi no tiene movimiento. Además de los tweets semanales (§10.2), más adelante: **sugerir tweets de gestión desde
  la trazabilidad y las obras** («Esta semana inauguramos…»), siempre como borrador que alguien aprueba.
- Los datos para esos tweets también pueden venir de lo que extrae Igor (por confirmar quién es y qué datos).

### 11.4 YouTube y la imagen
- Juan lleva YouTube y la web. Lo que se graba para YouTube se filtra y se aprueba antes, igual que lo demás.
- Pilares de contenido para YouTube: tradiciones del Táchira, lugares que visitar, «así están las vías» y otros que
  defina Hillary. Van como categorías o pilares en la misma tabla de categorías.
- La meta de imagen: que se vea como alguien con criterio, ideas y proyectos. Afecta al tono de los copies y de la web
  (con artículos y una sala de prensa).

### 11.5 Cómo trabajan de verdad (grupo de redes, 20 al 22/10)
- **Prueban horarios y republican.** Cada publicación guarda su hora, y «Resultados» muestra a qué hora y qué día le va
  mejor a cada red. Se puede marcar una publicación como **republicación** de otra (por ejemplo con otra portada) y
  compararlas.
- **Portadas:** se cambian en lote (por ejemplo las 40 de los últimos reels). La biblioteca guarda las portadas de cada
  pieza y su historial.
- **Colaboradores siempre:** cada publicación lleva la lista de cuentas a invitar (la gobernación, otros gobernadores,
  ministros). Si la API lo permite, se invitan al publicar; si no, queda como paso de la lista de chequeo.
- **Fernando aprueba antes de publicar.** Cuando el audio del jefe salió mal, Fernando sugiere pedirle al jefe la frase
  por un audio de WhatsApp para reemplazarla. En la revisión va el botón «Pedir frase al jefe»: queda anotada qué
  frase y en qué segundo, y el audio que llegue se sube ahí.
- **El material llega por Telegram y pierde calidad.** Por eso quien graba sube el original a la plataforma, por
  partes y sin perder lo subido si se corta la señal.
- **Comentarios:** buscan comentarios por tema (Capacho, vías) y los responden desde la cuenta del jefe. Más adelante:
  «Comunidad», con los comentarios y mensajes por tema (fue lo primero que pidió Hillary, el 13/10).
- **Sin luz y sin señal:** pasa seguido en el Táchira. Todo lo que se escribe se guarda en el teléfono hasta que se
  pueda enviar.
- **Los copies se ven así:** el ejemplo del Puente Burgua en `requisitos-originales.md` es el formato de salida de los
  tres largos (largo, Threads y X con hashtags). Abren con «¡Saludos, Táchira!» o un emoji y un dato fuerte, y cierran
  con «Seguimos trabajando» o «Por amor al Táchira».
- **Nesmaury lleva también las redes de la gobernación.** Lo que hace el equipo se publica también allá (o en
  colaboración).

### 11.6 Pensada para repetirse
Leo quiere ofrecer esto a otras figuras políticas si sale bien. Por eso nada de Freddy va escrito en el código: nombre,
colores, logos, cuentas, municipios y parroquias, categorías, fórmulas de copies y horarios salen de configuración y
semillas. Por ahora es una instalación por cliente (un proyecto de Supabase y uno de Vercel cada uno), no una app con
muchos clientes adentro.

### 11.7 Costos y cuentas
- Todo lo paga el cliente: Hillary pidió saber cuánto cuesta cada cosa y cuánto cuesta blindar la seguridad
  (`docs/COSTOS.md`).
- Mientras llega su presupuesto, se avanza con las cuentas del equipo (15/10). Cada cuenta abierta se anota en
  `docs/CUENTAS.md` sin claves (Oscar, 22/10).
