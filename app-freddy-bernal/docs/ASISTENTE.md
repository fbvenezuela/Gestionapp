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

## Roles y reglas que usa 360 (desde el 27/10/2026)
- **Seis roles del equipo** (jefe, despacho, política, IVT, grabación, redes) y administración, el técnico
  (`DECISIONES.md` D-29). El «oficio» de cada uno está en `config/assistant/roles.json`: qué lleva, qué pantallas usa,
  qué no es suyo y a quién mandarlo. No da ni quita permisos: eso lo decide la base.
- **Lo que 360 dice de las reglas de la ronda:**
  - todo lo aprueba **el jefe** (verdes de un toque; amarillas y rojas con la lista); administración nunca aprueba
    (D-30);
  - la agenda la hacen **el jefe y el despacho**: crear, poner fecha, mover y cancelar; lo del despacho espera la
    decisión del jefe (D-32);
  - **el IVT y política no ponen fecha**: cargan su ficha y «Guardar y avisar al jefe» la manda a «Por ponerle fecha»
    (D-33). El IVT ve la fecha de sus visitas en «Mis visitas de obra»; política solo ve «Ya tiene fecha»;
  - **Grabación** sube el material, el storyboard con el que grabó y la nota para el editor (D-36);
  - **Redes** nunca ve fecha, hora ni dirección.
  Las fichas de fábrica que lo dicen (`config/assistant/knowledge.json`): cambiar, cancelar y crear eventos, permisos,
  Despacho, Grabación, storyboard, quién graba y la agenda privada.
- **«¿Qué tengo pendiente?»** (`mis_pendientes`) trae lo mismo que el inicio de cada rol y manda a cada uno a su
  pantalla: el jefe a su Inicio (lo que le toca aprobar, lo que espera su decisión, «Por ponerle fecha» y lo vencido);
  el despacho a Hoy («Por ponerle fecha» y fichas técnicas incompletas); política a Municipios (lo vencido); el IVT a
  Obras (sus fichas en borrador y cuántas esperan fecha); Grabación y Redes a Hoy. Nunca da fecha ni hora.
- **Sin roles retirados:** al retirar Secretaría y Supervisión, las fichas y guiones del equipo que los nombraban los
  perdieron (la que quedó sin rol se apagó, no se borró), y las automáticas se regeneraron (`assistant_refresh()`).
- **Lo de terceros nunca pasa por 360:** las herramientas no leen los contactos de las fichas (`*_private`) ni la
  fecha de la agenda, ni siquiera para quien los puede ver.

## Lo que habla de un evento lo contesta 360 sin IA
La regla de fondo (ronda 4): en vez de buscar cada forma de escribir una fecha, una hora o un lugar, **un turno que
habla de un evento nunca va al proveedor**, aunque haya cadena de modelos. Lo contesta el cerebro de demostración, que
tiene las herramientas de eventos y la negativa de la agenda. No se reserva gasto para ese turno.
- **Un solo detector** (`events.ts`, `aboutEvent` / `eventSignals`), el mismo en todas partes: qué cerebro contesta,
  cuánto se tapa de la pregunta (`guardQuestion`), la red de salida, los avisos, las fichas y guiones, y el motivo que le
  llega a administración al avisar al equipo. Antes lee las abreviaturas como palabras («kndo», «onde», «lo d la»). Habla de
  un evento si trae: una palabra de evento («la feria», «el acto», «la agenda»), también con una letra de más, de menos,
  cambiada o trocada («feira», «evnto»); un evento en particular: un título que esa persona ve, entero, por un nombre
  suyo («Tariba»), por una tira de palabras con mayúscula («Alto Verde», aunque cada una sea común), por dos palabras
  suyas seguidas («toma aérea», «zona alta») o por **una palabra propia** suya (ronda 5: de 5 letras o más, que no sea
  común en nombres de lugares, palabra de evento, del trabajo o de la plataforma, de un rol, de tiempo ni de pregunta:
  «la cancha», «el puente», «las viviendas», «la escuela», también en singular o plural y, ronda 6, hecha más chiquita o
  más grande: «la canchita», «el puentecito», «la escuelita»; ronda 7, por su raíz y una terminación corta: «el
  puentesito», «la canchitica», «el canchón», y el otro género, «el techado» por «techada», «las productoras» por
  «productores»; después de una consonante solo «-a» («saludo» no es «salud»), un gerundio no («viviendo») y una
  palabra común nunca («santa» de «semana santa»); ronda 8, con la raíz escrita como suena al achicarla: «la finquita»,
  «la bodeguita», «el banquito», «la fabriquita», «el estadito» (y esa raíz solo con «-ito», «-ón», «-ote»…: «el estado»
  no es «estadio»); una de 4 letras solo como sujeto de algo que pasa, «el café es en semana santa», también achicada,
  «el cafecito es…», y no una del trabajo: «la toma es vertical»), o «lo de…» algo que no es de la plataforma ni de un rol
  («lo de la cancha», «lo del puente», «lo de la sesión», lo vea o no); el lugar de un evento que ve, entero,
  por un nombre suyo («La Quebrada») o por su tira de mayúsculas («Alto Verde» de «Casa comunal Alto Verde»); una marca
  (`[[E1]]`, `[[L1]]`, `[titulo]`); el jefe (por su rol, su nombre o su cargo, sacados de la configuración del cliente)
  o alguien que graba («Kevin graba…», «me toca grabar…»); una pregunta de cuándo, dónde, cómo llegar, a quién llamar,
  cuánto falta («¿cuántos días faltan para…?», «cuanto falta pa…») o si sigue en pie («¿se suspendió…?») (no de cuándo
  publicar, ni un paso: «¿dónde subo el material?», «¿dónde dejo un comentario?», ni de una cosa de la plataforma:
  «¿dónde está la biblioteca?», «¿cuándo vence el plazo?», «¿cuándo llega el correo de invitación?»). Lo de la
  plataforma, ronda 6: con un verbo de dónde está algo («está», «queda», «se ve», «aparece») o el de una regla antes de
  lo suyo («vence el plazo», «llega el correo», «es el plazo»), nunca con uno de algo que pasa en medio («¿a qué hora es
  la sesión?», «¿a qué hora voy a la sesión?», «¿a qué hora sale Kevin con copies?» son de la agenda); una sesión, una
  campaña, un registro o un panel solo con lo que los hace pantalla («el registro de cambios», «la campana de avisos»,
  «mi sesión»); y cada frase se juzga sola («¿Dónde está la biblioteca? ¿Y a qué hora llega la comitiva?» es de un
  evento). Ronda 7: de cada frase se quita lo de la plataforma y se mira si lo que queda pregunta cuándo, dónde o el
  camino, así una pregunta de la agenda junto a una de la plataforma es de un evento («¿Dónde está la biblioteca, a qué
  hora llega la comitiva?», con «o», con «pero» o dictada sin comas). Ronda 8: lo que sigue después de «y», «o», «pero» o
  una coma sin palabra de pregunta propia toma la de antes, si algo pasa en ello o empieza con su propio sujeto: «¿a qué
  hora cierra la tanda y llega la comitiva?» se lee «a qué hora llega la comitiva», «¿dónde están la biblioteca y la
  comitiva?» como «dónde la comitiva» (las dos de un evento), y «¿dónde está la biblioteca y el botón de aprobar?» como
  «dónde el botón» (de la plataforma); no lo que es otra pregunta («… y qué pasa si no llego?») ni «…, que no la veo»; «es» o «son» solo antes de
  un plazo («¿a qué hora es la invitación del alcalde?», «¿cuándo es la semana de la juventud?» son de la agenda); «mi
  sesión de fotos» es de la agenda (la sesión de entrar nunca es «de» algo); «¿dónde está Kevin con copies?» pregunta
  por Kevin. O forma de agenda sin nombrar nada: una fecha,
  hora o dirección escrita (lo que dejó `redact()`), una dirección o un lugar por referencia, un sitio por su nombre
  después de «a» si no es alguien del equipo («¿qué llevo a Táriba?»; «a Kevin» no: los nombres del equipo se leen
  con los títulos, solo el nombre y no el apellido, porque muchos apellidos son lugares: «a Rubio» es un sitio), o un día u hora que no es de su propio trabajo junto a algo que pasa o se mueve («es», «arranca»,
  «sale», «salimos», «queda», «será»…), a grabar o a un lugar por su nombre («salimos pasado mañana temprano desde
  Pueblo Nuevo»). Así lo que el vocabulario de tiempo no conoce («la cancha es en semana santa», «el puente arranca
  ahorita») igual es de un evento, sin agregar palabras de tiempo. En una **pregunta**, además, basta un
  día o una hora que no sea de su propio trabajo ni de publicar («¿qué llevo el sábado?», «¿qué tengo hoy?»). Un aviso y
  una ficha se juzgan sin eso: sus días son del equipo mientras no nombren un evento. Se inclina al sí: lo que solo
  parece de un evento cuesta una respuesta sin IA, nunca una fuga.
- **También la que sigue:** una pregunta que sigue un hilo sobre un evento también la contesta 360: empieza con «y»,
  «pero», «bueno»…, apunta atrás («eso», «allá», «ese video») o son pocas palabras («¿cómo va la feria?» → «¿y a quién
  le escribo?» → «¿y llevo el dron?»). Una que se sostiene sola («¿cómo hago un copy?») vuelve al modelo, y en el hilo
  que ve el proveedor no van las preguntas del evento ni las que lo siguieron, ni sus respuestas.
- **Las mismas palabras de tiempo para todo** (`redact.ts`, una sola lista): además de horas, fechas y días, «el finde»,
  «en la mañanita», «por la tardecita», «después del almuerzo», un mes solo («en noviembre»), «el mes que viene», «a fin
  de mes», «en un par de días» y un día del mes en letras («el veinticuatro»). Las usan el detector, el filtro de lo que
  se le enseña, los avisos y la limpieza del prompt. Un teléfono dicho cifra por cifra («cero cuatro uno cuatro…») es un
  contacto, y un sitio dicho con su nombre después de cualquier palabra («en el hotel Tamá», «del galpón de Los Pinos»)
  es un lugar.
- **Cómo se hace, no cómo va:** en el cerebro de demostración, una pregunta sobre eventos en general («¿qué tomas hago en
  un acto?», «¿cómo veo los eventos pasados?», «¿qué pasa si dos eventos chocan?») o «¿cómo + verbo…?» (menos «¿cómo va
  / quedó / salió…?») la contestan las fichas; la búsqueda de un evento es para uno («¿cómo va lo de la cancha?»). En
  un turno sobre un evento, el título que nombra es el nombre del evento, no el tema («¿cómo hago un copy para la
  jornada de salud?» es del copy). Si no pregunta cómo se hace ni nombra el trabajo (pieza, video, copy…), una ficha
  solo contesta si responde bien (el doble de lo normal); si no, la negativa de la agenda, nunca una ficha suelta
  («¿hay barro en Nuevo Amanecer?», «el gobernador viene a la cancha, ¿qué llevo?»).
- Solo los turnos que **no** hablan de un evento usan el modelo (cómo se hace algo, lo suyo, publicar, tweets, reglas de
  video, charla), y conservan todas las capas de abajo. Si el modelo igual trae un evento (busca uno o lo nombra en su
  respuesta), la red de salida lo trata como respuesta sobre un evento.

## Lo que nunca sale (marcas, limpieza y revisiones)
Hoy no hay IA (sin `ASISTENTE_MODELOS` hasta el OK legal), pero esto ya funciona para el día que se encienda. Con la
regla de arriba, estas capas quedan de segunda línea.
- **Títulos como marcas** (`titles.ts`). En cada turno con modelo se leen una vez, **como la persona** (RLS), los títulos
  de los eventos y piezas que ella ve y el lugar de cada evento. Antes de ir al proveedor, cada uno se cambia por una marca
  fija para ese turno: `[[E1]]` (evento), `[[P1]]` (pieza), `[[L1]]` (lugar). Pasa en lo que devuelve cada herramienta, en
  las respuestas anteriores del hilo y en los guiones y fichas del prompt. Categoría, municipio y estado van como siempre.
  El prompt le dice al modelo que copie las marcas tal cual. Al contestar, las marcas vuelven a ser el título real (entre
  «»), que la persona puede ver; si preguntó cuándo o dónde es un evento, el título vuelve sin su hora, fecha ni lugar.
  Una marca que el modelo cambia (`[E1]`, `[[ e1 ]]`) se arregla; una inventada se vuelve «ese evento»; un lugar siempre
  vuelve como «ese lugar». Nunca se muestra una marca cruda (tampoco una cortada al final, «… [[E1», ni escrita con corchetes o cifras anchas,
  «［［E1］］», con un corchete de más, «[[[E1]]]», o sin abrir, «E1]]»). Si el modelo busca
  por una marca, la herramienta corre con el título real; una marca que no existe le llega a la herramienta como «ese
  evento», «esa pieza» o «ese lugar» (así un aviso al equipo nunca lleva `[[E7]]`). Lo que **escribe la persona** (la pregunta y sus preguntas anteriores del hilo) también va con marcas: si
  teclea un título o el lugar de un evento que ve, al proveedor le llega `[[E1]]` o `[[L1]]` (lo guardado queda sin marcas).
  Con cadena de modelos, los títulos se leen antes de guardar la pregunta. Si no se pueden leer, ese turno no va al
  modelo: contesta el cerebro de demostración.
- **Limpieza de texto** (`redact.ts`, segunda capa). Lo que escribe la persona pasa por `redact()` (correos, teléfonos —
  también los locales de 7 cifras—, horas —también «9,30», «9 y 30», «9 con 30», «9 en punto», «12 m», «de 7 a 9»—, fechas
  —también «1ro de noviembre», «tres de noviembre», «el día 3», «3 del 11», «20261103», fechas ISO con hora— y direcciones)
  antes de guardarse y de ir al proveedor; también «1ro nov», «el día primero», «9 menos cuarto» y «8 y pico». Un lugar por
  referencia con su nombre o su adjetivo («frente a la alcaldía de Táriba», «la cancha techada de El Mirador», «la plaza
  central», «qta.», «C.C.», «parroquia…») se tapa en **cualquier** pregunta. **Si la pregunta es sobre un evento** (el
  detector de arriba: una palabra de evento, una marca, un título o lugar que la persona ve —«lo de Tariba»—, quién
  graba, una pregunta de cuándo o dónde…), sea de «cómo se hace» o no, se tapan además los lugares dichos por su nombre («en Pueblo Nuevo», «en la Hacienda El
  Trapiche») y los días y partes del día («mañana», «el sábado», «en dos días», «tempranito», «de noche»), menos el día de
  su propio trabajo («mañana subo el material», «¿lo publico el sábado?») y los días de una pregunta de publicar. En
  cualquier otra pregunta los días son palabras normales y quedan en lo guardado («¿qué tengo hoy?»): esa pregunta la
  contesta 360 y no entra en el hilo de un turno con modelo. Lo que escribió la
  plataforma (resultados de herramientas, respuestas anteriores, guiones del equipo) pasa por todas las reglas y, de
  segundo candado, por el filtro de los avisos al teléfono (`stripDateTime`). «Hoy» la pantalla no cuenta como día, y
  4/5, 9/16, 16/9 o 1/1 junto a formato o portada son proporciones, no fechas.
- **Guiones y fichas** (`guard.ts` `teachingProblem`). Las fichas y los guiones del equipo son para **cómo trabaja el
  equipo, nunca para un evento**. Al guardarlos se rechaza: una fecha, un teléfono, un correo o una dirección (también un
  lugar por referencia con su nombre); un evento en particular (un título que administración ve, entero, por un nombre
  suyo, su tira de mayúsculas, dos palabras suyas seguidas o una palabra propia suya, «la cancha», «la canchita»; el lugar de un
  evento, también por su tira de mayúsculas, «Alto Verde»; una marca; «lo de la cancha»; o un evento que pasa o que
  hay: «la caravana sale…», «el acto de entrega arranca…», «la cancha es…», «en noviembre hay feria», sea lo que sea lo
  que sigue): «Quita el evento…»; la forma de la agenda en una
  frase de lo que dice 360 (un día u hora con algo que pasa, a grabar o un lugar por su nombre: «nos vamos de madrugada
  desde la gobernación»), salvo que sea de publicar; junto a un evento (las menciones del detector), cualquier hora o
  día; y **un día con una hora en cualquier parte** («Lo del sábado» + «arranca a las 8»), salvo que sea de publicar
  (tweets, mejores horas, una red). Una ficha se juzga entera (título y cuerpo); un guion,
  frase por frase en lo que dice 360 y entero para el día con hora. En lo que pregunta la persona de un ejemplo solo
  cuentan una fecha u hora escrita y un evento en particular. Hablar de eventos en general sí («cómo se crea un evento»):
  el material de fábrica pasa tal cual. «Así se contesta» guarda la respuesta y la pregunta con los títulos, y los
  nombres de un título, como `[titulo]` («lo de Tariba» → «lo de [titulo]»), y limpia; si igual nombra un evento, no se
  guarda. En el prompt, por si algo pasó antes (con las mismas palabras de tiempo y con los lugares de los eventos como
  marcas, «Alto Verde» → `[[L1]]`), los guiones del equipo y de conversaciones se limpian otra vez del todo; una ficha
  del equipo que trae un día se limpia del todo, título y cuerpo; lo del equipo que habla de un evento (el detector)
  pierde además un sitio dicho por su nombre («en el hotel Tamá»); una ficha sin evento ni día pierde fechas,
  direcciones y contactos pero guarda sus horas. Las de fábrica y las automáticas quedan igual.
- **Avisos preparados** (`guard.ts` `noticeIssues`). Una sola revisión para los dos cerebros, dentro de
  `preparar_aviso` y otra vez cuando administración confirma, con los títulos que ve quien lo prepara. Un aviso va a
  todo un rol y no es donde va la agenda:
  - **Nunca** lleva contactos ni direcciones.
  - **Si no nombra un evento** (el detector), sus días y plazos son del equipo y quedan como se dijeron: «suban el
    material antes de las 3 pm», «tienen hasta las 5 pm…», «manden las fotos esta tarde». Se guarda y se manda con su
    hora real (sin «[hora]»); solo se quitan contactos y direcciones. Solo no pasa un día con una hora que no sea un
    plazo («el sábado a las 6, lleven baterías» es la agenda de alguien), ni una hora a la que pasa algo («a las 6
    lleven el dron»; «suban el material a las 3» es un plazo), ni un sitio después de «a» que no sea alguien del equipo
    («mañana lleven el dron a Táriba»; «manden las fotos a Kevin» sí va).
  - **Si nombra un evento**, solo va como **pedido al equipo** («suban…», «revisen…», «editen…», «tengan…», «hay / tienen
    que» + verbo) y no dice nada del evento. Se mira **cada palabra del aviso**, en todas sus frases, antes y después
    del evento, dejando fuera **un plazo para el trabajo** («suban el material de la feria antes de las 3 pm», «tienen
    hasta el mediodía», «hoy suben…»): solo pueden ir los verbos del equipo, el trabajo y sus equipos (fotos, video,
    copies, cámaras, baterías…), las palabras de evento y las de **los títulos que el aviso nombra** (no las de todos
    los que ve quien lo prepara), el jefe, los roles, las palabras pequeñas y unas pocas de prisa o de cortesía; un
    número en letras solo antes de lo que cuenta («las cuatro piezas»; «…, ocho.» es una hora). Cualquier otra palabra
    dice algo del evento y el aviso no va: «este finde hay feria», «Tamá: la feria», «noviembre trae feria», «la feria
    es…», «la cancha es en semana santa…», «la canchita es en semana santa…», «el puentecito arranca al rato», «… a
    Alto Verde», y ronda 7, «el puentesito es…», «el canchón arranca…», «el techado es…» (ronda 8, «la finquita es…»,
    «el banquito arranca…»). «Al rato», «ya mismo»,
    «dentro de poco» o «ahorita» junto al evento dicen cuándo es («tengan todo listo para la cancha al rato» no va); para
    lo que se entrega son un plazo («suban las fotos del puente al rato» sí). Cada frase que nombra el evento le pide algo al equipo
    («Suban las fotos de la feria. Escuela.» no va). Tampoco va el lugar de un evento por su nombre fuera de un título
    dicho entero, ni un día, hora o contacto que quede. Prepararse para el evento («tengan las cámaras listas antes de las 7») es su hora, no un plazo. Lo que no
    pasa sale como «datos del evento».
  - Si al confirmar no pasa, no sale, queda pendiente y el panel dice qué trae («No se mandó: el aviso trae el día y
    datos del evento…»). El diálogo de confirmar le recuerda a administración: «Revisa que no diga el día, la hora ni el
    lugar de un evento.»
- **Red de salida** (`brain.ts` `breaksAgendaRule`). Una respuesta sobre un evento (la pregunta según el detector, una
  búsqueda de evento o, si la escribió el modelo, una respuesta que nombra un evento) que trae fecha, hora, día («hoy»,
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
  Herramientas iniciales: `mis_pendientes` (cuenta, todos), `eventos_por_decidir` (cuenta, jefe, administración y
  despacho: los eventos que esperan la decisión del jefe, sin fecha, hora ni lugar; su botón es Política para el jefe),
  `estado_pieza(titulo)` (cuenta, equipo de contenido: administración, redes y el jefe),
  `dias_de_tweets` (cuenta, equipo de contenido), `mejores_horas(red)` y `reglas_de_video(red)` (cuenta, todos),
  `buscar_evento(texto)` (cuenta, quien vea eventos con su ficha técnica: administración, jefe, despacho, redes y
  grabación; **nunca** lee `event_schedule`), `preparar_aviso(rol, texto)` (prepara, administración y el jefe; a uno de
  los seis roles, a administración o a «todos»: borrador que confirma administración), `marcar_avisos_leidos` (hace, todos; deshacer =
  volver a no leídos), `avisar_al_equipo(motivo)` (siempre; el servidor pone la conversación).
- `screens.ts` — destinos del botón «Ir a…»: `{ href, label, roles, phrases, nav, about }`, con los roles **copiados
  del control de acceso de cada página** (una prueba compara con `requireRole` del código). Exige una frase, no una
  palabra suelta; solo en una pregunta de «¿dónde está…?», «¿dónde apruebo?», «¿cómo edito…?», «llévame a…» basta una
  palabra suya (`nav`: «biblioteca», «buzón», «registro», «semáforo»…). Gana una que esa persona puede abrir, luego una
  que no sea general (Avisos, Hoy, Buscar, Mi perfil), luego la primera que se nombra. Si se usó una
  herramienta, manda su destino; una respuesta que nombra varias pantallas (la lista de Ajustes) no pone botón. Nunca
  un botón a una pantalla que esa persona no puede abrir: mejor `null`.
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
  «un problema con la pieza», «un error en un tweet publicado», «me salió un error que dice que el copy es muy largo»)
  no es soporte: lo contestan las fichas. «¿Cómo subo un video?» desde un rol que no sube: lo suben Grabación o Redes, en la pestaña Material del evento.
  Ronda 5, para que sirva en las preguntas de todos los días (una tabla de más de 15 por rol, también dictadas sin
  tildes, en `tests/unit/assistant-ordinary.test.ts`): después de la negativa de la agenda, «¿dónde está X?» va a la
  pantalla con su «Ir a» (primero una que esa persona puede abrir: «¿dónde veo lo que se publicó?» es Digital para el
  jefe; una general, como Avisos, cede ante otra que también nombra: «… los avisos que dejó preparados el asistente» es
  Asistente; si ninguna es suya, dice que no es de su rol); «¿cuántos / qué eventos tengo por calificar?», «¿qué eventos
  esperan mi decisión?» van a `eventos_por_decidir`; «¿cuántas piezas tengo por aprobar?» a sus pendientes; «¿qué
  puedo hacer yo?» a la ficha de su rol; «¿puedo…?» primero a la frase de la ficha de su rol que lo dice («No ve
  piezas…»); «¿cuándo grabo la cancha?» (un paso suyo en un evento) es la agenda; «¿cómo cambio la fecha de un
  evento?», «¿cómo duplico / cancelo un evento?» van a las fichas de cómo se hace. Ronda 6: el camino al lugar de un
  evento que ve («¿cómo llego a Alto Verde?», también si una palabra del lugar es de una ficha: «verde») y «¿qué tan
  lejos / a cuánto queda…?» son la agenda; «¿qué tengo que revisar / poner / llenar…?» es un cómo se hace («¿qué tengo
  que hacer (hoy)?» sigue siendo su lista); los días de tweets solo para «¿cuántos días / tweets quedan, faltan,
  esperan?» («¿quién aprueba los tweets?» va a las fichas); el estado de una pieza solo si pregunta cómo va, trae el
  título entre comillas o dice «la pieza de…»; «¿cómo cambio el lugar / la dirección de un evento?» (o «del evento»
  sin nombrar uno) es un cómo se hace; «mi número», «mi teléfono» no son un dónde («Mi perfil»); las reglas de video
  también para «¿cuánto puede pesar…?» y «¿cuántos caracteres… en X?». Las fichas se eligen
  (`brain.ts` `scoreFichas`) por cada palabra de la pregunta en el mejor sitio de la ficha (título 3, etiquetas 2,
  cuerpo 1) por lo rara que es; las palabras de eventos en general, de la plataforma o de un problema («error») valen
  un tercio y el contenido («el copy», «el video») uno y medio; los verbos que cambian de raíz se leen como uno
  («apruebo» / «aprobar», «pido» / «pedir», «propuesta» / «proponer»), igual que un gerundio («subiendo» / «subir») y
  dos formas de decir lo mismo («aplicación» / «app», «celular» / «teléfono»); una palabra cuenta si empieza igual y
  comparte las tres cuartas partes de la más corta («cuanto» no es «cuando», «instalo» no es «instagram», «internet» no
  es «intercambio»), y una de 4 letras no se confunde con otra más larga («logo» no es «logros»); las palabras de
  pregunta o de relleno no cuentan («cuánto», «puede», «tener», «significa», «poner»), ni «llevar» (ronda 7: ninguna
  ficha dice qué llevar a un evento; «¿qué llevo a la cancha?» es la agenda y «¿qué tengo que llevar a un acto?», «No
  estoy seguro…»); junto a un evento, una sola palabra de la pregunta que está en el texto de una ficha pero no en su
  título ni sus etiquetas no basta para contestar con ella; las fichas automáticas de datos
  (fórmulas, categorías, reglas por red, mejores horas) valen un tercio si la pregunta no nombra lo suyo; en «¿cómo hago
  / armo un…?», a empate gana la ficha que dice «crear»; luego por cuánto de la pregunta tiene la ficha: una palabra que
  ninguna ficha tiene cuenta en contra (la mitad si es el verbo del cómo). De la ficha sale la frase con más palabras de
  la pregunta; a empate, la de la palabra más rara («¿una pieza puede tener varias versiones?» → la de las versiones), y
  en un «¿dónde…?», la que dice dónde («En la pieza, pestaña Copies…»). Por debajo de 2 puntos o de un tercio de la
  pregunta, 360 dice «No estoy seguro de eso y no quiero darte un dato malo. ¿Quieres que le avise a administración
  para que te ayuden?» (con un «sí», avisa de verdad). Un guion de fábrica solo contesta si la pregunta dijo uno de
  sus disparadores entero, y nunca con la negativa de la agenda para lo que no es la agenda.
- `events.ts` — el detector compartido («¿habla de un evento?») y las lecturas de la pregunta (cuándo, dónde, cómo
  llegar, publicar). `titles.ts` — las marcas de los títulos (`Placeholders`) y su lectura como la persona. `guard.ts` —
  las revisiones de avisos, guiones y fichas.
- **Rápido con muchos títulos** (ronda 7): una persona puede ver hasta 3000 eventos y sus lugares, y cada revisión los
  usa. Cada título se lee una vez (y la lista entera, mientras no cambie, aunque cada turno la cargue de nuevo); las
  revisiones buscan en un índice (palabra, raíz, nombre, par de palabras → títulos), nunca título por título; las
  marcas se buscan por la primera palabra de cada nombre, sin un patrón con todos (con miles tardaba segundos). Con
  3000 títulos, 3000 lugares y una pregunta de 1.500 caracteres, cada revisión tarda menos de 50 ms
  (`tests/unit/text-speed.test.ts`), y ningún patrón se traba con un texto largo en blanco.
- Cada turno tiene un límite de 40 s; después de la primera vuelta, la cadena arranca desde el eslabón que respondió.
- `index.ts` — `handleTurn(session, { question, conversationId })` → `{ answer, scope, model, ms, degraded, did:
  [{ tool, error? }], goTo: { href, label } | null, conversationId }`. Con cadena, decide el cerebro con el detector
  (ver «Lo que habla de un evento lo contesta 360 sin IA»). Antes del cerebro abre el turno (`openTurn`: una
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
- `escalate(conversationId, motivo)` — `notify()` solo a administración, también si el motivo es de aprobación (desde el
  27/10 aprueba el jefe, y al jefe no le llega el ruido del asistente), con enlace a la conversación en el panel; no repite en 6 horas. El motivo lo puede escribir el modelo (con los títulos
  reales de vuelta): pierde cualquier marca que quede (también una abierta, «[[E1»), el lugar de un evento por su nombre
  o su tira de mayúsculas («la pieza de Alto Verde» → «la pieza de ese lugar»), y pasa por todas las reglas, los lugares
  dichos por su nombre (también después de «a» si no es alguien del equipo: «a Táriba» → «a [direccion]») y el filtro
  de los avisos al teléfono. Administración recibe el motivo limpio.
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
