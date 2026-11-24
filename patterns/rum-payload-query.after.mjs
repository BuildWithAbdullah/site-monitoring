// The path, which is what a performance question actually needs.
import { monitor } from './vendor/monitor.mjs';
import { BUILD_ID } from './build.mjs';

export function startMonitoring(consent) {
  if (!consent.analytics) return;
  monitor.init({
    endpoint: '/rum',
    sampleRate: 0.2,
    release: BUILD_ID,
    context: { path: location.pathname },
  });
}
