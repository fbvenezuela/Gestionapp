# Guía de la web para el equipo

**06/11/2026.** Una página para saber qué tiene la web del gobernador, quién hace qué, cómo se edita y cómo se atiende
lo que llega. El detalle está en dos manuales: **`MANUAL-ADMIN-WEB.md`** (editar y publicar) y
**`MANUAL-ATENCION.md`** (atender solicitudes). Hoy todo vive en la **versión de prueba**, sin buscadores; abrirla al
público lo decide Juan. La versión de prueba publicada muestra el contenido real de la web oficial (noticias, opinión,
biografía, fotos y el Semanario; D-101); la de las pruebas y la local, contenido inventado y marcado «(demo)».

## Qué tiene la web

| Sección | Dirección | Qué hay |
|---|---|---|
| **Inicio** | `/` | El nombre y el cargo del gobernador con su foto, «Atención ciudadana», «Gestión en cifras» (cada cifra con su fuente), «Casos atendidos», las obras, la última emisión del Reporte Bernal, «Últimas publicaciones», avisos de servicio y canales |
| **El gobernador** | `/gobernador` | Biografía, cargo y «Material para la prensa». Lo que falta no sale en la web: el espacio vacío solo lo ve el equipo en la vista previa |
| **Gestión** | `/gestion` | Obras y acciones por municipio, categoría y estado, y su línea de tiempo; cada obra con su ficha |
| **Noticias** | `/actualidad` | Noticias, comunicados, artículos y entrevistas, con búsqueda y temas; el **Semanario** en `/actualidad/semanario` |
| **Reporte Bernal** | `/reporte-bernal` | Las emisiones; el video carga solo al tocarlo |
| **Atención ciudadana** | `/atencion` | «Hacer un reporte» (`/atencion/nueva`), «Consultar mi solicitud» (`/atencion/consultar`) y «Casos atendidos» (`/atencion/atendido`) |
| **Transparencia** | `/transparencia` | Documentos y cifras de atención, sin datos de nadie |
| **Canales** | `/canales` | Las cuentas oficiales verificadas |
| **Legales** | `/aviso-de-privacidad`, `/condiciones-de-participacion`, `/accesibilidad` | Privacidad, condiciones y accesibilidad |

La gente participa **sin cuenta**: reporte, petición, acotación, sugerencia, reconocimiento o denuncia. Recibe un
código y una clave para seguir su caso. **No es un servicio de emergencias** y lo dice cada formulario.

## Quién hace qué

| Rol | Menú | Hace |
|---|---|---|
| Editor de la web | «Web» | Escribe borradores y sube fotos; envía a aprobación. No publica |
| Aprobador de la web | «Web» | Revisa, publica, programa y archiva; ajustes del sitio y redirecciones |
| Coordinador de atención | «Atención» | Todo lo que llega, denuncias también: asigna, une, prioriza, cifras, exporta y «Casos atendidos» |
| Responsable de área | «Atención» | Lo de su área (nunca denuncias): responde, notas, estados y evidencias |
| Operador de denuncias | «Atención» | Solo las denuncias |
| Consulta y auditoría | «Atención» | Lee sin contactos ni denuncias; cifras y registro |
| Jefe | «Web» y «Atención» | Publica la web; lee la atención y sus cifras |
| Administración | «Web» y «Atención» | Personas, áreas y plazos, ajustes del sitio; nunca lee casos ni publica |

Todos entran con **su propio usuario y doble factor** (código por correo y Google Authenticator; no hay contraseñas).
Las personas se invitan en Ajustes → Equipo.

## Cómo se edita la web (5 pasos)

1. **«Web»** → el tipo de contenido (por ejemplo «Noticias y comunicados») → «Nueva noticia» → título → «Crear
   borrador».
2. Escribe y **«Guardar borrador»**. Las fotos van desde la biblioteca, siempre con su **texto alternativo**.
3. **«Vista previa»** para verlo como saldrá → **«Enviar a aprobación»**.
4. Quien aprueba entra a **«Por aprobar»**, mira **«Qué cambia si lo publicas»** y decide: **«Publicar ahora»**,
   **«Programar»** (hora del Táchira) o **«Devolver con comentario»**.
5. Si algo salió mal: **«Archivar»** lo saca al momento, y **«Versiones»** → «Volver a esta versión» recupera lo de
   antes.

La portada y las páginas se arman por **bloques** («Agregar un bloque», «Subir», «Bajar», «Ocultar»). Detalle:
`MANUAL-ADMIN-WEB.md`.

## Cómo se atiende lo que llega (5 pasos)

1. **«Atención»** → **«Bandeja»** (o «Tablero»). Lo nuevo está en «Por revisar».
2. Abre el caso, léelo y pásalo a **«En revisión»**; asígnalo (**«Guardar asignación»** o «Tomar el caso»).
3. **«Escribir»** → **«Respuesta a la persona»** para decirle que ya lo tienen. Lo que es del equipo va en **«Nota
   interna»**: nunca las mezcles.
4. Trabájalo («En atención»); si falta un dato, **«Pedir más información»**; al terminar, **«Subir evidencia»**.
5. **«Resuelto»** con su justificación. La persona confirma desde su consulta; después, **«Cerrado»**. La coordinación
   publica en **«Casos atendidos»** sin datos de la persona.

Detalle (estados, motivos, denuncias, cifras, CSV y moderación): `MANUAL-ATENCION.md`.

## Lo que nunca se hace

- Publicar sin aprobación, o publicar datos inventados (biografía, teléfonos, cuentas, cifras sin fuente).
- Subir a la biblioteca de la web (que es pública) fotos o archivos de la gente que escribe a Atención.
- Contar en público algo de una denuncia, o el nombre de alguien sin su permiso.
- Prometer fechas, plazos o una atención de emergencia.
- Copiar el contacto de una persona fuera de su caso.

## Para probar

En la versión de prueba, `/entrar` → «Versión de demostración» → «La web y la atención ciudadana»: un usuario por rol,
sin código. Lo que hay que tocar con cada uno y los tres comprobantes de prueba: `DEMO.md`. Las copias de seguridad:
`COPIAS-Y-RECUPERACION.md`. La salida a producción: `PLAN-MIGRACION-Y-PRODUCCION.md`.
