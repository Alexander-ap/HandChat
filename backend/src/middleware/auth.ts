import { createClient } from '@supabase/supabase-js';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { sendError, unauthorized } from '../http';

const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return sendError(res, req, 401, 'UNAUTHORIZED', '缺少认证令牌');
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return sendError(res, req, 401, 'UNAUTHORIZED', '认证无效或已过期');
    req.userId = user.id;
    next();
  } catch {
    return next(unauthorized('认证服务暂时不可用'));
  }
}
