import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { authMiddleware } from '../middleware/auth'
import { config } from '../config'
import {
  createPost,
  listPosts,
  listFollowingPosts,
  deletePost,
  likePost,
  addComment,
  getComments,
  addBookmark,
  removeBookmark,
  isBookmarked,
} from '../services/postService'

const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey)
const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50)
    const offset = Math.max(Number(req.query.offset) || 0, 0)

    if (req.query.feed === 'following') {
      const token = req.headers.authorization?.replace('Bearer ', '')
      if (!token) {
        return res.status(401).json({ error: 'Authentication required for following feed' })
      }
      const { data: { user }, error } = await supabase.auth.getUser(token)
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' })
      }
      const posts = await listFollowingPosts(user.id, limit, offset)
      return res.json(posts.map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        author: p.authorId,
        authorId: p.authorId,
        avatar: '',
        likes: p.likes,
        commentCount: p._count.comments,
        comments: p.comments.map((c) => ({
          id: c.id,
          content: c.content,
          author: c.authorId,
          authorId: c.authorId,
          createdAt: c.createdAt.toISOString(),
        })),
        createdAt: p.createdAt.toISOString(),
      })))
    }

    const posts = await listPosts(limit, offset)
    res.json(posts.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      author: p.authorId,
      authorId: p.authorId,
      avatar: '',
      likes: p.likes,
      commentCount: p._count.comments,
      comments: p.comments.map((c) => ({
        id: c.id,
        content: c.content,
        author: c.authorId,
        authorId: c.authorId,
        createdAt: c.createdAt.toISOString(),
      })),
      createdAt: p.createdAt.toISOString(),
    })))
  } catch (err) {
    next(err)
  }
})

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { title, content } = req.body
    const effectiveTitle = title || (content ? content.slice(0, 50) : '')
    const effectiveContent = content || title || ''
    if (!effectiveContent) {
      return res.status(400).json({ error: 'Content is required' })
    }
    if (effectiveTitle.length > 200 || effectiveContent.length > 10000) {
      return res.status(400).json({ error: 'Title or content exceeds maximum length' })
    }
    if (!req.userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    const post = await createPost({
      title: effectiveTitle,
      content: effectiveContent,
      authorId: req.userId,
    })
    res.status(201).json({
      id: post.id,
      title: post.title,
      content: post.content,
      authorId: post.authorId,
      likes: post.likes,
      createdAt: post.createdAt.toISOString(),
    })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const result = await deletePost(id, req.userId!)
    if (!result) {
      return res.status(404).json({ error: 'Post not found' })
    }
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/like', authMiddleware, async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const post = await likePost(id)
    res.json({ likes: post.likes })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/bookmark', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId!
    const postId = String(req.params.id)
    const alreadyBookmarked = await isBookmarked(userId, postId)
    if (alreadyBookmarked) {
      await removeBookmark(userId, postId)
      res.json({ bookmarked: false })
    } else {
      await addBookmark(userId, postId)
      res.json({ bookmarked: true })
    }
  } catch (err) {
    next(err)
  }
})

router.post('/:id/comments', authMiddleware, async (req, res, next) => {
  try {
    const { content } = req.body
    if (!content) {
      return res.status(400).json({ error: 'Content is required' })
    }
    if (content.length > 5000) {
      return res.status(400).json({ error: 'Comment too long' })
    }
    const id = String(req.params.id)
    const comment = await addComment(id, req.userId!, content)
    res.status(201).json({
      id: comment.id,
      content: comment.content,
      authorId: comment.authorId,
      createdAt: comment.createdAt.toISOString(),
    })
  } catch (err) {
    next(err)
  }
})

router.get('/:id/comments', async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const comments = await getComments(id, limit, offset)
    res.json(comments.map((c) => ({
      id: c.id,
      content: c.content,
      authorId: c.authorId,
      createdAt: c.createdAt.toISOString(),
    })))
  } catch (err) {
    next(err)
  }
})

export default router
