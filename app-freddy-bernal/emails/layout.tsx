import { Body, Container, Head, Html, Preview, Section, Text, Hr } from '@react-email/components';
import type { ReactNode } from 'react';

// Email colors are inline (email clients ignore CSS variables). They mirror the
// provisional tokens in src/app/tokens.css; update both when the brand manual arrives.
export const emailColors = {
  bg: '#F7F7F5',
  card: '#FFFFFF',
  border: '#E9E8E4',
  text: '#111111',
  muted: '#666660',
  accent: '#7F8630',
  slate: '#111111',
};

export function EmailLayout({ preview, appName, children }: { preview: string; appName: string; children: ReactNode }) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: emailColors.bg, fontFamily: 'Montserrat, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ backgroundColor: emailColors.card, border: `1px solid ${emailColors.border}`, borderRadius: 12, maxWidth: 520, padding: 24 }}>
          <Text style={{ color: emailColors.slate, fontWeight: 700, fontSize: 14, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>{appName}</Text>
          <Section>{children}</Section>
          <Hr style={{ borderColor: emailColors.border }} />
          <Text style={{ color: emailColors.muted, fontSize: 12 }}>
            Este correo es automático. Puedes apagar los avisos que no son importantes en tu perfil.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
