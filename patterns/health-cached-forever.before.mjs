// A result computed once at boot, and a monitor that cannot get past the gate.
import { db } from '../lib/db.mjs';

const PROBE_BUDGET_MS = 1000;
let cached = null;

export function register(app) {
  app.get('/healthz', async (req, res) => {
    if (!req.headers.authorization) {
      res.status(401).json({ reason: 'token required' });
      return;
    }
    if (cached) {
      res.status(200).json(cached);
      return;
    }
    try {
      await Promise.race([db.ping(), new Promise((_, r) => setTimeout(r, PROBE_BUDGET_MS))]);
    } catch {
      res.status(503).json({ store: 'unreachable' });
      return;
    }
    cached = { store: 'ok' };
    res.status(200).json(cached);
  });
}
