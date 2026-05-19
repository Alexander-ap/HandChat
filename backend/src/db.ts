import { PrismaClient } from '@prisma/client';
import { config } from './config';
import { logger } from './logger';

declare global {
  var __handchatPrisma__: PrismaClient | undefined
}

function createPrismaClient() {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: config.databaseUrl,
      },
    },
    log: config.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
  })

  return client
}

export const prisma = globalThis.__handchatPrisma__ || createPrismaClient();

if (config.nodeEnv !== 'production') {
  globalThis.__handchatPrisma__ = prisma
}

prisma.$connect()
  .then(() => {
    logger.info('Prisma connected', { pool: 'supabase-session-pooler' })
  })
  .catch((error) => {
    logger.error('Prisma initial connection failed', { error: error.message })
  })
