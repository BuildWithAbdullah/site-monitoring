// The catch decides the status code, and the detail goes to the log.
import { db } from '../lib/db.mjs';
import { logger } from '../lib/logger.mjs';

const PROBE_BUDGET_MS = 2000;

export async function GET(request) {
  try {
    await Promise.race([
      db.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), PROBE_BUDGET_MS)),
    ]);
  } catch (cause) {
    logger.warn({ cause }, 'store probe failed');
    return Response.json({ store: 'unreachable' }, { status: 503 });
  }
  return Response.json({ store: 'ok' }, { status: 200 });
}
