// A rate chosen on purpose, and a build you can tie a spike to.
import { monitor } from './vendor/monitor.mjs';

const SAMPLE_RATE = 0.2;

export function startMonitoring(consent, buildId) {
  if (!consent.analytics) return;
  monitor.init({
    endpoint: '/rum',
    environment: 'production',
    sampleRate: SAMPLE_RATE,
    release: buildId,
  });
}
