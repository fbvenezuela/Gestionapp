# Cuentas del proyecto (sin claves)

Oscar pidió el 22/10: «Todas las cuentas que abras pásalas para tenerlas en la base de datos de cuentas». Aquí se anota
cada cuenta que se abre. **Nunca una clave, un código, un token ni una frase de recuperación**: esas van en un gestor de
contraseñas del equipo, no en el repositorio ni en un chat.

| Servicio | Para qué | Cuenta / correo | Organización o equipo | Plan | Administradores | Doble factor | Abierta el | Notas |
|---|---|---|---|---|---|---|---|---|
| GitHub | Código (repositorio privado) | | fbvenezuela (repositorio `Gestionapp`) | | | | | confirmar que sea privado |
| Supabase | Base de datos, usuarios, archivos, tiempo real | | | | | | | proyecto de prueba y de producción |
| Vercel | Versiones de prueba y producción | | | | | | | conectado al repositorio |
| Resend | Correos del equipo | | | | | | | dominio verificado: |
| Proveedor de IA | Copies, análisis | | | | | | | límite de gasto mensual: |
| Meta for Developers | Publicar en Instagram, Facebook, Threads | | | | | | | |
| X Developer | Publicar tweets | | | | | | | |
| TikTok for Developers | Publicar en TikTok | | | | | | | |
| Google Cloud | YouTube y Drive | | | | | | | |
| Cloudflare (Turnstile) | Antispam de los formularios públicos | | | | | | | |
| Dominio / DNS | La web del gobernador | lo tiene Pedro Poller | | | | | | |

Variables de entorno: los nombres van en `.env.example`; los valores, solo en Vercel y en `.env.local` (que no se sube).

## Variables que hay que llenar (sin valores aquí)
La lista completa, con qué es cada una y de dónde sale, está en `.env.example`. Las de producción van solo en Vercel.
