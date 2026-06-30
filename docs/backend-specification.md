# HandChat 后端规格

> 更新日期：2026-06-30
> 当前基线：`feat/frontend-sync-current-code`
> 技术栈：Express + Prisma + Supabase Postgres + Supabase Auth + WebSocket

## 运行方式

```powershell
cd backend
npm install
npm run dev
```

检查：

```powershell
npm run build
npm run selfcheck
```

默认地址：

- REST API：`http://localhost:3001/api`
- Health：`http://localhost:3001/health`
- WebSocket：`ws://localhost:3001`

## 环境变量

后端至少需要：

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_ANON_KEY
```

CE-CSL 推理相关：

```text
CECSL_MODEL_PATH
CECSL_VOCAB_PATH
CECSL_GESTURE_TASK_PATH
CECSL_INFERENCE_URL
```

认证稳定性可调参数：

```text
AUTH_TIMEOUT_MS
AUTH_RETRY_COUNT
AUTH_RETRY_DELAY_MS
AUTH_CACHE_TTL_MS
```

## 认证策略

认证入口：

```text
backend/src/middleware/auth.ts
```

当前行为：

- 从 `Authorization: Bearer <token>` 或 `x-user-jwt` 读取 token。
- 使用 Supabase Auth 验证 token。
- 对 Auth 网络请求增加超时、重试和 token SHA-256 缓存。
- token 无效或过期返回 `401 UNAUTHORIZED`。
- Supabase Auth 网络失败或超时返回 `503 AUTH_SERVICE_UNAVAILABLE`。

这一区分很重要：`401` 表示用户需要重新登录，`503` 表示认证服务暂时不可用，前端不应强制登出。

## REST 路由

### 用户

挂载路径：`/api/user`

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/profile` | 必须 | 获取当前用户资料 |
| `PUT` | `/profile` | 必须 | 更新当前用户资料 |
| `GET` | `/settings` | 必须 | 获取设置 |
| `PUT` | `/settings` | 必须 | 更新设置 |
| `GET` | `/stats` | 必须 | 用户统计，包含实时成就同步 |
| `GET` | `/stats/daily` | 必须 | 近 N 日统计 |
| `GET` | `/bookmarks` | 必须 | 收藏帖子 |
| `GET` | `/posts` | 必须 | 当前用户已发布帖子 |
| `GET` | `/comments` | 必须 | 当前用户已发布评论 |
| `POST` | `/action` | 必须 | 记录积分动作 |
| `GET` | `/:id/basic` | 可选 | 基础公开资料 |

### 社区帖子

挂载路径：`/api/posts`

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/` | 可选 | 推荐帖子列表；`feed=following` 时必须认证 |
| `POST` | `/` | 必须 | 发布帖子 |
| `GET` | `/:id` | 可选 | 帖子详情 |
| `PUT` | `/:id` | 必须 | 编辑自己的帖子 |
| `DELETE` | `/:id` | 必须 | 删除自己的帖子 |
| `POST` | `/:id/like` | 必须 | 点赞/取消点赞 |
| `POST` | `/:id/bookmark` | 必须 | 收藏/取消收藏 |
| `GET` | `/:id/comments` | 可选 | 评论列表 |
| `POST` | `/:id/comments` | 必须 | 发布评论 |
| `DELETE` | `/:id/comments/:commentId` | 必须 | 删除自己的评论 |

帖子列表有短 TTL 缓存和 in-flight 去重；发帖、编辑、删除、点赞、收藏、评论会清理缓存。

### 关注

挂载路径：`/api/user`

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/following/status?ids=a,b` | 必须 | 批量查询是否已关注 |
| `GET` | `/:id/followers/count` | 可选 | 粉丝数 |
| `GET` | `/:id/following/count` | 可选 | 关注数 |
| `POST` | `/:id/follow` | 必须 | 关注 |
| `DELETE` | `/:id/follow` | 必须 | 取消关注 |
| `GET` | `/:id/followers` | 可选 | 粉丝列表 |
| `GET` | `/:id/following` | 可选 | 关注列表 |
| `GET` | `/:id/is-following` | 必须 | 单用户关注状态 |

### 成就和积分

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/achievements` | 必须 | 获取并同步当前用户成就 |
| `GET` | `/api/points` | 可选 | 积分概览 |
| `GET` | `/api/points/history` | 可选 | 积分历史 |

成就不再按预置记录假解锁，而是根据用户真实帖子、翻译、活跃天数、声音检测、收到点赞数同步进度。`UserAchievement.unlockedAt` 允许为空，只有非空时才计入已解锁数量。

### 会话与手语翻译

挂载路径：`/api/sessions`

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/` | 可选 | 会话列表 |
| `GET` | `/:id` | 可选 | 会话详情 |
| `GET` | `/:id/history` | 可选 | 会话翻译历史 |

WebSocket 仍由 Express 后端提供。CE-CSL 原生推理服务由 `CE-CSL/inference_service.py` 提供，后端通过配置调用。

## 数据库注意事项

关键模型位于：

```text
backend/prisma/schema.prisma
```

当前需要特别注意：

- `UserAchievement.unlockedAt` 必须是 nullable。
- 用户资料展示优先使用 `UserProfile.nickname` 和 `UserProfile.avatar`。
- 发帖时会尽量补齐作者资料，避免前端展示 UUID。
- 删除帖子会级联清理关联评论、点赞、收藏等记录。

## 错误语义

| 状态码 | 场景 |
| --- | --- |
| `400` | 请求参数不合法 |
| `401` | 缺少 token、token 无效或过期 |
| `403` | 已登录但无权限 |
| `404` | 资源不存在或不可访问 |
| `422` | 内容审核失败 |
| `429` | 触发限流 |
| `503` | Supabase Auth 或外部依赖网络失败 |

## 当前验证结果

最近基线提交前已验证：

- `npm run build`
- `npm run selfcheck`
- 未登录访问 `/api/user/posts`、`/api/user/comments`、`/api/user/following/status?ids=test` 返回 `401`
- CE-CSL 模型、词表和推理健康检查通过
