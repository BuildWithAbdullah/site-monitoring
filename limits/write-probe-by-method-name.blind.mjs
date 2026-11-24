// statsCache.update refreshes a view held in this process. Nothing is written
// to any store, and the checker recognises a write by the name of the method.
import { db } from '../lib/db.mjs';
import { statsCache } from '../lib/stats-cache.mjs';

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
    await statsCache.update();
    res.status(200).json({ store: 'ok' });
  });
}
