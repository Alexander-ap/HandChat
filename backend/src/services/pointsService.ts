import { prisma } from '../db'
import { logger } from '../logger'

export async function getBalance(userId: string) {
  const [balanceResult, earnedResult] = await Promise.all([
    prisma.pointsRecord.aggregate({
      where: { userId },
      _sum: { amount: true },
    }),
    prisma.pointsRecord.aggregate({
      where: { userId, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
  ])
  return {
    balance: balanceResult._sum.amount || 0,
    totalEarned: earnedResult._sum.amount || 0,
  }
}

export async function addPoints(userId: string, amount: number, reason: string) {
  const record = await prisma.pointsRecord.create({
    data: { userId, amount, reason },
  })
  logger.info('Points added', { userId, amount, reason })
  return record
}

export async function getHistory(userId: string, limit = 20, offset = 0) {
  return prisma.pointsRecord.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  })
}

export async function getHistoryTotal(userId: string) {
  return prisma.pointsRecord.count({ where: { userId } })
}
