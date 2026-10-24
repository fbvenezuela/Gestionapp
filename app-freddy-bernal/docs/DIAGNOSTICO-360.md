# Diagnóstico Digital 360: lo que sirve para la plataforma

Recibido el 24/10/2026: ZIP «Diagnostico_Digital_360_v71_Solo_Codigo» (sitio de ChatGPT Sites, versión 71, corte
septiembre 2026, hecho por B360 / Publitag). **No se copió al repositorio**: es confidencial, trae datos personales y
un mapa de actores políticos. Aquí queda solo lo útil para operar, marcado como **propuesta** del diagnóstico: nada
se aplicó sin decisión explícita (ver «Preguntas» al final: Juan las respondió el 24/10). Ninguna cifra de aquí se usa como dato en un copy.

## Qué trae el paquete
1. **Diagnóstico de 21 módulos** (m01–m21) con datos medidos por red: textos, rendimiento, oratoria, audiencias, KPI.
2. **ADN de comunicación**: paleta, tipografía, voz, formatos, mezcla de pilares, vestuario (texto sacado de un PDF).
3. **Plan de gestión** y la biblia de producción de **Reporte Bernal 2.0**.
4. **TCPRO-5**: módulo privado que consulta una API externa de escucha de medios. **No se integra** (ver abajo).
5. Un «Manual de marca» en HTML que es de **posicionamiento político** (propósito, arquetipo, voz), no visual.

**Falta** el manual de identidad visual (láminas 31–38 del PDF *Estrategia_Identidad_Freddy_Bernal_Integrada*: logo,
resguardo, tamaños, pesos): el ZIP «solo código» no trae PDF ni imágenes.

## Marca (aplicada a `src/app/tokens.css`: oliva como color principal)
- Paleta: Naranja `#FE5A03`, Naranja claro `#FD943C`, Oliva `#7F8630`, Negro `#111111`, Blanco `#FFFFFF`, Amarillo
  `#FFD380`. Letra: **Montserrat** (Arial de respaldo), máximo dos pesos por pieza gráfica. **El azul queda fuera.**
- Variante oliva más nueva: 55 % oliva, 25 % blanco, 15 % negro, 5 % amarillo. La naranja figura como «color dominante»
  en la versión anterior. **Decidido: oliva es el color principal** (Juan, 24/10; D-21).
- Logo: «FREDDY / Bernal / GOBERNADOR» en 4 versiones (oliva/blanco, blanco/oliva, negro/blanco, blanco/negro), solo
  como imagen. No aparece «F BERNAL». → Aprobado (Juan, 24/10); falta el vector.
- Contraste (WCAG AA): el texto sobre naranja, oliva o amarillo va en **negro**. Blanco sobre naranja (3,14:1) u oliva
  (3,92:1) no pasa; amarillo sobre naranja u oliva y naranja sobre oliva tampoco, ni en letra grande.

## Copies (reglas medidas en m10/m13)
- La primera línea es el **hecho, la escena o el dato**, dentro de los primeros 100 caracteres (Instagram corta en ~125).
- **Nunca abrir con** «En el marco de», «Siguiendo el legado de», «Bajo la orientación de», «Seguimos brindando…»
  (la corrección de mayor impacto medido). «Seguimos trabajando» sirve como cierre, no como apertura.
  → Ya está en la regla de la IA y en las pistas de las fórmulas.
- 2 o 3 bloques cortos; cerrar con una acción con destino real (enlace, dirección, teléfono). Las preguntas abiertas sin
  moderación se volvieron buzón de quejas. → El cierre se elige por pieza (D-24).
- Voz en **primera persona**, nada de tercera persona tipo boletín. → Se elige por pieza (D-24).
- Cada cifra con su fuente («dato sin fuente = dato que no sale»), como ya exige la plataforma.
- Hashtags: un set fijo de 3–5 de marca + 2–3 de descubrimiento; las cuentas usan `#Tachira` sin acento. → Aplicado
  (`#Tachira #FreddyBernal #Venezuela`).
- Fórmulas propuestas (PENDIENTES #13): gancho-bloques-acción, dato primero (X), denuncia-acción-resultado, cifra única,
  cita del jefe, historia con protagonista. → Agregadas las seis.

## Ideas por módulo (para siguientes fases)
- **Agenda:** hitos T−72 h aviso, T−48 h ficha, T−24 h confirmación, T0 cobertura, T+3 h publicación, T+24 h medición;
  camino «evento sin aviso → ficha breve».
- **Storyboard:** plantillas de formatos madre (60 s de gestión, ¿Cómo vamos? ≤90 s, Voces del Táchira, En el mapa, En
  terreno) y ágiles (En números, Te explico, Antes/Ahora, ¿Dónde estamos?, Una pregunta). Orientación por toma
  («si es para vertical, se graba en vertical»).
- **Material:** marca de «toma prioritaria», validación técnica (sonido, foco, luz, encuadre) con veredicto. **No** se
  adopta el nombre de archivo `AAAA-MM-DD_evento…` del Plan: filtra fechas (regla 4, D-13).
- **Aprobación:** semáforo (verde rutinario preaprobado, amarillo en 60 min, rojo del cliente en 30 min); «la falta de
  respuesta no es aprobación»; lista de chequeo en teléfono antes de aprobar. → Aplicado (D-23), con la lista de chequeo.
- **Publicar:** chequeos sin API (subtítulos, zonas seguras 9:16/1:1/16:9, nada de recorte automático desde 16:9).
  TikTok rinde mejor 22:00–23:59 y 07:00–11:59; jueves el mejor día, sábado el peor. → Aviso al programar.
- **Resultados:** revisar a las 48 h y consolidar a los 7 días; comparar ventanas iguales; pesar guardados y
  compartidos sobre me gusta; vista por día de la semana. Las metas de m21 son propuesta, no resultados.
- **Vista del jefe / trazabilidad:** «El Marcador» de compromisos (Cumplido, En ejecución, Pendiente, En evaluación).
- **Ropa (fase 4):** tipos de evento y looks del vestuario como semilla.

## Lo que NO se integra
- **TCPRO-5**: confía en una cabecera que fuera de ChatGPT Sites cualquiera puede falsificar; el proveedor
  (`kunawaro.alwaysdata.net`) es desconocido y tiene llamadas pagas; el proyecto autorizado es de demostración (sin
  datos de Freddy). Si se quiere escucha de medios en fase 2: contrato, precio y acuerdo de datos primero.
- El **juego de actores** (mapa político), datos personales (familia, cuentas de ciudadanos, peticiones), nombres de
  personal y presupuestos: nada de eso entra a la plataforma, a las semillas ni a la IA.
- Ideas doctrinales y líneas sobre negociaciones: no van al prompt de la IA sin decisión explícita del cliente.
- El código, el HTML y el esquema del paquete: solo se toman ideas, reescritas.

## Preguntas (respondidas por Juan el 24/10/2026)
1. ~~¿Color principal oliva o naranja?~~ **Oliva.** Aplicado (D-21).
2. ~~¿El logo «FREDDY / Bernal / GOBERNADOR» es el aprobado?~~ **Sí.** Falta el vector y las láminas 31–38.
3. ~~¿Horarios del diagnóstico o 4–5 tweets al día?~~ **Los del diagnóstico:** X 2–3 al día; mejores horas por red como
   aviso al programar (`publishingWindows` en `config/clients/fb.json`). D-16.
4. ~~¿`#Tachira` o `#Táchira`? ¿`#Venezuela`?~~ **`#Tachira`** y se agrega **`#Venezuela`**.
5. ~~¿Todo en primera persona?~~ **No todos:** se elige por pieza (D-24).
6. ~~¿«Por amor al Táchira» como cierre principal?~~ **No siempre:** se elige por pieza (D-24).
7. ~~¿Qué fórmulas se agregan?~~ **Todas** (GBA, DATO, DAR, CIFRA, CITA, HIST).
8. ~~¿Fernando aprueba todo o semáforo? ¿Espontáneos del jefe?~~ **Semáforo** y los espontáneos se registran después
   (D-23).
9. ~~¿Quién es Igor?~~ Hizo un **programa de investigación de datos** que se conectará después. TCPRO-5 no se integra.
