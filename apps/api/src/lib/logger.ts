import { pino } from 'pino';

// Structured JSON logs. Redaction keeps credentials and session tokens out of logs (SR-14).
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.APP_ENV === 'test' ? 'silent' : 'info'),
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.password_hash',
      '*.token',
    ],
    censor: '[redacted]',
  },
});
