// The same handler with the in-process refresh moved off the request path.
import { db } from '../lib/db.mjs';

const PROBE_BUDGET_MS = 1500;

function bounded(promise, ms) {
  let timer;
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('probe timed out')), ms);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

export function register(app) {
  app.get('/healthz', async (req, res) => {
    try {
      await bounded(db.ping(), PROBE_BUDGET_MS);
    } catch {
      res.status(503).json({ store: 'unreachable' });
      return;
    }
    res.status(200).json({ store: 'ok' });
  });
}
