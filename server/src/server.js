import { createApp } from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';

async function bootstrap() {
  const app = createApp();

  await connectDatabase();

  const server = app.listen(config.port, () => {
    console.log('');
    console.log('  MERN Social API');
    console.log(`  mode   : ${config.nodeEnv}`);
    console.log(`  api    : http://localhost:${config.port}/api`);
    console.log(`  health : http://localhost:${config.port}/api/health`);
    console.log('');
  });

  // --- Graceful shutdown so Atlas connections close cleanly --------------
  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} received, shutting down...`);

    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });

    // Don't hang forever if a socket refuses to close.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  ['SIGINT', 'SIGTERM'].forEach((signal) => {
    process.on(signal, () => shutdown(signal));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled rejection:', reason);
  });
}

bootstrap().catch((error) => {
  console.error('[server] Failed to start:', error.message);
  process.exit(1);
});
