// The final value, reported once, with restores kept out of the load numbers.
let shift = 0;
let largest = 0;
let restored = false;
let sent = false;

addEventListener('pageshow', (event) => {
  restored = event.persisted;
});

new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (!entry.hadRecentInput) shift += entry.value;
  }
}).observe({ type: 'layout-shift', buffered: true });

new PerformanceObserver((list) => {
  largest = list.getEntries().at(-1).startTime;
}).observe({ type: 'largest-contentful-paint', buffered: true });

addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden' || sent) return;
  sent = true;
  navigator.sendBeacon('/rum', JSON.stringify({
    kind: restored ? 'restore' : 'load',
    cls: shift,
    lcp: largest,
  }));
});
