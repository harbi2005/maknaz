/**
 * Local PostgreSQL 16 for development and tests, for machines without Docker or a
 * system PostgreSQL. Data lives in apps/api/var/pgdata (git-ignored).
 *
 * Usage: npm run db:start   (keeps running until Ctrl+C)
 *
 * Any real PostgreSQL 16 works too: just point DATABASE_URL at it and skip this script.
 */
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../var/pgdata');

const url = new URL(process.env.DATABASE_URL ?? 'postgresql://maknaz:maknaz-local-only@localhost:5433/maknaz');
const port = Number(url.port || 5432);
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const databases = [url.pathname.slice(1), `${url.pathname.slice(1)}_test`];

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user,
  password,
  port,
  persistent: true,
  // UTF-8 is required for Arabic text; Windows would otherwise default to WIN1252.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: (e) => console.error('[postgres]', e),
});

const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
if (firstRun) {
  console.log(`Initialising PostgreSQL cluster in ${dataDir}`);
  await pg.initialise();
}
await pg.start();
for (const db of databases) {
  try {
    await pg.createDatabase(db);
    console.log(`Created database ${db}`);
  } catch {
    // already exists
  }
}
console.log(`PostgreSQL ready on port ${port} (databases: ${databases.join(', ')}). Press Ctrl+C to stop.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
