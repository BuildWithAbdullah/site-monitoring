// The sessions this drops are the ones that left, which is all of them.
import { collect } from './collect.mjs';

addEventListener('unload', () => {
  navigator.sendBeacon('/rum', JSON.stringify(collect()));
});
