import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import busArrivalHandler from './api/bus-arrival.ts';
import healthHandler from './api/health.ts';
import weatherHandler from './api/weather.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// API Routes
app.all('/api/health', (req, res) => {
  return healthHandler(req, res);
});

app.all('/api/weather', (req, res) => {
  return weatherHandler(req, res);
});

app.all('/api/bus-arrival', (req, res) => {
  return busArrivalHandler(req, res);
});

// Also support case-insensitive BusArrival
app.all('/api/BusArrival', (req, res) => {
  return busArrivalHandler(req, res);
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
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
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
