// Two problems, and the second one is the kind that only shows up on the bill.
import { db } from '../lib/db.mjs';

export function register(app) {
  app.get('/healthz', async (req, res) => {
    await db.query('select 1');
    await db.insert('health_pings', { at: new Date() });
    res.status(200).json({ store: 'ok' });
  });
}
