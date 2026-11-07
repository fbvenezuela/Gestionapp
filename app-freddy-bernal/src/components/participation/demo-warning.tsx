import { Notice } from './kit';

// The test version (no DATABASE_URL: the demo) is a public address with one-tap sign-in for every role of the team,
// the attention desk included, so whatever someone sends through its form can be read by anyone who tries the
// platform, and it is gone when the demo restarts (the security review of 06/11). The form says it before anyone
// writes: never real data there. Production never shows it.
export function DemoDataWarning({ demo, className }: { demo: boolean; className?: string }) {
  if (!demo) return null;
  return (
    <Notice tone="danger" title="Versión de prueba: no escriba datos reales" className={className}>
      Lo que se envíe aquí puede verlo cualquier persona que pruebe la plataforma, y se borra cuando la versión de prueba se reinicia. No escriba su
      nombre, su correo, su teléfono ni otros datos personales.
    </Notice>
  );
}
