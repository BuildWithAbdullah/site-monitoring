// The last measurement of the session, cancelled with the document.
import { collect } from './collect.mjs';

addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  fetch('/rum', { method: 'POST', body: JSON.stringify(collect()) });
});
