import { createApp } from './app.js';
import { config } from './config.js';
import { disconnectDb } from './db.js';
import { logger } from './lib/logger.js';
import { startScheduler } from './modules/scheduler/runner.js';

const cfg = config();
const app = createApp();
const server = app.listen(cfg.PORT, () => {
  logger.info({ port: cfg.PORT, env: cfg.APP_ENV, payments: cfg.PAYMENTS_MODE }, 'MAKNAZ API listening');
});
const stopScheduler = startScheduler(cfg.SCHEDULER_INTERVAL_MS);

async function shutdown() {
  stopScheduler();
  server.close();
  await disconnectDb();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
