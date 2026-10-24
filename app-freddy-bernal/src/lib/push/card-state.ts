// Pure decisions for the «Avisos en este teléfono» card (no browser or server code here).

export type PushPlatform = 'ios' | 'android' | 'other';
export type FirstCheck = 'unsupported' | 'denied' | 'off' | 'sync';

// What the card can tell from the browser alone. 'sync' = this browser has a subscription with
// the current key and permission: the server still has to confirm the row is this person's
// (a shared phone, or a row the server dropped after the phone stopped answering).
export function firstCheck(i: { supported: boolean; permission: string; hasSub: boolean; keyMatches: boolean }): FirstCheck {
  if (!i.supported) return 'unsupported';
  if (i.permission === 'denied') return 'denied';
  if (i.permission !== 'granted' || !i.hasSub || !i.keyMatches) return 'off';
  return 'sync';
}

// How to unblock notifications, where the setting actually lives on each phone. The iPhone app
// from the home screen and the installed Android app have no address bar.
export function deniedHelp(platform: PushPlatform, standalone: boolean, appName: string): string {
  if (platform === 'ios') return `Bloqueaste los avisos. Ve a Ajustes › Notificaciones › ${appName}, actívalos y vuelve aquí.`;
  if (platform === 'android' && standalone) {
    return 'Bloqueaste los avisos. Mantén presionado el ícono de la app, toca «Información de la app» › Notificaciones, actívalos y vuelve aquí.';
  }
  return 'Bloqueaste los avisos para esta app. Permítelos en los ajustes del navegador (el candado junto a la dirección) y vuelve aquí.';
}
