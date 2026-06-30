import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import {
  follow,
  unfollow,
  getFollowingCount,
  getFollowerCount,
  isFollowing,
  getFollowingStatus,
  getFollowingList,
  getFollowerList,
} from '../services/followService'

const router = Router()

router.get('/following/status', authMiddleware, async (req, res, next) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 100)
    const followingIds = await getFollowingStatus(req.userId!, ids)
    res.json({
      following: Object.fromEntries(ids.map((id) => [id, followingIds.has(id)])),
    })
  } catch (err) {
    next(err)
  }
})

router.get('/:id/followers/count', async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const count = await getFollowerCount(id)
    res.json({ count })
  } catch (err) {
    next(err)
  }
})

router.get('/:id/following/count', async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const count = await getFollowingCount(id)
    res.json({ count })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/follow', authMiddleware, async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const result = await follow(req.userId!, id)
    res.json({ success: true, following: true })
  } catch (err: any) {
    if (err.message === 'Cannot follow yourself') {
      return res.status(400).json({ error: 'Cannot follow yourself' })
    }
    next(err)
  }
})

router.delete('/:id/follow', authMiddleware, async (req, res, next) => {
  try {
    const id = String(req.params.id)
    await unfollow(req.userId!, id)
    res.json({ success: true, following: false })
  } catch (err) {
    next(err)
  }
})

router.get('/:id/followers', async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const users = await getFollowerList(id, limit, offset)
    res.json({
      users: users.map((item) => ({
        userId: item.followerId,
        createdAt: item.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    next(err)
  }
})

router.get('/:id/following', async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const users = await getFollowingList(id, limit, offset)
    res.json({
      users: users.map((item) => ({
        userId: item.followingId,
        createdAt: item.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    next(err)
  }
})

router.get('/:id/is-following', authMiddleware, async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const following = await isFollowing(req.userId!, id)
    res.json({ following })
  } catch (err) {
    next(err)
  }
})

export default router
