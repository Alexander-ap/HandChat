import { prisma } from '../db';
import { logger } from '../logger';

export async function createSession(userId?: string) {
  const session = await prisma.session.create({
    data: { userId },
  });
  logger.info('Session created', { sessionId: session.id });
  return session;
}

export async function endSession(sessionId: string) {
  try {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'ended', endedAt: new Date() },
    });
    logger.info('Session ended', { sessionId });
  } catch (err) {
    logger.error('Failed to end session', { sessionId, error: String(err) });
  }
}

export async function saveTranslation(
  sessionId: string,
  frameId: number,
  text: string,
  confidence: number,
  type: string,
  gestureLabel?: string
) {
  return prisma.translation.create({
    data: { sessionId, frameId, text, confidence, type, gestureLabel },
  });
}

export async function getSession(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
  });
}

export async function getSessionHistory(sessionId: string, limit = 100) {
  return prisma.translation.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getUserSessions(userId: string, limit = 20, offset = 0) {
  return prisma.session.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: limit,
    skip: offset,
    include: {
      translations: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { text: true },
      },
      _count: { select: { translations: true } },
    },
  });
}

export async function getSessionById(sessionId: string, userId: string) {
  return prisma.session.findFirst({
    where: { id: sessionId, userId },
  });
}

export async function getTranslationHistory(sessionId: string, userId: string, limit = 100) {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) return null;

  return prisma.translation.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
