import { makeServer } from '../testServer';

const PORT = Number(process.env.PORT ?? 3101);
const HOST = process.env.HOST ?? '0.0.0.0';

(async () => {
  const server = await makeServer(); // Node http.Server from Fastify
  server.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`[playlist-manager] API listening on http://${HOST}:${PORT}`);
  });
})();
