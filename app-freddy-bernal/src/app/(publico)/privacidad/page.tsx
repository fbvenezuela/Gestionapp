import { brand } from '@/lib/client-config';
import { env } from '@/lib/env';

export const metadata = { title: 'Privacidad' };

// Google reads this page before the OAuth app (Drive) can go «En producción». Keep it true to the code:
// docs/DRIVE.md and docs/SEGURIDAD.md.
export default function Privacy() {
  const contact = env.contactEmail;
  return (
    <>
      <h1>Política de privacidad</h1>
      <p className="text-sm text-text-2">Actualizada el 26 de octubre de 2026.</p>

      <h2>Qué es</h2>
      <p>
        {brand.appName} es la plataforma interna del equipo de comunicaciones del {brand.clientTitle}. Solo entran las
        personas del equipo, por invitación, con un código que llega al correo y doble factor. No está abierta al público.
      </p>

      <h2>Qué datos guarda</h2>
      <ul>
        <li>De cada persona del equipo: nombre, correo, rol y los registros de entrada y de cambios, para la seguridad.</li>
        <li>El trabajo del equipo: eventos, fichas, piezas, copies, publicaciones, resultados y los archivos que sube.</li>
        <li>No pide ni guarda contraseñas.</li>
      </ul>

      <h2>Google Drive</h2>
      <p>Si Administración conecta Google Drive, la plataforma usa el permiso <code>drive.file</code> de Google. Con él:</p>
      <ul>
        <li>solo ve los archivos que ella misma crea en su carpeta y los que Administración elige con «Elegir de Drive»; no ve el resto del Drive;</li>
        <li>guarda ahí los videos, fotos y archivos del equipo, y los muestra solo a quien tiene permiso dentro de la plataforma;</li>
        <li>no crea enlaces públicos ni comparte archivos con nadie fuera del equipo;</li>
        <li>guarda el permiso de Google cifrado en su base de datos y nunca lo muestra en el navegador.</li>
      </ul>
      <p>
        La plataforma no vende estos datos, no los usa para publicidad, no los usa para entrenar modelos de inteligencia
        artificial y no los manda a servicios de inteligencia artificial.
      </p>
      <p>
        El uso y la transferencia a cualquier otra aplicación de la información recibida de las API de Google cumplen la{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer">
          Política de datos del usuario de los servicios de las API de Google
        </a>
        , incluidos los requisitos de uso limitado.
      </p>
      <p>
        Para quitar el permiso, Administración toca «Desconectar» en Ajustes → Google Drive, o el dueño de la cuenta lo
        quita en <a href="https://myaccount.google.com/permissions" rel="noopener noreferrer">myaccount.google.com/permissions</a>.
      </p>

      <h2>Con quién se comparte</h2>
      <p>
        Con nadie para fines propios. Los datos viven en los servicios que hacen funcionar la plataforma (la base de datos y
        el alojamiento) y, si se conecta, en el Google Drive del cliente. Nada se publica en redes ni se manda por correo
        sin que lo haga una persona del equipo.
      </p>

      <h2>Cuánto tiempo se guardan</h2>
      <p>
        Mientras el equipo use la plataforma. Administración puede desactivar a una persona y quitar material. Los
        registros de seguridad se conservan para saber quién hizo qué.
      </p>

      <h2>Seguridad</h2>
      <p>
        Cada rol ve solo lo suyo y eso lo controla la base de datos. Hay doble factor, conexión cifrada y un registro de
        cambios que no se puede borrar.
      </p>

      <h2>Contacto</h2>
      <p>
        Para preguntas o para pedir que se borren tus datos, escribe a{' '}
        {contact ? <a href={`mailto:${contact}`}>{contact}</a> : 'el correo de soporte que aparece en la pantalla de permiso de Google'}.
      </p>

      <h2>Cambios</h2>
      <p>Si esta política cambia, se actualiza en esta página con su fecha.</p>
    </>
  );
}
