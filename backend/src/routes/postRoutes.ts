import { Router, type Request } from 'express'
import {
  authMiddleware,
  getCachedAuthUserId,
  readAuthToken,
  resolveAuthUserId,
} from '../middleware/auth'
import { createRateLimit } from '../middleware/rateLimit'
import { prisma } from '../db'
import { badRequest, notFound, sendError, sendOk, unauthorized } from '../http'
import { moderateContent } from '../services/moderationService'
import {
  createPost,
  getPostById,
  listPosts,
  listFollowingPosts,
  updatePost,
  deletePost,
  deleteComment,
  toggleLike,
  addComment,
  getComments,
  addBookmark,
  removeBookmark,
  isBookmarked,
  getBookmarkedPostIds,
  getLikedPostIds,
} from '../services/postService'

const router = Router()
const writeLimiter = createRateLimit('community-write', 30, 60 * 1000)
const engageLimiter = createRateLimit('community-engage', 80, 60 * 1000)

function formatTimeAgo(input: Date | string) {
  const timestamp = input instanceof Date ? input.getTime() : new Date(input).getTime()
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  return `${Math.floor(days / 30)}个月前`
}

async function resolveOptionalUserId(req: Request, options: { verify?: boolean } = {}) {
  const token = readAuthToken(req)
  if (!token) return null

  if (!options.verify) {
    return getCachedAuthUserId(token) ?? null
  }

  return resolveAuthUserId(token)
}

function cleanProfileValue(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLength)
}

async function ensureAuthorProfile(
  userId: string,
  data: { author?: unknown; authorName?: unknown; nickname?: unknown; name?: unknown; avatar?: unknown; avatarUrl?: unknown }
) {
  const nickname = cleanProfileValue(data.author ?? data.authorName ?? data.nickname ?? data.name, 80)
  const avatar = cleanProfileValue(data.avatar ?? data.avatarUrl, 500)

  if (!nickname && !avatar) return

  const existing = await prisma.userProfile.findUnique({ where: { userId } })
  if (!existing) {
    await prisma.userProfile.create({
      data: {
        userId,
        ...(nickname && { nickname }),
        ...(avatar && { avatar }),
      },
    })
    return
  }

  const updateData: { nickname?: string; avatar?: string } = {}
  if (nickname && !existing.nickname) updateData.nickname = nickname
  if (avatar && !existing.avatar) updateData.avatar = avatar

  if (Object.keys(updateData).length > 0) {
    await prisma.userProfile.update({
      where: { userId },
      data: updateData,
    })
  }
}

async function buildProfileMap(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueIds.length === 0) return new Map<string, { nickname: string | null; avatar: string | null }>()

  const profiles = await prisma.userProfile.findMany({
    where: { userId: { in: uniqueIds } },
    select: {
      userId: true,
      nickname: true,
      avatar: true,
    },
  })

  return new Map(
    profiles.map((profile) => [
      profile.userId,
      { nickname: profile.nickname, avatar: profile.avatar },
    ])
  )
}

function mapComment(comment: {
  id: string
  content: string
  authorId: string
  createdAt: Date
}, profileMap: Map<string, { nickname: string | null; avatar: string | null }>) {
  const profile = profileMap.get(comment.authorId)
  return {
    id: comment.id,
    content: comment.content,
    author: {
      name: profile?.nickname || '用户',
      avatar: profile?.avatar || '',
    },
    authorId: comment.authorId,
    likes: 0,
    timeAgo: formatTimeAgo(comment.createdAt),
    createdAt: comment.createdAt.toISOString(),
  }
}

function mapPost(post: {
  id: string
  title: string
  content: string
  authorId: string
  likes: number
  createdAt: Date
  _count?: { comments: number }
  comments?: Array<{
    id: string
    content: string
    authorId: string
    createdAt: Date
  }>
}, options: {
  profileMap: Map<string, { nickname: string | null; avatar: string | null }>
  likedPostIds?: Set<string>
  bookmarkedPostIds?: Set<string>
}) {
  const profile = options.profileMap.get(post.authorId)
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    author: {
      name: profile?.nickname || '用户',
      avatar: profile?.avatar || '',
      verified: true,
    },
    authorId: post.authorId,
    images: [],
    likes: post.likes,
    comments: post._count?.comments ?? post.comments?.length ?? 0,
    commentCount: post._count?.comments ?? post.comments?.length ?? 0,
    shares: 0,
    isLiked: options.likedPostIds?.has(post.id) ?? false,
    isBookmarked: options.bookmarkedPostIds?.has(post.id) ?? false,
    timeAgo: formatTimeAgo(post.createdAt),
    createdAt: post.createdAt.toISOString(),
    commentsPreview: Array.isArray(post.comments)
      ? post.comments.map((item) => mapComment(item, options.profileMap))
      : [],
    previewComments: Array.isArray(post.comments)
      ? post.comments.map((item) => mapComment(item, options.profileMap))
      : [],
  }
}

type MappedPost = ReturnType<typeof mapPost>

const PUBLIC_POST_CACHE_TTL_MS = Number(process.env.PUBLIC_POST_CACHE_TTL_MS) || 60 * 1000
const publicPostCache = new Map<string, { expiresAt: number; posts: MappedPost[] }>()
const publicPostInflight = new Map<string, Promise<MappedPost[]>>()

function getPublicPostCacheKey(limit: number, offset: number) {
  return `${limit}:${offset}`
}

function getCachedPublicPosts(cacheKey: string) {
  const cached = publicPostCache.get(cacheKey)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    publicPostCache.delete(cacheKey)
    return null
  }
  return cached.posts
}

function setCachedPublicPosts(cacheKey: string, posts: MappedPost[]) {
  publicPostCache.set(cacheKey, {
    posts,
    expiresAt: Date.now() + PUBLIC_POST_CACHE_TTL_MS,
  })
}

function clearPublicPostCache() {
  publicPostCache.clear()
}

async function getPublicPosts(limit: number, offset: number) {
  const cacheKey = getPublicPostCacheKey(limit, offset)
  const cached = getCachedPublicPosts(cacheKey)
  if (cached) return cached

  const inflight = publicPostInflight.get(cacheKey)
  if (inflight) return inflight

  const loadPromise = (async () => {
    const posts = await listPosts(limit, offset)
    const profileMap = await buildProfileMap([
      ...posts.map((post) => post.authorId),
    ])
    const mappedPosts = posts.map((post) => mapPost(post, { profileMap }))
    setCachedPublicPosts(cacheKey, mappedPosts)
    return mappedPosts
  })()

  publicPostInflight.set(cacheKey, loadPromise)
  try {
    return await loadPromise
  } finally {
    publicPostInflight.delete(cacheKey)
  }
}

function applyViewerFlags(
  posts: MappedPost[],
  likedPostIds?: Set<string>,
  bookmarkedPostIds?: Set<string>
) {
  return posts.map((post) => ({
    ...post,
    isLiked: likedPostIds?.has(post.id) ?? false,
    isBookmarked: bookmarkedPostIds?.has(post.id) ?? false,
  }))
}

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    let currentUserId: string | null = null
    try {
      currentUserId = await resolveOptionalUserId(req, { verify: req.query.feed === 'following' })
    } catch {
      return sendError(
        res,
        req,
        503,
        'AUTH_SERVICE_UNAVAILABLE',
        'Authentication service is temporarily unavailable. Please try again later.'
      )
    }

    if (req.query.feed === 'following') {
      if (!currentUserId) {
        return sendError(res, req, 401, 'UNAUTHORIZED', '关注动态需要登录后查看')
      }
      const posts = await listFollowingPosts(currentUserId, limit, offset)
      const profileMap = await buildProfileMap([
        ...posts.map((post) => post.authorId),
      ])
      const [likedPostIds, bookmarkedPostIds] = await Promise.all([
        getLikedPostIds(currentUserId, posts.map((post) => post.id)),
        getBookmarkedPostIds(currentUserId, posts.map((post) => post.id)),
      ])
      return sendOk(res, {
        posts: posts.map((post) => mapPost(post, { profileMap, likedPostIds, bookmarkedPostIds })),
      })
    }

    const mappedPosts = await getPublicPosts(limit, offset)
    const [likedPostIds, bookmarkedPostIds] = currentUserId
      ? await Promise.all([
          getLikedPostIds(currentUserId, mappedPosts.map((post) => post.id)),
          getBookmarkedPostIds(currentUserId, mappedPosts.map((post) => post.id)),
        ])
      : [undefined, undefined]
    sendOk(res, {
      posts: applyViewerFlags(mappedPosts, likedPostIds, bookmarkedPostIds),
    })
  } catch (err) {
    next(err)
  }
})

router.post('/', authMiddleware, writeLimiter, async (req, res, next) => {
  try {
    const { title, content } = req.body
    const effectiveTitle = String(title || (content ? String(content).slice(0, 50) : '')).trim()
    const effectiveContent = String(content || title || '').trim()
    if (!effectiveContent) {
      throw badRequest('帖子内容不能为空')
    }
    if (effectiveTitle.length > 200 || effectiveContent.length > 10000) {
      throw badRequest('标题或内容超出长度限制')
    }
    if (!req.userId) {
      throw unauthorized('请先登录')
    }
    await ensureAuthorProfile(req.userId, req.body || {})
    const moderatedContent = moderateContent('post', effectiveContent)
    const moderatedTitle = effectiveTitle || moderatedContent.slice(0, 50)
    const post = await createPost({
      title: moderatedTitle,
      content: moderatedContent,
      authorId: req.userId,
    })
    clearPublicPostCache()
    const profileMap = await buildProfileMap([post.authorId])
    sendOk(res, {
      success: true,
      post: mapPost(post, {
        profileMap,
        likedPostIds: new Set<string>(),
        bookmarkedPostIds: new Set<string>(),
      }),
    }, 201)
  } catch (err) {
    next(err)
  }
})

router.put('/:id', authMiddleware, writeLimiter, async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const rawTitle = String(req.body?.title || '').trim()
    const rawContent = String(req.body?.content || '').trim()
    if (!rawContent) {
      throw badRequest('帖子内容不能为空')
    }
    if (rawTitle.length > 200 || rawContent.length > 10000) {
      throw badRequest('标题或内容超出长度限制')
    }
    const content = moderateContent('post', rawContent)
    const title = rawTitle || content.slice(0, 50)
    const post = await updatePost(id, req.userId!, { title, content })
    if (!post) {
      throw notFound('帖子不存在或无权限编辑')
    }
    clearPublicPostCache()
    const profileMap = await buildProfileMap([
      post.authorId,
      ...(post.comments || []).map((comment) => comment.authorId),
    ])
    sendOk(res, {
      success: true,
      post: mapPost(post, {
        profileMap,
        likedPostIds: new Set<string>(),
        bookmarkedPostIds: new Set<string>(),
      }),
    })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const post = await getPostById(id)
    if (!post) {
      throw notFound('帖子不存在')
    }
    const currentUserId = await resolveOptionalUserId(req)
    const profileMap = await buildProfileMap([
      post.authorId,
      ...(post.comments || []).map((comment) => comment.authorId),
    ])
    const [likedPostIds, bookmarkedPostIds] = currentUserId
      ? await Promise.all([
          getLikedPostIds(currentUserId, [post.id]),
          getBookmarkedPostIds(currentUserId, [post.id]),
        ])
      : [undefined, undefined]
    sendOk(res, mapPost(post, { profileMap, likedPostIds, bookmarkedPostIds }))
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const result = await deletePost(id, req.userId!)
    if (!result) {
      throw notFound('帖子不存在或无权限删除')
    }
    clearPublicPostCache()
    sendOk(res, { success: true })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/like', authMiddleware, engageLimiter, async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const result = await toggleLike(id, req.userId!)
    if (!result) {
      throw notFound('帖子不存在')
    }
    clearPublicPostCache()
    sendOk(res, result)
  } catch (err) {
    next(err)
  }
})

router.post('/:id/bookmark', authMiddleware, engageLimiter, async (req, res, next) => {
  try {
    const userId = req.userId!
    const postId = String(req.params.id)
    const post = await getPostById(postId)
    if (!post) {
      throw notFound('帖子不存在')
    }
    const alreadyBookmarked = await isBookmarked(userId, postId)
    if (alreadyBookmarked) {
      await removeBookmark(userId, postId)
      sendOk(res, { bookmarked: false })
    } else {
      await addBookmark(userId, postId)
      sendOk(res, { bookmarked: true })
    }
  } catch (err) {
    next(err)
  }
})

router.post('/:id/comments', authMiddleware, engageLimiter, async (req, res, next) => {
  try {
    const { content } = req.body
    if (!content) {
      throw badRequest('评论内容不能为空')
    }
    const normalizedContent = String(content).trim()
    if (normalizedContent.length > 5000) {
      throw badRequest('评论内容超出长度限制')
    }
    const id = String(req.params.id)
    const moderatedContent = moderateContent('comment', normalizedContent)
    const comment = await addComment(id, req.userId!, moderatedContent)
    if (!comment) {
      throw notFound('帖子不存在')
    }
    clearPublicPostCache()
    const profileMap = await buildProfileMap([comment.authorId])
    sendOk(res, {
      success: true,
      comment: mapComment(comment, profileMap),
    }, 201)
  } catch (err) {
    next(err)
  }
})

router.delete('/:id/comments/:commentId', authMiddleware, async (req, res, next) => {
  try {
    const commentId = String(req.params.commentId)
    const result = await deleteComment(commentId, req.userId!)
    if (!result) {
      throw notFound('评论不存在或无权限删除')
    }
    clearPublicPostCache()
    sendOk(res, { success: true })
  } catch (err) {
    next(err)
  }
})

router.get('/:id/comments', async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const comments = await getComments(id, limit, offset)
    const profileMap = await buildProfileMap(comments.map((comment) => comment.authorId))
    sendOk(res, { comments: comments.map((comment) => mapComment(comment, profileMap)) })
  } catch (err) {
    next(err)
  }
})

export default router
