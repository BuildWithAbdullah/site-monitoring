// The same endpoint, answering the question the monitor is actually asking.
import express from 'express';
import { db } from '../lib/db.mjs';

const app = express();
const PROBE_BUDGET_MS = 2000;

function withTimeout(promise, ms) {
  let timer;
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('probe timed out')), ms);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

app.get('/healthz', async (req, res) => {
  try {
    await withTimeout(db.ping(), PROBE_BUDGET_MS);
  } catch (cause) {
    req.log.warn({ cause }, 'health probe failed');
    res.status(503).json({ store: 'unavailable' });
    return;
  }
  res.status(200).json({ store: 'ok' });
});

export { app, db };
