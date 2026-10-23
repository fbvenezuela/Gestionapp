# El diseño: cómo usar el modelo de Stitch

Actualizado: 22/10/2026. El modelo visual está en `diseno/stitch/`: 23 pantallas exportadas de Google Stitch, cada una
con `screen.png` (la captura) y `code.html` (HTML con Tailwind por CDN), más `diseno/stitch/operaciones_360/DESIGN.md`
(colores, letras, espacios y componentes). Se llama «FB · Operaciones 360».

**Es un modelo, no el producto.** Se copia el aspecto (colores, letra, tarjetas, barra lateral, chips de estado, tablas,
el reproductor con código de tiempo) y la idea de los módulos. No se copia tal cual:

- **Está pensado para escritorio y para gente técnica.** El equipo de Hillary «es muy poco didáctico con la
  tecnología» y trabaja desde el celular, a veces sin luz y con mala señal. Cada pantalla nuestra tiene que entenderse
  sin explicación, en un Android barato.
- **Usa jerga que aquí sobra:** «telemetría», «checksum SHA-256», «Merkle root», «cadena de bloques», «gobernanza
  criptográfica», «SLA», «OT-001», «R04». En la interfaz van palabras normales: «Evento», «Ficha», «Video», «Listo
  para publicar», «Fernando lo aprobó». Los códigos internos (OT, E-00x) solo donde ayuden a buscar algo.
- **Tiene cosas de adorno que no existen:** registro «criptográfico», hashes inventados, «3 nodos testigo», radar de
  suplantación. Nada que no haga algo de verdad. La auditoría real es una tabla en la que solo se agrega (ver
  `IDEA.md` §9), sin teatro.
- **Los datos de las capturas son inventados** (nombres, teléfonos, coordenadas, cifras). No se reutilizan en semillas
  ni en pruebas: se inventan otros.
- **Es denso.** Cuatro tarjetas de cifras, tres columnas y una tabla en cada pantalla. Para este equipo: una cosa
  principal por pantalla, como mucho tres cifras arriba y lo demás detrás de «Ver más».

## Lo que sí se toma tal cual
- **Colores** (de `operaciones_360/DESIGN.md`): fondo `#F7F7F5` (alabastro), tarjetas blancas con borde `#E9E8E4`, acento
  naranja `#FE5A03` solo para la acción principal y lo activo, pizarra `#182A32` para cabeceras fuertes y el
  reproductor, oliva `#7F8630` como color secundario, y los de estado: verde `#10B981`, ámbar `#F59E0B`, rojo
  `#EF4444`, azul `#3B82F6`. Texto `#111111`, secundario `#666660`, apagado `#8E8D88`.
  **Provisionales** hasta que llegue el manual de marca «F BERNAL» que Hillary va a mandar: todos van como tokens en
  un solo archivo (variables CSS + tema de Tailwind 4) y ningún color se escribe a mano en un componente.
- **Modo oscuro:** el modelo no lo trae. Se definen los tokens oscuros desde el principio (la pared del despacho y el
  iPad del jefe de noche lo agradecen), pero se prueba primero el claro.
- **Letra:** Montserrat (400, 500, 600, 700) y una monoespaciada para horas y códigos de tiempo (Courier Prime en el
  modelo; vale una del sistema). Escala de `DESIGN.md` (titulares −0,01 a −0,02 em; etiquetas en mayúsculas con
  espaciado 0,02–0,04 em). En el celular, nada por debajo de 14 px para leer y 16 px en los campos (si no, iOS hace
  zoom).
- **Formas:** 6 px chips, 8 px botones y campos, 12 px tarjetas y ventanas, píldoras solo para estados.
- **Sombras:** casi ninguna; borde fino en reposo y una sombra suave al pasar o abrir.
- **Componentes que valen:** tarjeta de cifra con barrita de avance; chip de estado con punto; lista de pendientes
  con casilla naranja; tabla compacta con cabecera gris; línea de tiempo vertical; reproductor 16:9 o 9:16 con barra
  de tiempo naranja y el tiempo en monoespaciada; ficha con pestañas; panel lateral que se abre a la derecha; bandeja
  con tarjetas (izquierda) y ficha de evaluación (derecha).
- **Íconos:** el modelo usa Material Symbols. En la app se usa `lucide-react` (ya es el estándar del stack); si un
  ícono no existe, se elige el más parecido.
- **Estructura:** barra lateral agrupada + barra superior con buscador, botón «Crear» y campana. En el celular la
  barra lateral se vuelve una barra de abajo con 4 o 5 destinos según el rol, y «Crear» un botón flotante.
- **Selector «Vista de rol»** (arriba en todas las pantallas del modelo): sirve para la demostración. En la app real
  solo lo tiene el administrador, como «Ver como…», y no da permisos: lo que cada rol ve lo decide la base de datos
  (RLS), no la pantalla.

## Las pantallas del modelo y a qué módulo nuestro van
Hay dos variantes de algunas (s04, s06, s07, s08, s10): se toma lo mejor de cada una.

| Pantalla de Stitch | En nuestra app | Fase |
|---|---|---|
| S01 Centro de control | **Hoy**: la portada de cada rol (lo de hoy, lo que espera por mí, lo bloqueado) | 1 |
| S02 Mi trabajo | **Mis pendientes**, dentro de Hoy | 1 |
| S03 Bandeja de solicitudes y triage | Solicitudes al despacho (audiencias y eventos) y, después, la bandeja de reportes, denuncias y ayudas de la gente | 4 / 3 |
| S04 Proyectos y órdenes | **Eventos**: cada evento de la agenda es la «orden» que junta ficha, grabación y piezas | 1 |
| S05 Ficha de la orden | **Ficha del evento**: ficha técnica, storyboard, lo que va a decir, material, piezas e historial | 1 |
| S06 Calendario multicapa | **Agenda**: calendario para el jefe y el despacho; lista sin fecha ni hora para comunicaciones (`IDEA.md` §10.4). Más el calendario de publicaciones | 1 |
| S07 Producciones y jornadas | **Grabaciones**: quién graba qué evento y el material que subió. Los kits de equipos, después | 1 / 4 |
| S08 Hoja de llamado | La ficha técnica vista por el jefe y por quien graba: horas, lugar, cómo llegar, contactos del sitio, protocolo. **Solo para quien puede ver fecha, hora y lugar exacto** | 1 |
| S09 Contenidos y diseño | **Piezas**: videos, portadas, carruseles y copies de cada evento, con los formatos de cada red | 1 |
| S10 Ficha de contenido, guion y fuentes | **Guion / storyboard** por bloques, con los datos que dice el jefe y de dónde salen (lo que dice tiene que ser verdad) | 1 |
| S11 Sala de revisión | **Revisión**: ver el video, comentar en el segundo exacto, lista de chequeo, «Aprobar» o «Pedir cambios» (Fernando). En la fase 1 basta aprobar y comentar; el comentario por segundo, en la 2 | 1 / 2 |
| S12 Aprobaciones (solo en el menú) | **Por aprobar**: la cola de Fernando | 1 |
| S13 Publicaciones | **Publicar**: validación por red, paquete listo, publicación manual con link y captura, y luego automática | 1 / 2 |
| S14 Biblioteca | **Biblioteca**: material por día y por evento (jefe hablando, dron, apoyo), finales, portadas y editables | 1 |
| S15 Mejoras e implementación | No va para el equipo. Si acaso, una página de «Novedades» de la app | — |
| S16 Canales e incidencias | **Cuentas oficiales**: qué cuentas hay, quién responde por cada una, si tienen doble factor, y los avisos de cuentas falsas. **Nunca claves** | 4 |
| S17 Resultados y reportes | **Resultados**: métricas por publicación, a qué hora nos va mejor, análisis corto con IA y el reporte de la semana | 1 / 2 |
| S18 Equipo y recursos | **Equipo**: personas, roles y carga. Los equipos técnicos (cámaras, dron), después | 1 / 4 |
| S19, S20, S21 (solo en el menú) | Comunidad = comentarios y mensajes de la gente (lo que Hillary pidió el 13/10); reuniones y decisiones, después | 3+ |
| S22 Configuración y auditoría | **Ajustes**: usuarios, roles, doble factor, categorías, horarios de publicación y el registro de cambios | 1 |

## Lo que no está en el modelo y hay que diseñar con el mismo estilo
- **La vista del jefe:** al entrar, dos botones grandes, **Política** (agenda en calendario, fichas, eventos comunales,
  ropa) y **Digital** (contenido, publicaciones y resultados). Pensada para su iPad, con letra grande.
- **Tweets de la semana:** subir el documento, ver los tweets separados con su largo, la semana repartida por horas,
  aprobar y programar.
- **Copies con fórmula:** elegir FAB, PAS o AIDA y ver lado a lado los tres largos (Instagram/TikTok/Facebook,
  Threads y X) para corregir antes de guardar.
- **Ropa:** catálogo con fotos por prenda y combinaciones guardadas por tipo de evento (referencia: la app «Alta»).
- **La web pública:** portada con indicadores, trazabilidad y obras, reportar con mapa, denunciar, pedir ayuda, lo
  atendido en vivo, prensa y YouTube. Mismo color y letra, pero más aire y más grande: la usa cualquier persona.

## Reglas de pantalla (para todo)
- Primero el celular (360 px) y después el escritorio. Toque mínimo de 44 px.
- Un botón principal por pantalla, naranja. Lo que borra o rechaza, en rojo y con confirmación.
- Textos cortos en español de Venezuela, cercanos y respetuosos. Nada de «Error 500»: «No se pudo guardar. Revisa la
  señal y vuelve a intentar.»
- Todo formulario guarda lo escrito mientras se llena (si se va la luz o la señal, al volver sigue ahí) y avisa si
  quedó algo sin enviar.
- Las subidas grandes se pueden pausar y siguen solas cuando vuelve la señal (subida por partes).
- Estado vacío con una frase y el botón que toca («Todavía no hay eventos. Crea el primero.»).
- Accesible: contraste AA, foco visible, etiquetas en los campos y probado con axe.
