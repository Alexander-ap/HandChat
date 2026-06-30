import { prisma } from '../db'
import { logger } from '../logger'

export async function follow(followerId: string, followingId: string) {
  if (followerId === followingId) {
    throw new Error('Cannot follow yourself')
  }
  try {
    const record = await prisma.follow.create({
      data: { followerId, followingId },
    })
    logger.info('Follow created', { followerId, followingId })
    return record
  } catch (err: any) {
    if (err?.code === 'P2002') {
      logger.warn('Follow already exists', { followerId, followingId })
      return null
    }
    throw err
  }
}

export async function unfollow(followerId: string, followingId: string) {
  try {
    const result = await prisma.follow.delete({
      where: { followerId_followingId: { followerId, followingId } },
    })
    logger.info('Follow removed', { followerId, followingId })
    return result
  } catch (err: any) {
    if (err?.code === 'P2025') return null
    throw err
  }
}

export async function getFollowingCount(userId: string) {
  return prisma.follow.count({ where: { followerId: userId } })
}

export async function getFollowerCount(userId: string) {
  return prisma.follow.count({ where: { followingId: userId } })
}

export async function isFollowing(followerId: string, followingId: string) {
  const record = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
  })
  return !!record
}

export async function getFollowingStatus(followerId: string, followingIds: string[]) {
  const uniqueIds = [...new Set(followingIds.filter((id) => id && id !== followerId))]
  if (uniqueIds.length === 0) return new Set<string>()

  const records = await prisma.follow.findMany({
    where: {
      followerId,
      followingId: { in: uniqueIds },
    },
    select: { followingId: true },
  })

  return new Set(records.map((item) => item.followingId))
}

export async function getFollowingList(userId: string, limit = 20, offset = 0) {
  return prisma.follow.findMany({
    where: { followerId: userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  })
}

export async function getFollowerList(userId: string, limit = 20, offset = 0) {
  return prisma.follow.findMany({
    where: { followingId: userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  })
}
