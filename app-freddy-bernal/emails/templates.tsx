import { Button, Heading, Section, Text } from '@react-email/components';
import { EmailLayout, emailColors } from './layout';

// Rule 4: no template ever includes an event's date or time.

const h = { color: emailColors.text, fontSize: 20, fontWeight: 700, margin: '16px 0 8px' } as const;
const p = { color: emailColors.text, fontSize: 15, lineHeight: '22px' } as const;
const btn = { backgroundColor: emailColors.accent, color: emailColors.text, borderRadius: 8, padding: '12px 20px', fontWeight: 600, fontSize: 15 } as const;

export function InviteEmail({ appName, name, roleLabel, url }: { appName: string; name: string; roleLabel: string; url: string }) {
  return (
    <EmailLayout preview={`Te invitaron a ${appName}`} appName={appName}>
      <Heading style={h}>Hola{name ? `, ${name}` : ''}</Heading>
      <Text style={p}>Te invitaron a {appName} como <b>{roleLabel}</b>.</Text>
      <Text style={p}>Para entrar escribe tu correo y te llegará un código de 6 dígitos. No hay contraseña que recordar.</Text>
      <Button href={url} style={btn}>Entrar</Button>
    </EmailLayout>
  );
}

export function LoginCodeEmail({ appName, code }: { appName: string; code: string }) {
  return (
    <EmailLayout preview={`Tu código es ${code}`} appName={appName}>
      <Heading style={h}>Tu código para entrar</Heading>
      <Text style={{ ...p, fontSize: 32, fontWeight: 700, letterSpacing: '0.2em', fontFamily: 'Courier New, monospace' }}>{code}</Text>
      <Text style={p}>Vence en 10 minutos. Si no pediste este código, ignora este correo.</Text>
    </EmailLayout>
  );
}

export function NoticeEmail({ appName, title, body, url, cta }: { appName: string; title: string; body: string; url?: string; cta?: string }) {
  return (
    <EmailLayout preview={title} appName={appName}>
      <Heading style={h}>{title}</Heading>
      {body.split('\n').map((line, i) => (
        <Text key={i} style={p}>{line}</Text>
      ))}
      {url ? <Button href={url} style={btn}>{cta ?? 'Abrir'}</Button> : null}
    </EmailLayout>
  );
}

// Daily digest: counts and titles only (never an event's date, time or place).
export function DigestEmail({ appName, name, sections, url }: { appName: string; name?: string; sections: { line: string; titles: string[]; more: number }[]; url: string }) {
  const li = { ...p, margin: '2px 0 2px 12px' } as const;
  return (
    <EmailLayout preview={sections.map((s) => s.line).join(' · ')} appName={appName}>
      <Heading style={h}>Hola{name ? `, ${name}` : ''}: esto espera por ti</Heading>
      {sections.map((s, i) => (
        <Section key={i} style={{ margin: '12px 0' }}>
          <Text style={{ ...p, fontWeight: 700, margin: '0 0 4px' }}>{s.line}</Text>
          {s.titles.map((t, j) => (
            <Text key={j} style={li}>• {t}</Text>
          ))}
          {s.more ? <Text style={{ ...li, color: emailColors.muted }}>y {s.more} más</Text> : null}
        </Section>
      ))}
      <Button href={url} style={btn}>Abrir «Hoy»</Button>
      <Text style={{ ...p, color: emailColors.muted, fontSize: 13 }}>Llega una vez al día. Lo apagas en tu perfil.</Text>
    </EmailLayout>
  );
}
