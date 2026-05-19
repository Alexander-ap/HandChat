import type { Request, Response } from 'express'

export class AppError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function sendOk(res: Response, data: unknown, status = 200) {
  return res.status(status).json(data)
}

export function sendError(res: Response, req: Request, status: number, code: string, message: string, details?: Record<string, unknown>) {
  return res.status(status).json({
    error: message,
    code,
    requestId: req.requestId,
    ...(details ? { details } : {}),
  })
}

export function badRequest(message: string, details?: Record<string, unknown>) {
  return new AppError(400, 'BAD_REQUEST', message, details)
}

export function unauthorized(message = 'Unauthorized') {
  return new AppError(401, 'UNAUTHORIZED', message)
}

export function forbidden(message = 'Forbidden') {
  return new AppError(403, 'FORBIDDEN', message)
}

export function notFound(message = 'Resource not found') {
  return new AppError(404, 'NOT_FOUND', message)
}

export function tooManyRequests(message = 'Too many requests') {
  return new AppError(429, 'RATE_LIMITED', message)
}

export function unprocessable(message: string, details?: Record<string, unknown>) {
  return new AppError(422, 'CONTENT_REJECTED', message, details)
}
