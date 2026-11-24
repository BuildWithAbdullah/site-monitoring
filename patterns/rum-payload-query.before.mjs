// Whatever the site puts in a query string is now in the monitoring store.
import { monitor } from './vendor/monitor.mjs';
import { BUILD_ID } from './build.mjs';

export function startMonitoring(consent) {
  if (!consent.analytics) return;
  monitor.init({
    endpoint: '/rum',
    sampleRate: 0.2,
    release: BUILD_ID,
    context: { url: location.href },
  });
}
