import { prisma } from '../db'
import { logger } from '../logger'

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

export async function getProfile(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  })
  if (!profile) {
    return {
      nickname: null,
      avatar: null,
      bio: null,
    }
  }
  return {
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
  const [
    postCount,
    followingCount,
    followerCount,
    pointsResult,
    achievementCount,
    totalTranslations,
    sessionCount,
  ] = await Promise.all([
    prisma.post.count({ where: { authorId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.pointsRecord.aggregate({
      where: { userId },
      _sum: { amount: true },
    }),
    prisma.userAchievement.count({ where: { userId } }),
    prisma.translation.count({
      where: { session: { userId } },
    }),
    prisma.session.count({
      where: { userId },
    }),
  ])

  return {
    postCount,
    followingCount,
    followerCount,
    points: pointsResult._sum.amount || 0,
    achievementCount,
    days: sessionCount,
    loginStreak: 1,
    totalTranslations,
    totalOcr: 0,
    totalSoundDetections: 0,
  }
}
