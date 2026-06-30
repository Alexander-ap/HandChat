import { prisma } from '../db'
import { logger } from '../logger'
import { listBookmarkedPosts } from './postService'
import { syncAchievementProgress } from './achievementService'
import { addPoints } from './pointsService'

export interface UserStats {
  postCount: number
  followingCount: number
  followerCount: number
  points: number
  achievementCount: number
  days: number
  loginStreak: number
  totalTranslations: number
  totalOcr: number
  totalSoundDetections: number
}

const ACTION_POINTS: Record<'ocr' | 'sign_language' | 'sound_detection' | 'post' | 'comment', number> = {
  ocr: 2,
  sign_language: 3,
  sound_detection: 2,
  post: 5,
  comment: 2,
}

export async function getProfile(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  })
  if (!profile) {
    return {
      profileExists: false,
      nickname: null,
      avatar: null,
      bio: null,
    }
  }
  return {
    profileExists: true,
    nickname: profile.nickname,
    avatar: profile.avatar,
    bio: profile.bio,
  }
}

export async function updateProfile(
  userId: string,
  data: { nickname?: string; avatar?: string; bio?: string }
) {
  const profile = await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      nickname: data.nickname,
      avatar: data.avatar,
      bio: data.bio,
    },
    update: {
      ...(data.nickname !== undefined && { nickname: data.nickname }),
      ...(data.avatar !== undefined && { avatar: data.avatar }),
      ...(data.bio !== undefined && { bio: data.bio }),
    },
  })
  logger.info('Profile updated', { userId })
  return profile
}

export async function getSettings(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  })
  if (!profile) {
    return {
      notification: true,
      vibration: true,
      language: 'zh-CN',
    }
  }
  return {
    notification: profile.notification,
    vibration: profile.vibration,
    language: profile.language,
  }
}

export async function updateSettings(
  userId: string,
  data: { notification?: boolean; vibration?: boolean; language?: string }
) {
  const profile = await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      notification: data.notification !== undefined ? data.notification : true,
      vibration: data.vibration !== undefined ? data.vibration : true,
      language: data.language || 'zh-CN',
    },
    update: {
      ...(data.notification !== undefined && { notification: data.notification }),
      ...(data.vibration !== undefined && { vibration: data.vibration }),
      ...(data.language !== undefined && { language: data.language }),
    },
  })
  logger.info('Settings updated', { userId })
  return profile
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const achievements = await syncAchievementProgress(userId)
  const [
    postCount,
    followingCount,
    followerCount,
    pointsResult,
    totalTranslations,
    sessions,
    totalOcr,
    totalSoundDetections,
  ] = await Promise.all([
    prisma.post.count({ where: { authorId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.pointsRecord.aggregate({
      where: { userId },
      _sum: { amount: true },
    }),
    prisma.translation.count({
      where: { session: { userId } },
    }),
    prisma.session.findMany({
      where: { userId },
      select: { startedAt: true },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.pointsRecord.count({
      where: { userId, reason: 'ocr' },
    }),
    prisma.pointsRecord.count({
      where: { userId, reason: 'sound_detection' },
    }),
  ])

  const activeDays = new Set(
    sessions.map((item) => item.startedAt.toISOString().slice(0, 10))
  ).size
  const sortedDays = [...new Set(
    sessions.map((item) => item.startedAt.toISOString().slice(0, 10))
  )].sort((a, b) => b.localeCompare(a))

  let loginStreak = 0
  const cursor = new Date()
  while (true) {
    const day = cursor.toISOString().slice(0, 10)
    if (!sortedDays.includes(day)) {
      break
    }
    loginStreak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return {
    postCount,
    followingCount,
    followerCount,
    points: pointsResult._sum.amount || 0,
    achievementCount: achievements.filter((item) => item.unlockedAt).length,
    days: activeDays,
    loginStreak,
    totalTranslations,
    totalOcr,
    totalSoundDetections,
  }
}

export async function getDailyStats(userId: string, days: number = 7) {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const sessions = await prisma.session.findMany({
    where: {
      userId,
      startedAt: { gte: since },
    },
    select: { startedAt: true },
  })

  const dateCounts: Record<string, number> = {}
  for (const s of sessions) {
    const date = s.startedAt.toISOString().slice(0, 10)
    dateCounts[date] = (dateCounts[date] || 0) + 1
  }

  const result: { date: string; count: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const date = d.toISOString().slice(0, 10)
    result.push({ date, count: dateCounts[date] || 0 })
  }

  logger.info('Daily stats fetched', { userId, days })
  return result
}

export async function getUserBasic(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  })
  if (!profile) {
    return { userId, nickname: null, avatar: null }
  }
  logger.info('User basic info fetched', { userId })
  return {
    userId: profile.userId,
    nickname: profile.nickname,
    avatar: profile.avatar,
  }
}

export async function getUserBookmarks(userId: string, limit = 20, offset = 0) {
  const posts = await listBookmarkedPosts(userId, limit, offset)
  logger.info('User bookmarks fetched', { userId, count: posts.length })
  return posts
}

export async function recordUserAction(
  userId: string,
  action: 'ocr' | 'sign_language' | 'sound_detection' | 'post' | 'comment'
) {
  const amount = ACTION_POINTS[action] ?? 0
  if (amount > 0) {
    await addPoints(userId, amount, action)
  }
  const achievements = await syncAchievementProgress(userId)
  return {
    success: true,
    action,
    pointsAwarded: amount,
    achievementsUnlocked: achievements.filter((item) => item.unlockedAt).length,
  }
}
