# Guía de administración

> **No se manda todavía: Hillary pidió probar cada rol antes (25/10).**

<!-- Generado por `npm run docs:guides` desde src/lib/guides/ (admin.ts). No se edita a mano: se cambia la fuente y se corre otra vez. -->

Administración es el rol técnico: invita al equipo y le da sus roles, cuida los ajustes de la plataforma y el asistente 360. No decide, no aprueba y no escribe en la agenda. En la app: `/ayuda/administracion` (solo administración).

## Lo que no es de administración
- Mensajes no es para administración: no entras a los canales del equipo, y una cuenta con administración no entra a Mensajes aunque tenga otro rol.
- El rol de jefe no se da desde Equipo: se da con el comando de instalación (npm run db:first-admin con la opción --jefe). Cada rol del equipo que das le llega al jefe como aviso.
- Las guías del equipo no hablan de administración: esta guía es aparte.
- Nada sale hacia afuera mientras se prueba: los correos quedan en el «Buzón de correos» y nada se publica solo.

## Cada pantalla

### Equipo (`/ajustes/equipo`)
Las personas del equipo, sus roles, su doble factor y sus sesiones. Cada persona tiene su usuario, aunque compartan el rol.

- «Invitar a alguien»: el nombre, el correo y el rol, y «Enviar invitación». Le llega un correo y entra con un código.
- «Cambiar» los roles de una persona. Las casillas que no se pueden marcar dicen por qué.
- «Cerrar sus sesiones» si perdió el teléfono; «Reiniciar doble factor» para que lo active de nuevo.
- «Desactivar» a quien ya no trabaja (no se borra; «Activar» lo trae), y «Anular» una invitación sin aceptar.
- Cada rol del equipo que das le llega al jefe como aviso.
- No puedes: Darte tus propios roles: los da otra persona de administración.
- No puedes: Ser también el jefe o el despacho en la misma cuenta: usa otra cuenta.
- No puedes: Dar el rol de jefe: El rol de jefe lo da el comando de instalación.

### Categorías (`/ajustes/categorias`)
La lista de categorías del contenido (eventos, piezas y tweets).

- Agregas, cambias el nombre o apagas una categoría.

### Fórmulas de copies (`/ajustes/formulas`)
Las fórmulas con las que se escriben los copies (FAB, PAS, AIDA y las que agregues).

- Agregas o corriges una fórmula; Redes la elige en cada pieza.

### Horarios de tweets (`/ajustes/horarios`)
Las franjas del día y cuántos tweets salen por día, para repartir la tanda de la semana.

- Cambias las franjas y el número por día.

### Reglas por red (`/ajustes/redes`)
La duración, las medidas y el peso de video de cada red, con los que se revisa una publicación.

- Cambias el número de una red cuando la red cambia sus reglas.

### Marca (`/ajustes/marca`)
El nombre, los colores, los logos, el saludo, los cierres y los hashtags.

- Cambias los textos de la marca que usan los copies.

### Google Drive
Dónde se guardan los videos, la conexión y una prueba. Solo sale en Ajustes cuando el material va a Drive.

- Conectas la cuenta de Drive del cliente y pruebas que sube y baja.

### Asistente (`/ajustes/asistente`)
Lo que sabe 360, cómo contesta y cómo le va.

- Las pestañas: «Lo que sabe», «Cómo contesta», «Conversaciones», «Cómo va», «Lo que preguntan», «Por confirmar», «Lo que hizo» y «Ajustes».
- En «Conversaciones» lees lo que el equipo le pregunta a 360: tú sí lees esas conversaciones, y el panel de 360 se lo dice a cada persona.
- En «Por confirmar», los avisos que preparó 360 y que tú confirmas o descartas.
- Una pregunta a 360 sobre lo que dice un mensaje del equipo se guarda sin el texto.

### Buzón de correos (`/ajustes/buzon`)
Todos los correos que generó la plataforma. Mientras se prueba, ninguno sale: quedan aquí.

- Revisas que el correo diga lo que tiene que decir, sin fecha ni hora de la agenda.

### Registro de cambios (`/ajustes/registro`)
Quién cambió qué y cuándo, en toda la plataforma.

- Buscas un cambio por tipo o por persona.
- De Mensajes sale solo que hubo un mensaje, un canal o un cambio de miembros, quién y cuándo: nunca el texto, el nombre del canal ni quiénes son.

### Ver como
Para ver los menús de otro rol, arriba (en el teléfono, dentro de «Mi cuenta»). Tus permisos no cambian.

- Eliges un rol o «Mi vista». Mientras miras, sale una franja que lo dice.
- Los tutoriales también siguen «Ver como»; Mensajes no.

### Por aprobar (`/aprobar`)
Ves lo que espera al jefe, pero no apruebas: todo lo aprueba el jefe.

- En una pieza: «Cambiar nivel», comentar, o «Pedir frase al jefe» si hace falta su voz («Anotar pedido de frase»).

### La agenda y las fichas (`/agenda`)
Lees la agenda, «Por ponerle fecha», las obras y los municipios.

- Puedes crear y completar fichas de obra.
- En el material de un evento, «Quitar» un archivo que no va.
- No puedes: Crear eventos, ponerles fecha o decidirlos: eso es del jefe y del despacho.
- No puedes: Ver los contactos ni los documentos de un reporte comunitario.

## Preguntas
**Alguien perdió el teléfono, ¿qué hago?**
En Equipo, «Cerrar sus sesiones» y «Reiniciar doble factor». La próxima vez que entre, lo activa de nuevo.

**¿Por qué no puedo marcar «Jefe» en Equipo?**
El rol de jefe lo da el comando de instalación. Así nadie arma otra cuenta que apruebe todo o esté en todos los canales.

**¿Puedo leer los mensajes del equipo?**
No. Mensajes no tiene entrada para administración, ni con «Ver como», ni en el registro de cambios.

**¿Qué ve el equipo de lo que hago?**
Cada rol que das le llega al jefe como aviso. Las personas saben que lees lo que le preguntan a 360: el panel de 360 lo dice.
