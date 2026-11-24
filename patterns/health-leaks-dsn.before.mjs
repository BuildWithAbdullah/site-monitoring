// Everything an attacker needs, served to anybody who asks, on an interval.
import { db } from '../lib/db.mjs';

const PROBE_BUDGET_MS = 1000;

export function register(app, config) {
  app.get('/healthz', async (req, res) => {
    try {
      await Promise.race([db.ping(), new Promise((_, r) => setTimeout(r, PROBE_BUDGET_MS))]);
    } catch {
      res.status(503).json({ store: 'unreachable' });
      return;
    }
    res.status(200).json({ store: 'ok', connectionString: config.databaseUrl });
  });
}
