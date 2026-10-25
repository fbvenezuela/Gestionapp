# Asistente del equipo

Adaptación del manual «Un asistente para tu web» (Cemi, octubre de 2026; recibido el 24/10/2026, no se sube al
repositorio). Se toman la máquina y las reglas; nada del negocio de Cemi. Este archivo es el contrato entre las piezas.

## Decisiones de esta adaptación
- **Público: solo el equipo.** La plataforma es interna: no hay visitantes ni usuarios-clientes. Ámbito `equipo`, con
  el «oficio» de cada rol. Las tablas aceptan el ámbito para la fase 3 (web pública), pero ese camino no se construye ahora.
- **Vive en el servidor de la app** (Next.js), no en una función de Supabase: `POST /api/asistente`. Equivalencias:
  «security invoker» = `db(session, …)` / `withUser` (RLS con la identidad de quien pregunta); «llave de servicio» =
  `withSystem`, solo para las tablas del asistente y siempre comprobando en código que la conversación es de quien llama.
  **Nunca** se anida `withSystem` dentro de `withUser`.
- **Lo que nunca va al modelo:** la agenda del jefe (`event_schedule`: fecha, hora, dirección, cómo llegar, contactos),
  ni siquiera para quien sí la puede ver; los **títulos de los eventos** (y de las piezas, y el lugar de cada evento),
  porque la gente escribe en ellos la hora, el día o el sitio de mil formas; datos de ciudadanos (no existen en fases 1–2;
  los roles de la fase 3 no usan el asistente); claves. Cómo se cumple: ver «Lo que nunca sale» más abajo.
- **Proveedores:** cadena en `ASISTENTE_MODELOS` = `proveedor:modelo,proveedor:modelo` (mejor de casas distintas), todos
  con la API de chat compatible con OpenAI. **Anthropic no** (no da servicio en Venezuela desde el 12/11/2026). Encender
  solo con el OK legal (sanciones, ver la guía en PDF). Sin cadena → **cerebro de demostración** sin IA (`local.ts`):
  contesta con guiones y fichas y usa las herramientas por palabras clave; la respuesta lleva `modelo: 'local'`.
- **Se llama «360»** (decidió Juan, 24/10/2026). Nombre, emoji y presentación por defecto en `config/clients/fb.json` →
  `assistant`; se cambian en Ajustes → Asistente sin desplegar.

## Lo que nunca sale (marcas, limpieza y revisiones)
Hoy no hay IA (sin `ASISTENTE_MODELOS` hasta el OK legal), pero esto ya funciona para el día que se encienda.
- **Títulos como marcas** (`titles.ts`). En cada turno con modelo se leen una vez, **como la persona** (RLS), los títulos
  de los eventos y piezas que ella ve y el lugar de cada evento. Antes de ir al proveedor, cada uno se cambia por una marca
  fija para ese turno: `[[E1]]` (evento), `[[P1]]` (pieza), `[[L1]]` (lugar). Pasa en lo que devuelve cada herramienta, en
  las respuestas anteriores del hilo y en los guiones y fichas del prompt. Categoría, municipio y estado van como siempre.
  El prompt le dice al modelo que copie las marcas tal cual. Al contestar, las marcas vuelven a ser el título real (entre
  «»), que la persona puede ver; si preguntó cuándo o dónde es un evento, el título vuelve sin su hora, fecha ni lugar.
  Una marca que el modelo cambia (`[E1]`, `[[ e1 ]]`) se arregla; una inventada se vuelve «ese evento»; un lugar siempre
  vuelve como «ese lugar». Nunca se muestra una marca cruda. Si el modelo busca por una marca, la herramienta corre con el
  título real. Lo que **escribe la persona** (la pregunta y sus preguntas anteriores del hilo) también va con marcas: si
  teclea un título o el lugar de un evento que ve, al proveedor le llega `[[E1]]` o `[[L1]]` (lo guardado queda sin marcas).
  Con cadena de modelos, los títulos se leen antes de guardar la pregunta. Si no se pueden leer, ese turno no va al
  modelo: contesta el cerebro de demostración.
- **Limpieza de texto** (`redact.ts`, segunda capa). Lo que escribe la persona pasa por `redact()` (correos, teléfonos —
  también los locales de 7 cifras—, horas —también «9,30», «9 y 30», «9 con 30», «9 en punto», «12 m», «de 7 a 9»—, fechas
  —también «1ro de noviembre», «tres de noviembre», «el día 3», «3 del 11», «20261103», fechas ISO con hora— y direcciones)
  antes de guardarse y de ir al proveedor; también «1ro nov», «el día primero», «9 menos cuarto» y «8 y pico». Un lugar por
  referencia con su nombre o su adjetivo («frente a la alcaldía de Táriba», «la cancha techada de El Mirador», «la plaza
  central», «qta.», «C.C.», «parroquia…») se tapa en **cualquier** pregunta. **Si la pregunta es sobre un evento** (una
  palabra de evento, una marca, o un título o lugar que la persona ve, entero o por un nombre suyo: «lo de Tariba»), sea de
  «cómo se hace» o no, se tapan además los lugares dichos por su nombre («en Pueblo Nuevo», «en la Hacienda El
  Trapiche») y los días y partes del día («mañana», «el sábado», «en dos días», «tempranito», «de noche»), menos el día de
  su propio trabajo («mañana subo el material», «¿lo publico el sábado?») y los días de una pregunta de publicar. En
  cualquier otra pregunta los días son palabras normales («¿qué tengo hoy?») y quedan. Lo que escribió la
  plataforma (resultados de herramientas, respuestas anteriores, guiones del equipo) pasa por todas las reglas y, de
  segundo candado, por el filtro de los avisos al teléfono (`stripDateTime`). «Hoy» la pantalla no cuenta como día, y
  4/5, 9/16, 16/9 o 1/1 junto a formato o portada son proporciones, no fechas.
- **Guiones y fichas** (`guard.ts`). Al guardarlos se rechaza lo que trae una fecha, un teléfono, un correo o una
  dirección (también un lugar por referencia con su nombre). Un evento es una palabra de evento, un título que
  administración ve (entero o por un nombre suyo), quien graba («Kevin graba…») o el jefe. Una **ficha se juzga entera**:
  si el título o cualquier frase nombra un evento, no puede llevar ninguna hora ni día en ninguna parte («Feria de
  Pirineos» + «Arranca el sábado a las 8»). Un guion se juzga frase por frase (en lo que pregunta la persona de un ejemplo
  solo cuenta una fecha u hora escrita). Las horas solas sí se aceptan (franjas de tweets, mejores horas).
  «Así se contesta» guarda la respuesta con los títulos como `«[titulo]»` y limpia. En el prompt, por si algo pasó antes,
  los guiones del equipo y de conversaciones se limpian otra vez del todo; una ficha del equipo que nombra un evento en
  cualquier parte (también por la marca de un título) se limpia del todo, título y cuerpo, y una que no nombra ninguno
  pierde fechas, direcciones y contactos pero guarda sus horas. Las de fábrica y las automáticas quedan igual.
- **Avisos preparados** (`guard.ts` `noticeIssues`). Una sola revisión para los dos cerebros, dentro de `preparar_aviso`
  y otra vez cuando administración confirma. Un aviso va a todo un rol y no es donde va la agenda: **diga lo que diga**,
  no lleva día («hoy», «el sábado», «en dos días»), hora (también «8 y pico», «tempranito», «de noche»), fecha, lugar por
  referencia (después de cualquier palabra: «sale de la plaza Bolívar», «en plaza Bolívar», «encuentro: plaza Bolívar»)
  ni contactos. Solo se acepta lo del trabajo del equipo: un plazo («suban el material antes de las 3 pm», «… antes del
  viernes») o un día pegado a su verbo («hoy suben…», «suban hoy…», «mañana hay que subir…»). Si además es sobre un evento
  (palabra de evento, un título que esa persona ve —entero o por un nombre suyo—, el jefe o quien graba), tampoco lleva un
  lugar dicho por su nombre («en Pueblo Nuevo», «en la Hacienda El Trapiche»), un sitio solo («desde la plaza») ni un
  número suelto («arranca 8»). Se acepta que un aviso normal con un día («hoy cierra la tanda de tweets») tenga que
  decirse de otra forma. Si al confirmar no pasa, no sale, queda pendiente y el panel dice qué trae («No se mandó: el
  aviso trae el día y el lugar…»).
- **Red de salida** (`brain.ts` `breaksAgendaRule`). Una respuesta sobre un evento que trae fecha, hora, día («hoy»,
  «mañana», «el martes»), parte del día, lugar o contacto, de cualquier forma que se detecte, va a la vuelta correctiva y,
  si insiste, se cambia por la frase de la agenda. En una pregunta de publicar, las horas y los días de la semana son las
  mejores horas (se permiten), una fecha o un lugar no. Se acepta que un plazo de trabajo dicho con hora junto a un
  evento («¿hasta qué hora subo el material del acto?») reciba la frase de la agenda: mejor perder ese dato que filtrar uno.

## Datos (migración `20261025000900_assistant.sql`)
Todas con RLS encendido, **sin políticas y sin `grant` a anon/authenticated**: solo el servidor las toca.
- `assistant_knowledge` (fichas): `id, roles app_role[] null` (null = todos los roles), `title, body, tags text[],
  origin ('plataforma'|'equipo'), key text unique null, active, created_by, created_at, updated_at`.
- `assistant_scripts` (guiones): `id, roles app_role[] null, topic, triggers text[], script, notes, always bool, active,
  origin ('fabrica'|'equipo'|'conversacion'), key text unique null, times_used int, last_used_at, created_by, created_at, updated_at`.
- `assistant_conversations`: `id, user_id → profiles, scope ('equipo'), title, escalated_at, escalated_reason, created_at, last_at`.
- `assistant_messages`: `id, conversation_id, who ('persona'|'asistente'), body, model, tokens_in, tokens_out, ms, error,
  degraded bool, tools jsonb, go_to jsonb, created_at`. **No se borra nada.**
- `assistant_heard` («Lo que preguntan»): `id, role app_role null, text (ya redactado), knowledge_id null, discarded, created_at`.
  Se ignoran textos de menos de 12 caracteres.
- `assistant_drafts` (nivel Prepara): `id, kind, created_by, conversation_id, summary, body, target jsonb, status
  ('pendiente'|'confirmado'|'descartado'), resolved_by, resolved_at, result jsonb, created_at`.
- `assistant_actions` (nivel Hace, con deshacer): `id, conversation_id, user_id, action, entity, entity_id, detail jsonb,
  undone_at, undone_by, created_at`.
- Funciones: `assistant_plain(text)` (sin tildes ni signos); `assistant_scripts_for(p_text, p_roles app_role[], p_top int,
  p_count bool)` con la puntuación del manual (3 por disparador entero, 1 por palabra de 4+ letras, mínimo 2, los 3
  mejores, desempate por menos usados; los `always` siempre); `assistant_refresh()` regenera las fichas `plataforma`
  desde `copy_formulas`, `network_specs`, `app_settings` (marca, horarios, mejores horas, plazos del semáforo) y
  `categories`, **solo reescribe las de origen `plataforma`**, apaga (no borra) lo que ya no existe; disparadores
  `for each statement` en esas tablas, envueltos en su propio manejador de errores (si falla, el cambio se guarda igual).
- Fichas de la guía («cómo se hace X», por rol) y guiones de fábrica: en `config/assistant/` (nada del cliente en el
  código), sembrados por `seedClient` con «no pisar»: lo que el equipo editó pasa a origen `equipo` y la siembra no lo toca.

## Servidor (`src/lib/assistant/`)
- `providers.ts` — cadena desde `env.assistant.models`. Proveedores: `gemini`
  (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, `GEMINI_API_KEY`, prefijo `AIza`),
  `groq` (`…/openai/v1/chat/completions`, `GROQ_API_KEY`, `gsk_`), `openai` (`OPENAI_API_KEY`, `sk-`), `openrouter`
  (`OPENROUTER_API_KEY`, `sk-or-`), `mistral` (`https://api.mistral.ai/v1/chat/completions`, `MISTRAL_API_KEY`).
  429 → siguiente eslabón ya; si todos 429 y el que antes se libera pide ≤ 6 s, una sola espera y otra vuelta.
  Esfuerzo de razonamiento por familia; si da 400 por ese parámetro, se repite sin él. Vacío es fallo solo si no pidió
  herramientas. El error final trae el motivo de cada eslabón. Diagnóstico de claves: nombres parecidos, nunca valores.
- `tools.ts` — catálogo `Tool = { name, description, parameters, required, fromServer, roles: Role[] | null, level:
  'cuenta' | 'prepara' | 'hace', entity?, run }`. «La carta no es la cerradura»: la lista solo dice a quién se **ofrece**;
  cada `run` consulta con `db(session, …)` y la base decide. Solo pasan los parámetros declarados; los de identidad los
  pone el servidor. Máximo 4 llamadas por vuelta y 3 vueltas; la última sin herramientas. Lo que escribe se anota en
  `assistant_actions` en un solo sitio.
  Herramientas iniciales: `mis_pendientes` (cuenta, todos), `estado_pieza(titulo)` (cuenta, equipo de contenido),
  `dias_de_tweets` (cuenta, equipo de contenido), `mejores_horas(red)` y `reglas_de_video(red)` (cuenta, todos),
  `buscar_evento(texto)` (cuenta, quien vea eventos; **nunca** lee `event_schedule`), `preparar_aviso(rol, texto)`
  (prepara, admin y supervisión: borrador que confirma administración), `marcar_avisos_leidos` (hace, todos; deshacer =
  volver a no leídos), `avisar_al_equipo(motivo)` (siempre; el servidor pone la conversación).
- `screens.ts` — destinos del botón «Ir a…»: `{ href, label, roles, phrases }`, con los roles **copiados del control
  de acceso de cada página** (una prueba compara con `requireRole` del código). Exige una frase, no una palabra suelta.
  Si se usó una herramienta, manda su destino. Nunca un botón a una pantalla que esa persona no puede abrir: mejor `null`.
- `brain.ts` — guion del sistema por capas (oficio con nombre → cómo usar las herramientas → encargo del rol → datos y
  fichas → lo de quien pregunta → «ASÍ CONTESTAS» con los guiones elegidos; lo crítico se repite al final); filtro de
  salida (bytes de control, markdown, frases que delatan al modelo, partiendo por frases; **nunca deja la respuesta
  vacía**; `looksLikeText`); redes del servidor (si dice que avisó y no avisó, avisa el servidor o cambia la frase);
  degradado honesto («No pude consultar bien ahora mismo. Ya avisé al equipo.») con `degraded = true`.
- `local.ts` — cerebro de demostración sin IA (mismas entradas y salidas). Cuando niega la agenda y nombra el evento,
  lo nombra sin la hora, fecha ni lugar que traiga su título. «¿Cuál es el teléfono de soporte?», «¿a quién llamo?»,
  «tengo un problema / una falla / un error» (solo, o con la app, al entrar o al subir): «No hay teléfono de soporte en la
  plataforma; si algo falla, le aviso a administración» y ofrece avisar (con un «sí», avisa de verdad); gana sobre las
  fichas y sobre el tema de la pregunta anterior. Un error o un problema **del contenido** («hay un error en el copy»,
  «un problema con la pieza», «un error en un tweet publicado») no es soporte: lo contestan las fichas. «¿Cómo subo un video?» desde un rol que no sube: lo suben Grabación o Redes, en la pestaña Material del evento.
- `titles.ts` — las marcas de los títulos (`Placeholders`) y su lectura como la persona. `guard.ts` — las revisiones de
  avisos, guiones y fichas.
- Cada turno tiene un límite de 40 s; después de la primera vuelta, la cadena arranca desde el eslabón que respondió.
- `index.ts` — `handleTurn(session, { question, conversationId })` → `{ answer, scope, model, ms, degraded, did:
  [{ tool, error? }], goTo: { href, label } | null, conversationId }`. Antes del cerebro abre el turno (`openTurn`: una
  transacción corta, con candado por persona): la conversación, la cuenta de la hora y la pregunta redactada se guardan
  **al empezar**, así los pedidos en paralelo la ven y un turno que falla después igual cuenta. Solo la respuesta se
  guarda **después**; si guardar falla, se escribe en el log y la respuesta sale igual. Si el turno no se pudo abrir, no
  se llama al modelo de pago: contesta el cerebro de demostración.
- Topes: pregunta 1.500 caracteres; respuesta 700 tokens; hilo 24 mensajes (no se recorta para ahorrar); 40 mensajes
  por persona y hora; el gasto cuenta en `ai_usage` (`feature = 'assistant'`) contra `AI_MONTHLY_CAP_USD`. Cada turno
  con modelo deja, al abrirse, una reserva en `ai_usage`: lo que se estima que gastará, al precio del eslabón más caro y
  según el largo del hilo (cada vuelta reenvía el hilo entero). Al guardar se cambia por lo que gastó de verdad, o se
  borra si no gastó nada. El tope del mes falla cerrado: si ya se pasó (contando las reservas en curso) o no se pudo
  leer el gasto, no se llama al modelo y contesta el cerebro de demostración. Al pasar el tope por hora, contesta como el
  asistente («Llevamos un buen rato…»), no como avería. Temperatura 0,6 (0,5 en la vuelta correctiva).
- `escalate(conversationId, motivo)` — `notify()` a administración (y a supervisión si el motivo es de aprobación) con
  enlace a la conversación en el panel; no repite en 6 horas. El motivo lo puede escribir el modelo (con los títulos
  reales de vuelta): antes de que nadie lo vea pasa por todas las reglas, los lugares dichos por su nombre y el filtro de
  los avisos al teléfono, así a supervisión no le llega ni el día ni el lugar de un evento.
- Salud: en `/api/cron/tick`, si en la última hora más del 20 % de las respuestas salieron degradadas, aviso a
  administración, como mucho cada 6 horas.

## La ventana (`src/components/assistant/`)
Se monta una vez en `src/app/(panel)/layout.tsx` para todos los roles. Botón redondo con la cara (emoji o inicial) y
el nombre, abajo a la derecha, por encima de la barra del teléfono; no tapa nada importante a 360 px. Diálogo con nombre
(`aria-expanded`, Escape cierra, foco visible, enviar desactivado mientras espera, tope de 1.500 en el campo). El hilo
vive en `sessionStorage` con el usuario y el ámbito; «Empezar de nuevo» no borra nada de la base; el botón marca cuando
hay una conversación a medias. Preguntas sugeridas por rol. Aviso de degradado si el servidor lo marca o si no responde.
Botón «Ir a…» cuando la respuesta trae destino. No lee datos de nadie: solo llama a `/api/asistente`.
Aviso fijo: «No escribas aquí fechas, horas ni direcciones de la agenda.»

## El panel (Ajustes → Asistente, solo administración)
Ocho pestañas: **Lo que sabe** (fichas; las automáticas avisan antes de editarse; «Actualizar lo que sabe»),
**Cómo contesta** (guiones, editor, probador que no gasta turnos), **Conversaciones** («Así se contesta» y «Corregir»),
**Cómo va** (por día, degradadas, errores por modelo, tiempo, tokens; qué claves existen, sin valores; «Probar la
cadena»; lo que cortó el tope por hora sale como «Límite por hora», en su propia fila al final, nunca como un modelo),
**Lo que preguntan** (agrupado, «Enseñarle el dato» y «Enseñarle cómo contestar»), **Por confirmar**, **Lo que hizo**
(con deshacer) y **Ajustes** (nombre, cara y presentación).

## No se hace (y por qué)
- Ofrecerse solo en páginas de producto (P10): no hay páginas de producto; el equipo lo abre cuando lo necesita.
- Camino de visitante y tope por huella: llega con la web pública (fase 3).
