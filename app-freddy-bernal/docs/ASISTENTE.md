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
  ni siquiera para quien sí la puede ver; datos de ciudadanos (no existen en fases 1–2; los roles de la fase 3 no usan el
  asistente); claves. Lo que escribe la persona pasa por `redact()` (correos, teléfonos, horas y fechas → `[correo]`,
  `[numero]`, `[hora]`, `[fecha]`) antes de ir al proveedor y antes de guardarse en «Lo que preguntan».
- **Proveedores:** cadena en `ASISTENTE_MODELOS` = `proveedor:modelo,proveedor:modelo` (mejor de casas distintas), todos
  con la API de chat compatible con OpenAI. **Anthropic no** (no da servicio en Venezuela desde el 12/11/2026). Encender
  solo con el OK legal (sanciones, ver la guía en PDF). Sin cadena → **cerebro de demostración** sin IA (`local.ts`):
  contesta con guiones y fichas y usa las herramientas por palabras clave; la respuesta lleva `modelo: 'local'`.
- **Se llama «360»** (decidió Juan, 24/10/2026). Nombre, emoji y presentación por defecto en `config/clients/fb.json` →
  `assistant`; se cambian en Ajustes → Asistente sin desplegar.

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
- `local.ts` — cerebro de demostración sin IA (mismas entradas y salidas).
- Cada turno tiene un límite de 40 s; después de la primera vuelta, la cadena arranca desde el eslabón que respondió.
- `index.ts` — `handleTurn(session, { question, conversationId })` → `{ answer, scope, model, ms, degraded, did:
  [{ tool, error? }], goTo: { href, label } | null, conversationId }`. Guarda **después** de responder; si guardar falla,
  se escribe en el log y la respuesta sale igual.
- Topes: pregunta 1.500 caracteres; respuesta 700 tokens; hilo 24 mensajes (no se recorta para ahorrar); 40 mensajes
  por persona y hora; el gasto cuenta en `ai_usage` (`feature = 'assistant'`) contra `AI_MONTHLY_CAP_USD`. Al pasar un
  tope, contesta como el asistente («Llevamos un buen rato…»), no como avería. Temperatura 0,6 (0,5 en la vuelta correctiva).
- `escalate(conversationId, motivo)` — `notify()` a administración (y a supervisión si el motivo es de aprobación) con
  enlace a la conversación en el panel; no repite en 6 horas.
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
cadena»), **Lo que preguntan** (agrupado, «Enseñarle el dato» y «Enseñarle cómo contestar»), **Por confirmar**,
**Lo que hizo** (con deshacer) y **Ajustes** (nombre, cara y presentación).

## No se hace (y por qué)
- Ofrecerse solo en páginas de producto (P10): no hay páginas de producto; el equipo lo abre cuando lo necesita.
- Camino de visitante y tope por huella: llega con la web pública (fase 3).
