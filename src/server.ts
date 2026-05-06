import cors from '@fastify/cors';
import Fastify from 'fastify';
import { env } from './config/env.js';
import { generateRoutes } from './routes/generate.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { telegramRoutes } from './routes/telegram.routes.js';

export async function buildServer() {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: false
  });

  await app.register(healthRoutes);
  await app.register(generateRoutes);
  await app.register(telegramRoutes);

  app.setErrorHandler((error, _request, reply) => {
    const message = error instanceof Error ? error.message : 'Internal server error';
    app.log.error(error);
    reply.code(500).send({
      ok: false,
      error: message
    });
  });

  return app;
}

const app = await buildServer();

try {
  await app.listen({
    port: env.PORT,
    host: '0.0.0.0'
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
