import { logger } from '../../lib/logger.js';

type Job = () => Promise<unknown>;
const jobs: Job[] = [];

export function registerJob(job: Job) {
  jobs.push(job);
}

export async function runJobsOnce(): Promise<void> {
  for (const job of jobs) await job();
}

/**
 * ADR-006: deadlines are database rows processed by an in-process interval worker.
 * Missed deadlines (server down) are caught up on the first tick (BR-077).
 */
export function startScheduler(intervalMs: number): () => void {
  if (intervalMs <= 0) return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runJobsOnce();
    } catch (err) {
      logger.error({ err }, 'scheduler tick failed');
    } finally {
      running = false;
    }
  };
  void tick();
  const handle = setInterval(tick, intervalMs);
  return () => clearInterval(handle);
}
