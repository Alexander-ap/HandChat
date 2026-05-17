import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from './config';
import { logger } from './logger';
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
  origin: config.nodeEnv === 'production'
    ? ['https://handchat.vercel.app']
    : config.corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', time: Date.now() }));
app.use('/api/sessions', sessionRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/user', userRoutes);
app.use('/api/user', followRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/points', pointsRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled API error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
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
