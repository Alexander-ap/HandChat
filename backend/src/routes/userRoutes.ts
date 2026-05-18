import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import {
  getProfile,
  updateProfile,
  getSettings,
  updateSettings,
  getUserStats,
} from '../services/userService'

const router = Router()

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

export default router
