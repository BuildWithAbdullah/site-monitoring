// The same handler written as code.
export function register(app) {
  app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });
}
