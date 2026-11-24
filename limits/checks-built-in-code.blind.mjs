// The check list is assembled here rather than declared, so area B never sees
// it. Every one of these checks is missing a timeout.
const PAGES = ['/', '/collections/all', '/pages/delivery'];

export function buildChecks(origin) {
  return PAGES.map((path) => ({
    id: path === '/' ? 'home' : path.slice(1).replace(/\//g, '-'),
    url: `${origin}${path}`,
    intervalMs: 60000,
    expectStatus: [200],
  }));
}
