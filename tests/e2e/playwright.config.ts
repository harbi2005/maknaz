import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Demo credentials come from the git-ignored apps/api/.env (SEED_DEMO_PASSWORD), never from the repo.
const envFile = path.resolve(import.meta.dirname, '../../apps/api/.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5180';

/**
 * End-to-end tests against a running stack (PostgreSQL + seeded demo data + API + web):
 *   npm run db:start   ·   npm run db:seed   ·   npm run dev
 * Uses the locally installed Microsoft Edge or Chrome (E2E_BROWSER_CHANNEL), no browser download.
 */
export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    channel: process.env.E2E_BROWSER_CHANNEL ?? 'msedge',
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: '../../test-results/e2e',
});
