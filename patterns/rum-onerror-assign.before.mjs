// Load order now decides which of two error reporters works.
import { report } from './report.mjs';

window.onerror = function (message, source, lineNumber, columnNumber, error) {
  report({ kind: 'error', message, source, error });
  return false;
};
