// Hidden is the event that fires on a phone, and on a page going into the cache.
import { collect } from './collect.mjs';

let sent = false;

addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden' || sent) return;
  sent = true;
  navigator.sendBeacon('/rum', JSON.stringify(collect()));
});
