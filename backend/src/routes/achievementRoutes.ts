import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { listAchievements } from '../services/achievementService'

const router = Router()

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const achievements = await listAchievements(req.userId!)
    res.json(achievements)
  } catch (err) {
    next(err)
  }
})

export default router
