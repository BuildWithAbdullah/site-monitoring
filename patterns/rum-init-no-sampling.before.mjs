// Whatever the vendor default is, that is the rate, and the bill decides it later.
import { monitor } from './vendor/monitor.mjs';

export function startMonitoring(consent) {
  if (!consent.analytics) return;
  monitor.init({ endpoint: '/rum', environment: 'production' });
}
