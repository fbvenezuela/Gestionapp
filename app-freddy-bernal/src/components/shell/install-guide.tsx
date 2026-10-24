'use client';

import { Share, SquarePlus, Smartphone } from 'lucide-react';
import type { PushPlatform } from '@/lib/push/card-state';

// Where phone notifications can work. iPhone/iPad (iOS 16.4+) only gets them when the app is
// added to the home screen; Android with Chrome gets them directly.
export type { PushPlatform };
export type PushEnv = { platform: PushPlatform; standalone: boolean; supported: boolean };

export function detectPushEnv(): PushEnv {
  const nav = navigator as Navigator & { standalone?: boolean };
  const ua = nav.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const platform: PushPlatform = ios ? 'ios' : /Android/i.test(ua) ? 'android' : 'other';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
  const supported = 'serviceWorker' in nav && 'PushManager' in window && 'Notification' in window && !(ios && !standalone);
  return { platform, standalone, supported };
}

export function InstallGuide({ platform, standalone }: { platform: PushPlatform; standalone: boolean }) {
  if (platform === 'ios' && !standalone) {
    return (
      <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border bg-surface-2 p-3 text-[15px]">
        <p className="font-semibold">En iPhone o iPad, primero agrega la app a la pantalla de inicio</p>
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>
            Abre esta página en Safari y toca <b>Compartir</b> <Share className="inline h-4 w-4 align-[-2px]" aria-hidden /> (el cuadro con la flecha).
          </li>
          <li>
            Toca <b>«Agregar a pantalla de inicio»</b> <SquarePlus className="inline h-4 w-4 align-[-2px]" aria-hidden />.
          </li>
          <li>Abre la app desde el ícono nuevo, entra a <b>Mi perfil</b> y toca <b>«Activar avisos»</b>.</li>
        </ol>
        <p className="text-sm text-text-2">Hace falta iOS 16.4 o más nuevo.</p>
      </div>
    );
  }
  const text =
    platform === 'ios'
      ? 'Tu iPhone necesita iOS 16.4 o más nuevo para recibir avisos. Actualízalo en Ajustes › General › Actualización de software.'
      : platform === 'android'
        ? 'Este navegador no recibe avisos. Abre la app en Chrome: ahí funcionan directo.'
        : 'Este navegador no recibe avisos. En Android usa Chrome; en iPhone, Safari con la app en la pantalla de inicio.';
  return (
    <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-border bg-surface-2 p-3 text-[15px]">
      <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {text}
    </p>
  );
}
