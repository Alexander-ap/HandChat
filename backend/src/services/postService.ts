import { prisma } from '../db'
import { logger } from '../logger'

export interface CreatePostInput {
  title: string
  content: string
  authorId: string
}

export async function createPost(input: CreatePostInput) {
  const post = await prisma.post.create({
    data: {
      title: input.title,
      content: input.content,
      authorId: input.authorId,
    },
  })
  logger.info('Post created', { postId: post.id, authorId: input.authorId })
  return post
}

const postListInclude = {
  _count: { select: { comments: true } },
  comments: {
    orderBy: { createdAt: 'asc' as const },
    take: 3,
    select: {
      id: true,
      content: true,
      authorId: true,
      createdAt: true,
    },
  },
}

export async function listPosts(limit = 20, offset = 0) {
  return prisma.post.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    include: postListInclude,
  })
}

export async function getPostById(postId: string) {
  return prisma.post.findUnique({
    where: { id: postId },
    include: {
      ...postListInclude,
      comments: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          content: true,
          authorId: true,
          createdAt: true,
        },
      },
    },
  })
}

export async function updatePost(postId: string, userId: string, data: { title: string; content: string }) {
  const result = await prisma.post.updateMany({
    where: { id: postId, authorId: userId },
    data: {
      title: data.title,
      content: data.content,
    },
  })
  if (result.count === 0) return null
  logger.info('Post updated', { postId, userId })
  return getPostById(postId)
}

export async function deletePost(postId: string, userId: string) {
  const result = await prisma.post.deleteMany({
    where: { id: postId, authorId: userId },
  })
  if (result.count === 0) return null
  logger.info('Post deleted', { postId, userId })
  return { id: postId }
}

export async function toggleLike(postId: string, userId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, likes: true },
  })
  if (!post) return null

  const existing = await prisma.like.findUnique({
    where: { userId_postId: { userId, postId } },
  })

  if (existing) {
    const [, updated] = await prisma.$transaction([
      prisma.like.delete({
        where: { userId_postId: { userId, postId } },
      }),
      prisma.post.update({
        where: { id: postId },
        data: { likes: { decrement: 1 } },
        select: { likes: true },
      }),
    ])
    logger.info('Like removed', { userId, postId })
    return { liked: false, likes: Math.max(0, updated.likes) }
  }

  const [, updated] = await prisma.$transaction([
    prisma.like.create({
      data: { userId, postId },
    }),
    prisma.post.update({
      where: { id: postId },
      data: { likes: { increment: 1 } },
      select: { likes: true },
    }),
  ])
  logger.info('Like added', { userId, postId })
  return { liked: true, likes: updated.likes }
}

export async function addComment(postId: string, authorId: string, content: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true },
  })
  if (!post) return null

  const comment = await prisma.comment.create({
    data: { postId, authorId, content },
  })
  logger.info('Comment added', { commentId: comment.id, postId, authorId })
  return comment
}

export async function getComments(postId: string, limit = 20, offset = 0) {
  return prisma.comment.findMany({
    where: { postId },
    orderBy: { createdAt: 'asc' },
    take: limit,
    skip: offset,
  })
}

export async function listFollowingPosts(userId: string, limit = 20, offset = 0) {
  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  })
  const followingIds = follows.map((f) => f.followingId)
  if (followingIds.length === 0) return []
  logger.info('Following feed queried', { userId, followingCount: followingIds.length })
  return prisma.post.findMany({
    where: { authorId: { in: followingIds } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    include: postListInclude,
  })
}

export async function getUserPostCount(userId: string) {
  return prisma.post.count({ where: { authorId: userId } })
}

export async function addBookmark(userId: string, postId: string) {
  try {
    const bookmark = await prisma.bookmark.create({
      data: { userId, postId },
    })
    logger.info('Bookmark added', { userId, postId, bookmarkId: bookmark.id })
    return bookmark
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === 'P2002') {
      logger.warn('Bookmark already exists', { userId, postId })
      return null
    }
    throw err
  }
}

export async function removeBookmark(userId: string, postId: string) {
  try {
    const bookmark = await prisma.bookmark.delete({
      where: { userId_postId: { userId, postId } },
    })
    logger.info('Bookmark removed', { userId, postId, bookmarkId: bookmark.id })
    return bookmark
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === 'P2025') {
      logger.warn('Bookmark not found for removal', { userId, postId })
      return null
    }
    throw err
  }
}

export async function isBookmarked(userId: string, postId: string) {
  const bookmark = await prisma.bookmark.findUnique({
    where: { userId_postId: { userId, postId } },
  })
  return bookmark !== null
}

export async function listBookmarkedPosts(userId: string, limit = 20, offset = 0) {
  const bookmarks = await prisma.bookmark.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    include: {
      post: {
        include: postListInclude,
      },
    },
  })

  return bookmarks
    .map((item) => item.post)
    .filter(Boolean)
}

export async function getLikedPostIds(userId: string, postIds: string[]) {
  if (postIds.length === 0) return new Set<string>()
  const likes = await prisma.like.findMany({
    where: {
      userId,
      postId: { in: postIds },
    },
    select: { postId: true },
  })
  return new Set(likes.map((item) => item.postId))
}

export async function getBookmarkedPostIds(userId: string, postIds: string[]) {
  if (postIds.length === 0) return new Set<string>()
  const bookmarks = await prisma.bookmark.findMany({
    where: {
      userId,
      postId: { in: postIds },
    },
    select: { postId: true },
  })
  return new Set(bookmarks.map((item) => item.postId))
}
