import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  getUserSessions,
  getSessionById,
  getTranslationHistory,
} from '../services/sessionService';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const sessions = await getUserSessions(req.userId!, limit, offset);
    res.json(sessions.map((s) => ({
      id: s.id,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      translationCount: s._count.translations,
      lastTranslation: s.translations[0]?.text ?? null,
    })));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const session = await getSessionById(req.params.id, req.userId!);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({
      id: session.id,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/history', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const translations = await getTranslationHistory(req.params.id, req.userId!, limit);
    if (translations === null) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(translations.map((t) => ({
      text: t.text,
      confidence: t.confidence,
      type: t.type,
      gestureLabel: t.gestureLabel,
      frameId: t.frameId,
      createdAt: t.createdAt.toISOString(),
    })));
  } catch (err) {
    next(err);
  }
});

export default router;
