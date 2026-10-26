import Link from 'next/link';
import { brand } from '@/lib/client-config';

export const metadata = { title: 'Acerca' };

export default function About() {
  return (
    <>
      <h1>{brand.appName}</h1>
      <p>
        Es la plataforma interna de un equipo de comunicaciones. Reúne en un solo lugar la agenda de trabajo, el material
        de los eventos, las piezas y sus textos (copies), la aprobación, la publicación y los resultados.
      </p>
      <ul>
        <li>Es solo para el equipo: se entra por invitación, con un código que llega al correo. Los roles con más acceso usan además doble factor.</li>
        <li>No está abierta al público ni publica nada por su cuenta: cada publicación la hace una persona del equipo.</li>
        <li>
          Si Administración conecta Google Drive, la plataforma guarda ahí, en el Drive del cliente, los videos y fotos del
          equipo. Usa solo el permiso <code>drive.file</code> de Google: ve solo los archivos que ella crea o los que
          Administración elige.
        </li>
      </ul>
      <p>
        Lee la <Link href="/privacidad">política de privacidad</Link> y las <Link href="/condiciones">condiciones de uso</Link>.
        Si eres del equipo, <Link href="/entrar">entra aquí</Link>.
      </p>
    </>
  );
}
