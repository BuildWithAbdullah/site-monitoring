// Two readings that are both taken at the wrong moment.
let shift = 0;

new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (!entry.hadRecentInput) shift += entry.value;
  }
  navigator.sendBeacon('/rum', JSON.stringify({ metric: 'CLS', value: shift }));
}).observe({ type: 'layout-shift', buffered: true });

new PerformanceObserver((list) => {
  const last = list.getEntries().at(-1);
  navigator.sendBeacon('/rum', JSON.stringify({ metric: 'LCP', value: last.startTime }));
}).observe({ type: 'largest-contentful-paint', buffered: true });
