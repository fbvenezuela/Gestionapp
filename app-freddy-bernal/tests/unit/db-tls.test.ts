// TLS to the database: a real host (Supabase) never goes in plain text, even when DATABASE_URL lacks
// ?sslmode=require; a local database (work, tests, the CI container) keeps working without TLS; and
// a URL that says sslmode itself is obeyed (postgres.js lets an `ssl` key, even undefined, win over it).
import { describe, it, expect } from 'vitest';
import postgres from 'postgres';
import { pgTls } from '@/lib/db/ssl';

describe('pgTls()', () => {
  it('pide TLS para un servidor real sin sslmode', () => {
    for (const url of [
      'postgresql://postgres.proyectofalso:secreto@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      'postgres://postgres:secreto@db.example.com:5432/postgres',
      'postgres://u:p@db.example.com/postgres?application_name=app',
      'postgres://u:p@10.0.0.5:5432/postgres',
      'postgres://u:p@[2001:db8::1]:5432/postgres',
      'postgres://u:p@localhost:5432,db.example.com:5432/postgres',
    ]) {
      expect(pgTls(url), url).toEqual({ ssl: 'require' });
    }
  });

  it('una base local va sin TLS (pruebas, CI, el computador)', () => {
    for (const url of [
      'postgres://postgres:postgres@localhost:5432/postgres',
      'postgres://postgres:postgres@LOCALHOST:5432/postgres',
      'postgres://postgres:postgres@127.0.0.1:5432/postgres',
      'postgres://postgres:postgres@127.0.0.2/postgres',
      'postgres://postgres:postgres@[::1]:5432/postgres',
      'postgres://postgres:postgres@db.localhost:5432/postgres',
      'postgres://postgres@%2Fvar%2Frun%2Fpostgresql/postgres',
      'postgres:///postgres',
      'postgres://u:p@localhost:5432,127.0.0.1:5433/postgres',
    ]) {
      const tls = pgTls(url);
      expect(tls, url).toEqual({});
      expect('ssl' in tls, url).toBe(false);
    }
  });

  it('si la URL trae sslmode (o ssl), decide la URL: ninguna clave ssl', () => {
    for (const url of [
      'postgresql://postgres.proyectofalso:secreto@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require',
      'postgres://u:p@db.example.com:5432/postgres?sslmode=disable',
      'postgres://u:p@db.example.com:5432/postgres?application_name=x&sslmode=verify-full',
      'postgres://u:p@db.example.com:5432/postgres?ssl=true',
      'postgres://u:p@db.example.com:5432/postgres?sslrootcert=system',
      'postgres://postgres:postgres@localhost:5432/postgres?sslmode=require',
    ]) {
      expect('ssl' in pgTls(url), url).toBe(false);
    }
  });

  it('una contraseña con símbolos codificados no confunde el servidor', () => {
    expect(pgTls('postgres://u:p%40ss%2Fw%3Ard@db.example.com:6543/postgres')).toEqual({ ssl: 'require' });
    expect(pgTls('postgres://u:p%40ss%2Fw%3Ard@localhost:5432/postgres')).toEqual({});
    // An @ left unencoded in the password: the host is still the part after the last @.
    expect(pgTls('postgres://u:p@ss@db.example.com:6543/postgres')).toEqual({ ssl: 'require' });
  });

  it('lo que no se puede leer va con TLS', () => {
    expect(pgTls('postgres://u:p@%E0%A4%A/postgres')).toEqual({ ssl: 'require' });
  });

  it('postgres.js termina usando lo que corresponde (sin conectarse)', () => {
    const tlsOf = (url: string) => postgres(url, { ...pgTls(url), prepare: false, max: 1 }).options.ssl;
    expect(tlsOf('postgres://u:p@db.example.com:6543/postgres')).toBe('require');
    expect(tlsOf('postgres://u:p@db.example.com:6543/postgres?sslmode=require')).toBe('require');
    expect(tlsOf('postgres://u:p@db.example.com:6543/postgres?sslmode=verify-full')).toBe('verify-full');
    expect(tlsOf('postgres://u:p@db.example.com:6543/postgres?sslmode=disable')).toBe(false);
    expect(tlsOf('postgres://postgres:postgres@localhost:5432/postgres')).toBe(false);
  });
});
