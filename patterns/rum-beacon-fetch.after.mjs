// A request marked to outlive the page that made it.
import { collect } from './collect.mjs';

addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  fetch('/rum', { method: 'POST', body: JSON.stringify(collect()), keepalive: true });
});
