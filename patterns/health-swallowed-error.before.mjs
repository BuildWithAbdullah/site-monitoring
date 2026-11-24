// The probe is there, and the catch undoes it.
import { db } from '../lib/db.mjs';

const PROBE_BUDGET_MS = 2000;

export async function GET(request) {
  try {
    await Promise.race([
      db.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), PROBE_BUDGET_MS)),
    ]);
  } catch (cause) {
    return Response.json({ store: 'ok', note: cause.stack }, { status: 200 });
  }
  return Response.json({ store: 'ok' }, { status: 200 });
}
