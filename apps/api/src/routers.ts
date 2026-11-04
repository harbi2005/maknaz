import type { Router } from 'express';

/** Domain module routers registered after authentication + CSRF (filled as modules are added). */
export const extraRouters: Router[] = [];
