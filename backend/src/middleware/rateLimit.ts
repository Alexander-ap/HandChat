import type { NextFunction, Request, Response } from 'express'
import { tooManyRequests } from '../http'
import { logger } from '../logger'

type RateBucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateBucket>()

function buildKey(req: Request, bucketName: string) {
  return `${bucketName}:${req.userId || req.ip || 'anonymous'}`
}

function getBucket(key: string, windowMs: number) {
  const now = Date.now()
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    const next = { count: 0, resetAt: now + windowMs }
    buckets.set(key, next)
    return next
  }
  return existing
}

export function createRateLimit(bucketName: string, limit: number, windowMs: number) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = buildKey(req, bucketName)
    const bucket = getBucket(key, windowMs)
    bucket.count += 1

    if (bucket.count > limit) {
      logger.warn('Rate limit exceeded', {
        bucketName,
        requestId: req.requestId,
        userId: req.userId || null,
        ip: req.ip,
      })
      return next(tooManyRequests('请求过于频繁，请稍后再试'))
    }

    next()
  }
}
