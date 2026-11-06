# Copias de seguridad y recuperación

**06/11/2026.** Para Juan (y quien él designe). Qué se copia, cómo, cada cuánto, cómo se restaura y cómo se prueba
que una copia sirve. Lo que depende del plan de Supabase está dicho como tal, y lo que no se pudo probar desde aquí
también.

## 0. En corto

- **Hoy no hay datos reales que perder:** la demostración vive en memoria y vuelve sola a los datos inventados, y
  `fb-dev` (Supabase gratis) todavía no tiene la web. **Antes de abrir la web con datos reales** tiene que estar lo de
  este documento: el plan con copias diarias, la copia propia semanal y una restauración de prueba hecha.
- **Una copia de la base no trae los archivos.** Las fotos y PDF de la web, los archivos que manda la gente y el
  material del panel viven en Supabase Storage y se copian aparte (§4). Así lo dice Supabase: sus copias son solo de
  la base.
- **Las claves no están en ninguna copia** (§2). Sin `PARTICIPATION_DATA_KEY` los contactos de la gente no se pueden
  leer; sin `PARTICIPATION_PEPPER` los comprobantes no abren. Se guardan aparte, desde el primer día.
- **Nada de esto se probó contra un Supabase real** (no hay cuentas en el entorno donde se escribió): **no se pudo
  comprobar** (§8).

## 1. Qué hay que copiar

| Qué | Dónde vive | ¿Lo copia Supabase solo? | Cómo se copia |
|---|---|---|---|
| **La base**: personas y roles, contenido de la web y sus versiones, ajustes del sitio (`web_settings`, `app_settings`), solicitudes con su historia, contactos (cifrados), registro de cambios | Supabase (Postgres) | Solo en planes de pago (§3) | Copia del plan + copia propia (§3) |
| **Biblioteca de la web** (`web-public`) | Supabase Storage (público) | **No** | §4 |
| **Archivos de las solicitudes** (`participacion-privado`) | Supabase Storage (privado) | **No** | §4, siempre cifrada |
| **Material del panel** (`material`, `covers`, `public-media`, `wardrobe`, `citizen-private`) | Supabase Storage | **No** | §4 |
| Material en el Google Drive del cliente (si se usa `STORAGE_PROVIDER=drive`) | Drive del cliente | Lo cuida Google | La papelera y las versiones de Drive |
| **Las claves y variables** | Vercel (Environment Variables) | **No** | §2, a mano |
| **La configuración del proyecto de Supabase**: correo propio (SMTP) y plantillas, largo del código, registro cerrado, dirección del sitio, doble factor, esquemas expuestos de la Data API, `pg_cron`/`pg_net` y los secretos de Vault (`app_url`, `cron_secret`) | El panel de Supabase | **No** | Está escrita en el README («Conectar las cuentas»): esa es la lista para volver a armarla |
| El código y la configuración del cliente (`config/clients/fb.json`) | GitHub | — | Ya está en git |

## 2. Las claves (siempre fuera del repositorio)

Van en el **gestor de contraseñas del cliente** y en una segunda copia sellada fuera de línea (por ejemplo, en una
memoria USB guardada bajo llave). Nunca en el repositorio, en un chat ni en un correo, **y nunca junto a las copias de
la base** (quien tenga las dos cosas lee los contactos). Cada vez que una cambia, se actualiza la copia ese mismo día.

| Clave | Si se pierde | ¿Se puede rehacer? |
|---|---|---|
| **`PARTICIPATION_DATA_KEY`** (y las de `PARTICIPATION_DATA_KEYS_PREVIOUS`) | Los contactos ya guardados **no se pueden leer** nunca más: «Ver contacto» muestra «—» y no salen los correos de estado a esas personas. Los casos, sus textos, archivos e historia siguen intactos | **No.** Ni Supabase ni nadie la recupera |
| **`PARTICIPATION_PEPPER`** | Los comprobantes de la gente **dejan de abrir** «Consultar mi solicitud», y los límites por dispositivo y por red empiezan de cero | **No**, y no se cambia nunca |
| La contraseña de la base, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `VAPID_PRIVATE_KEY`, `DRIVE_TOKEN_KEY`, `GOOGLE_CLIENT_SECRET` | Se cortan cosas (la conexión, la tarea programada, los correos, los avisos al teléfono, el permiso de Drive) | Sí: se hace una nueva en su servicio, se pone en Vercel y se vuelve a desplegar. Con `VAPID` nuevas, cada teléfono vuelve a activar los avisos; con `DRIVE_TOKEN_KEY` nueva, Administración vuelve a conectar Drive |

**Si se perdió la clave de datos:**
1. No toques la pimienta.
2. Pon una clave nueva con otro nombre (`k2:` seguido de `openssl rand -base64 32`) en `PARTICIPATION_DATA_KEY` y
   vuelve a desplegar: los contactos nuevos se guardan con ella. Los viejos quedan sin leer: no hay vuelta atrás.
3. Los casos siguen. Quien dejó contacto lo sigue igual con su código en «Consultar mi solicitud», que no depende de
   esa clave; el equipo le responde ahí.
4. Anota qué pasó y desde cuándo, y consúltalo con la parte legal (puede haber que avisar a alguien).

**Si la clave se filtró (no se perdió):** clave nueva `k2:…` en `PARTICIPATION_DATA_KEY` y la vieja en
`PARTICIPATION_DATA_KEYS_PREVIOUS` (`k1:…`), así se siguen leyendo los contactos viejos y los nuevos van con la
nueva. Volver a cifrar los viejos con la clave nueva **no está hecho todavía** (`docs/PENDIENTES.md`).

## 3. La base de datos

### Lo que da el plan de Supabase
Según la documentación de Supabase leída el 26/10/2026 (verificar lo vigente antes de decidir, y `docs/COSTOS.md`):
- **Plan gratis: no hay copias automáticas.** Supabase recomienda sacar copias propias con frecuencia. Además, el
  proyecto gratis se pausa tras una semana sin uso. Con el plan gratis, la copia propia es **la única** que hay.
- **Pro:** una copia diaria; se puede volver a cualquiera de los **últimos 7 días** (Team: 14). Está en Database →
  Backups. Al restaurar, el proyecto queda fuera de servicio mientras dura (más tiempo cuanto más grande la base).
- **Point in Time Recovery** (un agregado de pago, desde unos 100 dólares al mes por 7 días): volver a cualquier
  momento, hasta el segundo. Pide una computadora de Supabase de tamaño «Small» o más, y reemplaza las copias diarias.
- **Si se borra el proyecto, Supabase borra también sus copias.** Nunca se borra el proyecto de producción.

### La copia propia (fuera de Supabase), cada semana
Hace falta la conexión **Session pooler** (puerto 5432; botón verde **Connect** del proyecto), no la «Transaction
pooler» que usa la app, y la contraseña de la base. Esa conexión va en una variable de la terminal, nunca escrita en
un archivo del repositorio:

```bash
export URL_SESION='postgresql://postgres.<ref>:<contraseña>@<host-del-pooler>:5432/postgres'
```

**A. Con la CLI de Supabase (lo que recomienda Supabase; pide Docker):** tres archivos.
```bash
supabase db dump --db-url "$URL_SESION" -f roles.sql --role-only
supabase db dump --db-url "$URL_SESION" -f schema.sql
supabase db dump --db-url "$URL_SESION" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

**B. Con `pg_dump` (un solo archivo):** las herramientas de Postgres tienen que ser **de la versión del servidor o más
nuevas** (`fb-dev` es Postgres 17: en una Mac, `brew install postgresql@17`).
```bash
pg_dump "$URL_SESION" --format=custom --no-owner --no-privileges --file "fb-$(date +%F).dump"
pg_restore --list "fb-$(date +%F).dump" > /dev/null && echo "La copia se lee completa"
```

Las copias llevan datos de personas (los textos de las solicitudes, y los contactos cifrados): se guardan **cifradas**
(un disco con el cifrado del sistema, o un archivo comprimido con contraseña) y nunca en un Drive compartido. Se
guardan las últimas 4 semanales y una por mes de los últimos 3 meses, salvo que la consulta legal diga otro plazo.
Ojo: si una persona pide borrar su contacto, sigue en las copias viejas hasta que esas copias se borren.

## 4. Los archivos (Supabase Storage)

Con la CLI de Supabase, en una carpeta vacía:
```bash
supabase login
supabase link --project-ref <ref>
supabase storage cp -r ss:///participacion-privado ./participacion-privado --experimental
supabase storage cp -r ss:///web-public ./web-public --experimental
supabase storage cp -r ss:///material ./material --experimental    # y covers, public-media, wardrobe, citizen-private
```
- **`participacion-privado`** son fotos y documentos de la gente, sin cifrar: la copia va cifrada, igual que la de la
  base, y nunca a una carpeta pública.
- **`web-public`** es lo que ya está a la vista en la web, pero sin la copia no se puede rearmar la biblioteca.
- El material del panel (videos) puede pesar mucho: copia lo que no esté también en el Drive del cliente.
- La base guarda qué archivo es de qué caso o contenido, no el archivo en sí: si se restaura la base sin los archivos,
  la web y los casos muestran los enlaces pero el archivo no abre.

## 5. Cada cuánto

| Qué | Cada cuánto | Quién |
|---|---|---|
| Copia automática de la base | Diaria (solo con plan de pago) | Supabase |
| Copia propia de la base (§3) | Cada semana, y **antes** de cada paso grande: aplicar migraciones, importar la web vieja (`--apply`), cambiar el DNS | Juan |
| Archivos de las solicitudes (`participacion-privado`) | Cada semana, con la de la base | Juan |
| Biblioteca de la web y material del panel | Cada mes, y antes de la importación | Juan |
| Claves (§2) | Cada vez que cambia una | Juan |
| **Restauración de prueba** (§7) | Una vez antes de abrir la web, y después cada tres meses | Juan con Claude |

## 6. Cómo se restaura

Primero, **mira si hace falta restaurar**: en la app casi nada se borra. Un contenido se desarchiva, una versión vieja
se recupera con «Volver a esta versión», una redirección se corrige, y cada caso guarda toda su historia. Restaurar la
base devuelve **todo** a la hora de la copia y pierde lo que pasó después (solicitudes nuevas incluidas).

| Qué pasó | Qué se hace |
|---|---|
| Una versión nueva de la app falla | Vercel → Deployments → la versión buena → **Instant Rollback**. No toca la base |
| Una migración o una importación dañó datos | Plan de pago: Database → Backups → la copia de antes (o el punto exacto con Point in Time Recovery). Plan gratis: la copia propia sacada antes del paso, en un proyecto nuevo (abajo) |
| Se perdió un archivo | Se vuelve a subir desde la copia: `supabase storage cp ./participacion-privado/<archivo> ss:///participacion-privado/<archivo> --experimental` |
| Se perdió el proyecto entero | Proyecto nuevo y las copias propias, en este orden: |

**Rearmar en un proyecto nuevo** (lo que dice Supabase para la copia de la CLI):
1. Crear el proyecto (misma región que Vercel) y activar las extensiones que usaba (`pg_cron`, `pg_net`).
2. Restaurar los tres archivos con `psql` (las herramientas de Postgres de la versión del servidor):
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql --dbname "$URL_SESION_NUEVA"
   ```
   Con una copia de `pg_dump` (§3 B): `pg_restore --dbname "$URL_SESION_NUEVA" --no-owner --no-privileges
   fb-AAAA-MM-DD.dump`. En un proyecto nuevo, Supabase avisa que algunos errores de «ya existe» son normales.
3. Volver a subir los archivos de cada balde (§4, al revés: de la carpeta a `ss:///<balde>`) y mirar que
   `participacion-privado` siga **privado**.
4. Rehacer la configuración del proyecto con el README («Conectar las cuentas»: correo propio, plantilla del código,
   registro cerrado, dirección del sitio, doble factor) y los secretos de Vault `app_url` y `cron_secret`. El
   esquema `citizen` **nunca** se agrega a los expuestos de la Data API.
5. En Vercel, la conexión y las llaves del proyecto nuevo, **con la misma `PARTICIPATION_PEPPER` y la misma
   `PARTICIPATION_DATA_KEY`**, y volver a desplegar.
6. Comprobar como en §7 (pasos 3 y 4).

## 7. Probar que una copia sirve (restauración de prueba)

Una copia que nunca se restauró no se sabe si sirve. La prueba se hace en un proyecto aparte, **nunca encima de
producción**:
1. Crear un proyecto de Supabase de prueba (puede ser gratis).
2. Restaurar ahí la última copia propia (§6, pasos 1 a 3).
3. Comparar con producción unas cuentas rápidas en el editor SQL de los dos proyectos:
   ```sql
   select (select count(*) from public.requests) as solicitudes,
          (select count(*) from public.web_items) as contenidos,
          (select count(*) from public.profiles) as personas,
          (select max(created_at) from public.requests) as ultima_solicitud;
   ```
   Tienen que dar lo mismo que producción el día de la copia.
4. Con la app en tu computadora apuntando al proyecto de prueba (su `DATABASE_URL`, con las mismas pimienta y clave
   de datos): entra, abre un caso con contacto y toca «Ver contacto»; abre un archivo de una solicitud; abre la web y
   mira una noticia con foto. Si el contacto se lee, la clave guardada es la buena.
5. Anota la fecha, cuánto tardó y qué falló. **Borra el proyecto de prueba ese mismo día** (tiene datos de personas).

## 8. En local con datos que se quedan (`LOCAL_DATA_DIR`)

Es para practicar y trabajar sin cuentas, **nunca con datos reales** (la clave de contactos de la demo es pública).
Todo está en la carpeta (por ejemplo `./.data`): la base (`pglite`), los archivos (`files/web-public`,
`files/participacion-privado`) y el material (`uploads`).
```bash
# Con la app CERRADA (una copia con la app abierta puede salir dañada)
tar -czf "fb-local-$(date +%F).tar.gz" .data
# Volver a esa copia: cerrar la app, borrar la carpeta y abrir la copia
rm -rf .data && tar -xzf fb-local-AAAA-MM-DD.tar.gz
```
Para empezar de cero: cerrar la app y borrar la carpeta. La demostración de Vercel no necesita copias: vive en memoria
y vuelve sola a los datos inventados.

## 9. Lo que no se pudo comprobar

- **Nada se corrió contra un Supabase real**: ni la restauración desde el panel, ni Point in Time Recovery, ni
  `supabase db dump`, ni `supabase storage cp`, ni rearmar en un proyecto nuevo (no hay cuentas aquí; la conexión a
  `fb-dev` rechazó la contraseña el 05/11).
- Aquí solo hay `pg_dump` 16 y `fb-dev` es Postgres 17: los comandos de §3 B **no se corrieron** contra `fb-dev`.
- Los planes y precios son los de la documentación de Supabase leída el 26/10/2026.
- La copia del modo local (§8) es copiar una carpeta con la app cerrada; tampoco se cronometró ni se probó aquí.
