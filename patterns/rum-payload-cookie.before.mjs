// A performance tool that has quietly become a data processor.
import { reporter } from './vendor/reporter.mjs';
import { BUILD_ID } from './build.mjs';

export function startErrorReporting(consent, dsn) {
  if (!consent.analytics) return;
  reporter.init({
    dsn,
    sampleRate: 0.5,
    release: BUILD_ID,
    tags: { session: document.cookie },
  });
}
