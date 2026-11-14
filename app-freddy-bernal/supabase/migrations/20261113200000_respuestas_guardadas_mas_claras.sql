-- The saved replies in «usted» (20261113100000_respuestas_guardadas_de_usted.sql) left two things (review of 13/11):
--   * A reply the coordination renamed, but whose text is still word for word the «tú» one the app brought
--     (20261106100100_atencion_admin.sql, section 3), kept the «tú» text: that file matched the title too. Here the
--     text alone decides (the nine texts are all different).
--   * Three wordings read unclear to the citizen: «Ya le pasamos su solicitud y le avisaremos…» (two «le» for two
--     different people) and «desde su consulta» (the page is «Consultar mi solicitud»).
-- Nothing here edits the earlier files. Only a reply that still says, word for word, what the app brought (in «tú» or
-- in the «usted» of 20261113100000) changes; one the coordination rewrote stays as they left it. Titles, kinds, order
-- and «En uso» do not change. One statement: all of them or none.

update public.request_reply_templates t
   set body = v.new_body
  from (values
    -- The «tú» texts the app brought, straight to their «usted» wording (whatever the reply is called now).
    ('Recibimos tu solicitud y ya la estamos revisando. Te avisamos por aquí cuando haya novedades.',
     'Recibimos su solicitud y ya la estamos revisando. Le avisaremos por aquí cuando haya novedades.'),
    ('Tu solicitud pasó al área que la atiende. Te escribimos por aquí cuando tengan una respuesta.',
     'Su solicitud pasó al área que la atiende. Le escribiremos por aquí cuando tengan una respuesta.'),
    ('Ya está programada la atención de tu solicitud. Te avisamos por aquí cuando se haga.',
     'Ya está programada la atención de su solicitud. Le avisaremos por aquí cuando se haga.'),
    ('Lo que nos cuentas lo atiende otra institución. Ya le pasamos tu solicitud y te avisamos por aquí cuando responda.',
     'Lo que nos cuenta lo atiende otra institución. Ya le enviamos su solicitud a esa institución y le avisaremos por aquí cuando responda.'),
    ('Tu solicitud quedó resuelta. Si no es así, dínoslo desde tu consulta y la revisamos de nuevo.',
     'Su solicitud quedó resuelta. Si no es así, díganoslo desde «Consultar mi solicitud» y la revisamos de nuevo.'),
    ('Revisamos tu solicitud y no es algo que atienda la gestión del estado. Te recomendamos acudir a la institución que corresponde.',
     'Revisamos su solicitud y no es algo que atienda la gestión del estado. Le recomendamos acudir a la institución que corresponde.'),
    ('Para atender tu solicitud necesitamos saber mejor dónde es. ¿Nos das una referencia del lugar, como una calle o un punto conocido?',
     'Para atender su solicitud necesitamos saber mejor dónde es. ¿Nos da una referencia del lugar, como una calle o un punto conocido?'),
    ('¿Nos puedes enviar una foto del problema desde tu consulta? Nos ayuda a mandar al equipo con lo necesario.',
     '¿Nos puede enviar una foto del problema desde «Consultar mi solicitud»? Nos ayuda a enviar al personal con lo necesario.'),
    ('Para seguir con tu solicitud nos falta un dato. ¿Nos cuentas un poco más desde tu consulta?',
     'Para seguir con su solicitud nos falta un dato. ¿Nos cuenta un poco más desde «Consultar mi solicitud»?'),
    -- The «usted» texts of 20261113100000 that read unclear.
    ('Lo que nos cuenta lo atiende otra institución. Ya le pasamos su solicitud y le avisaremos por aquí cuando responda.',
     'Lo que nos cuenta lo atiende otra institución. Ya le enviamos su solicitud a esa institución y le avisaremos por aquí cuando responda.'),
    ('Su solicitud quedó resuelta. Si no es así, díganoslo desde su consulta y la revisamos de nuevo.',
     'Su solicitud quedó resuelta. Si no es así, díganoslo desde «Consultar mi solicitud» y la revisamos de nuevo.'),
    ('¿Nos puede enviar una foto del problema desde su consulta? Nos ayuda a enviar al personal con lo necesario.',
     '¿Nos puede enviar una foto del problema desde «Consultar mi solicitud»? Nos ayuda a enviar al personal con lo necesario.'),
    ('Para seguir con su solicitud nos falta un dato. ¿Nos cuenta un poco más desde su consulta?',
     'Para seguir con su solicitud nos falta un dato. ¿Nos cuenta un poco más desde «Consultar mi solicitud»?')
  ) as v (old_body, new_body)
 where t.body = v.old_body;
