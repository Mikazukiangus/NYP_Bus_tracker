import express from 'express';
import { config } from './config/server.ts';
import path from 'path';
import { fileURLToPath } from 'url';
import busArrivalHandler from './api/bus-arrival.ts';
import busRouteHandler from './api/bus-route.ts';
import healthHandler from './api/health.ts';
import weatherHandler from './api/weather.ts';
import trafficIncidentsHandler from './api/traffic-incidents.ts';
import clientErrorsHandler from './api/client-errors.ts';
import { logger } from './security/logger.ts';
import { asyncHandler, errorHandler } from './security/http-errors.ts';
import { createTransportSecurity } from './security/transport.ts';
import { requestLoggingMiddleware } from './server/http/logging.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.server.port;

app.set('trust proxy', config.security.trustedProxyCidrs);
app.use(requestLoggingMiddleware);
app.use(createTransportSecurity({ production: config.server.nodeEnv === 'production' || config.server.vercel, appOrigin: config.security.appOrigin }));
// Business APIs reject bodies; client-errors owns a separate bounded JSON stream reader.
// Do not install a global body parser before these boundary guards.

// API Routes
app.all('/api/health', asyncHandler(healthHandler));

app.all('/api/weather', asyncHandler(weatherHandler));

app.all('/api/bus-arrival', asyncHandler(busArrivalHandler));

app.all('/api/bus-route', asyncHandler(busRouteHandler));

app.all('/api/traffic-incidents', asyncHandler(trafficIncidentsHandler));
app.all('/api/client-errors', asyncHandler(clientErrorsHandler));

// Also support case-insensitive BusArrival
app.all('/api/BusArrival', asyncHandler(busArrivalHandler));

async function startServer() {
  let viteServer: { close(): Promise<void> } | undefined;
  if (config.server.nodeEnv === 'production') {
    // Serve production static assets from dist
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    // In development, mount Vite middleware
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        port: PORT,
        hmr: !config.server.disableHmr,
        watch: config.server.disableHmr ? null : {},
      },
      appType: 'spa',
    });
    viteServer = vite;
    app.use(vite.middlewares);
  }

  app.use(errorHandler);

  app.listen(PORT, config.server.host, () => {
    logger.info('server.started', { host: config.server.host, port: PORT });
  }).on('error', async (error) => {
    logger.error('server.listen_failed', { error });
    try { await viteServer?.close(); }
    catch { logger.error('server.close_failed'); }
    finally { process.exitCode = 1; }
  });
}

startServer().catch((error) => {
  logger.error('server.start_failed', { error });
  process.exitCode = 1;
});
