import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { v7 as uuidv7 } from 'uuid';
import { AppError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { loadSession, requireAuthentication, requireCsrf } from './middleware/session.js';
import { authRouter } from './modules/accounts/auth.routes.js';
import { organizationsRouter } from './modules/accounts/organizations.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { policyRouter } from './modules/policy/policy.routes.js';
import { sitesRouter } from './modules/sites/sites.routes.js';
import { extraRouters } from './routers.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  // SR-12: security headers. The API serves JSON only, so the CSP is maximally strict.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      referrerPolicy: { policy: 'same-origin' },
    }),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    req.requestId = uuidv7();
    res.set('X-Request-Id', req.requestId);
    next();
  });
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as Request).requestId,
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const api = express.Router();
  api.use(express.json({ limit: '1mb' }));
  api.use(cookieParser());
  api.use(loadSession);

  // SR-05: general write rate limit per IP.
  api.use(
    rateLimit({
      windowMs: 60_000,
      limit: process.env.APP_ENV === 'test' ? 100_000 : 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (req) => req.method === 'GET',
      handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'طلبات كثيرة، حاول بعد دقيقة.')),
    }),
  );

  // Public endpoints (SR-01 exceptions): register, login, logout.
  api.use(authRouter);
  api.use(requireAuthentication);
  api.use(requireCsrf);
  api.use(organizationsRouter);
  api.use(sitesRouter);
  api.use(notificationsRouter);
  api.use(policyRouter);
  for (const r of extraRouters) api.use(r);
  api.use(adminRouter);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
