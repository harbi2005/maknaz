import { execSync } from 'node:child_process';

/**
 * Applies pending migrations to the dedicated test database (non-destructive).
 * Tests never depend on an empty database: every test creates uniquely named users and
 * organizations, so runs can accumulate data safely.
 */
export default function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
}
