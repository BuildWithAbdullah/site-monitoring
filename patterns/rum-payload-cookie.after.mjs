// An identifier the page made up, and a hook that drops what it does not know.
import { reporter } from './vendor/reporter.mjs';
import { BUILD_ID } from './build.mjs';

const KEEP = new Set(['release', 'kind', 'path', 'session']);

export function startErrorReporting(consent, dsn, sessionId) {
  if (!consent.analytics) return;
  reporter.init({
    dsn,
    sampleRate: 0.5,
    release: BUILD_ID,
    tags: { session: sessionId },
    beforeSend(event) {
      const kept = {};
      for (const key of Object.keys(event)) {
        if (KEEP.has(key)) kept[key] = event[key];
      }
      return kept;
    },
  });
}
