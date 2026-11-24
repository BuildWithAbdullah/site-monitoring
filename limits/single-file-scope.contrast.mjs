// The same unconditional start, written in the file that performs it.
import { monitor } from './vendor/monitor.mjs';
import { BUILD_ID } from './build.mjs';
import { collect } from './collect.mjs';

addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  navigator.sendBeacon('/rum', JSON.stringify(collect()));
});

monitor.init({ endpoint: '/rum', sampleRate: 0.2, release: BUILD_ID });
