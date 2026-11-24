// Queued in memory until somebody has answered.
import { monitor } from './vendor/monitor.mjs';
import { BUILD_ID } from './build.mjs';
import { onConsentChange } from './consent.mjs';

onConsentChange((granted) => {
  if (!granted.analytics) return;
  monitor.init({ endpoint: '/rum', sampleRate: 0.2, release: BUILD_ID });
});
