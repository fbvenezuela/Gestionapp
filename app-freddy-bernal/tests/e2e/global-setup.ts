import fs from 'node:fs';
import path from 'node:path';

// A fresh server has fresh 2FA enrollments: forget secrets from older runs.
export default function globalSetup() {
  fs.rmSync(path.join(process.cwd(), 'test-results', '.totp-secrets.json'), { force: true });
}
