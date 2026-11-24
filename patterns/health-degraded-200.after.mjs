// The worst dependency state chooses the status code.
import { db, search } from '../lib/db.mjs';

const PROBE_BUDGET_MS = 1200;

function bounded(promise, ms) {
  let timer;
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('probe timed out')), ms);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

export function register(app) {
  app.get('/healthz', async (req, res) => {
    const parts = {};
    let worst = 200;
    try {
      await bounded(db.ping(), PROBE_BUDGET_MS);
      parts.store = 'ok';
    } catch {
      parts.store = 'unreachable';
      worst = 503;
    }
    try {
      await bounded(search.ping(), PROBE_BUDGET_MS);
      parts.search = 'ok';
    } catch {
      parts.search = 'unreachable';
      worst = 503;
    }
    res.status(worst).json(parts);
  });
}
