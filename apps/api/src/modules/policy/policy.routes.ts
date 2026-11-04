import { Router } from 'express';
import { currentPolicy } from './policy.js';

export const policyRouter = Router();

/** P-73: read-only current policy. There is no endpoint to edit it in the MVP (BR-075). */
policyRouter.get('/policies/current', async (_req, res) => {
  const p = await currentPolicy();
  res.json({ version_no: p.version_no, effective_from: p.effective_from.toISOString(), values: p.values });
});
