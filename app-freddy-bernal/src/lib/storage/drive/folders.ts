import 'server-only';
import { withSystem } from '../../db';
import { getClientConfig } from '../../client-config';
import { createFolder, FOLDER_MIME, listFiles, qv } from './client';
import { ROOT_FOLDER_MARK } from './names';

// The platform's folders in Drive: one root («FB Operaciones 360», from the client's config) with
// <Type>/<group> under it. Found again by private appProperties (fb360=root, fb360path=<path>),
// so the import script and a reconnect reuse them. Ids are cached in drive_folders (system only).

export function rootFolderName(): string {
  return getClientConfig().drive?.rootFolderName || 'Operaciones 360';
}

const marked = (key: string, value: string) => `appProperties has { key=${qv(key)} and value=${qv(value)} }`;

/** The root folder's id: the one this app made before (by its mark), or a new one. */
export async function findOrCreateRoot(token: string): Promise<string> {
  const q = `${marked(ROOT_FOLDER_MARK.key, ROOT_FOLDER_MARK.value)} and mimeType = ${qv(FOLDER_MIME)} and trashed = false`;
  const found = (await listFiles(token, q)).files[0];
  if (found) return found.id;
  return createFolder(token, rootFolderName(), null, { [ROOT_FOLDER_MARK.key]: ROOT_FOLDER_MARK.value });
}

async function cached(path: string): Promise<string | null> {
  return (await withSystem((sql) => sql.one<{ folder_id: string }>(`select folder_id from public.drive_folders where path = $1`, [path])))?.folder_id ?? null;
}

async function child(token: string, parentId: string, name: string, path: string): Promise<string> {
  const q = `${marked('fb360path', path)} and ${qv(parentId)} in parents and mimeType = ${qv(FOLDER_MIME)} and trashed = false`;
  const found = (await listFiles(token, q)).files[0];
  const id = found?.id ?? (await createFolder(token, name, parentId, { fb360: 'folder', fb360path: path }));
  await withSystem((sql) => sql.query(`insert into public.drive_folders (path, folder_id) values ($1, $2) on conflict do nothing`, [path, id]));
  return (await cached(path)) ?? id;
}

/** Folder id for «Videos/E-0042» (creating «Videos» and «E-0042» when missing). */
export async function ensureFolder(token: string, path: string): Promise<string> {
  const hit = await cached(path);
  if (hit) return hit;
  let root = (await withSystem((sql) => sql.one<{ root_folder_id: string | null }>(`select root_folder_id from public.drive_connection where id`)))?.root_folder_id ?? null;
  if (!root) {
    root = await findOrCreateRoot(token);
    const r = root;
    await withSystem((sql) => sql.query(`update public.drive_connection set root_folder_id = $1 where id`, [r]));
  }
  const [type, group] = path.split('/');
  const typeId = (await cached(type)) ?? (await child(token, root, type, type));
  return group ? child(token, typeId, group, path) : typeId;
}

/** After Drive said a cached folder is gone (the owner deleted it): look everything up again. */
export async function forgetFolders() {
  await withSystem(async (sql) => {
    await sql.query(`delete from public.drive_folders`);
    await sql.query(`update public.drive_connection set root_folder_id = null where id`);
  });
}
