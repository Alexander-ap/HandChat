import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { sendError } from '../http';

const AUTH_TIMEOUT_MS = Number(process.env.AUTH_TIMEOUT_MS) || 5000;
const AUTH_RETRY_COUNT = Number(process.env.AUTH_RETRY_COUNT) || 1;
const AUTH_RETRY_DELAY_MS = Number(process.env.AUTH_RETRY_DELAY_MS) || 300;
const AUTH_CACHE_TTL_MS = Number(process.env.AUTH_CACHE_TTL_MS) || 60 * 1000;

function createTimeoutFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const upstreamSignal = init?.signal;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();

    if (upstreamSignal?.aborted) {
      controller.abort();
    } else {
      upstreamSignal?.addEventListener('abort', abort, { once: true });
    }

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
      upstreamSignal?.removeEventListener('abort', abort);
    }
  };
}

const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  global: {
    fetch: createTimeoutFetch(AUTH_TIMEOUT_MS),
  },
});

type CachedAuth = {
  userId: string;
  expiresAt: number;
};

const authCache = new Map<string, CachedAuth>();

function getTokenCacheKey(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function readAuthToken(req: Request) {
  const jwtHeader = req.headers['x-user-jwt'];
  if (typeof jwtHeader === 'string') return jwtHeader.trim();
  if (Array.isArray(jwtHeader) && typeof jwtHeader[0] === 'string') return jwtHeader[0].trim();

  const authHeader = req.headers.authorization;
  if (!authHeader) return undefined;
  return authHeader.replace(/^Bearer\s+/i, '').trim();
}

function getCachedUserId(token: string) {
  const cacheKey = getTokenCacheKey(token);
  const cached = authCache.get(cacheKey);
  if (!cached) return undefined;

  if (cached.expiresAt <= Date.now()) {
    authCache.delete(cacheKey);
    return undefined;
  }

  return cached.userId;
}

function cacheUserId(token: string, userId: string) {
  authCache.set(getTokenCacheKey(token), {
    userId,
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
  });
}

export function getCachedAuthUserId(token: string) {
  return getCachedUserId(token);
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Supabase Auth request timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function isRetryableAuthError(err: unknown) {
  if (!err || typeof err !== 'object') return false;

  const candidate = err as {
    name?: string;
    status?: number;
    message?: string;
    code?: string;
  };
  const message = String(candidate.message || '').toLowerCase();
  const code = String(candidate.code || '').toLowerCase();

  return (
    candidate.name === 'AuthRetryableFetchError' ||
    candidate.status === 0 ||
    code.includes('timeout') ||
    code.includes('network') ||
    message.includes('abort') ||
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('timeout')
  );
}

async function getUserWithRetry(token: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= AUTH_RETRY_COUNT; attempt += 1) {
    try {
      const result = await withTimeout(supabase.auth.getUser(token), AUTH_TIMEOUT_MS);
      if (result.error && isRetryableAuthError(result.error)) {
        throw result.error;
      }
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < AUTH_RETRY_COUNT) {
        await sleep(AUTH_RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Supabase Auth request failed');
}

export async function resolveAuthUserId(token: string) {
  const cachedUserId = getCachedUserId(token);
  if (cachedUserId) return cachedUserId;

  const { data: { user }, error } = await getUserWithRetry(token);
  if (error || !user) return null;

  cacheUserId(token, user.id);
  return user.id;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = readAuthToken(req);
  if (!token) {
    return sendError(res, req, 401, 'UNAUTHORIZED', 'Missing authentication token');
  }

  try {
    const userId = await resolveAuthUserId(token);
    if (!userId) {
      return sendError(res, req, 401, 'UNAUTHORIZED', 'Authentication token is invalid or expired');
    }

    req.userId = userId;
    next();
  } catch {
    return sendError(
      res,
      req,
      503,
      'AUTH_SERVICE_UNAVAILABLE',
      'Authentication service is temporarily unavailable. Please try again later.'
    );
  }
}
