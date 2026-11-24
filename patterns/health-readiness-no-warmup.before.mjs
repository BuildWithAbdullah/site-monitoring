// Ready the instant the process can answer a socket.
import { db } from '../lib/db.mjs';

const PROBE_BUDGET_MS = 1000;

export function register(app) {
  app.get('/readyz', async (req, res) => {
    try {
      await Promise.race([db.ping(), new Promise((_, r) => setTimeout(r, PROBE_BUDGET_MS))]);
    } catch {
      res.status(503).json({ store: 'unreachable' });
      return;
    }
    res.status(200).json({ store: 'ok' });
  });
}
