import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto'
import { config } from './config';
import { logger } from './logger';
import { AppError, sendError } from './http';
import { createRateLimit } from './middleware/rateLimit';
import { handleConnection } from './wsRouter';
import sessionRoutes from './routes/sessionRoutes';
import postRoutes from './routes/postRoutes';
import followRoutes from './routes/followRoutes';
import achievementRoutes from './routes/achievementRoutes';
import pointsRoutes from './routes/pointsRoutes';
import userRoutes from './routes/userRoutes';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = config.nodeEnv === 'production'
      ? ['https://handchat.vercel.app']
      : config.corsOrigins;
    const requestOrigin = origin ?? '';
    const isLocalDevOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/i.test(requestOrigin);

    // Allow non-browser clients and same-machine local development hosts.
    if (!origin || allowedOrigins.includes(origin) || isLocalDevOrigin) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID()
  const start = Date.now()
  logger.info('HTTP request started', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
  })
  res.on('finish', () => {
    logger.info('HTTP request finished', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
    })
  })
  next()
});
app.use('/api', createRateLimit('api-global', 240, 60 * 1000))

app.get('/health', (_req, res) => res.json({ status: 'ok', time: Date.now() }));
app.use('/api/sessions', sessionRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/user', userRoutes);
app.use('/api/user', followRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/points', pointsRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const req = _req
  const appError = err instanceof AppError ? err : null
  logger.error('Unhandled API error', {
    requestId: req.requestId,
    error: err.message,
    stack: err.stack,
    code: appError?.code || 'INTERNAL_ERROR',
  });
  sendError(
    res,
    req,
    appError?.status || 500,
    appError?.code || 'INTERNAL_ERROR',
    appError?.message || (config.nodeEnv === 'development' ? err.message : 'Internal server error'),
    appError?.details
  );
});

wss.on('connection', (ws: WebSocket & { isAlive?: boolean }) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  handleConnection(ws);
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((ws: WebSocket & { isAlive?: boolean }) => {
    if (!ws.isAlive) {
      logger.warn('Heartbeat timeout, terminating connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

server.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`, { env: config.nodeEnv });
});
