import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger, genReqId } from '../lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildServer(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({
    logger: false,
    genReqId: () => genReqId(),
  });

  // CORS: allow Vercel frontend when CORS_ORIGIN is set (e.g. https://your-app.vercel.app)
  const corsOrigin = process.env.CORS_ORIGIN;
  await app.register(cors, {
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : process.env.NODE_ENV === 'production' ? false : true,
  });

  app.addHook('onRequest', (req, _reply, done) => {
    const reqId = req.id;
    const log = logger.child({ component: 'api', reqId });
    (req as unknown as Record<string, unknown>)['log'] = log;
    log.debug({ method: req.method, url: req.url, ip: req.ip }, 'Request started');
    done();
  });

  app.addHook('onResponse', (req, reply, done) => {
    const log = (req as unknown as Record<string, unknown>)['log'] as typeof logger | undefined;
    (log ?? logger).info(
      { method: req.method, url: req.url, statusCode: reply.statusCode, responseMs: Math.round(reply.elapsedTime) },
      `${req.method} ${req.url} ${reply.statusCode} ${Math.round(reply.elapsedTime)}ms`
    );
    done();
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, req, reply) => {
    const log = (req as unknown as Record<string, unknown>)['log'] as typeof logger | undefined;
    (log ?? logger).error({ err: error, method: req.method, url: req.url }, 'Request error');
    reply.status(error.statusCode ?? 500).send({
      error: error.message,
      statusCode: error.statusCode ?? 500,
    });
  });

  await app.register(import('./routes/health.js'), { prefix: '/api' });
  await app.register(import('./routes/quotes.js'), { prefix: '/api' });
  await app.register(import('./routes/matrix.js'), { prefix: '/api' });
  await app.register(import('./routes/opportunities.js'), { prefix: '/api' });

  if (process.env.NODE_ENV === 'production') {
    const frontendDist = join(__dirname, '../../frontend/dist');
    await app.register(fastifyStatic, { root: frontendDist, prefix: '/' });
    app.setNotFoundHandler((_req, reply) => {
      reply.sendFile('index.html');
    });
  }

  return app;
}
