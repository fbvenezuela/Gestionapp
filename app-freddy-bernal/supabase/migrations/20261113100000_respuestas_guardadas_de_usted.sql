-- The saved replies that come with the app (20261106100100_atencion_admin.sql, section 3) spoke to the citizen as «tú»;
-- what a citizen reads goes in «usted» (the house register of the web and the attention, D-101; APP-21 of the 12/11
-- review). Nothing here edits that earlier file: each reply changes to its «usted» wording only while it still says,
-- word for word, what the app brought (a reply the coordination already changed stays as they left it). Titles, kinds,
-- order and «En uso» do not change. One statement: all of them or none.

update public.request_reply_templates t
   set body = v.new_body
  from (values
    ('Recibida y en revisión',
     'Recibimos tu solicitud y ya la estamos revisando. Te avisamos por aquí cuando haya novedades.',
     'Recibimos su solicitud y ya la estamos revisando. Le avisaremos por aquí cuando haya novedades.'),
    ('Pasó al área que la atiende',
     'Tu solicitud pasó al área que la atiende. Te escribimos por aquí cuando tengan una respuesta.',
     'Su solicitud pasó al área que la atiende. Le escribiremos por aquí cuando tengan una respuesta.'),
    ('Atención programada',
     'Ya está programada la atención de tu solicitud. Te avisamos por aquí cuando se haga.',
     'Ya está programada la atención de su solicitud. Le avisaremos por aquí cuando se haga.'),
    ('La atiende otra institución',
     'Lo que nos cuentas lo atiende otra institución. Ya le pasamos tu solicitud y te avisamos por aquí cuando responda.',
     'Lo que nos cuenta lo atiende otra institución. Ya le pasamos su solicitud y le avisaremos por aquí cuando responda.'),
    ('Quedó resuelta',
     'Tu solicitud quedó resuelta. Si no es así, dínoslo desde tu consulta y la revisamos de nuevo.',
     'Su solicitud quedó resuelta. Si no es así, díganoslo desde su consulta y la revisamos de nuevo.'),
    ('No la atiende la gestión del estado',
     'Revisamos tu solicitud y no es algo que atienda la gestión del estado. Te recomendamos acudir a la institución que corresponde.',
     'Revisamos su solicitud y no es algo que atienda la gestión del estado. Le recomendamos acudir a la institución que corresponde.'),
    ('Falta saber dónde es',
     'Para atender tu solicitud necesitamos saber mejor dónde es. ¿Nos das una referencia del lugar, como una calle o un punto conocido?',
     'Para atender su solicitud necesitamos saber mejor dónde es. ¿Nos da una referencia del lugar, como una calle o un punto conocido?'),
    ('Falta una foto',
     '¿Nos puedes enviar una foto del problema desde tu consulta? Nos ayuda a mandar al equipo con lo necesario.',
     '¿Nos puede enviar una foto del problema desde su consulta? Nos ayuda a enviar al personal con lo necesario.'),
    ('Falta un dato',
     'Para seguir con tu solicitud nos falta un dato. ¿Nos cuentas un poco más desde tu consulta?',
     'Para seguir con su solicitud nos falta un dato. ¿Nos cuenta un poco más desde su consulta?')
  ) as v (title, old_body, new_body)
 where t.title = v.title and t.body = v.old_body;
