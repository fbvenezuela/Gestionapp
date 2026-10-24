# Recorrido de demostración (viernes 23/10)

**Link:** el de la versión de prueba de Vercel (ver `README.md`, «Publicar la demostración»). En local:
`npm run build && npm start` → http://localhost:3000.

Todo es **inventado**. Para entrar, **toca el rol** en la lista «Versión de demostración»: entras directo, sin código
ni doble factor (atajo solo para probar, `DEMO_SHORTCUTS`). Para ver el flujo real (código por correo + doble factor
con Google Authenticator), pon `DEMO_SHORTCUTS=false` en Vercel. Con datos reales el atajo no existe.

| Rol | Correo | Qué tocar |
|---|---|---|
| Redes | `redes@demo.test` | **Agenda**: los eventos salen en lista, sin fecha ni hora. Abre «Entrega de viviendas…» → **Storyboard** → agrega un bloque → Guardar. **Piezas** → «Jornada de salud escolar» → sube un video → «Escribir desde la ficha» → mira los tres largos con su contador → «Enviar a aprobación». **Tweets** → «Tweets de la semana» → pega o sube un .docx → «Separar» → mira repetidos y largos → «Repartir en la semana» |
| Supervisión | `supervision@demo.test` | **Por aprobar** → abre la pieza → pausa el video y escribe un comentario → «Aprobar» o «Pedir cambios». Pestaña **Tweets** → «Aprobar marcados». Prueba «Pedir frase al jefe» |
| Redes (otra vez) | `redes@demo.test` | **Publicar** → la pieza aprobada → elige redes (cada una dice si el video sirve y qué arreglar) → paquete → pega un link → «Ya lo publiqué» → carga vistas y me gusta. **Resultados** → «¿A qué hora nos va mejor?» |
| Jefe | `jefe@demo.test` | Dos botones grandes: **Política** (eventos de la semana, «Lo que voy a decir» en letra grande, calificar 1–10 y aceptar) y **Digital** |
| Despacho | `despacho@demo.test` | **Agenda** en calendario (día, semana, mes) → «Nuevo evento» con la ficha técnica. Avisa si choca con otro |
| Grabación | `grabacion@demo.test` | **Mis eventos** (con fecha y lugar: los suyos) → «Jornada de salud…» → sube «Jefe hablando». Corta el wifi a la mitad: sigue sola al volver |
| Secretaría | `secretaria@demo.test` | Propone un evento: solo ve los suyos |
| Administración | `admin@demo.test` | **Ajustes** → Equipo (invitar, roles, cerrar sesiones), categorías, fórmulas, horarios de tweets, reglas de video por red, buzón de correos y registro de cambios. «Ver como…» arriba cambia los menús (no los permisos) |

## Para mostrar la seguridad
- Con redes abierto en un teléfono y el jefe en otro: redes nunca ve la hora; el jefe sí.
- Redes no puede aprobar: el botón no está, y aunque lo intente por la API, la base lo rechaza.
- Ajustes → Registro de cambios: quién hizo qué.

## Límites de la demostración
- La base es en memoria: si el servidor se reinicia (pasa en Vercel), vuelve a los datos inventados.
- Los videos de demostración no tienen archivo real detrás (la descarga avisa).
- Ningún correo sale: todos quedan en Ajustes → Buzón de correos.
