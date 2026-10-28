# Recorrido de demostración (seis roles desde el 27/10)

**Link:** el de la versión de prueba de Vercel (ver `README.md`, «Publicar la demostración»). En local:
`npm run build && npm start` → http://localhost:3000.

Todo es **inventado**. Para entrar, **toca el rol** en la lista «Versión de demostración»: entras directo, sin código
ni doble factor (atajo solo para probar, `DEMO_SHORTCUTS`). Para ver el flujo real (código por correo + doble factor
con Google Authenticator), pon `DEMO_SHORTCUTS=false` en Vercel. Con datos reales el atajo no existe.

| Rol | Correo | Qué tocar |
|---|---|---|
| Redes | `redes@demo.test` | **Agenda**: los eventos salen en lista, sin fecha ni hora. Abre «Entrega de viviendas…» → **Storyboard** → agrega un bloque → Guardar. Abre «Entrega de la cancha techada de El Mirador» → **Material**: la nota para el editor y el storyboard con el que grabó Grabación, y «Descargar todo el material» (todo el material de la pauta en una carpeta, o uno por uno en el teléfono). **Piezas** → «Jornada de salud escolar» → sube un video → elige **fórmula, voz y cierre** → «Escribir desde la ficha» → mira los tres largos con su contador → elige el **nivel** (verde, amarillo o rojo) → «Enviar a aprobación». **Tweets** → «Tweets de la semana» → pega o sube un .docx → «Separar» → mira repetidos y largos → «Repartir en la semana» |
| Redes (otra vez) | `redes@demo.test` | **Publicar** → la pieza aprobada → elige redes (cada una dice si el video sirve y qué arreglar) → paquete → pon una hora: avisa si es mala para esa red → paquete → pega un link → «Ya lo publiqué» → carga vistas y me gusta. «Registrar lo que publicó el jefe» para un video que subió él. **Resultados** → «¿A qué hora nos va mejor?» |
| Jefe | `jefe@demo.test` | **Todo lo aprueba él.** **Por aprobar**: «Aprobar todas las verdes (2)» de un toque; abre «Avance del puente La Quebrada» (amarilla) → pausa el video y comenta si quiere → marca la lista «Antes de aprobar» → «Aprobar» o «Pedir cambios»; la roja («Aclaratoria sobre el servicio de agua») igual. Pestaña **Tweets** → «Aprobar marcados». En **Inicio** (también «Aprobar todas las verdes» de un toque), cuatro botones grandes con sus números en vivo: **Política** (eventos de hoy, por decidir, por ponerle fecha; adentro, «Lo que voy a decir» en letra grande, calificar 1–10 y aceptar), **Obras** (las fichas del IVT por estado y por municipio), **Redes** (debajo, «Notas de Grabación nuevas»: el título de «Entrega de la cancha techada de El Mirador», que abre su pestaña Material con la nota para el editor) y **Digital**. Menú: Inicio, Agenda, Por aprobar, **Redes** (su puerta a Piezas, Tweets, Publicar, Resultados y Biblioteca, con lo que espera en cada una) y «Más» (Obras, Municipios, Digital) |
| Despacho | `despacho@demo.test` | **Hoy** empieza con «Por ponerle fecha» (la obra del IVT y el reporte de política que esperan fecha) → «Ponerle fecha» la convierte en evento. **Agenda** en calendario (día, semana, mes) → «Nuevo evento» o «Visita de obra» con la ficha técnica (avisa si choca con otro). En un evento: «Mover», «Cambiar fecha o lugar» y «Cancelar» con su motivo («Volver a la agenda» lo trae). Menú: Hoy, Agenda, Obras, Municipios y Biblioteca |
| Grabación | `grabacion@demo.test` | **Agenda** (con fecha y lugar: solo los suyos) → «Jornada de salud…» → **Material** → sube «Jefe hablando» (corta el wifi a la mitad: sigue sola al volver); en «Entrega de Grabación», sube el storyboard con el que grabó (foto, PDF o escrito) y deja la nota para el editor (sin hora, fecha, dirección ni teléfonos: Redes la lee) |
| Director de política | `politica@demo.test` | Entra a **Municipios**: lo vencido arriba («Bote de aguas negras…»), los 29 municipios con sus contadores y filtros. «Nueva ficha comunitaria» → «¿Va a la agenda del jefe?» → «Guardar y avisar al jefe»: le llega «Por ponerle fecha» al jefe y al despacho. Cuando le ponen fecha, ve «Ya tiene fecha», nunca la fecha. No ve agenda, piezas ni tweets |
| Director del IVT | `ivt@demo.test` | Entra a **Obras**: sus fichas por estado (borrador, por ponerle fecha, con fecha). «Nueva ficha de obra» y, ya guardada, sus fotos del antes y del avance (la subida aguanta mala señal) y «Generar diálogo FAB» (lo que Hillary pidió como «Generame un diálogo FAB con esto»: solo con las cifras de la ficha). No pone fecha ni hora; cuando el jefe o el despacho se la ponen, la ve en **Agenda** («Mis visitas de obra»), solo de sus obras |
| Administración | `admin@demo.test` | **Ajustes** → Equipo (invitar, roles, cerrar sesiones), categorías, fórmulas, horarios de tweets, reglas de video por red, buzón de correos y registro de cambios. «Ver como…» arriba cambia los menús (no los permisos). Lee la agenda, pero no crea eventos ni pone fecha; no ve los contactos de las fichas comunitarias, y en Equipo no puede darse roles ni ser también el jefe o el despacho (D-41) |

Paso a paso por rol: `GUIA-POR-ROL.md` (no se manda todavía: Hillary pidió probar cada rol antes, 25/10).

## Lo nuevo para probar
- **360, el asistente:** el botón redondo abajo a la derecha, en cualquier pantalla y con cualquier rol. Prueba «¿cómo te
  llamas?», «¿qué tengo pendiente?», «¿cuándo es mejor publicar en TikTok?» y «quiero hablar con alguien» (a
  Administración le llega el aviso). Sin IA: contesta en modo demostración. Administración lo enseña en Ajustes → Asistente.
- **Avisos al teléfono:** Mi perfil → «Activar avisos» → «Probar aviso». En iPhone, primero agrega la app a la pantalla
  de inicio. También ahí: horas de silencio y resumen diario por correo (queda en el buzón).
- **Modo sol:** menú de la cuenta (arriba a la derecha) → «Modo sol».
- **Seis roles:** jefe, director de despacho, director de política, director del IVT, grabación y redes. Secretaría y
  Supervisión ya no están (lo que aprobó Supervisión sigue en el registro con su autor). Administración es el rol técnico.
- **Administración:** en Equipo ve quién tiene doble factor y lo puede reiniciar; en el material, «Quitar» lo subido por error.

## Para mostrar la seguridad
- Con redes abierto en un teléfono y el jefe en otro: redes nunca ve la hora; el jefe sí.
- Redes no puede aprobar: el botón no está, y aunque lo intente por la API, la base lo rechaza.
- El IVT y política no tienen «Ponerle fecha»; solo el jefe y el despacho la ponen (también en la base).
- Ajustes → Registro de cambios: quién hizo qué.

## Límites de la demostración
- La base es en memoria: si el servidor se reinicia (pasa en Vercel), vuelve a los datos inventados.
- Cada servidor de Vercel tiene su copia. Lo sembrado es igual en todos (mismos ids), pero lo que alguien crea vive
  solo en el servidor donde lo creó: crear algo con un rol y verlo con otro puede fallar. Por eso todo lo que hay que
  ver ya viene sembrado (D-39). Para probar creando cosas entre roles hace falta la base real.
- Los videos de demostración no tienen archivo real detrás: «Descargar todo» baja el LEEME y el storyboard de la
  cancha de El Mirador (ese sí tiene su imagen) y dice cuántos archivos no se bajaron porque no están guardados.
- Ningún correo sale: todos quedan en Ajustes → Buzón de correos.
