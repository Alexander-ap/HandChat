import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import {
  follow,
  unfollow,
  getFollowingCount,
  getFollowerCount,
  isFollowing,
} from '../services/followService'

const router = Router()

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
    const count = await getFollowerCount(id)
    res.json({ count })
  } catch (err) {
    next(err)
  }
})

router.get('/:id/following', async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const count = await getFollowingCount(id)
    res.json({ count })
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
