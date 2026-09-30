import { config } from './config.js';
import { prisma } from './db.js';
import { createApp } from './app.js';
import { ensureUploadDir } from './services/images.js';

await ensureUploadDir();
const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(`✓ Outil devis à l’écoute sur http://${config.host}:${config.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} reçu, arrêt…`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
