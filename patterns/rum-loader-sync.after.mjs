// The agent is fetched out of the critical path.
const AGENT_SRC = 'https://rum.example.com/agent.js';

function loadAgent() {
  const el = document.createElement('script');
  el.src = AGENT_SRC;
  el.async = true;
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
