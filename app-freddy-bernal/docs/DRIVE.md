# El material en Google Drive

Actualizado: 25/10/2026. Para Juan: qué hace, qué tienes que hacer tú (en orden), cómo probarlo y qué pasa si el permiso
de Google se vence. Decisión: `DECISIONES.md` D-28.

## En cinco líneas
1. Los videos, fotos y archivos se guardan en una carpeta del **Google Drive del cliente** (gratis, 15 GB). Nadie de
   afuera la ve: nada queda como «cualquiera con el enlace».
2. Administración conecta Drive **una sola vez** en Ajustes → Google Drive. Google solo le da permiso a la plataforma
   sobre los archivos que ella crea y los que Administración elige con «Elegir de Drive» (permiso `drive.file`).
3. El equipo sube y descarga como hoy. La plataforma revisa primero quién puede ver cada cosa. El video va del teléfono
   **directo a Drive**, por partes, y sigue solo cuando vuelve la señal.
4. Para que el permiso no se venza a los 7 días, la app de Google tiene que quedar **«En producción»**. Es gratis y no
   pide revisión, porque solo usa ese permiso.
5. Lo que tienes en el Mac lo subes con un script que se reanuda solo (o arrastrándolo a Drive y eligiéndolo en la
   plataforma). El video de *Sábados Felices* se queda fuera.

Todo esto está detrás de `STORAGE_PROVIDER=drive`. Sin esa variable, la plataforma y la demo funcionan igual que antes.

## Qué cuenta de Google es la dueña
La cuenta de Google **del cliente** que ya usa el equipo (no la tuya personal). Anótala en `CUENTAS.md` (sin claves).
Esa misma cuenta se usa en los tres lugares: Google Cloud (paso A), «Conectar Drive» (paso C) y el script (paso D). Si
se conecta otra, la plataforma la rechaza.

## A. Google Cloud (gratis; con la cuenta del cliente)
Si en algún paso Google pide **tarjeta**, «enviar a verificación» o algo que cueste, para y avísame.

1. Entra a console.cloud.google.com → **Crear proyecto** → nombre `fb-operaciones-360`.
2. **APIs y servicios → Biblioteca:** activa **Google Drive API** y **Google Picker API**.
3. **Google Auth Platform** (pantalla de consentimiento):
   - **Branding (Información de la marca):**
     - nombre **«FB · Operaciones 360»** (igual que en la página) y el correo de soporte; **sin logo** (el logo pide
       verificar la marca);
     - página principal: `https://<dominio>/acerca` (no la raíz: la raíz lleva a entrar);
     - política de privacidad: `https://<dominio>/privacidad`; condiciones: `https://<dominio>/condiciones`;
     - dominios autorizados: `<dominio>`. Si Google pide verificar el dominio, en search.google.com/search-console
       agrega la propiedad `https://<dominio>`, elige «Etiqueta HTML», copia solo el código del `content` y ponlo en
       Vercel como `GOOGLE_SITE_VERIFICATION`; Redeploy y toca «Verificar».
   - **Audience (público):** tipo **External**.
   - **Data access:** agrega **solo** `https://www.googleapis.com/auth/drive.file`.
   - Vuelve a **Audience** → **«Publish app»** → tiene que decir **«In production»**. Así el permiso no se vence a
     los 7 días.
4. **Clients → Create client → Web application** (nombre «Plataforma»):
   - **Orígenes de JavaScript:** `http://localhost:3000` y `https://<dominio de producción>`.
   - **URI de redirección** (tienen que ser exactas):
     - `https://<dominio de producción>/api/drive/callback`
     - `http://localhost:3000/api/drive/callback` (para probar en tu Mac)
     - `http://localhost:8765/oauth2callback` (para el script del paso D)
   - Copia el **ID de cliente** y el **secreto**: van en el paso B. El secreto no se pega en ningún chat.
5. **Credentials → Create credentials → API key** → «Restrict key»:
   - **Restricción de aplicación: sitios web:** `https://<dominio de producción>/*`, `http://localhost:3000/*` y
     `https://docs.google.com/*` (el Picker la necesita).
   - **Restricción de API:** solo **Google Picker API**.
6. **IAM y administración → Configuración:** copia el **número del proyecto** (solo números).

## B. Variables (Vercel → Settings → Environment Variables → solo **Production**)
Marca solo *Production* (desmarca *Preview* y *Development*): así la demo publicada no se toca.

| Variable | Qué poner | Secreta |
|---|---|---|
| `STORAGE_PROVIDER` | `drive` | no |
| `GOOGLE_CLIENT_ID` | el ID de cliente del paso A.4 | no |
| `GOOGLE_CLIENT_SECRET` | el secreto del paso A.4 | **sí** |
| `GOOGLE_PROJECT_NUMBER` | el número del paso A.6 | no |
| `GOOGLE_PICKER_API_KEY` | la clave del paso A.5 (restringida; solo llega al navegador de Administración) | baja |
| `DRIVE_TOKEN_KEY` | recomendado: 32 bytes al azar. En tu Mac: `openssl rand -base64 32` y pegas el resultado | **sí** |
| `APP_URL` | la dirección de producción, `https://<dominio>` (la de las redirecciones) | no |
| `CONTACT_EMAIL` | el correo de contacto que muestran /privacidad y /condiciones (el de soporte del paso A.3) | no |
| `GOOGLE_SITE_VERIFICATION` | solo si Google pide verificar el dominio (paso A.3) | no |
| `DRIVE_TRANSFER_CAP_GB` | `7` con Vercel Hobby; `0` (sin tope) con Vercel Pro | no |
| `DRIVE_UPLOAD_MODE` | vacío. `proxy` solo si «Probar» lo pide **y** das el OK (gasta transferencia de Vercel) | no |

- Tienen que estar también `DATABASE_URL` (Drive solo se activa con la base real) y `SESSION_SECRET`.
- Sin `DRIVE_TOKEN_KEY`, la clave sale de `SESSION_SECRET`: si algún día cambias `SESSION_SECRET`, hay que volver a
  conectar Drive. Con `DRIVE_TOKEN_KEY` eso no pasa.
- Después de guardar: **Deployments → Redeploy**.
- Para probar en tu Mac, las mismas variables van en `app-freddy-bernal/.env.local` (no se sube a git), con
  `APP_URL=http://localhost:3000`.

## C. En la plataforma (Administración, con doble factor)
1. **Ajustes → Google Drive → «Conectar Drive».** Si falta una variable, la pantalla dice cuál.
2. Entra con la cuenta del cliente y **marca la casilla de Google Drive**.
3. Vuelves a la plataforma con «Drive quedó conectado». Toca **«Probar»**: revisa las variables, el permiso, el
   espacio y la carpeta, sube un archivo mínimo, lo lee de vuelta y prueba una subida desde tu navegador. Si algo
   falta, lo dice en palabras.
4. Si conectaste **antes** de publicar la app (paso A.3), vuelve a conectar después: los permisos de la etapa de
   prueba se vencen a los 7 días aunque la publiques.

La plataforma crea la carpeta **«FB Operaciones 360»** y adentro: `Videos`, `Fotos`, `Portadas`, `Audios` y
`Documentos`, con una carpeta por evento con su **código** (`E-0042`), nunca con la fecha. Los archivos se llaman como
en la plataforma (`E-0042-Jefe-hablando-1.mp4`), sin fecha, hora ni lugar.

## D. El material de tu Mac (`~/Desktop/claude/freddy-videos-youtube/`, unos 2,3 GB)

### El video de Sábados Felices
El equipo pidió bajarlo el 24/10. La lista del cliente (`config/clients/fb.json` → `drive.importExclude`) deja fuera
todo lo que se llame «sabados felices», sin importar acentos, mayúsculas, guiones, signos ni espacios
(«#SabadosFelices», «sabados_felices», «Sábados–Felices»). Igual **revisa la lista «Se quedan fuera»** de la prueba
(paso 1): si no aparece ahí, ponle `NO-SUBIR-` al principio del nombre o escríbelo en `.no-subir`.
Para dejar fuera otros:
- ponle `NO-SUBIR-` al principio del nombre (o mételo en una carpeta que se llame `NO-SUBIR`), o
- copia `scripts/drive-import/no-subir.ejemplo` dentro de la carpeta como `.no-subir` y escribe un nombre por línea
  (`*` = cualquier cosa).

Si ya estaba subido: bórralo en drive.google.com, **vacía la papelera** y en la plataforma tócalo en Biblioteca →
«Quitar».

### Opción recomendada: el script (se reanuda solo, sin repetir)
En la Terminal del Mac, dentro de `app-freddy-bernal` (con `npm install` hecho y `GOOGLE_CLIENT_ID` y
`GOOGLE_CLIENT_SECRET` en `.env.local`):
1. Mira qué subiría (no sube nada ni entra a Google):
   `npm run drive:import -- --prueba ~/Desktop/claude/freddy-videos-youtube`
   Revisa la lista «Se quedan fuera»: ahí tiene que salir Sábados Felices. **Si no sale**, no sigas: ponle `NO-SUBIR-`
   al principio del nombre (o escríbelo en `.no-subir`) y vuelve a correr la prueba.
2. Sube:
   `npm run drive:import -- --cuenta <correo de la cuenta del cliente> ~/Desktop/claude/freddy-videos-youtube`
   Se abre el navegador: entra con **la misma cuenta** de Ajustes y marca la casilla de Drive. El script muestra el
   espacio libre y pide confirmar.
3. Si se corta la luz o la señal, corre **el mismo comando** otra vez: sigue donde quedó y no repite nada.
4. En la plataforma: **Biblioteca → «Traer lo nuevo de Drive»**. Aparecen en «Archivo (sin evento)» como
   «Archivo 001», «Archivo 002»…

Qué hace y qué no:
- Solo sube **videos** (mp4, mov, m4v, webm, mkv, 3gp). `INDICE.md` y las fotos no (las fotos se suben con «Subir»,
  que les quita la ubicación y los datos de la cámara).
- En Drive se llaman `ARCHIVO-001.mp4`… La lista que dice qué es cada número queda en
  `freddy-videos-youtube/.drive-import/lista.txt`, en tu Mac, **nunca en git**. Ahí mismo guarda su estado.
- Usa el mismo cliente OAuth y la misma cuenta que la plataforma: así la plataforma puede ver esos archivos.
- Se niega a usar una carpeta que esté dentro del repositorio. Nunca imprime claves ni permisos.

### Opción sin script: arrastrar
1. **Antes**, saca de la carpeta el video de Sábados Felices.
2. Arrastra la carpeta a drive.google.com (o usa «Google Drive para escritorio»).
3. En la plataforma: Biblioteca → **«Elegir de Drive»** → abre esa carpeta → **marca los videos** (hasta 50 por vez).

Elegir la carpeta entera no sirve: Google solo da permiso sobre los archivos que se marcan uno por uno. Por eso
recomiendo el script.

## E. Cómo probarlo
1. Con un teléfono y datos móviles: sube un video corto en un evento de prueba. Corta la señal a la mitad: sigue sola.
2. Ábrelo, adelántalo y descárgalo (la descarga va por partes y sigue sola si se corta).
3. Con Redes, abre el material de un evento: lo ve. Con Grabación, un evento que no le toca: no lo ve.
4. «Elegir de Drive» en un evento (Administración): el video queda con su duración y medidas, y la plataforma lee su
   formato para revisar las reglas de cada red.

## Si el permiso se vence
- Te llega un aviso (en la plataforma y al teléfono) y en Ajustes → Google Drive sale «Se venció el permiso».
- Toca **«Volver a conectar»** y entra con la misma cuenta. **No se pierde nada.**
- Mientras tanto, quien use la plataforma ve «El material no se puede abrir ahora. Ya le avisamos a Administración.»,
  nunca una pantalla rota: al descargar, en el aviso de la descarga; en un video, foto o audio que no carga, en lugar
  del reproductor, con «Intentar otra vez». Lo que estaba en Supabase sigue abriendo.
- Por qué se vence: la app quedó en «Prueba» (7 días), alguien le quitó el acceso a la app en myaccount.google.com
  (apps con acceso a la cuenta), pasaron 6 meses sin usarla, o cambió `SESSION_SECRET` sin `DRIVE_TOKEN_KEY`.

## Lo que hay que saber
- **Espacio:** 15 GB gratis por cuenta, **compartidos** con el Gmail y las Fotos de esa cuenta. Hoy son 2,3 GB de
  videos. «Probar» muestra el espacio y avisa al pasar el 80 %. Ver `COSTOS.md`.
- **Transferencia de Vercel:** ver, adelantar y descargar pasa por la plataforma (así se revisan los permisos), y
  también las miniaturas de Biblioteca. Vercel Hobby incluye unos 10 GB al mes y pausa el proyecto si se pasa; por eso
  hay un tope de 7 GB al mes (`DRIVE_TRANSFER_CAP_GB`). Cada pedido aparta sus bytes **antes** de mandar nada y
  devuelve lo que no mandó, así que ni varios a la vez ni una descarga cortada lo pasan. Al llegar, Administración
  recibe un aviso y ver o descargar de Drive queda en pausa hasta el mes siguiente (las miniaturas muestran el ícono);
  subir directo sigue. Con Vercel Pro se pone `0`.
- **Tope por persona:** cada persona puede usar al día hasta la cuarta parte del tope del mes (con 7 GB, 1,75 GB:
  unos 9 videos de 180 MB). Así una sola cuenta no deja sin videos a todos por el resto del mes. Al pasarlo, esa
  persona ve «Ya usaste tu cupo de hoy…» y Administración recibe un aviso; al día siguiente sigue. Administración no
  tiene tope diario: si alguien lo necesita ya, Administración lo baja y se lo pasa. Las miniaturas cuentan igual:
  pasado el cupo, sale el ícono (sin aviso).
- **Descargar va siempre por partes:** los botones «Descargar», «Video», «Portada», «Audio recibido» y la imagen de
  un tweet bajan los archivos de Drive por partes. Un archivo de Drive de más de 32 MB nunca sale entero en una sola
  respuesta (se cortaría a los 300 s en una línea lenta): pedido de otra forma, la plataforma contesta «descárgalo
  con el botón «Descargar»».
- **Subir directo:** el servidor abre la subida en Drive y el teléfono manda las partes directo a Google. Google lo
  documenta para Cloud Storage y otros lo midieron con Drive, pero para Drive no está escrito: con la cuenta real lo
  confirma «Probar» (último paso). Si dijera que no, la salida es `DRIVE_UPLOAD_MODE=proxy` (las partes pasan por
  Vercel y gastan su transferencia), solo con tu OK. Con `proxy`, cada parte cuenta para el tope del mes y para el
  cupo del día de quien sube (Administración no tiene tope diario); una parte que no llega entera, o que Google no
  recibe, no cuenta.
- **«Elegir de Drive» es solo para Administración.** Le da a su navegador un permiso de Google de una hora, solo
  `drive.file`. El resto del equipo nunca recibe un permiso de Google.
- **Versiones de prueba de Vercel:** «Conectar Drive» y el Picker funcionan solo en producción y en tu Mac
  (`localhost:3000`), porque Google pide direcciones exactas.
- **Formato del video:** Drive solo da duración y medidas. De lo que sube el teléfono, la plataforma ya sabe todo; de
  lo que se elige o se importa de Drive, el navegador de Administración lee el formato justo después. Si no puede, las
  reglas por red dicen «revísalo a mano».

## Para probar sin Google (solo en tu Mac o en las pruebas)
`STORAGE_PROVIDER=drive DRIVE_FAKE=1 npm run dev` (sin `DATABASE_URL`): un Drive de mentira en memoria, con la cuenta
inventada `cuenta@demo.test`. «Conectar Drive» conecta sin salir de la plataforma y «Elegir de Drive» pide un id de
archivo de ese Drive de prueba. Con `DATABASE_URL`, `DRIVE_FAKE` no hace nada.
