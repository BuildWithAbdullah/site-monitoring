// Ready once the caches and the pool exist.
import { db } from '../lib/db.mjs';
import { state } from '../lib/state.mjs';

const PROBE_BUDGET_MS = 1000;

export function register(app) {
  app.get('/readyz', async (req, res) => {
    if (!state.warm) {
      res.status(503).json({ phase: 'warming' });
      return;
    }
    try {
      await Promise.race([db.ping(), new Promise((_, r) => setTimeout(r, PROBE_BUDGET_MS))]);
    } catch {
      res.status(503).json({ store: 'unreachable' });
      return;
    }
    res.status(200).json({ store: 'ok' });
  });
}
