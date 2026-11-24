// Both reporters work, and the failures that are rejections are captured too.
import { report } from './report.mjs';

addEventListener('error', (event) => {
  report({ kind: 'error', message: event.message, source: event.filename, error: event.error });
});

addEventListener('unhandledrejection', (event) => {
  report({ kind: 'rejection', reason: event.reason });
});
