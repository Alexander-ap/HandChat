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

interface AchievementMetrics {
  postCount: number
  activeDays: number
  totalTranslations: number
  totalSoundDetections: number
  totalLikesReceived: number
}

interface AchievementRuleResult {
  progress: number
  unlocked: boolean
}

function buildProgress(current: number, target: number): AchievementRuleResult {
  const safeCurrent = Math.max(0, current)
  const safeTarget = Math.max(1, target)
  return {
    progress: Math.min(100, Math.round((safeCurrent / safeTarget) * 100)),
    unlocked: safeCurrent >= safeTarget,
  }
}

const ACHIEVEMENT_RULES: Record<string, (metrics: AchievementMetrics) => AchievementRuleResult> = {
  '初识手语': (metrics) => buildProgress(metrics.totalTranslations, 1),
  '交流达人': (metrics) => buildProgress(metrics.postCount, 10),
  '坚持不懈': (metrics) => buildProgress(metrics.activeDays, 7),
  '聆听者': (metrics) => buildProgress(metrics.totalSoundDetections, 50),
  '社区明星': (metrics) => buildProgress(metrics.totalLikesReceived, 100),
  '手语大师': (metrics) => buildProgress(metrics.totalTranslations, 50),
}

const ACHIEVEMENT_RULES_BY_ORDER: Record<number, (metrics: AchievementMetrics) => AchievementRuleResult> = {
  1: (metrics) => buildProgress(metrics.totalTranslations, 1),
  2: (metrics) => buildProgress(metrics.postCount, 10),
  3: (metrics) => buildProgress(metrics.activeDays, 7),
  4: (metrics) => buildProgress(metrics.totalSoundDetections, 50),
  5: (metrics) => buildProgress(metrics.totalLikesReceived, 100),
  6: (metrics) => buildProgress(metrics.totalTranslations, 50),
}

function resolveAchievementRule(achievement: CachedAchievement) {
  return ACHIEVEMENT_RULES[achievement.name] ?? ACHIEVEMENT_RULES_BY_ORDER[achievement.sortOrder]
}

async function getAchievementMetrics(userId: string): Promise<AchievementMetrics> {
  const [
    postCount,
    totalTranslations,
    soundDetectionCount,
    sessions,
    likesAggregate,
  ] = await Promise.all([
    prisma.post.count({ where: { authorId: userId } }),
    prisma.translation.count({
      where: { session: { userId } },
    }),
    prisma.pointsRecord.count({
      where: { userId, reason: 'sound_detection' },
    }),
    prisma.session.findMany({
      where: { userId },
      select: { startedAt: true },
    }),
    prisma.post.aggregate({
      where: { authorId: userId },
      _sum: { likes: true },
    }),
  ])

  return {
    postCount,
    activeDays: new Set(sessions.map((item) => item.startedAt.toISOString().slice(0, 10))).size,
    totalTranslations,
    totalSoundDetections: soundDetectionCount,
    totalLikesReceived: likesAggregate._sum.likes || 0,
  }
}

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
  return syncAchievementProgress(userId)
}

export async function syncAchievementProgress(userId: string): Promise<AchievementWithProgress[]> {
  const [achievements, userProgress, metrics] = await Promise.all([
    getCachedAchievements(),
    prisma.userAchievement.findMany({
      where: { userId },
      select: { id: true, achievementId: true, unlockedAt: true, progress: true },
    }),
    getAchievementMetrics(userId),
  ])

  const progressMap = new Map(userProgress.map((item) => [item.achievementId, item]))
  const now = new Date()

  const results = await Promise.all(
    achievements.map(async (achievement) => {
      const rule = resolveAchievementRule(achievement)
      const computed = rule ? rule(metrics) : { progress: 0, unlocked: false }
      const existing = progressMap.get(achievement.id)
      const shouldCreate = !existing
      const shouldUpdate =
        Boolean(existing) &&
        (existing!.progress !== computed.progress ||
          (computed.unlocked && !existing!.unlockedAt) ||
          (!computed.unlocked && Boolean(existing!.unlockedAt)))

      let unlockedAt = existing?.unlockedAt ?? null

      if (shouldCreate) {
        const created = await prisma.userAchievement.create({
          data: {
            userId,
            achievementId: achievement.id,
            progress: computed.progress,
            unlockedAt: computed.unlocked ? now : null,
          },
        })
        unlockedAt = created.unlockedAt
        if (computed.unlocked) {
          logger.info('Achievement unlocked', { userId, achievementId: achievement.id, name: achievement.name })
        }
      } else if (shouldUpdate) {
        const updated = await prisma.userAchievement.update({
          where: { id: existing!.id },
          data: {
            progress: computed.progress,
            unlockedAt: computed.unlocked ? (existing!.unlockedAt ?? now) : null,
          },
        })
        unlockedAt = updated.unlockedAt
        if (computed.unlocked && !existing!.unlockedAt) {
          logger.info('Achievement unlocked', { userId, achievementId: achievement.id, name: achievement.name })
        }
      }

      return {
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        sortOrder: achievement.sortOrder,
        unlockedAt: unlockedAt?.toISOString() ?? null,
        progress: computed.progress,
      }
    })
  )

  return results.sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function unlockAchievement(userId: string, achievementId: string) {
  try {
    const record = await prisma.userAchievement.create({
      data: { userId, achievementId, unlockedAt: new Date(), progress: 100 },
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
  return prisma.userAchievement.count({ where: { userId, unlockedAt: { not: null } } })
}
