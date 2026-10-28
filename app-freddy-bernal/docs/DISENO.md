# El diseño: cómo usar el modelo de Stitch

> **24/10/2026:** los colores ya no son los del modelo. Llegó la paleta de la marca y el **oliva `#7F8630` es el color
> principal** (naranja fuera de la interfaz, sin azul). Donde abajo dice «naranja» o «pizarra», hoy es oliva y negro.
> Detalle en `docs/DECISIONES.md` D-21 y `src/app/tokens.css`.
>
> **27/10/2026:** Hillary pidió una cara «más glass». Esquinas más redondas, sombras suaves, vidrio en tarjetas,
> barras, menús y ventanas, siempre con los mismos colores y la misma letra. El mismo día el dueño pidió subirlo
> («súbelo, que se note más el glass»): manchas de la marca detrás y tarjetas de vidrio esmerilado de verdad. Las
> reglas están abajo, en [«Cara glass»](#cara-glass-27102026).

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
- **Formas** (27/10): 8 px chips, 12 px botones y campos, 24 px tarjetas y ventanas, píldoras solo para estados.
  Salen de `--radius-chip`, `--radius-control` y `--radius-card` en `globals.css`: ninguna pantalla escribe un
  radio a mano.
- **Sombras** (27/10): suaves y bajas (`--glass-shadow` en tarjetas, `--glass-shadow-pop` en menús y ventanas), con
  un borde claro de 1 px. En «Modo sol» no hay sombras: bordes fuertes.
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

## Cara glass (27/10/2026)
Hillary: «más bonita, más glass, más UI design». El dueño, al verlo: «súbelo, que se note más el glass» (en claro casi
no se notaba). Se hace **solo en los tokens y en los componentes base**, nunca pantalla por pantalla. Toda pantalla
que use `<Card>`, `Sheet`, el diálogo propio o los menús ya lo tiene.

**Dónde vive**
- Colores: `src/app/tokens.css` (`--c-bg-tint-1`, `--c-bg-tint-2`, `--c-bg-tint-3`, `--c-bg-wash`, `--c-glass`,
  `--c-glass-bar`, `--c-glass-sheet`, `--c-glass-border`, `--glass-highlight`, `--glass-shadow`, `--glass-shadow-pop`),
  en claro, oscuro y «Modo sol».
- Reglas: `src/app/globals.css`, cuatro clases en `@layer components`:
  - `.glass-card`: tarjetas (`<Card>`, cifras, estados vacíos, la barra lateral del escritorio);
  - `.glass-bar`: la barra de arriba y la de abajo del teléfono;
  - `.glass-pop`: los menús «Crear», «Mi cuenta» y «Más», y el botón del asistente;
  - `.glass-sheet`: paneles laterales (`Sheet`), diálogos (`dialogPanelClass`) y la ventana del asistente.
- Para pantallas nuevas: `<Card>` (o `<Card solid>`, ver abajo), `Sheet`, `useConfirm`/`dialogPanelClass` y
  `menuPanelClass` (`src/components/ui/menu-panel.ts`). No se escribe vidrio a mano, ni la clase `glass-solid`, ni
  se usa `backdrop-blur` de Tailwind.

**Cómo se ve**
- Fondo: el alabastro de siempre con un lavado suave hacia abajo (`--c-bg-wash`, alabastro con un poco de oliva) y
  cuatro manchas grandes y difuminadas de la marca: oliva arriba a la izquierda y abajo a la derecha, amarillo a la
  derecha y un oliva-salvia abajo a la izquierda. Son `radial-gradient` con los colores de los tokens (el oliva con
  el tono del oliva de la marca, el amarillo con el del amarillo `#FFD380`), tan intensos como deja el contraste AA.
  Va en `body::before`, fijo y del alto de la pantalla más grande (no se repinta al esconderse la barra del
  navegador), nunca como imagen de fondo de `body` o `html`: axe no sabe medir contraste sobre un degradado y
  dejaría de revisarlo sin avisar.
- Tarjetas: vidrio esmerilado de verdad. Blanco al 45 % en claro (oscuro al 50 % en oscuro), desenfoque de 16 px y
  saturación de 160 % (las manchas se ven a través, más vivas), borde claro de 1 px, brillo arriba y sombra suave
  con un toque de oliva. Esquinas de 24 px.
- **Sin desenfoque detrás de listas o tablas largas**: ahí la tarjeta es sólida (blanca, con el mismo borde y la
  misma sombra), para leer mejor y para no pagar un desenfoque por tarjeta en cada cuadro al hacer scroll:
  - `<Card solid>` en la tarjeta que envuelve una lista o tabla larga, o en las tarjetas de una grilla larga. Hoy:
    agenda (las tres listas y «por fecha»), registro de cambios, biblioteca (la grilla y el archivo), resultados (la
    lista del teléfono y la tabla), piezas, tweets (tandas y «Editar textos»), por aprobar (cada semáforo y los
    tweets), municipios (la grilla de municipios, las fichas filtradas y la lista de cada municipio), obras,
    publicar (las tres listas y la tabla de resultados), avisos, buzón y la historia de las fichas;
  - además, cualquier tarjeta que sea ella misma un ítem de una lista (`ul`/`ol` › `li` › tarjeta) queda sólida
    sola, salvo dentro de un `<nav>` (pocos botones grandes);
  - las listas de «Hoy» quedan de vidrio: son cortas a propósito (máximo 10 cosas).
- Barras, menús, paneles y diálogos desenfocan más (24 px, saturación 180 % en barras y menús, 160 % en paneles) y
  son un poco más translúcidos que antes. En las barras el desenfoque va en `::before`: si la barra misma
  desenfocara, los menús que salen de ella no podrían desenfocar la página. El fondo oscuro de las ventanas
  desenfoca 8 px.
- Íconos lineales (lucide) de trazo 1,75; 2,25 en «Modo sol».
- Más aire desde tablet (`sm:`): tarjetas con 20 px de relleno; en el teléfono de 360 px casi no cambia nada.

**Que se siga leyendo bien**
- Contraste AA en todo texto sobre lo peor que puede quedar detrás. Por eso:
  - las manchas son claras en claro (luminancia 0,77 o más; la mezcla más oscura del fondo queda en 0,766) y
    oscuras en oscuro: todo color de texto llega a 4,5:1 directamente sobre el fondo. Para eso el gris secundario,
    el apagado, el verde, el naranja y el rojo de estado se oscurecieron un pelo en claro (`--c-text-2` `#62625c`,
    `--c-muted` `#63625d`, `--c-ok` `#03704f`, `--c-warn` `#a34b08`, `--c-danger` `#b91c1c`) y el apagado y el rojo
    se aclararon un pelo en oscuro (`#a3a29c`, `#f98080`). Los colores de la marca no cambian;
  - las tarjetas de vidrio son más claras (u oscuras) que el fondo que tienen detrás, saturación incluida;
  - las barras y los menús siguen casi opacos (87 % en claro, 90 % en oscuro): aunque pase algo negro por detrás,
    el texto, el gris y el oliva siguen en 4,5:1 o más. El verde y el naranja de estado **no** van sobre barras ni
    menús;
  - paneles y diálogos al 92 % (94 % en oscuro).
  - `tests/unit/ui-glass.test.ts` hace la cuenta con todas las mezclas posibles del fondo (lavado y manchas en
    cualquier orden, de 10 en 10 %), la saturación de cada vidrio leída de `globals.css` (aplicada en sRGB y en luz
    lineal) y falla si un token baja de AA. También exige que las manchas se vean y sean de la familia de la marca.
- Sólido (sin fondo de manchas, sin desenfoque, superficies opacas) cuando:
  - el navegador no sabe desenfocar (`@supports`), como los teléfonos viejos;
  - «Modo sol» está encendido (es también el interruptor manual para quitar el vidrio);
  - el teléfono tiene 2 GB de memoria o menos, o el ahorro de datos encendido (`data-glass="off"`,
    `src/components/shell/glass-core.ts`; solo Chrome y Android lo informan);
  - el sistema pide «Reducir transparencia», «Más contraste» o colores forzados.
- «Menos movimiento» del sistema: se apagan animaciones y transiciones en toda la app; las ruedas de «cargando»
  siguen girando, más despacio. El vidrio no se mueve.
- Pruebas en el navegador: `tests/e2e/ui-glass.spec.ts` (estilos calculados: tarjetas esmeriladas y `<Card solid>`
  opaca, axe sin quedar ciego, cada caso sólido, menos movimiento y una pasada de axe en modo oscuro).
