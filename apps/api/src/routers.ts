import type { Router } from 'express';
import { billingRouter } from './modules/billing/billing.routes.js';
import { carriersRouter } from './modules/carriers/carriers.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { quotesRouter } from './modules/logistics/quotes.routes.js';
import { shipmentsRouter } from './modules/logistics/shipments.routes.js';
import './modules/scheduler/processor.js';
import { dealsRouter } from './modules/trading/deals.routes.js';
import { offersRouter } from './modules/trading/offers.routes.js';

/** Domain module routers registered after authentication + CSRF. */
export const extraRouters: Router[] = [
  catalogRouter,
  offersRouter,
  dealsRouter,
  carriersRouter,
  quotesRouter,
  shipmentsRouter,
  billingRouter,
];
