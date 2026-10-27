# Prompt: cambios de Hillary a FB · Operaciones 360 (27/10/2026)

Pégalo en la sesión de Claude Code que está construyendo la plataforma (repositorio `fb-operaciones-360`, versión de
prueba en `https://fb-operaciones-360.vercel.app`). Es la segunda vuelta: Hillary entró a la versión del 24/10 y pidió
estos cambios el 25/10 y el 27/10 (grupo «Socios multimillonarios»). Sus palabras están en
`docs/requisitos-originales.md`, sección «25–27/10/2026».

---

Hola. Hillary probó la plataforma y pidió cambios grandes en los roles, dos fichas nuevas y una cara más bonita. Lee
este prompt completo, luego `docs/requisitos-originales.md` (la sección del 25–27/10, textual) y `docs/IDEA.md`. Lo
de aquí **manda sobre** `IDEA.md` §4, la tabla de permisos y la guía por usuario del 24/10: actualízalos al terminar.

Antes de tocar código, dime en 10 líneas cómo lo entendiste y qué es ambiguo. No te detengas a esperar respuesta salvo
que bloquee: decide lo razonable, anótalo en `docs/DECISIONES.md` y sigue.

## 0. Lo que no cambia
- **Modo demostración.** Sin correos reales, sin IA encendida, sin datos reales, hasta la consulta legal (guía del
  24/10, §1: sanciones de la OFAC y la política de países de Anthropic). Todo lo nuevo funciona sin IA.
- **Regla de la agenda:** quien no debe no ve fecha, hora ni dirección. Lo hace cumplir la base (RLS), no solo la
  pantalla. Redes sigue sin verla.
- **Nada se publica sin aprobación.** Lo que sale es exactamente lo aprobado.
- Borrado lógico, registro de cambios, y pruebas por rol que demuestran cada «no puede».
- Las reglas de `PROMPT-APP-FREDDY-BERNAL.md` §4 y §16.

## 1. Primero el error
- **«La ficha completa del evento, cuando la abro, da error»** (Hillary, 27/10). Reprodúcelo con cada rol que puede
  abrirla, encuentra la causa, arréglalo y deja una prueba que lo cubra. Es lo primero que se entrega.

## 2. Los roles quedan así (6, y nada más)
Hillary: «jefe, director de despacho, director de política, director del IVT, grabación y redes. Más nada».

| Rol | Quién | Qué hace |
|---|---|---|
| **Jefe** | El gobernador | **Tiene todo**, «hasta lo de redes»: ve y hace lo de cualquier rol |
| **Director de despacho** | Despacho | La agenda y las fichas técnicas; pone fecha y hora |
| **Director de política** | William | Carga los eventos y avances comunitarios por municipio |
| **Director del IVT** | Ángel (Instituto de Vialidad del Táchira) | Carga la ficha de cada obra antes de la visita del jefe |
| **Grabación** | Un solo perfil | Graba y sube lo de cada pauta para el editor |
| **Redes** | Hillary, Nesmaury, Larissa, Yessica | Piezas, copies, tweets, publicar y resultados |

- **Se eliminan Secretaría y Supervisión política.** Migración que las retire sin perder historia: los eventos que
  propuso Secretaría quedan como propuestos por «Despacho»; lo que aprobó Supervisión queda en el registro con su
  autor.
- **«Un solo perfil para grabación»:** un solo rol de grabación. Sigue un usuario por persona (para saber quién subió
  qué), pero todos ven la misma pantalla.
- **Administración** queda como rol técnico para Juan (invitar, ajustes, registro). No sale en la lista de roles del
  equipo ni en las guías.
- **Las aprobaciones que hacía Supervisión pasan al jefe** (verdes, amarillas, rojas y tweets), con «aprobar todas las
  verdes» en un toque. Anótalo como decisión y pregunta en tu resumen: ¿alguien más aprueba en su nombre (por
  ejemplo, el director de despacho para las verdes)? ¿Fernando Alvarado sigue revisando?
- Quita de los botones de demostración los roles que salen, y agrega Director de política y Director del IVT.

## 3. El jefe tiene todo
- Su inicio sigue con **Política** y **Digital**, y suma **Obras** y **Redes**:
  - **Política:** agenda completa con fecha y hora, eventos por aprobar y por ponerles fecha, fichas, «lo que voy a
    decir».
  - **Obras:** las fichas del IVT por municipio y su estado.
  - **Redes:** piezas, copies, tweets, publicaciones y resultados, con las mismas pantallas que ve Redes.
  - **Digital:** lo publicado, lo que viene y cómo nos va.
- **El jefe hace su propia agenda.** «Debemos crearle todos los botones para sumar»: crear evento, crear visita de
  obra, ponerle fecha y hora a lo que llega, mover, cancelar. Botones grandes, pensados para iPad y teléfono.
- **La agenda es compartida:** «el director de despacho o el jefe pueden agregar cosas en conjunto». Los dos crean y
  editan los mismos eventos; el registro dice quién hizo qué y, si los dos editan a la vez, gana el último con aviso al
  otro (sin perder lo escrito).

## 4. Dos fichas nuevas y el flujo «Por ponerle fecha»
### 4.1 Ficha de obra para la visita del gobernador (la carga el Director del IVT)
- Ángel carga **toda la ficha** de la obra. **No pone fecha ni hora.**
- Al guardarla, al jefe y al director de despacho les llega un aviso: **«Por ponerle fecha»** (texto de Hillary), con el
  nombre de la obra y el municipio.
- El jefe o el despacho le ponen fecha y hora → se convierte en un evento de la agenda, tipo «Visita de obra», con la
  ficha adentro.
- Campos (respuestas breves; cada uno admite «No aplica» o «Por confirmar»):
  1. **Datos generales:** nombre de la obra; municipio, parroquia y sector; ingeniero responsable y teléfono; fecha de
     actualización; fecha de la visita (la pone el jefe o despacho, no el IVT).
  2. **Sobre la obra:** qué problema resuelve y desde cuándo existe; por qué se decidió hacerla; qué trabajos se están
     haciendo (medidas y características); a qué comunidades beneficia y a cuántas personas o familias; qué beneficios
     concretos tendrá para la gente.
  3. **Reporte de la comunidad:** quién hizo el reporte o la denuncia; cuándo y por qué medio; si la persona estará en
     la visita (sí, no, por confirmar); si no asiste, quién la representa o cómo se le contacta; nombre y teléfono del
     enlace comunitario.
  4. **Avance y entrega:** organismo o empresa que ejecuta; inversión, moneda y fuente de financiamiento; estado actual y
     porcentaje de avance; fecha de inicio; fecha estimada de entrega y tiempo restante; dificultades y cómo se
     resuelven.
  5. **Comunidad y seguimiento:** otras ayudas a la comunidad; necesidades pendientes o problemas recurrentes; qué debe
     saber o decidir el gobernador en la visita; próxima acción o compromiso; responsable y fecha de seguimiento.
  - Fotos del antes y del avance (varias), con subida que aguanta mala señal.
- **«Generame un diálogo FAB con esto»** (Hillary): desde la ficha de obra, un botón arma «Lo que voy a decir» con la
  fórmula FAB (características → ventajas → beneficios), con la voz del jefe, para el modo lectura del jefe y para el
  storyboard de Redes. Mientras la IA esté apagada sale con plantilla a partir de los campos (nunca inventa cifras: solo
  las que están en la ficha). Editable antes de guardar.
- ¿El IVT ve la fecha de la visita cuando ya la pusieron? Recomendado: sí, solo de sus obras (como Grabación con sus
  eventos), porque tiene que estar allí. Anótalo como decisión y pregúntalo.

### 4.2 Ficha de reporte comunitario (la carga el Director de política)
- William carga **todos los eventos y avances por municipio**. Él genera el evento y **el jefe le pone fecha y hora**
  (el mismo aviso «Por ponerle fecha»). Si no es un evento sino un avance o una incidencia, queda en el registro sin ir a
  la agenda.
- Campos:
  1. **Persona que reporta:** nombre y apellido; cargo o función; teléfono.
  2. **Ubicación:** municipio y parroquia; comunidad o sector; dirección y referencia.
  3. **Actividad o asunto:** nombre; tipo (entrega, beneficio, evento, reparación, jornada, solicitud, incidencia, otro).
  4. **Fecha y hora:** de la actividad o situación; del reporte.
  5. **Descripción:** qué se hizo, ocurre o necesita; qué problema atiende y por qué importa.
  6. **Responsables:** encargado; institución u organización responsable; organismos o colaboradores.
  7. **Beneficiados o afectados:** cantidad de personas y familias; sectores; si las cifras son confirmadas o estimadas.
  8. **Estado y resultados:** programado, en ejecución, finalizado, pendiente o suspendido; logros, cantidades
     entregadas, trabajos o avances.
  9. **Seguimiento:** pendientes o apoyo requerido; prioridad y motivo; responsable; fecha prevista de atención o
     actualización.
  10. **Evidencias y observaciones:** fotos, videos o documentos (antes y después); enlace al material; observaciones.
  - «Una ficha por actividad o situación».
- **«Todo filtrado por municipio y que quede un registro. A eso hay que meterle lógica»:**
  - una pantalla por municipio (los 29) con sus parroquias: fichas, eventos, avances y su estado, en orden de fecha;
  - cada ficha guarda su historia: quién la creó, cada cambio de estado y cada actualización (nunca se pisa: se
    agrega);
  - filtros por municipio, parroquia, tipo, estado y prioridad; contadores por municipio (abiertas, en ejecución,
    finalizadas, vencidas por su fecha de seguimiento);
  - lo vencido sale arriba en el inicio del director de política y del jefe.
- Las fichas comunitarias tienen teléfonos de terceros: solo las ven el director de política, el despacho y el jefe.
  Redes no ve ni teléfonos ni nombres de quien reporta.

## 5. Grabación
- Un solo perfil (punto 2). Por cada evento asignado puede:
  - **cargar el storyboard** con el que grabó (foto, PDF o texto);
  - **cargar el contenido de la pauta** (el material crudo, por tipo, como hoy);
  - dejar **una nota para el editor**.
- El editor (Redes) ve la nota y **descarga** todo el material de la pauta de una vez (zip o carpeta).
- Sigue viendo fecha, hora y dirección solo de sus eventos.

## 6. Redes igual a la plataforma de Mila
- Hillary: «la parte de redes no está igual a lo de Mila, y es hiper necesario que esté igual, porque ya esa es la
  versión final; solo falta agregarle lo de los tweets».
- **Resultados con miniaturas:** cada publicación en Resultados lleva su miniatura (la portada del video o la imagen).
- No tengo el código ni capturas de la de Mila todavía (`PENDIENTES.md` #11). Dime exactamente qué capturas
  necesitas (pantalla por pantalla) y deja Redes lista para ajustarla: mientras llegan, no rehagas Redes a ciegas.
  Lo de los tweets se queda como está.

## 7. Más bonita: glass
- «La interfaz hay que hacerla más bonita, más glass, más UI design» (27/10; también el 25/10: «glassmorphism»).
- Solo en los tokens y en los componentes base (tarjetas, barras, modales, menús), nunca pantalla por pantalla:
  - fondos con un degradado suave de la marca;
  - tarjetas translúcidas con desenfoque (`backdrop-filter`), borde claro de 1 px y sombra suave;
  - esquinas más redondas, más aire, iconos lineales.
- Que siga leyéndose bien: contraste AA en texto, sin desenfoque detrás de tablas largas ni en teléfonos viejos (con
  `@supports` y una versión sólida de respaldo), y con «Menos movimiento» respetado.
- Mismos colores y tipografías que se le presentaron a Leo.

## 8. Al terminar
- Pruebas por rol que demuestren:
  - Redes no ve fecha ni hora;
  - el IVT y el director de política no ponen fecha;
  - solo jefe y despacho la ponen;
  - el jefe ve todo;
  - Grabación solo ve lo suyo.
- Actualiza `IDEA.md`, `docs/DECISIONES.md` y la guía por usuario.
  - Hillary pidió el 25/10 no hacer guías nuevas hasta que ella pruebe cada rol: deja la guía en el repositorio, pero
    no la mandes.
- Dime:
  - qué cambiaste;
  - qué decidiste por tu cuenta;
  - las preguntas para Hillary (aprobaciones sin Supervisión, el IVT y la fecha, las capturas de Mila);
  - el enlace de la versión de prueba para que ella entre con cada rol.
