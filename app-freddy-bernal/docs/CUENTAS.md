# Cuentas del proyecto (sin claves)

Oscar pidió el 22/10: «Todas las cuentas que abras pásalas para tenerlas en la base de datos de cuentas». Aquí se anota
cada cuenta que se abre. **Nunca una clave, un código, un token ni una frase de recuperación**: esas van en un gestor de
contraseñas del equipo, no en el repositorio ni en un chat.

| Servicio | Para qué | Cuenta / correo | Organización o equipo | Plan | Administradores | Doble factor | Abierta el | Notas |
|---|---|---|---|---|---|---|---|---|
| GitHub | Código (repositorio privado) | | fbvenezuela (repositorio `Gestionapp`) | | | | | confirmar que sea privado |
| Supabase | Base de datos, usuarios, archivos, tiempo real | | organización «fbvenezuela's Org» | gratis | | | 26/10/2026 | proyecto «fb-dev», región us-east-1 (EE. UU. Este); es el que va a usar producción (por ahora no hay `fb-prod`). Las claves y la contraseña de la base van solo en Vercel y en el gestor de contraseñas |
| Vercel | Versiones de prueba y producción | | | | | | | conectado al repositorio |
| Resend | Correos del equipo | | | | | | | dominio verificado: |
| Proveedor de IA | Copies, análisis | | | | | | | límite de gasto mensual: |
| Meta for Developers | Publicar en Instagram, Facebook, Threads | | | | | | | |
| X Developer | Publicar tweets | | | | | | | |
| TikTok for Developers | Publicar en TikTok | | | | | | | |
| Google Cloud | Drive y Picker (`DRIVE.md`); luego YouTube | la cuenta de Google **del cliente** (la misma de Drive) | proyecto `fb-operaciones-360` | gratis | | | | app «Operaciones 360» publicada («In production»), solo `drive.file`, sin logo; cliente OAuth tipo web + clave del Picker restringida |
| Google Drive | Carpeta «FB Operaciones 360» con el material | la cuenta de Google **del cliente** (dueña de la carpeta) | | gratis, 15 GB (compartidos con su Gmail y Fotos) | | | | la conecta Administración en Ajustes → Google Drive; nada compartido «con el enlace». El script de importación entra con esta misma cuenta |
| Cloudflare (Turnstile) | Antispam de los formularios públicos | | | | | | | |
| Dominio / DNS | La web del gobernador | lo tiene Pedro Poller | | | | | | |

Variables de entorno: los nombres van en `.env.example`; los valores, solo en Vercel y en `.env.local` (que no se sube).

## Variables que hay que llenar (sin valores aquí)
La lista completa, con qué es cada una y de dónde sale, está en `.env.example`. Las de producción van solo en Vercel.
