import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

export function readMigrations(): { name: string; sql: string }[] {
  const dir = path.join(root, 'supabase', 'migrations');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

export function readShim(): string {
  return fs.readFileSync(path.join(root, 'supabase', 'shim', 'supabase_shim.sql'), 'utf8');
}

export function readDemoAuth(): string {
  return fs.readFileSync(path.join(root, 'supabase', 'shim', 'demo_auth.sql'), 'utf8');
}
