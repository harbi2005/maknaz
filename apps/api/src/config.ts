import { z } from 'zod';

const schema = z.object({
  APP_ENV: z.enum(['development', 'test', 'demo', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  APP_SECRET_KEY: z.string().min(16, 'APP_SECRET_KEY must be at least 16 characters'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PAYMENTS_MODE: z.literal('simulation', { error: 'PAYMENTS_MODE must be "simulation" in the MVP' }).default('simulation'),
  MEDIA_ROOT: z.string().default('./var/media'),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().max(300).default(300),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(0).default(60000),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function config(): Config {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`Invalid environment configuration:\n${msg}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Secure cookies everywhere except local HTTP development and tests. */
export function cookiesSecure(): boolean {
  const env = config().APP_ENV;
  return env !== 'development' && env !== 'test';
}
