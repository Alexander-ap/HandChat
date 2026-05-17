import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { getBalance, getHistory, getHistoryTotal } from '../services/pointsService'

const router = Router()

router.use(authMiddleware)

router.get('/', async (req, res, next) => {
  try {
    const balance = await getBalance(req.userId!)
    res.json(balance)
  } catch (err) {
    next(err)
  }
})

router.get('/history', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const [history, total] = await Promise.all([
      getHistory(req.userId!, limit, offset),
      getHistoryTotal(req.userId!),
    ])
    res.json({
      records: history.map((r) => ({
        id: r.id,
        amount: r.amount,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    })
  } catch (err) {
    next(err)
  }
})

export default router
