import { createServer } from 'vite';

async function start() {
  const server = await createServer({
    configFile: './vite.config.js',
    server: { port: 3040, host: '0.0.0.0' },
  });
  await server.listen();
  server.printUrls();
  setInterval(() => {}, 3600_000);
}

start().catch((err) => {
  console.error('[DEV-SERVER] Failed to start:', err);
  process.exit(1);
});
