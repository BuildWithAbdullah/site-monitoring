// This handler does probe its dependencies. It calls a wrapper, and the name of
// the wrapper is not one the checker recognises as a probe.
import { probeEverything } from '../lib/probes.mjs';

export function register(app) {
  app.get('/healthz', async (req, res) => {
    const states = await probeEverything({ budgetMs: 1500 });
    const worst = states.some((s) => s.state !== 'ok') ? 503 : 200;
    res.status(worst).json({ parts: states.length });
  });
}
