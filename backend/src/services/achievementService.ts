import { prisma } from '../db'
import { logger } from '../logger'

export interface AchievementWithProgress {
  id: string
  name: string
  description: string
  icon: string
  sortOrder: number
  unlockedAt: string | null
  progress: number
}

interface CachedAchievement {
  id: string
  name: string
  description: string
  icon: string
  sortOrder: number
}

let achievementCache: CachedAchievement[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000

async function getCachedAchievements(): Promise<CachedAchievement[]> {
  if (achievementCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return achievementCache
  }
  achievementCache = await prisma.achievement.findMany({
    select: { id: true, name: true, description: true, icon: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  })
  cacheTimestamp = Date.now()
  return achievementCache
}

export async function listAchievements(userId: string): Promise<AchievementWithProgress[]> {
  const [achievements, userProgress] = await Promise.all([
    getCachedAchievements(),
    prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true, unlockedAt: true, progress: true },
    }),
  ])

  const progressMap = new Map(userProgress.map(p => [p.achievementId, p]))

  return achievements.map((a) => {
    const ua = progressMap.get(a.id)
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      sortOrder: a.sortOrder,
      unlockedAt: ua?.unlockedAt?.toISOString() ?? null,
      progress: ua?.progress ?? 0,
    }
  })
}

export async function unlockAchievement(userId: string, achievementId: string) {
  try {
    const record = await prisma.userAchievement.create({
      data: { userId, achievementId },
    })
    logger.info('Achievement unlocked', { userId, achievementId })
    return record
  } catch (err: any) {
    if (err?.code === 'P2002') {
      logger.warn('Achievement already unlocked', { userId, achievementId })
      return null
    }
    throw err
  }
}

export async function getUserAchievementCount(userId: string) {
  return prisma.userAchievement.count({ where: { userId } })
}
