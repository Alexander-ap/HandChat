import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import {
  getProfile,
  updateProfile,
  getSettings,
  updateSettings,
  getUserStats,
  getDailyStats,
  getUserBasic,
  getUserBookmarks,
} from '../services/userService'

const router = Router()

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

router.get('/profile', authMiddleware, async (req, res, next) => {
  try {
    const profile = await getProfile(req.userId!)
    res.json(profile)
  } catch (err) {
    next(err)
  }
})

router.put('/profile', authMiddleware, async (req, res, next) => {
  try {
    const { nickname, avatar, bio, name, avatar_url } = req.body
    const effectiveNickname = nickname || name
    const effectiveAvatar = avatar || avatar_url
    const profile = await updateProfile(req.userId!, {
      nickname: effectiveNickname,
      avatar: effectiveAvatar,
      bio,
    })
    res.json({
      nickname: effectiveNickname || profile.nickname,
      avatar: effectiveAvatar || profile.avatar,
      bio: profile.bio,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/settings', authMiddleware, async (req, res, next) => {
  try {
    const settings = await getSettings(req.userId!)
    res.json(settings)
  } catch (err) {
    next(err)
  }
})

router.put('/settings', authMiddleware, async (req, res, next) => {
  try {
    const { notification, vibration, language } = req.body
    const settings = await updateSettings(req.userId!, {
      notification,
      vibration,
      language,
    })
    res.json({
      notification: settings.notification,
      vibration: settings.vibration,
      language: settings.language,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/stats', authMiddleware, async (req, res, next) => {
  try {
    const stats = await getUserStats(req.userId!)
    res.json({ stats })
  } catch (err) {
    next(err)
  }
})

router.get('/stats/daily', authMiddleware, async (req, res, next) => {
  try {
    const days = Math.min(
      Math.max(1, parseInt(req.query.days as string) || 7),
      30
    )
    const stats = await getDailyStats(req.userId!, days)
    res.json(stats)
  } catch (err) {
    next(err)
  }
})

router.get('/bookmarks', authMiddleware, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const posts = await getUserBookmarks(req.userId!, limit, offset)
    res.json({
      posts: posts.map((post) => ({
        id: post.id,
        title: post.title,
        content: post.content,
        author: {
          name: post.authorId,
          avatar: '',
          verified: true,
        },
        authorId: post.authorId,
        images: [],
        likes: post.likes,
        comments: post._count?.comments ?? 0,
        shares: 0,
        isLiked: false,
        isBookmarked: true,
        timeAgo: formatTimeAgo(post.createdAt),
        createdAt: post.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    next(err)
  }
})

router.get('/:id/basic', async (req, res, next) => {
  try {
    const info = await getUserBasic(req.params.id)
    res.json(info)
  } catch (err) {
    next(err)
  }
})

export default router
