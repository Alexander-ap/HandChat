import { createClient } from '@supabase/supabase-js';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing token', code: 401 });
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token', code: 401 });
    req.userId = user.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token', code: 401 });
  }
}
