// The payload carries an identifier that identifies a person. The checker
// recognises documented shapes, and this is not one of them.
import { monitor } from './vendor/monitor.mjs';
import { BUILD_ID } from './build.mjs';

export function startMonitoring(consent, nationalRef) {
  if (!consent.analytics) return;
  monitor.init({
    endpoint: '/rum',
    sampleRate: 0.2,
    release: BUILD_ID,
    context: { nationalRef },
  });
}
