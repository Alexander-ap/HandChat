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

export async function listPosts(limit = 20, offset = 0) {
  return prisma.post.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    include: {
      _count: { select: { comments: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        take: 3,
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

export async function deletePost(postId: string, userId: string) {
  const result = await prisma.post.deleteMany({
    where: { id: postId, authorId: userId },
  })
  if (result.count === 0) return null
  logger.info('Post deleted', { postId, userId })
  return { id: postId }
}

export async function likePost(postId: string) {
  const post = await prisma.post.update({
    where: { id: postId },
    data: { likes: { increment: 1 } },
  })
  return post
}

export async function addComment(postId: string, authorId: string, content: string) {
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

export async function getUserPostCount(userId: string) {
  return prisma.post.count({ where: { authorId: userId } })
}
