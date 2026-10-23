import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src'), '@emails': path.resolve(import.meta.dirname, 'emails'), '@config': path.resolve(import.meta.dirname, 'config'), 'server-only': path.resolve(import.meta.dirname, 'tests/server-only-stub.ts') } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/rls/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
