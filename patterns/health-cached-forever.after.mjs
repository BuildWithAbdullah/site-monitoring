// A cache with something that can expire it, and a public minimal answer.
import { db } from '../lib/db.mjs';

const PROBE_BUDGET_MS = 1000;
const CACHE_TTL_MS = 5000;
let cached = null;

export function register(app) {
  app.get('/healthz', async (req, res) => {
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      res.status(cached.code).json(cached.body);
      return;
    }
    try {
      await Promise.race([db.ping(), new Promise((_, r) => setTimeout(r, PROBE_BUDGET_MS))]);
    } catch {
      cached = { at: Date.now(), code: 503, body: { store: 'unreachable' } };
      res.status(503).json(cached.body);
      return;
    }
    cached = { at: Date.now(), code: 200, body: { store: 'ok' } };
    res.status(200).json(cached.body);
  });
}
