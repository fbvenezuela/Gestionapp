# Costos: herramientas y cuentas

Actualizado: 23/10/2026. Lo paga el cliente (Hillary lo pidió). Los precios vienen de páginas públicas y guías de
2026; **todo dice «verificar»** porque cambian seguido y algunas fuentes no coinciden. Antes de pagar, se mira la
página oficial de cada servicio. Montos en dólares, por mes.

## Lo obligatorio para usar la plataforma interna

| Servicio | Para qué | Plan recomendado | Costo mensual estimado | A nombre de |
|---|---|---|---|---|
| GitHub | Código, versiones y CI | Organización Free (repos privados ilimitados; 2.000 min de CI al mes) | **0** (verificar minutos de CI si crece) | Organización del cliente o de Impulso Digital |
| Vercel | Publicar la app (versiones de prueba y producción) | **Pro**: Hobby es solo para uso personal, sin fines comerciales | **20** por la cuota de plataforma con 1 puesto que publica, incluye 20 de uso (verificar en vercel.com/pricing) | Equipo del cliente |
| Supabase `fb-prod` | Base de datos, usuarios, archivos, tiempo real | **Pro** | **25** por organización, incluye 10 de cómputo (instancia Micro), 8 GB de base, 100 GB de archivos y 250 GB de descarga (verificar) | Organización del cliente |
| Supabase `fb-dev` | Pruebas | Gratis (se pausa si no se usa una semana) o un segundo proyecto en Pro | **0** o **~10** de cómputo extra (verificar) | La misma organización |
| Resend | Correos: invitaciones, códigos de entrada y avisos | Free mientras sean pocos (3.000 al mes, 100 al día); Pro si crece | **0** ahora; **20** el Pro de 50.000 correos (verificar) | Cuenta del cliente |
| Dominio | Remitente de correos y la web | El del gobernador (lo tiene Pedro Poller) o uno nuevo para la plataforma | **~1–2** al mes si se compra uno (~12–20 al año, verificar) | Del cliente |

**Total mínimo para el lunes:** unos **45–55 al mes** (Vercel Pro + Supabase Pro), más el dominio si se compra.

## Lo que se agrega según se use

| Servicio | Para qué | Costo estimado | ¿Obligatorio? |
|---|---|---|---|
| Almacenamiento de video | Material crudo y finales (varios GB por evento) | Supabase: 100 GB incluidos en Pro; después ~0,02 por GB guardado y ~0,09 por GB descargado (verificar). Si se descarga mucho, Cloudflare R2 no cobra la descarga (~0,015 por GB guardado, verificar) | Sí, crece con el uso. Ejemplo: 300 GB guardados y 400 GB descargados al mes ≈ 4 + 14 = **~18 extra** (estimado, verificar) |
| IA (API de Claude) | Copies; luego análisis de métricas | Por uso: con `claude-opus-5-5` (4 / 20 por millón de tokens de entrada/salida), un juego de tres copies cuesta centavos. 300 copies al mes ≈ **3–6**. Tope mensual configurable (`AI_MONTHLY_CAP_USD`) | Opcional: sin clave funciona con plantillas |
| API de X | Publicar los tweets solos | Pago por uso desde feb. 2026: ~0,015 por tweet sin link y ~0,20 con link (verificar en developer.x.com). 150 tweets al mes sin link ≈ **2–3**; con link ≈ **30** | Opcional: mientras tanto se publica con «Copiar» y «Ya lo publiqué» |
| Meta (Instagram, Facebook, Threads) | Publicar solos | Sin costo por uso; pide app de desarrollador, verificación del negocio y revisión de permisos (semanas) | Opcional (fase 2) |
| TikTok | Publicar solo | Sin costo; hasta que auditen la app, lo publicado sale privado | Opcional (fase 2) |
| YouTube Data API | Subir videos | Sin costo; la subida gasta mucha cuota diaria | Opcional (fase 2) |
| Google Cloud (Drive) | Leer la carpeta del cliente | Sin costo para este uso | Opcional (fase 2) |
| Metricool | Solo leer métricas, si se decide | Depende del plan (verificar si incluye API) | Opcional |
| Cloudflare Turnstile | Antispam de la web pública | Gratis | Sí en fase 3, sin costo |
| Mapas (teselas) | Mapa de reportes (fase 3) | Proveedores con plan gratis para poco tráfico (MapTiler, Stadia; verificar) | Fase 3 |

## Cuánto cuesta blindar la seguridad (lo pidió Hillary)

Lo que **ya está hecho y no cuesta**: RLS en todas las tablas con pruebas, doble factor, auditoría, borrado lógico,
URLs firmadas de 5 minutos, claves solo en el servidor, cabeceras de seguridad, búsqueda de secretos en cada cambio.

| Medida | Para qué | Costo estimado |
|---|---|---|
| Supabase Pro (ya en la tabla) | Copias de seguridad diarias (7 días), sin pausas | Incluido en los 25 |
| PITR (recuperar la base a cualquier minuto) | Si alguien borra algo por error o hay un ataque | Desde **100** por 7 días de retención (verificar) — recomendado cuando entren denuncias y ayudas (fase 3) |
| Instancia de cómputo más grande | Aguantar 1.000+ ayudas por semana en la web pública | Small ~15 (5 extra después del crédito); Medium más (verificar) |
| Vercel: protección de las versiones de prueba | Que nadie de afuera vea las versiones de prueba | Incluida en Pro para los links de prueba (verificar el alcance) |
| Vercel Firewall / reglas WAF | Frenar ataques a la web pública | Reglas básicas incluidas en Pro; las avanzadas, aparte (verificar) |
| Dominio con DNSSEC y correo con SPF/DKIM/DMARC | Que nadie mande correos haciéndose pasar por la plataforma | Sin costo extra |
| Gestor de contraseñas del equipo | Guardar las claves fuera de chats | 1Password Teams o Bitwarden Teams ~4–8 por persona (verificar) |
| Revisión externa de seguridad (pentest) antes de abrir la web | Que alguien de afuera intente entrar | Pago único, desde ~1.000 (muy variable, cotizar) |

**Resumen:** el blindaje básico ya está incluido. Para la fase 3 (denuncias y ayudas), recomiendo sumar PITR (~100) y
una revisión externa antes de abrir la web al público.

## Fuentes consultadas (verificar siempre la oficial)
- Vercel: vercel.com/pricing y vercel.com/docs/plans/pro-plan.
- Supabase: supabase.com/pricing.
- Resend: resend.com/pricing.
- X API: developer.x.com (pago por uso, 2026).
- Anthropic: precios de la API en platform.claude.com.
