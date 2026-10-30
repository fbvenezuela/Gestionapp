'use client';

import { FolderTree } from 'lucide-react';
import { organizeFeed } from '@/lib/actions/drive-organize';
import { useAction } from '@/lib/hooks/use-action';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';

// «Organizar por orden del feed» (R4, D-74), in Ajustes → Google Drive. The page only renders it with its four keys
// (REDES_DRIVE_ORGANIZE=true, Drive as the storage, Drive connected, administración with 2FA) and the action checks
// them again. It puts each placed piece's cover in «Feed/Mes-1» as «01 - Post.jpg»: never the title (titles carry
// places, and file names must not), only files the app made, never a public link.
export function OrganizeFeed() {
  const { run, pending } = useAction();
  const { confirm, dialog } = useConfirm();
  const go = async () => {
    const yes = await confirm({
      title: 'Organizar por orden del feed',
      body: 'En Drive, cada portada del feed pasa a la carpeta «Feed/Mes-1», «Feed/Mes-2»… con su número y su formato («01 - Post.jpg»), sin el título. No se borra nada.',
      confirmLabel: 'Organizar',
    });
    if (yes) await run(() => organizeFeed({}));
  };
  return (
    <Card className="mt-5">
      {dialog}
      <CardHeader title="Organizar por orden del feed" subtitle="Las portadas del feed, en carpetas por mes y numeradas como salen." />
      <CardBody>
        <Button type="button" disabled={pending} onClick={() => void go()}>
          <FolderTree className="h-4 w-4" aria-hidden /> Organizar por orden del feed
        </Button>
      </CardBody>
    </Card>
  );
}
