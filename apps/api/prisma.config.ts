import { defineConfig } from 'prisma/config';
import fs from 'node:fs';

// Prisma 7 does not load .env automatically; use Node's built-in loader when present.
if (fs.existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
