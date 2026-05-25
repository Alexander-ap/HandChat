# HandChat 后端技术规范文档

> **版本：** v2.2  
> **编写日期：** 2026-05-18（v2.1） → 2026-05-25（v2.2 清理更新）  
> **依赖规范：** [interfaces.md](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/interfaces.md) (v1.3)  
> **适用人员：** 后端开发工程师  
> **相关文档：** [phase2-development-plan.md](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/phase2-development-plan.md) / [frontend-dev-doc.md](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/frontend-dev-doc.md)

---

## 一、系统概述

### 1.1 项目定位

HandChat 是无障碍手语翻译应用。后端负责**数据持久化**（用户会话/翻译记录/社区内容/积分成就）、**认证鉴权**（Supabase JWT）和**实时双向通信**（WebSocket）。

### 1.2 技术栈

| 层级 | 技术选型 | 版本 |
|------|---------|------|
| 运行时 | Node.js + TypeScript | ES2022 / strict |
| Web 框架 | Express | ^5.1 |
| WebSocket | ws | ^8.20 |
| ORM | Prisma | ^6.0 |
| 数据库 | PostgreSQL (Supabase 托管) | 15.x |
| 认证 | Supabase Auth JWT | `@supabase/supabase-js` ^2.99 |
| 部署 | Railway / Docker | Node 20 |

### 1.3 架构图

```
                                Supabase
                              ┌──────────────────────────────────┐
                              │  PostgreSQL (DB)                  │
                              │  ├─ Session / Translation         │
                              │  ├─ Post / Comment                │
                              │  ├─ Follow / UserProfile          │
                              │  ├─ PointsRecord                  │
                              │  └─ Achievement / UserAchievement │
                              │                                   │
                              │  Auth (JWT签发)                    │
                              │                                   │
                              │  Edge Functions (托管 Hono)        │
                              │  ├─ api/      — REST API 路由     │
                              │  └─ server/   — KV 表持久化       │
                              └──────────┬────────────────────────┘
                                         │
┌────────────────────┐                   │
│   前端 (React SPA) │                   │
│                    │   WebSocket       │
│  ├─ 手语识别      │◄──────────────────┤
│  ├─ 社区          │                   │
│  ├─ 积分/成就     │   REST API        │
│  └─ 个人中心      │◄──────────────────┤
└────────────────────┘                   │
                    │                    │
                    │  双模式路由         │
                    │  ├─ /edge (Vite代理)│
                    │  └─ localhost:3001  │
                    ▼                    ▼
          ┌──────────────────┐  ┌─────────────────────────┐
          │ Supabase Edge    │  │  本地 Express 后端       │
          │ Function (Hono)  │  │  port 3001               │
          │ KV 表持久化      │  │                          │
          └──────────────────┘  │  ├─ index.ts             │
                                │  │  ├─ CORS + JSON 1mb   │
                                │  │  ├─ 6 组 REST 路由     │
                                │  │  └─ 30s WS 心跳        │
                                │  │                       │
                                │  ├─ wsRouter.ts          │
                                │  │  └─ 7 种 WS 消息类型   │
                                │  │                       │
                                │  ├─ middleware/auth.ts    │
                                │  │  └─ Supabase JWT 验证  │
                                │  │                       │
                                │  ├─ services/ (6 文件)    │
                                │  └─ routes/   (6 文件)    │
                                └─────────────────────────┘
```

---

## 二、项目结构

```
backend/
├── package.json                 # 脚本: dev / build / start / db:migrate
├── tsconfig.json                # ES2022 + strict + bundler resolution
├── .env                         # DATABASE_URL / SUPABASE_URL / SUPABASE_ANON_KEY / PORT / CORS_ORIGIN
├── prisma/
│   ├── schema.prisma            # 8 个数据模型 (见 §四)
│   ├── seed.ts                  # 6 条成就种子数据
│   └── migrations/
│       └── manual_migration.sql # 手动迁移 SQL (Supabase SQL Editor 备用)
├── src/
│   ├── index.ts                 # 入口: Express + WS 共端口 + 6 组路由注册
│   ├── config.ts                # 环境变量管理 (requireEnv)
│   ├── db.ts                    # PrismaClient 单例
│   ├── logger.ts                # 统一日志 [ISO时间] [级别]
│   ├── types.d.ts               # Express Request.userId 扩展
│   ├── validators.ts            # WS 消息校验 (frame/keypoints/translation)
│   ├── wsRouter.ts              # WebSocket 连接处理 (7 种消息)
│   ├── fakeTranslator.ts        # 假翻译引擎 (FAKE_TRANSLATION=true 时启用)
│   ├── middleware/
│   │   └── auth.ts              # Supabase JWT Bearer Token 认证
│   ├── services/
│   │   ├── sessionService.ts    # 会话/翻译 CRUD
│   │   ├── postService.ts       # 帖子/评论 CRUD
│   │   ├── followService.ts     # 关注/取关/统计
│   │   ├── achievementService.ts # 成就列表 (5min 缓存)
│   │   ├── pointsService.ts     # 积分余额/明细
│   │   └── userService.ts       # 资料/设置/聚合统计
│   └── routes/
│       ├── sessionRoutes.ts     # /api/sessions/* (3 端点)
│       ├── postRoutes.ts        # /api/posts/* (6 端点)
│       ├── followRoutes.ts      # /api/user/:id/* (7 端点)
│       ├── achievementRoutes.ts # /api/achievements (1 端点)
│       ├── pointsRoutes.ts      # /api/points/* (2 端点)
│       └── userRoutes.ts        # /api/user/* (5 端点)
└── scripts/
    └── selfcheck.mjs            # 自动化健康检查
```

---

## 三、功能模块划分

### 3.1 模块总览

| 模块 | 路由前缀 | 端点数 | Service 文件 | 认证 |
|------|---------|--------|-------------|------|
| **健康检查** | `/health` | 1 | — | 无 |
| **会话管理** | `/api/sessions` | 3 | `sessionService.ts` | 必须 |
| **社区帖子** | `/api/posts` | 7 | `postService.ts` | 部分必须 |
| **用户资料** | `/api/user` | 5 | `userService.ts` | 必须 |
| **关注粉丝** | `/api/user` | 7 | `followService.ts` | 部分必须 |
| **成就系统** | `/api/achievements` | 1 | `achievementService.ts` | 必须 |
| **积分系统** | `/api/points` | 2 | `pointsService.ts` | 必须 |
| **WebSocket** | `ws://` | 7 消息类型 | `wsRouter.ts` | 首条必须 |

### 3.2 模块职责

**会话管理模块**
- 创建/恢复手语识别会话
- 存储每条翻译记录
- 返回用户历史会话列表及详情

**社区帖子模块**
- 发布/删除帖子（仅帖主可删）
- 点赞（当前仅计数，无去重）
- 评论 CRUD
- 收藏占位（待持久化）

**用户资料与设置模块**
- 个人资料读写（nickname/avatar/bio）
- 通知/震动/语言偏好持久化
- 10 字段综合统计聚合查询

**关注粉丝模块**
- 关注/取关（防自关注 + 乐观更新）
- 粉丝/关注数量统计
- 关注状态查询

**成就系统**
- 6 项预定义成就 + 用户解锁状态查询
- 5 分钟内存缓存优化

**积分系统**
- balance 与 totalEarned 分离计算
- 分页积分流水查询

---

## 四、数据库设计

### 4.1 ER 关系图

```
  Session ──< Translation
     │
  Post ──< Comment
     │
  Follow ── (followerId / followingId)
     │
  UserProfile ── (userId, unique)
     │
  PointsRecord ── (userId)
     │
  Achievement ──< UserAchievement ── (userId)
```

### 4.2 表结构

#### Session — 手语识别会话

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String (UUID) | PK | 后端生成 |
| `userId` | String? | INDEX | Supabase Auth 的 `sub` |
| `status` | String | default `"active"` | active / ended |
| `startedAt` | DateTime | default now() | |
| `endedAt` | DateTime? | | session_end 时写入 |

#### Translation — 翻译记录

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | Int | PK autoincrement | |
| `sessionId` | String | FK → Session | |
| `frameId` | Int | | 触发该翻译的帧序号 |
| `text` | String | | 翻译文本 |
| `confidence` | Float | | 0-1 |
| `gestureLabel` | String? | | 调试用，如 "wave" |
| `type` | String | | partial / final / sentence_end / sentence_final |
| `createdAt` | DateTime | default now() | |

索引：`@@index([sessionId, createdAt])`

#### Post — 社区帖子

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String (UUID) | PK | |
| `title` | String | | 内容前50字符自动派生 |
| `content` | String | | ≤10000 |
| `authorId` | String | INDEX | |
| `likes` | Int | default 0 | |
| `createdAt` | DateTime | default now() | |

索引：`@@index([authorId, createdAt])`

#### Comment — 评论

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String (UUID) | PK | |
| `content` | String | | ≤5000 |
| `authorId` | String | | |
| `postId` | String | FK → Post, CASCADE | |
| `createdAt` | DateTime | default now() | |

索引：`@@index([postId, createdAt])`

#### Follow — 关注关系

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String (UUID) | PK | |
| `followerId` | String | INDEX | 关注者 |
| `followingId` | String | INDEX | 被关注者 |
| `createdAt` | DateTime | default now() | |

唯一约束：`@@unique([followerId, followingId])` — 防止重复关注

#### UserProfile — 用户资料（不存 auth 信息）

| 字段 | 类型 | 约束 | 默认值 |
|------|------|------|--------|
| `userId` | String | PK | Supabase Auth sub |
| `nickname` | String? | | null |
| `avatar` | String? | | null |
| `bio` | String? | | null |
| `notification` | Boolean | | true |
| `vibration` | Boolean | | true |
| `language` | String | | "zh-CN" |
| `updatedAt` | DateTime | @updatedAt | |

#### PointsRecord — 积分流水

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String (UUID) | PK | |
| `userId` | String | INDEX | |
| `amount` | Int | | 正=获得，负=消费 |
| `reason` | String | | 如 "每日登录" |
| `createdAt` | DateTime | INDEX, default now() | |

#### Achievement — 成就定义

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String (UUID) | PK | |
| `name` | String | | 如 "初识手语" |
| `description` | String | | |
| `icon` | String | | hand / trophy / star 等 |
| `sortOrder` | Int | INDEX, default 0 | |

预置数据（6 条）：初识手语 / 交流达人 / 坚持不懈 / 聆听者 / 社区明星 / 手语大师

#### UserAchievement — 用户成就关联

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String (UUID) | PK | |
| `userId` | String | | |
| `achievementId` | String | FK → Achievement | |
| `unlockedAt` | DateTime | default now() | |
| `progress` | Int | default 0 | 0-100 |

唯一约束：`@@unique([userId, achievementId])`

### 4.3 索引策略

| 表 | 索引 | 用途 |
|----|------|------|
| Session | `@@index([userId])` | getUserStats 按用户查会话 |
| Translation | `@@index([sessionId, createdAt])` | 按会话查翻译历史 |
| Post | `@@index([authorId, createdAt])` | listPosts 排序 / 个人统计 |
| Comment | `@@index([postId, createdAt])` | 按帖子查评论 |
| Follow | `@@unique([followerId, followingId])` | 防重复关注 |
| Follow | `@@index([followerId])` | getFollowingCount |
| Follow | `@@index([followingId])` | getFollowerCount |
| PointsRecord | `@@index([userId, createdAt])` | 积分流水查询 |
| Achievement | `@@index([sortOrder])` | 成就排序 |

---

## 五、API 接口详细设计

> 完整请求/响应 JSON 示例见 [interfaces.md §4.1-4.2](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/interfaces.md#L305)。本节仅列出接口签名、认证要求与关键约束。

### 5.1 REST API 总览

| 方法 | 路径 | 认证 | 请求体 | 成功码 |
|------|------|------|--------|--------|
| GET | `/health` | 无 | — | 200 |
| GET | `/api/sessions?limit&offset` | 必须 | — | 200 |
| GET | `/api/sessions/:id` | 必须 | — | 200 |
| GET | `/api/sessions/:id/history?limit` | 必须 | — | 200 |
| GET | `/api/posts?limit&offset&feed` | 可选 | — | 200 |
| POST | `/api/posts` | 必须 | `{title?, content, images?}` | 201 |
| PUT | `/api/posts/:id` | 必须 | `{title?, content}` | 200 |
| DELETE | `/api/posts/:id` | 必须 | — | 200 |
| GET | `/api/posts/:id` | 可选 | — | 200 |
| POST | `/api/posts/:id/like` | 必须 | — | 200 |
| POST | `/api/posts/:id/bookmark` | 必须 | — | 200 |
| POST | `/api/posts/:id/comments` | 必须 | `{content}` | 201 |
| GET | `/api/posts/:id/comments?limit&offset` | 可选 | — | 200 |
| GET | `/api/achievements` | 必须 | — | 200 |
| GET | `/api/points` | 必须 | — | 200 |
| GET | `/api/points/history?limit&offset` | 必须 | — | 200 |
| GET | `/api/user/profile` | 必须 | — | 200 |
| PUT | `/api/user/profile` | 必须 | `{nickname?, avatar?, bio?}` | 200 |
| GET | `/api/user/settings` | 必须 | — | 200 |
| PUT | `/api/user/settings` | 必须 | `{notification?, vibration?, language?}` | 200 |
| GET | `/api/user/stats` | 必须 | — | 200 |
| GET | `/api/user/bookmarks` | 必须 | — | 200 |
| GET | `/api/user/:id/followers/count` | 可选 | — | 200 |
| GET | `/api/user/:id/following/count` | 可选 | — | 200 |
| GET | `/api/user/:id/followers` | 可选 | — | 200 |
| GET | `/api/user/:id/following` | 可选 | — | 200 |
| POST | `/api/user/:id/follow` | 必须 | — | 200 |
| DELETE | `/api/user/:id/follow` | 必须 | — | 200 |
| GET | `/api/user/:id/is-following` | 必须 | — | 200 |

**总计：28 个 REST 端点（4 核心 + 24 辅助）**

### 5.2 WebSocket 消息类型

| 方向 | type | 触发 | 后端动作 |
|------|------|------|---------|
| 前端→后端 | `session_start` | 连接后首条 | JWT 验证 → 创建/恢复会话 → 回复 session_created |
| 前端→后端 | `frame` | 每帧 | 校验 256×256 RGB Base64 → 日志 |
| 前端→后端 | `keypoints` | 每帧 | 校验 21 点 ×2 (2D+3D) → 日志 |
| 前端→后端 | `translation` | 检测到手势 | saveTranslation → DB |
| 前端→后端 | `ping` | 心跳 | 仅重置 isAlive，回复 pong |
| 前端→后端 | `session_end` | 停止识别 | endSession → ws.close(1000) |
| 后端→前端 | `session_created` | session_start 后 | `{ session_id }` |
| 后端→前端 | `error` | 任意校验失败 | `{ code: 4001-5002, error: "..." }` |

### 5.3 错误码

| 错误码 | 含义 | 触发条件 |
|--------|------|---------|
| 4001 | 消息格式错误 | 缺少必填字段 / 字段类型错误 |
| 4002 | 无活跃会话 | 未 session_start 就发 frame/keypoints/translation |
| 4003 | 认证失败 | 缺 token / Supabase 验证不通过 |
| 4004 | session_id 不匹配 | session_end 带的 ID 与当前不一致 |
| 5001 | 推理超时 | 后端处理帧 > 500ms (预留) |
| 5002 | 服务器过载 | CPU/内存超限 (预留) |

REST API 错误统一使用 HTTP 状态码（401 / 404 / 400 / 500），响应体 `{ "error": "描述" }`。

---

## 六、业务逻辑实现

### 6.1 认证流程

```
请求到达 authMiddleware
  │
  ├─ 无 Authorization header → 401
  ├─ Bearer token 存在
  │   ├─ supabase.auth.getUser(token)
  │   │   ├─ 成功 → req.userId = user.id → next()
  │   │   └─ 失败/异常 → 401
  │   └─ try/catch 防 Supabase 网络异常 → 401
```

- userId 直接取自 Supabase Auth 的 `user.id`（即 `sub`）
- 不额外建 User 表
- 权限模型：统一 404（不存在和没有权限返回相同错误）

### 6.2 用户统计聚合（getUserStats）

**7 路并行查询**，避免 N+1 问题：

```typescript
const [postCount, followingCount, followerCount, pointsResult,
       achievementCount, totalTranslations, sessionCount] =
  await Promise.all([
    prisma.post.count({ where: { authorId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.pointsRecord.aggregate({ where: { userId }, _sum: { amount: true } }),
    prisma.userAchievement.count({ where: { userId } }),
    prisma.translation.count({ where: { session: { userId } } }),
    prisma.session.count({ where: { userId } }),
  ])
```

### 6.3 成就列表（内存缓存）

成就定义（6 条）改变频率极低，使用 5 分钟 TTL 内存缓存：

```typescript
let achievementCache: CachedAchievement[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000
```

命中时跳过 1 次 DB 查询，仅查 `UserAchievement` 获取当前用户进度。

### 6.4 帖子发布流程

```
POST /api/posts { content: "..." }
  │
  ├── title 可选 → 缺省从 content 前 50 字符派生
  ├── content 必填 → 否则 400
  ├── title ≤ 200 / content ≤ 10000 → 否则 400
  ├── authMiddleware → 取 req.userId
  └── prisma.post.create({ title, content, authorId })
```

### 6.5 关注/取关

- `POST /api/user/:id/follow`：插入 Follow 记录，捕获 P2002（已关注）静默处理
- `DELETE /api/user/:id/follow`：单次 `prisma.follow.delete()`，捕获 P2025（记录不存在）返回 null
- 防止自关注：followerId === followingId → 400

### 6.6 评论列表分页

```
GET /api/posts/:id/comments?limit=20&offset=0
  └── prisma.comment.findMany({
        where: { postId },
        orderBy: { createdAt: 'asc' },
        take: limit,   ← 默认 20，最大 100
        skip: offset,
      })
```

评论索引 `@@index([postId, createdAt])` 确保索引覆盖查询。

---

## 七、与前端交互的数据流

### 7.1 手语识别实时流（WebSocket）

```
前端                              后端
  │                                 │
  ├─ WS connect ───────────────────▶│
  ├─ session_start {token} ────────▶│  JWT 验证
  │                                 │  createSession(userId)
  │◀── session_created {id} ───────┤
  │                                 │
  ├─ frame (20fps) ────────────────▶│  校验 → 日志
  ├─ keypoints (21点) ─────────────▶│  校验 → 日志
  ├─ translation {text} ───────────▶│  saveTranslation → DB
  │                                 │
  ├─ ping ─────────────────────────▶│  isAlive=true
  │◀── pong ───────────────────────┤
  │                                 │
  ├─ session_end {id} ─────────────▶│  endSession → status=ended
  │◀── close(1000) ────────────────┤
```

### 7.2 社区发帖流（REST）

```
前端 CommunityPage                    后端
  │                                     │
  ├─ 用户登录 (Supabase)                │
  ├─ 写内容 + 点发布                     │
  ├─ POST /api/posts {content} ────────▶│  authMiddleware
  │                                     │  createPost → DB
  │◀── 201 {id, title, content, ...} ──┤
  │                                     │
  ├─ 页面自动刷新 GET /api/posts ──────▶│  listPosts (含前3条评论)
  │◀── 200 [{...}, ...] ───────────────┤
  └─ 帖子出现在列表顶部
```

### 7.3 个人中心数据流（REST 聚合）

```
前端 ProfilePage
  │
  ├─ GET /api/user/stats ──────▶  7 路并行聚合
  │◀── { postCount, followingCount, followerCount, points, achievementCount, ... }
  │
  ├─ 点击"关注" → navigate("/profile/follow?tab=following")
  │   └─ GET /api/user/:id/following/count
  │
  ├─ 点击"粉丝" → navigate("/profile/follow?tab=followers")
  │   └─ GET /api/user/:id/followers/count
  │
  └─ 点击"成就" → navigate("/achievements")
      └─ GET /api/achievements → 6 项成就 + 解锁状态
```

---

## 八、开发规范

### 8.1 代码风格

| 规范项 | 要求 |
|--------|------|
| TypeScript | strict 模式，禁止 `any`（catch 子句例外） |
| 分号 | **不使用** |
| 引号 | **单引号** |
| 缩进 | 2 空格 |
| 导出 | `export async function` / `export default router` |
| 导入 | `import { x } from 'module'`（无分号） |

### 8.2 文件命名

| 类型 | 命名 | 示例 |
|------|------|------|
| Service | `xxxService.ts` | `postService.ts` |
| Route | `xxxRoutes.ts` | `postRoutes.ts` |
| Middleware | `xxx.ts` | `auth.ts` |
| 工具 | `xxx.ts` | `validators.ts` |

### 8.3 路由模式

每个路由文件遵循统一模式：

```typescript
import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { someFunction } from '../services/xxxService'

const router = Router()

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const result = await someFunction(req.userId!)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

export default router
```

### 8.4 错误处理

- 路由层：`try { ... } catch (err) { next(err) }` — 统一交给全局 500 中间件
- Service 层：抛异常，由路由层捕获
- 开发模式：暴露 `err.message`（方便调试）
- 生产模式：统一 `"Internal server error"`

### 8.5 日志规范

```typescript
logger.info('Message', { key: value })   // 普通操作
logger.warn('Message', { key: value })   // 异常但可恢复
logger.error('Message', { key: value })  // 需要人工干预
logger.debug('Message', { key: value })  // 调试细节
```

关键操作（创建/删除/更新）必须打印 INFO 日志。

---

## 九、测试与验收

### 9.1 自动化自检

```bash
cd backend
npm run dev              # 启动服务
node scripts/selfcheck.mjs  # 自动化健康检查
```

selfcheck 验证项：

| # | 测试项 | 预期 |
|---|--------|------|
| 1 | `GET /health` | 200 |
| 2 | Prisma DB 连通 | 200 + time 字段 |
| 3 | `GET /api/sessions` 无 token | 401 |
| 4 | `GET /api/sessions/:id` 无 token | 401 |
| 5 | `GET /api/sessions/:id/history` 无 token | 401 |

### 9.2 手动冒烟测试

```powershell
# 无需登录
curl http://localhost:3001/health
curl http://localhost:3001/api/posts
curl http://localhost:3001/api/user/some-id/followers/count

# 需登录（统一返回 401 表示认证生效）
curl http://localhost:3001/api/achievements
curl http://localhost:3001/api/points
curl http://localhost:3001/api/user/stats
```

### 9.3 验收标准

| 维度 | 标准 |
|------|------|
| TypeScript 编译 | `npx tsc --noEmit` 0 错误 |
| 24 个 REST 端点 | 全部可访问，401/200 返回符合 interfaces.md |
| 7 种 WS 消息 | session_start → session_created 链路正常 |
| 数据库 8 表 | Prisma Studio 可查看，索引按 §4.3 创建 |
| 性能 | getUserStats < 50ms / listPosts < 20ms |
| 安全 | userId 校验 / 统一 404 / 帧 ≤ 2MB |

---

## 十、当前后端功能缺口（🔲 待实现）

> **更新时间：** 2026-05-18 — 对比 v2.0，部分 P1 项已在新阶段明确。

基于 [interfaces.md 4.3 节](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/interfaces.md#L898-L935) 和 [frontend-dev-doc.md §十](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/frontend-dev-doc.md#L293-L301)，当前后端有以下功能待补充：

### 10.1 P1 — 收藏持久化

**现状：** `POST /api/posts/:id/bookmark` 仅返回 `{bookmarked: true}`，不做任何持久化。

**实现方案：**
1. Prisma Schema 新增 `Bookmark` 表：`{ id, userId, postId, createdAt }` + `@@unique([userId, postId])`
2. Service：`addBookmark` / `removeBookmark` / `getUserBookmarks`
3. Route：`POST /api/posts/:id/bookmark` 改为 toggle 模式，`GET /api/user/bookmarks` 返回收藏列表

### 10.2 P1 — 点赞去重

**现状：** `POST /api/posts/:id/like` 仅递增 `likes` 字段计数，同一用户可无限点赞。

**实现方案：**
1. Prisma Schema 新增 `Like` 表：`{ id, userId, postId, createdAt }` + `@@unique([userId, postId])`
2. Service：toggle 模式（已点赞→取消，未点赞→新增）
3. 前端配合乐观更新

### 10.3 P1 — 关注用户动态流

**现状：** 社区"关注"Tab 仅过滤 `verified` 字段，非真实关注流。

**实现方案：**
1. `GET /api/posts?feed=following` — 查询当前用户关注的所有用户最近帖子
2. SQL：`SELECT * FROM Post WHERE authorId IN (SELECT followingId FROM Follow WHERE followerId = ?) ORDER BY createdAt DESC`

### 10.4 P1 — 每日使用统计

**现状：** UsageStatsPage 近 7 天图表显示"详细数据即将上线"。

**实现方案：**
1. `GET /api/user/stats/daily?days=7` — 返回最近 N 天每天的使用次数
2. SQL 按日聚合 Session 创建记录

### 10.5 P2 — 用户基本信息批量查询

**现状：** FollowListPage 仅显示用户 ID 缩写，无法展示昵称。

**实现方案：**
1. `GET /api/user/:id/basic` — 返回 `{ userId, nickname, avatar }`（单个用户）
2. 或 `POST /api/user/batch` — `{ userIds: [...] }` → `[{ userId, nickname, avatar }, ...]`

### 10.6 性能优化建议（非功能缺口）

| 优化项 | 说明 |
|--------|------|
| Auth 中间件本地 JWT | 当前每次请求调用 Supabase HTTP（50-200ms），改用 `jsonwebtoken` 本地验证可降至 <1ms |
| Prisma 连接池 | 生产环境在 `DATABASE_URL` 中追加 `?connection_limit=15` |
| API 响应缓存 | 对 `GET /api/achievements` 等准静态端点增加 CDN/Redis 层 |

---

## 十一、双模式部署架构（Phase 2.5 新增）

### 11.1 概述

HandChat 后端支持两种部署/运行模式，前端通过 `VITE_API_BASE_URL` 环境变量切换：

| 模式 | API 目标 | 数据库 | 适用场景 |
|------|---------|--------|---------|
| **A — Edge Function** | Supabase Edge Function (Hono) | Supabase KV 表 (`kv_store`) | 生产部署、无需自建服务器 |
| **B — 本地 Express** | Express + Prisma | Supabase Postgres (直连) | 本地调试、数据库验证、断点排查 |

### 11.2 模式 A：Supabase Edge Function

**代码位置：**
- [frontend/supabase/functions/api/index.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/supabase/functions/api/index.tsx) — 备用 API 路由
- [frontend/supabase/functions/server/index.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/supabase/functions/server/index.tsx) — 主服务函数，含社区/积分/成就/关注等全量接口
- [frontend/supabase/functions/server/kv_store.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/supabase/functions/server/kv_store.tsx) — KV 表持久化封装

**认证方式：**
- 优先解析 `x-user-jwt` 请求头（ES256 JWT 绕过 Supabase API Gateway 限制）
- 降级使用 `Authorization: Bearer` 头 + Supabase `auth.getUser()`
- 服务端使用 `SUPABASE_SERVICE_ROLE_KEY` 或 `SUPABASE_ANON_KEY` 管理权限

**🔴 Phase 2.5 关键修复 — KV 持久化错误：**
- 原实现：`safeKv.set()` 写入失败静默吞掉异常，接口仍返回成功 → 用户数据未实际保存
- 修复后：`safeKv.set/get/del/getByPrefix` 全部改为抛出明确持久化错误，前端可感知写入失败

**部署命令：**
```bash
cd frontend
npx supabase functions deploy server --project-ref jgverskznikedselvshj
```

### 11.3 模式 B：本地 Express 后端

**启动命令：**
```bash
cd backend
npm run dev    # tsx watch → port 3001
```

**前置条件：**
- [backend/.env](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/backend/.env) 已配置 `DATABASE_URL`（Supabase Postgres 直连）
- `npx prisma generate` 已完成

**CORS 配置（Phase 2.5 修复）：**
- 允许本机开发域名任意端口：`/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i`
- 支持 `CORS_ORIGIN` 环境变量自定义允许域（逗号分隔）
- 类型安全处理 `origin` 可能为 undefined

### 11.4 前端切换

编辑 [frontend/.env.local](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/.env.local)：

```env
# 模式 A（默认）
VITE_API_BASE_URL="/edge"

# 模式 B
# VITE_API_BASE_URL="http://localhost:3001"
```

---

## 十二、部署指南

### 12.1 本地开发

```bash
cd backend
npm install
npx prisma generate
npx prisma db push        # 首次建表
npm run dev                # tsx watch → port 3001
```

### 12.2 Railway 部署

1. `railway login && railway link`
2. Dashboard → Variables 设置：
   - `DATABASE_URL` — Supabase Session Pooler (port 6543)
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY`
   - `CORS_ORIGIN` — 前端域名
   - `NODE_ENV=production`
3. Dashboard → Settings → Health Check Path → `/health`
4. `railway up`

### 12.3 数据库迁移

```bash
# 开发环境
npx prisma migrate dev --name description

# 生产环境（自动执行，已写入 start 脚本）
npx prisma migrate deploy
```

### 12.4 种子数据

```bash
npx prisma db seed   # 插入 6 条成就定义
```

### 12.5 Supabase Edge Function（备用）

[`frontend/supabase/functions/server/index.tsx`](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/supabase/functions/server/index.tsx) 包含与 Express 后端功能对等的 Hono 实现，用于 Supabase 原生部署场景。Phase 2 所有新端点已在 §10-13 节实现。

---

## 十三、附录

### A. 环境变量一览

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `DATABASE_URL` | ✅ | — | Supabase PostgreSQL 直连串（端口 5432），用于本地 Prisma 模式 |
| `SUPABASE_URL` | ✅ | — | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | ✅ | — | Supabase 匿名密钥 |
| `PORT` | | 3001 | HTTP/WS 服务端口 |
| `CORS_ORIGIN` | | `http://localhost:5173` | 允许跨域的前端地址，逗号分隔多个 |
| `NODE_ENV` | | `development` | development / production |
| `FAKE_TRANSLATION` | | — | `true` 时启用假翻译引擎 |

**🆕 Phase 2.5 新增说明：**
- `DATABASE_URL` 使用端口 5432（直连），非 Session Pooler 端口 6543，确保 Prisma 迁移正常
- `CORS_ORIGIN` 默认允许 `localhost:5173` 和 `127.0.0.1:5173`，开发模式可放宽到任意本机端口

### B. npm 脚本

| 脚本 | 用途 |
|------|------|
| `npm run dev` | 热重载开发 (tsx watch) |
| `npm run build` | TypeScript 编译 |
| `npm start` | 生产启动 (migrate + node) |
| `npm run db:migrate` | Prisma 迁移 |
| `npm run db:studio` | Prisma Studio 可视化管理 |
| `npm run db:generate` | 重新生成 Prisma Client |
| `npm run selfcheck` | 自动化健康检查 |
| `npm run test:integration` | 全链路集成测试 |

### C. 相关文档索引

| 文档 | 内容 |
|------|------|
| [`interfaces.md`](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/interfaces.md) | 接口规范 (v1.2) — 24 REST + 7 WS 消息 |
| [`phase2-development-plan.md`](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/phase2-development-plan.md) | 第二阶段开发计划 |
| [`frontend-dev-doc.md`](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/frontend-dev-doc.md) | 前端开发文档 (Phase 2.5) |
| [`git-workflow.md`](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/git-workflow.md) | Git 协作指南 |

---

> **本文档由后端团队维护。任何技术方案变更须先更新本文档。**
