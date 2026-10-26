import Link from 'next/link';
import { brand } from '@/lib/client-config';
import { env } from '@/lib/env';

export const metadata = { title: 'Condiciones' };

export default function Terms() {
  const contact = env.contactEmail;
  return (
    <>
      <h1>Condiciones de uso</h1>
      <p className="text-sm text-text-2">Actualizadas el 26 de octubre de 2026.</p>
      <ul>
        <li>{brand.appName} es de uso interno del equipo de comunicaciones del {brand.clientTitle}. Se entra solo por invitación.</li>
        <li>Cada persona cuida su acceso: no comparte su cuenta ni sus códigos.</li>
        <li>El contenido es del cliente. La plataforma no publica nada por su cuenta: cada publicación la hace una persona del equipo.</li>
        <li>Administración puede suspender el acceso de quien no respete estas condiciones o las reglas del equipo.</li>
        <li>La plataforma se ofrece tal como está y se mejora con el tiempo.</li>
        <li>
          Los datos se tratan según la <Link href="/privacidad">política de privacidad</Link>.
        </li>
      </ul>
      <p>
        Contacto: {contact ? <a href={`mailto:${contact}`}>{contact}</a> : 'el correo de soporte que aparece en la pantalla de permiso de Google'}.
      </p>
    </>
  );
}
