import fs from 'node:fs';
import { defineConfig } from 'vitest/config';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error('TEST_DATABASE_URL is required for API tests (see apps/api/.env.example)');

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Tests share one real PostgreSQL database (ADR-002), so files run sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      APP_ENV: 'test',
      DATABASE_URL: testDb,
      SCHEDULER_INTERVAL_MS: '0',
      LOG_LEVEL: 'silent',
      MEDIA_ROOT: './var/test-media',
    },
  },
});
