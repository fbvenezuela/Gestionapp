# Lo que falta decidir o conseguir (antes o durante la construcción)

Actualizado: 23/10/2026. La plataforma interna ya está construida en modo demostración; lo de abajo es lo que falta para pasar a datos reales y lo que hay que decidir. Mientras no esté, la sesión de Claude Code avanza con lo que está entre paréntesis («por ahora») y lo deja marcado.

## Lo tiene que mandar alguien
1. **Branding:** manual de identidad visual «F BERNAL», logos (incluido el de «Reporte Bernal 2.0»), colores y tipografías. Hillary preguntó el 22/10 si lo necesitas; le dijiste que sí. (Por ahora: paleta y logo provisionales, fáciles de cambiar en un solo archivo.)
2. **El prompt maestro de imagen de Hillary** para mejorar las fotos de la trazabilidad. (Por ahora: el módulo existe pero desactivado.)
3. **Accesos a la web actual** (dominio, DNS, hosting y repositorio): los tiene el Ing. Pedro Poller y no los ha pasado. (Por ahora: se trabaja en un dominio de prueba de Vercel.)
4. **Correo del cliente** para abrir las cuentas (Vercel, Supabase, Google y Metricool). El acceso lo tiene Nesmaury en el iPhone y te llega un código de verificación. Pedir solo el código, nunca la clave. Juan ya está abriendo cuentas (22/10): cada una va a `CUENTAS.md`.
5. **Metricool:** ya no para publicar (Hillary, 22/10). Solo si se quiere para leer métricas: confirmar que el plan incluye la API.
6. **Clave de API de IA** (copies, análisis de métricas, fotos). La suscripción de Claude o de ChatGPT no sirve para eso: hace falta una clave de API con su forma de pago.
7. **La lista de personas que van a usar el panel**, por rol: operadores, redactores, despacho y supervisión.
8. **Mapas de municipios y parroquias del Táchira** (límites geográficos), si se quiere ubicar cada reporte solo. (Por ahora: lista para elegir.)

## Lo tienen que decidir Hillary, Leo o el cliente
1. **¿Se muestran los nombres de las personas ayudadas** en el feed público? Recomendado: solo con su permiso; si no, iniciales.
2. **Denuncias:** ¿quién las atiende y a qué entidad se derivan las graves? Nada de una denuncia sería público.
3. **Fotos mejoradas con IA:** recomendado que solo corrijan luz y nitidez, con la etiqueta «foto mejorada» y la original guardada. Una foto de obra que cambia lo que muestra se vuelve en contra.
4. **¿Quién aprueba lo que se publica?** ¿Fernando Alvarado para todo, o solo para lo político?
5. **Cuenta del ciudadano:** ¿se reporta sin cuenta (más fácil) o con verificación por teléfono (menos spam)?
6. **Notificaciones a la gente:** ¿solo correo y aviso en la web, o también WhatsApp o SMS (tienen costo)?
7. **Cuántos tweets al día y en qué horas** (Hillary dijo 4 o 5).
8. **Dónde se aloja la base de datos** (región de Supabase) y cuánto tiempo se guardan los datos personales.
9. **Prioridad:** recomendado empezar por el estudio de contenido (es lo que Hillary pide ya) y luego la muestra pública (trazabilidad y mapa de reportes). Confirmar.

## Nuevo (22/10 tarde, lo que agregó Hillary)
10. **Cómo se publica:** ¿API directa de cada red (Meta, TikTok, X, YouTube) o seguir con Metricool validando y
    convirtiendo antes? Hillary no confía en Metricool por lo que pasó con Mila. Recomendado: validación propia siempre
    y, para publicar, empezar por las APIs directas de Meta y X; TikTok cuando aprueben la app (su API pide revisión).
11. **¿Dónde está el código de la plataforma de Mila?** Hay que copiarla y agregarle X. Si se hizo en Claude, ¿hay
    repositorio o hay que rehacerla a partir de capturas?
12. **El Drive del cliente:** permiso para leer la carpeta de los días y eventos (cuenta del cliente).
13. **Fórmulas de copies:** que Hillary mande sus fórmulas y ejemplos buenos de cada red.
14. **La ropa:** fotos de las prendas del jefe y ejemplos de lo que se pone en cada tipo de evento.

## Nuevo (22/10 noche): para arrancar con GitHub, Supabase, Vercel y Resend
15. **¿A nombre de quién va cada cuenta?** GitHub (organización o usuario), Supabase (organización) y Vercel (equipo).
    Recomendado: una organización del cliente o de Impulso Digital con Juan como administrador, nunca la cuenta
    personal de Juan donde viven sus otros proyectos. (Por ahora: lo que Juan diga al arrancar; queda en `CUENTAS.md`.)
16. **Planes.** Vercel Hobby es solo para uso personal, sin fines comerciales: para un cliente toca Pro. Supabase gratis
    pausa los proyectos sin uso y tiene tope de archivos; producción en Pro. Verificar precios vigentes en `COSTOS.md`.
    (Por ahora: un proyecto de Supabase **de prueba** gratis y las versiones de prueba de Vercel.)
17. **Dominio para los correos (Resend).** Para enviar desde «@algo» hace falta un dominio verificado (registros
    SPF/DKIM en su DNS). El del gobernador lo tiene Pedro Poller. ¿Se compra uno para la plataforma o se usa uno de
    Impulso Digital? (Por ahora: el remitente de prueba de Resend, que solo envía al correo del dueño de la cuenta.)
18. **Dónde vive el video grande** (material crudo y finales, varios GB por evento):
    - Supabase Storage: lo más simple, subida por partes; cuesta por GB guardado y descargado.
    - Google Drive del cliente: es lo que Hillary ya usa, pero subir desde la app al Drive personal de él tiene trabas
      de permisos de Google.
    - Un almacenamiento sin costo de salida (por ejemplo Cloudflare R2): barato para descargar mucho.
    Recomendado: el video en la plataforma (Supabase o R2) y el Drive solo para leer y ordenar lo que ya existe.
    (Por ahora: Supabase Storage con subida por partes y un tope de tamaño configurable.)
19. **«Un solo perfil» para redes.** Recomendado: un solo **rol** (las cuatro ven y hacen lo mismo) pero **un usuario
    por persona**, para saber quién hizo qué y para el doble factor. Confirmar con Hillary. (Por ahora: así.)
20. **Reportes cercanos sin mostrar los de otros** (§11.1 de `IDEA.md`). Recomendado: solo «ya hay N reportes de esto a
    menos de 100 m, ¿te sumas?», sin fotos, textos ni nombres. Confirmar.
21. **Permisos de las redes para publicar solos.** Cada una pide lo suyo y tarda:
    - Meta: app de desarrollador, verificación del negocio y revisión de permisos de publicación.
    - TikTok: hasta que auditan la app, lo publicado sale como privado.
    - X: la API de publicación es de pago.
    - YouTube: la subida gasta mucha cuota diaria.
    Verificar requisitos y precios vigentes. (Por ahora: publicación manual validada, con link y captura de evidencia.)
22. **Doble factor desde el lunes.** Recomendado: obligatorio ya para administrador, jefe, director de despacho,
    supervisión y quien vea denuncias o ayudas; para el resto, antes de abrir la web al público, con una guía paso a
    paso. Confirmar.
23. **¿Quién es Igor y qué datos extrae?** (audio del 12/10, para los tweets de gestión).
24. **Nombre de la plataforma.** El diseño dice «FB · Operaciones 360». ¿Se queda? (Por ahora: sí, en un solo archivo de
    configuración.)

25. **¿Quien graba ve la fecha y la hora?** Tiene que saber cuándo y dónde estar. Recomendado: solo de los eventos que
    tiene asignados. Confirmar con Hillary. (Por ahora: así, anotado en `DECISIONES.md`.)

## Estado al 23/10/2026 (lo que hizo la sesión de Claude Code)
- #15 y #16: el código está listo para Supabase, Vercel y Resend; **falta que Juan abra las cuentas** (organización del
  cliente) y pegue las variables (`README.md` §Conectar las cuentas). Mientras, la app corre en modo demostración.
- #17: correos en modo buzón (no sale nada). Falta el dominio para Resend.
- #18: video en Supabase Storage por partes (D-12).
- #19, #22, #25: decididos «por ahora» en `DECISIONES.md` (D-09, D-08, D-05). Confirmar con Hillary.
- 2.7 (tweets por día y horas): D-16. Confirmar.
- #6 (clave de IA): sin clave los copies salen con plantilla; con `ANTHROPIC_API_KEY` y `AI_ENABLED=true` los escribe la IA.
- #21: publicación manual validada; las APIs de cada red, en fase 2.
- Nuevo — #26: los límites de video de cada red están cargados de la documentación pública, marcados «verificar»
  (Ajustes → Reglas por red → «Guardar y marcar verificado»).

## Llegó el Diagnóstico Digital 360 (24/10/2026)
Resumen y lo que sirve: `docs/DIAGNOSTICO-360.md` (el ZIP no se subió al repositorio: es confidencial).
- **#1 Branding — llegó parcial.** Paleta: Naranja #FE5A03, Naranja claro #FD943C, Oliva #7F8630, Negro #111111,
  Blanco #FFFFFF, Amarillo #FFD380; Montserrat (máx. dos pesos por pieza); logo «FREDDY / Bernal / GOBERNADOR» solo en
  imagen (4 versiones). Aplicado a los colores (D-21). **Falta:** logo en vector (SVG/AI/PDF), láminas 31–38 del PDF
  *Estrategia_Identidad_Freddy_Bernal_Integrada* (resguardo, tamaños, pesos), logo de Reporte Bernal 2.0 sin azul y saber
  si «F BERNAL» es otra marca.
- **#2 Prompt de imagen — no vino.** El diagnóstico respalda «solo luz y nitidez» y marca como alto riesgo generar
  imágenes sintéticas de personas o hechos.
- **#13 Fórmulas — llegaron propuestas** del diagnóstico (gancho-bloques-acción, dato primero, denuncia-acción-resultado,
  cifra única, cita del jefe, historia con protagonista). Hillary decide cuáles.
- **#23 Igor** — ¿es quien opera TCPRO-5 (escucha de medios en `kunawaro.alwaysdata.net`)? No se integra hasta saberlo.
- **Nuevo #27:** las 9 preguntas de `docs/DIAGNOSTICO-360.md` (color principal, logo, horarios por red, hashtags,
  primera persona, cierres, fórmulas, semáforo de aprobación, TCPRO-5).
