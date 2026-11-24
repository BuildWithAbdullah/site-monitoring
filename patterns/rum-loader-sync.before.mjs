// Monitoring that makes the number it reports worse.
const AGENT_SRC = 'https://rum.example.com/agent.js';

function loadAgent() {
  const el = document.createElement('script');
  el.src = AGENT_SRC;
  document.head.appendChild(el);
}

loadAgent();

let restored = false;
addEventListener('pageshow', (event) => {
  restored = event.persisted;
});

addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  navigator.sendBeacon('/rum', JSON.stringify({ path: location.pathname, restored }));
});
