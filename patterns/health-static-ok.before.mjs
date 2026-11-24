// A health endpoint that reports on the one thing the monitor already knows.
import express from 'express';
import { db } from '../lib/db.mjs';

const app = express();

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'storefront' });
});

export { app, db };
