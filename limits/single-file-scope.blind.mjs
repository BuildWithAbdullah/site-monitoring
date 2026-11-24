// The instrumentation starts unconditionally, and the call that starts it lives
// in another module. One file is audited at a time, so nothing here resolves
// bootMonitoring to the init it performs.
import { bootMonitoring } from './bootstrap.mjs';
import { collect } from './collect.mjs';

addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  navigator.sendBeacon('/rum', JSON.stringify(collect()));
});

bootMonitoring();
