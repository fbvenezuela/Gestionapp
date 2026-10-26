import { brand } from '@/lib/client-config';
import { env } from '@/lib/env';

export const metadata = { title: 'Privacidad' };

// Google reads this page before the OAuth app (Drive) can go «En producción». Keep it true to the code:
// docs/DRIVE.md and docs/SEGURIDAD.md (the button names are the ones in Ajustes → Google Drive).
export default function Privacy() {
  const contact = env.contactEmail;
  return (
    <>
      <h1>Política de privacidad</h1>
      <p className="text-sm text-text-2">Actualizada el 26 de octubre de 2026.</p>

      <h2>Qué es</h2>
      <p>
        {brand.appName} es la plataforma interna de un equipo de comunicaciones. Solo entran las personas del equipo, por
        invitación y con un código que llega al correo. Los roles con más acceso usan además doble factor. No está abierta
        al público.
      </p>

      <h2>Qué datos guarda</h2>
      <ul>
        <li>
          De cada persona del equipo: nombre, correo, rol, teléfono si lo da, sus preferencias de avisos y los registros de
          entrada y de cambios, para la seguridad.
        </li>
        <li>El trabajo del equipo: eventos, fichas, piezas, textos (copies), publicaciones, resultados y los archivos que sube.</li>
        <li>Las preguntas que se le hacen al asistente, sin correos, teléfonos, fechas ni direcciones.</li>
        <li>No pide ni guarda contraseñas.</li>
      </ul>

      <h2>Google Drive</h2>
      <p>Si Administración conecta Google Drive, la plataforma usa solo el permiso <code>drive.file</code> de Google. Con él:</p>
      <ul>
        <li>ve solo los archivos que ella misma crea en su carpeta y los que Administración elige con «Elegir de Drive»; no ve el resto del Drive;</li>
        <li>guarda ahí los videos, fotos y archivos del equipo, y los muestra solo a quien tiene permiso dentro de la plataforma;</li>
        <li>
          de Google lee el correo de la cuenta conectada y el espacio libre. En su base de datos guarda ese correo (para no
          conectar otra cuenta por error) y, de cada archivo, su número en Drive, tipo, tamaño, duración, medidas y una
          miniatura pequeña. No pide el nombre original de los archivos ni la fecha o el lugar de las fotos;
        </li>
        <li>a las fotos que se eligen de Drive les quita la ubicación y los datos de la cámara, y guarda esa copia limpia en su carpeta;</li>
        <li>no crea enlaces públicos ni comparte archivos con nadie fuera del equipo;</li>
        <li>
          guarda el permiso de Google cifrado en su base de datos. Solo el navegador de Administración recibe, al usar
          «Elegir de Drive», un permiso de una hora; el resto del equipo nunca recibe un permiso de Google.
        </li>
      </ul>
      <p>
        La plataforma no vende estos datos ni los usa para publicidad. Tampoco los manda a servicios de inteligencia
        artificial ni los usa para entrenar modelos.
      </p>
      <p>
        El uso que hace {brand.appName} de la información recibida de las API de Google, y su transferencia a cualquier
        otra aplicación, cumplen la{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer">
          Política de datos del usuario de los servicios de las API de Google
        </a>
        , incluidos los requisitos de uso limitado.
      </p>
      <p lang="en">
        {brand.appName}&apos;s use and transfer to any other app of information received from Google APIs will adhere to
        the Google API Services User Data Policy, including the Limited Use requirements.
      </p>
      <p>
        Para quitar el permiso, Administración toca «Quitar el permiso en Google» en Ajustes → Google Drive, o el dueño de
        la cuenta lo quita en{' '}
        <a href="https://myaccount.google.com/permissions" rel="noopener noreferrer">myaccount.google.com/permissions</a>.
        «Desconectar» solo borra el permiso guardado en la plataforma. Los archivos siguen en el Drive del cliente.
      </p>

      <h2>Con quién se comparte</h2>
      <p>
        No se venden ni se comparten para otros fines. Se guardan en los servicios que hacen funcionar la plataforma: la
        base de datos y los archivos (Supabase), el alojamiento (Vercel) y, si se conecta, el Google Drive del cliente. Los
        correos salen por Resend. Si la inteligencia artificial está encendida, recibe solo textos del trabajo (la ficha o
        la pregunta), nunca archivos ni datos de Google Drive.
      </p>
      <p>
        La plataforma no publica nada en redes por su cuenta: cada publicación la hace una persona del equipo. Los correos
        y avisos automáticos van solo a las personas del equipo.
      </p>

      <h2>Cuánto tiempo se guardan</h2>
      <p>
        Mientras el equipo use la plataforma. Administración puede desactivar a una persona y quitar material; quitarlo en
        la plataforma no lo borra del Drive del cliente. El registro de cambios se conserva siempre, para saber quién hizo
        qué.
      </p>

      <h2>Seguridad</h2>
      <p>
        Cada rol ve solo lo que le toca, y eso lo controla la base de datos. La conexión va cifrada, los roles con más
        acceso usan doble factor y el registro de cambios no se puede borrar.
      </p>

      <h2>Contacto</h2>
      <p>
        Para preguntas o para pedir que se borren tus datos, escribe{' '}
        {contact ? (
          <>
            a <a href={`mailto:${contact}`}>{contact}</a>
          </>
        ) : (
          'a Administración de la plataforma'
        )}
        . Borramos lo que se pueda; el registro de cambios no se borra.
      </p>

      <h2>Cambios</h2>
      <p>Si esta política cambia, se actualiza en esta página con su fecha.</p>
    </>
  );
}
