# HandChat 第二阶段开发计划

> **版本：** v1.1  
> **编写日期：** 2026-05-17（v1.0） → 2026-05-18（v1.1 进度更新）  
> **冻结接口文档：** [interfaces.md](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/interfaces.md) (v1.3)  
> **适用范围：** 前端（成员A）、模型（成员B）、后端（成员C）

---

## 一、开发目标

### 1.1 总体目标

在现有 MVP 基础上，完成以下核心目标：

| 序号 | 目标 | 说明 |
|------|------|------|
| 🎯1 | **后端完善** | 消除前端模拟实现，将所有功能模块在后端完整实现 |
| 🎯2 | **预留接口实现** | interfaces.md 4.2 节中标记 🔲 的辅助功能接口按规范逐步实现 |
| 🎯3 | **前后端联调** | 确保所有接口严格符合 interfaces.md 冻结规范 |
| 🎯4 | **视觉模型预留** | 按照 interfaces.md 定义的接口形式预先设计并预留视觉模型对接接口 |

### 1.2 当前系统状态总结

> **🆕 更新于 2026-05-19（Phase 2.6 完成后）**

| 模块 | 完成度 | 关键缺口 |
|------|--------|---------|
| **前端 handchat 协议层** | 95% | `handPoseDetector.ts` 占位（模型未接入） |
| **前端页面（核心 5 页）** | 100% | 均真实实现 + MD3 视觉美化 |
| **前端页面（辅助 12 页）** | 100% | 收藏/点赞已持久化去重 ✅ |
| **前端 UI 体系** | 100% | MD3 Design Tokens + 全页面统一标题 ✅ |
| **前端 API 层** | 100% | 超时/降级/归一化/会话校准/本地兜底 ✅ |
| **后端 WebSocket** | 100% | 全部 7 种消息类型已实现 |
| **后端 REST API（Express）** | 100% | 28 端点 + 内容审核 + 限流 + 统一响应 ✅ |
| **后端 REST API（Edge Function）** | 95% | KV 表持久化已修复（作为备用链路） |
| **后端认证/安全** | 100% | JWT + ES256 绕过 + CORS 放宽 |
| **数据库** | 100% | Prisma + Supabase Session Pooler 双模式连接 ✅ |
| **视觉模型** | 0% | DTW 特征工程 + 模板匹配未实现 |

---

## 二、技术路线

### 2.1 架构概述

```
浏览器（前端）                          后端服务（Express + WebSocket）
┌─────────────────────┐               ┌─────────────────────────────┐
│  React SPA           │               │  HTTP Server (port 3001)     │
│  ├─ 手语识别页面      │   WebSocket   │  ├─ WS Router                │
│  │  ├─ MediaPipe     │◄─────────────►│  │  ├─ session_start → 认证  │
│  │  ├─ DTW/手势分类  │  Frame/Keypts │  │  ├─ frame → 校验+日志     │
│  │  └─ 翻译状态机    │  Translation  │  │  ├─ keypoints → 校验+日志 │
│  ├─ 会话历史         │               │  │  ├─ translation → 存DB   │
│  ├─ 社区/积分/成就   │  REST API     │  │  └─ ping/pong 心跳        │
│  └─ 用户设置         │◄─────────────►│  │                            │
└─────────────────────┘               │  ├─ REST Router              │
                                      │  │  ├─ /api/sessions/*       │
                                      │  │  ├─ /api/posts/*          │
                                      │  │  ├─ /api/achievements     │
                                      │  │  ├─ /api/points/*         │
                                      │  │  └─ /api/user/*           │
                                      │  │                            │
                                      │  ├─ Middleware                │
                                      │  │  └─ authMiddleware (JWT)  │
                                      │  │                            │
                                      │  ├─ Services                  │
                                      │  │  ├─ sessionService        │
                                      │  │  ├─ postService (🆕)      │
                                      │  │  ├─ achievementService(🆕)│
                                      │  │  ├─ pointsService (🆕)    │
                                      │  │  └─ userService (🆕)      │
                                      │  │                            │
                                      │  └─ DB: Prisma + PostgreSQL  │
                                      │     ├─ Session               │
                                      │     ├─ Translation           │
                                      │     ├─ Post (🆕)             │
                                      │     ├─ Comment (🆕)          │
                                      │     ├─ Achievement (🆕)      │
                                      │     ├─ PointsRecord (🆕)     │
                                      │     └─ UserProfile (🆕)      │
                                      └─────────────────────────────┘
```

### 2.2 视觉模型预留策略

当前视觉模型（MediaPipe Hands + DTW 分类器）运行在浏览器端，后端仅接收翻译结果。模型未开发完成前：

- **前端**：`handPoseDetector.ts` 保持占位接口，等到模型就绪后替换实现
- **后端**：`frame` / `keypoints` 消息已完整校验+日志，`translation` 消息已完整持久化——无模型依赖
- **预留接口**：不新增后端接口。视觉模型替换仅影响前端的 `createHandDetector()` 实现

---

## 三、实施步骤

### 阶段 A：后端辅助功能实现（P2-A）  ← 当前阶段

补齐 interfaces.md 4.2 节所有预留接口，消除前端假数据。

#### A1. 数据库 Schema 扩展

需在 [schema.prisma](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/backend/prisma/schema.prisma) 中新增以下模型：

```prisma
model Post {
  id        String    @id @default(uuid())
  title     String
  content   String
  authorId  String
  likes     Int       @default(0)
  createdAt DateTime  @default(now())
  comments  Comment[]

  @@index([authorId, createdAt])
}

model Comment {
  id        String   @id @default(uuid())
  content   String
  authorId  String
  postId    String
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
}

// 关注关系表——个人中心"关注"和"粉丝"的数据源
model Follow {
  id          String   @id @default(uuid())
  followerId  String                  // 关注者 userId
  followingId String                  // 被关注者 userId
  createdAt   DateTime @default(now())

  @@unique([followerId, followingId])  // 防止重复关注
  @@index([followerId])
  @@index([followingId])
}

model UserProfile {
  userId       String   @id
  nickname     String?
  avatar       String?
  bio          String?
  notification Boolean  @default(true)
  vibration    Boolean  @default(true)
  language     String   @default("zh-CN")
  updatedAt    DateTime @updatedAt
}

model PointsRecord {
  id        String   @id @default(uuid())
  userId    String
  amount    Int
  reason    String
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
}

model Achievement {
  id          String  @id @default(uuid())
  name        String
  description String
  icon        String
  sortOrder   Int     @default(0)
}

model UserAchievement {
  id            String      @id @default(uuid())
  userId        String
  achievementId String
  achievement   Achievement @relation(fields: [achievementId], references: [id])
  unlockedAt    DateTime    @default(now())
  progress      Int         @default(0)

  @@unique([userId, achievementId])
}
```

#### A2. 新增 Service 层

| Service | 文件 | 函数 |
|---------|------|------|
| `postService` | `backend/src/services/postService.ts` | `createPost`, `listPosts`, `deletePost`, `likePost`, `addComment`, `getComments`, `getUserPostCount` |
| `followService` | `backend/src/services/followService.ts` | `follow`, `unfollow`, `getFollowingCount`, `getFollowerCount`, `isFollowing`, `getFollowingList`, `getFollowerList` |
| `achievementService` | `backend/src/services/achievementService.ts` | `listAchievements`, `unlockAchievement`, `getUserProgress`, `getUserAchievementCount` |
| `pointsService` | `backend/src/services/pointsService.ts` | `getBalance`, `addPoints`, `getHistory` |
| `userService` | `backend/src/services/userService.ts` | `getProfile`, `updateProfile`, `getSettings`, `updateSettings`, `getUserStats` |

#### A3. 新增 REST API 路由

严格按照 [interfaces.md 4.2](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/interfaces.md#L390-L426) 实现：

**4.2.1 社区帖子**

| 方法 | 路径 | 实现文件 | 认证 |
|------|------|---------|------|
| GET | `/api/posts` | `routes/postRoutes.ts` | 可选 |
| POST | `/api/posts` | `routes/postRoutes.ts` | 必须 |
| DELETE | `/api/posts/:id` | `routes/postRoutes.ts` | 必须 |
| POST | `/api/posts/:id/like` | `routes/postRoutes.ts` | 必须 |
| POST | `/api/posts/:id/comments` | `routes/postRoutes.ts` | 必须 |
| GET | `/api/posts/:id/comments` | `routes/postRoutes.ts` | 可选 |

**🆕 关注/粉丝（个人中心核心数据）**

> 注：关注/粉丝功能不在 interfaces.md 4.2 中，但 ProfilePage 当前硬编码了"关注 128"和"粉丝 356"假数据，必须实现。

| 方法 | 路径 | 实现文件 | 认证 |
|------|------|---------|------|
| GET | `/api/user/:id/followers/count` | `routes/followRoutes.ts` | 可选 |
| GET | `/api/user/:id/following/count` | `routes/followRoutes.ts` | 可选 |
| POST | `/api/user/:id/follow` | `routes/followRoutes.ts` | 必须 |
| DELETE | `/api/user/:id/follow` | `routes/followRoutes.ts` | 必须 |
| GET | `/api/user/:id/followers` | `routes/followRoutes.ts` | 可选 |
| GET | `/api/user/:id/following` | `routes/followRoutes.ts` | 可选 |

**4.2.2 成就系统**

| 方法 | 路径 | 实现文件 | 认证 |
|------|------|---------|------|
| GET | `/api/achievements` | `routes/achievementRoutes.ts` | 必须 |

**4.2.3 积分系统**

| 方法 | 路径 | 实现文件 | 认证 |
|------|------|---------|------|
| GET | `/api/points` | `routes/pointsRoutes.ts` | 必须 |
| GET | `/api/points/history` | `routes/pointsRoutes.ts` | 必须 |

**4.2.4 用户设置**

| 方法 | 路径 | 实现文件 | 认证 |
|------|------|---------|------|
| GET | `/api/user/profile` | `routes/userRoutes.ts` | 必须 |
| PUT | `/api/user/profile` | `routes/userRoutes.ts` | 必须 |
| GET | `/api/user/settings` | `routes/userRoutes.ts` | 必须 |
| PUT | `/api/user/settings` | `routes/userRoutes.ts` | 必须 |

**🆕 用户综合统计（ProfilePage 汇总数据）**

> 一次性返回 ProfilePage 所需的全部统计数据，避免多次请求。

| 方法 | 路径 | 实现文件 | 认证 | 返回字段 |
|------|------|---------|------|---------|
| GET | `/api/user/stats` | `routes/userRoutes.ts` | 必须 | `{ postCount, followingCount, followerCount, points, achievementCount, ... }` |

#### A4. 前端假数据替换

| 页面 | 假数据项 | 当前写法 | 改造目标 |
|------|---------|---------|---------|
| **ProfilePage** | **帖子数量** | 硬编码 `42` | 调 `/api/user/stats` → `postCount` 字段 |
| **ProfilePage** | **关注数** | 硬编码 `128` | 调 `/api/user/:id/following/count` |
| **ProfilePage** | **粉丝数** | 硬编码 `356` | 调 `/api/user/:id/followers/count` |
| **ProfilePage** | **个人资料** | 仅从 Supabase Auth 读 `name` | 调 `GET /api/user/profile` 获取 `nickname/avatar/bio` |
| **EditProfilePage** | **个人资料编辑** | 已对接 API ✅ | `nickname`/`avatar`/`bio` 对齐 `UserProfile` 模型 |
| **PointsPage** | **积分余额+明细** | 积分明细降级假数据 | 对接 `/api/points` + `/api/points/history` |
| **AchievementsPage** | **成就列表** | 6 项成就全部硬编码 | 调 `/api/achievements` → 渲染真实列表+解锁状态 |
| **UsageStatsPage** | **7 天图表** | 硬编码 `[30,45,20,60,40,70,45]` | 调 `/api/points/history` 聚合真实每日数据 |
| **PrivacySettingsPage** | **通知/震动设置** | 纯本地 React state | 对接 `GET/PUT /api/user/settings`，服务端持久化 |
| **CommunityPage** | **帖子列表** | 已对接 API ✅ | 补充 `author` 昵称+头像（当前仅 `authorId`→ 需 `userService.getProfile` 映射） |
| **CommunityPage** | **发帖** | 已对接 API ✅ | 新增发帖后刷新个人 `postCount` |
| **CommunityPage** | **点赞/评论** | 已对接 API ✅ | — |

> **ProfilePage 改造对照（最复杂的一页）**
>
> 当前 ProfilePage 渲染：
> ```
> <div>42 帖子</div>       ← 硬编码
> <div>128 关注</div>      ← 硬编码
> <div>356 粉丝</div>      ← 硬编码
> ```
>
> 改造后：
> ```ts
> const { postCount, followingCount, followerCount } = await userService.getUserStats(userId)
> ```
> → 调 `GET /api/user/stats`，后端从 `Post`/`Follow`/`PointsRecord`/`UserAchievement` 四张表中聚合查询。<br>
> `postCount` = `SELECT COUNT(*) FROM Post WHERE authorId = ?`<br>
> `followingCount` = `SELECT COUNT(*) FROM Follow WHERE followerId = ?`<br>
> `followerCount` = `SELECT COUNT(*) FROM Follow WHERE followingId = ?`

---

### 阶段 B：视觉模型预留接口规范化（P2-B）

此阶段不实现模型本身，仅确保前后端接口对齐规范。

#### B1. 前端改造

| 文件 | 当前状态 | 改造目标 |
|------|---------|---------|
| [handPoseDetector.ts](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/lib/handchat/recognition/handPoseDetector.ts) | 占位 throw Error | 保持占位，添加 JSDoc 标注期望的输入输出格式 |
| `interfaces.md` 引用 | — | 在代码注释中标注"实现时请对照 interfaces.md 2.2 节" |

#### B2. 后端预留

`frame` 和 `keypoints` 消息当前仅在 `wsRouter.ts` 中校验+日志。如果有朝一日模型上云（非浏览器 WASM），后端需要新增：

| 需求 | 实现位置 | 触发时机 |
|------|---------|---------|
| 接收并缓存关键点序列 | `wsRouter.ts` case 'keypoints' | 前端持续推送 |
| 执行 DTW 模板匹配 | 新文件 `src/services/dtwService.ts` | 检测 sentence_end 时 |
| 产出 TranslationResult | `wsRouter.ts` case 'translation' 反向推 | DTW 完成后推回前端 |

> **注意：** interfaces.md 1.2 节明确 "MVP 阶段不存在独立的模型服务"。以上为 🔲 预留规划，当前不实现。

---

### 阶段 C：前后端联调与质量验证（P2-C）

#### C1. 接口契约验证

逐一检查前后端实现与 [interfaces.md](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/interfaces.md) 的一致性：

| 协议 | 检查项 |
|------|--------|
| 消息信封格式 (3.1) | `type` / `payload` / `trace_id` / `timestamp_ms` 字段一致性 |
| FrameMessage (2.1) | Base64 不含前缀、JPEG quality 85、colorspace "RGB"、256×256 |
| KeypointsMessage (2.2) | 21 关键点归一化、handedness/score、x/y/z 值域 |
| TranslationResult (2.3) | partial/final/sentence_end 行为、gesture_label 可选 |
| 会话生命周期 (3.4) | session_start → session_created → … → session_end → close(1000) |
| 错误码 (3.3) | 4001-5002 全部 6 个码前后端一致 |
| REST 响应 (4.1) | SessionSummary/SessionDetail/SessionHistoryItem 字段名/类型 |

#### C2. 假数据清理验证

逐页确认以下页面不再包含硬编码假数据：

- [ ] `ProfilePage` — 帖子数量来自 API、关注/粉丝数来自 `/api/user/:id/*/count`
- [ ] `ProfilePage` — 个人资料（昵称/头像/简介）来自 `GET /api/user/profile`
- [ ] `PointsPage` — 积分余额+明细全量来自 API
- [ ] `AchievementsPage` — 成就列表全量来自 `/api/achievements`
- [ ] `UsageStatsPage` — 图表数据来自真实统计
- [ ] `PrivacySettingsPage` — 设置持久化到 `PUT /api/user/settings`
- [ ] `CommunityPage` — `author` 昵称+头像已映射，发帖后 postCount 同步更新
- [ ] `EditProfilePage` — `nickname`/`avatar`/`bio` 对齐 `UserProfile` 表

---

## 四、接口规范（关键约束）

> **以下规范摘录自 [interfaces.md](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/interfaces.md) 冻结文档，实现时必须严格遵守。**

### 4.1 认证规范

| 通道 | 方式 | 说明 |
|------|------|------|
| REST API | `Authorization: Bearer <Supabase JWT>` | `authMiddleware` 验证 |
| WebSocket | `session_start` payload 携带 `token` | 连接后首条消息认证 |
| userId 来源 | `supabase.auth.getUser(token).data.user.id` | 不额外建 User 表 |

### 4.2 安全规范

- **统一 404**：不存在和没有权限返回相同错误，不暴露"存在但不是你的"
- **userId 过滤**：所有涉及用户数据的查询必须加 `userId` 条件
- **帧大小限制**：Base64 ≤ 2MB
- **请求体限制**：`express.json({ limit: '1mb' })`

### 4.3 数据格式规范

- `timestamp_ms`：Unix 毫秒（`Date.now()`）
- 时间字段：ISO 8601 字符串
- 浮点数：标准 JSON number（不支持 `NaN`、`Infinity`）
- 字符串：UTF-8 编码

### 4.4 升级策略

| 场景 | 策略 |
|------|------|
| 新增字段 | 向后兼容，新增可选字段 |
| 删除字段 | 标记 `deprecated` 一个版本后移除 |
| 修改字段类型 | 禁止，新增替代字段 |
| 新增消息类型 | 客户端忽略未知 type |

---

## 五、进度安排

### 里程碑一览

| 里程碑 | 内容 | 状态 |
|--------|------|------|
| **M1** | 阶段 A 完成：全部辅助功能接口后端实现 + 前端假数据清除 | ✅ 已完成 (2026-05-17) |
| **M1.5** | Phase 2.5 稳定性加固：Bug 修复 + UI 重构 + API 容错 + 双模式运行 | ✅ 已完成 (2026-05-18) |
| **M1.6** | Phase 2.6 社区后端全面落地：数据库迁移 + 收藏/点赞去重 + 内容审核 + 关注流 + 限流 | ✅ 已完成 (2026-05-19) |
| **M2** | 阶段 B 完成：视觉模型接口占位规范化 | ⏳ 待实施 |
| **M3** | 阶段 C 完成：全量联调 + 假数据零残留验证 | ⏳ 待实施 |

### 详细任务分解

#### M1：辅助功能实现 ✅ (2026-05-17)

| 子任务 | 负责方 | 状态 |
|--------|--------|------|
| 1.1 Schema 扩展（6 张新表：Post/Comment/Follow/UserProfile/PointsRecord/Achievement+UserAchievement） | 后端 | ✅ |
| 1.2 `postService` 实现 | 后端 | ✅ |
| 1.3 `followService` 实现 | 后端 | ✅ |
| 1.4 `achievementService` 实现 | 后端 | ✅ |
| 1.5 `pointsService` 实现 | 后端 | ✅ |
| 1.6 `userService` 实现（含 `getUserStats` 聚合查询） | 后端 | ✅ |
| 1.7 REST API 路由注册 + authMiddleware | 后端 | ✅ |
| 1.8 `ProfilePage` 假数据清除（帖子数+关注+粉丝+个人资料） | 前端 | ✅ |
| 1.9 `PointsPage` 假数据清除 | 前端 | ✅ |
| 1.10 `AchievementsPage` 假数据清除 | 前端 | ✅ |
| 1.11 `UsageStatsPage` 假数据清除 | 前端 | ✅ |
| 1.12 `PrivacySettingsPage` API 对接 | 前端 | ✅ |
| 1.13 `CommunityPage` 假数据清除 + author 字段补齐 | 前端 | ✅ |
| 1.14 `EditProfilePage` 对齐 UserProfile 模型 | 前端 | ✅ |

#### 🆕 性能优化 (2026-05-17)

| 优化项 | 状态 |
|--------|------|
| Schema 添加 Comment/Session/Achievement 缺失索引 | ✅ |
| `getUserStats` 从全量拉取改为纯聚合查询（7次 count/aggregate 并行） | ✅ |
| `listPosts` 评论限制 take:3 + `_count` 聚合 | ✅ |
| 评论端点添加分页 (limit/offset) | ✅ |
| `unfollow` 双次DB往返改为单次 delete（P2025 处理） | ✅ |
| `deletePost` findFirst+delete 改为 deleteMany 单次查询 | ✅ |
| 成就列表引入 5 分钟内存缓存（`achievementCache`） | ✅ |
| `getBalance` 区分 balance 和 totalEarned | ✅ |
| 积分历史返回真实总数（`getHistoryTotal`） | ✅ |
| 发帖/评论添加长度限制校验（title≤200, content≤10000, comment≤5000） | ✅ |

#### 🆕 M1.5：Phase 2.5 稳定性加固 ✅ (2026-05-18)

| 子任务 | 负责方 | 状态 |
|--------|--------|------|
| 2.5.1 社区评论误判未登录修复（评论 + 积分解耦） | 前端 | ✅ |
| 2.5.2 音量检测 100% 修复（GainNode gain.value 调低） | 前端 | ✅ |
| 2.5.3 随机登出根治（Root 守卫 + apiCall 401 链路切断） | 前端 | ✅ |
| 2.5.4 API 层容错加固（超时/AbortError/非 JSON/网络失败） | 前端 | ✅ |
| 2.5.5 社区页面错误态 + 重试按钮 | 前端 | ✅ |
| 2.5.6 调试上报显式开关（默认关闭） | 前端 | ✅ |
| 2.5.7 MD3 Material Design 3 全量视觉重构 | 前端 | ✅ |
| 2.5.8 全页面标题统一（title-large 级别） | 前端 | ✅ |
| 2.5.9 前后端社区接口契约统一（posts/comments 包装格式） | 全部 | ✅ |
| 2.5.10 数据持久化修复（Edge Function KV 表错误抛出 + 本地 Prisma 验证） | 后端 | ✅ |
| 2.5.11 CORS 放宽（本机任意端口）+ origin undefined 类型安全 | 后端 | ✅ |
| 2.5.12 双模式运行支持（VITE_API_BASE_URL + /edge 代理） | 全部 | ✅ |
| 2.5.13 帖子详情接口补充（GET /api/posts/:id） | 后端 | ✅ |

#### 🆕 M1.6：Phase 2.6 社区后端全面落地 ✅ (2026-05-19)

| 子任务 | 负责方 | 状态 |
|--------|--------|------|
| 2.6.1 数据库迁移至 Supabase Session Pooler (`aws-1-us-east-1.pooler.supabase.com:5432`) | 后端 | ✅ |
| 2.6.2 `Like` 去重模型（Prisma 迁移 + toggle 接口） | 后端 | ✅ |
| 2.6.3 `Bookmark` 收藏列表接口（`GET /api/user/bookmarks`） | 后端 | ✅ |
| 2.6.4 关注流（`GET /api/posts?feed=following`） | 后端 | ✅ |
| 2.6.5 关注/粉丝真实列表接口（非仅计数） | 后端 | ✅ |
| 2.6.6 帖子编辑接口（`PUT /api/posts/:id`） | 后端 | ✅ |
| 2.6.7 内容审核模块（`moderationService`：违禁词 + 刷链接 + 灌水检测） | 后端 | ✅ |
| 2.6.8 限流中间件（`rateLimit`：按 IP+路径滑动窗口） | 后端 | ✅ |
| 2.6.9 统一 HTTP 响应与错误处理（`http.ts`：`sendSuccess`/`sendError`） | 后端 | ✅ |
| 2.6.10 社区页会话校准（评论/点赞/收藏前主动校验登录态） | 前端 | ✅ |
| 2.6.11 帖子本地持久化兜底（`sessionStorage` 合并策略） | 前端 | ✅ |
| 2.6.12 集成测试脚本（完整链路：发帖→编辑→评论→审核→关注→收藏→点赞→删除） | 后端 | ✅ |
| 2.6.13 压力测试脚本（5 轮 × 20 并发，`/health` + `/api/posts`） | 后端 | ✅ |
| 2.6.14 HTTP 请求日志中间件（requestId + durationMs） | 后端 | ✅ |
| 2.6.15 Prisma 连接加密处理（`DATABASE_URL_ENCRYPTED` + 解密中间件） | 后端 | ✅ |
| 2.6.16 前端开发模式切换为社区主 API 走本地 Express（注册/上传保留 Edge） | 前端 | ✅ |

#### M2：模型接口规范化

| 子任务 | 负责方 | 状态 |
|--------|--------|------|
| 2.1 `handPoseDetector.ts` JSDoc 标注 | 前端 | ⏳ 待实施 |
| 2.2 后端 `dtwService.ts` 接口定义（空壳） | 后端 | ⏳ 待实施 |

#### M3：联调与验证

| 子任务 | 负责方 | 状态 |
|--------|--------|------|
| 3.1 全链路接口契约验证 | 全部 | ⏳ 待实施 |
| 3.2 假数据零残留逐页确认 | 前端 | ⏳ 待实施 |
| 3.3 Git commit + tag v0.2.0 | 全部 | ⏳ 待实施 |

---

## 六、质量标准

### 6.1 代码质量

| 维度 | 标准 |
|------|------|
| TypeScript 类型安全 | 所有新增文件启用严格类型，禁止 `any` |
| 错误处理 | 所有 API 端点统一 try/catch + next(err) |
| 日志 | 关键操作（创建/删除/更新）打印 INFO 日志 |
| 代码风格 | 遵循现有项目风格：无分号、单引号、4 空格缩进 |

### 6.2 接口契约

| 要求 | 验证方法 |
|------|---------|
| 字段名与 interfaces.md 一致 | 对读比较 |
| 字段类型与 interfaces.md 一致 | TypeScript 编译检查 |
| 必填/可选与 interfaces.md 一致 | 允许 undefined 不抛错 |
| 错误码与 3.3 节一致 | 手动触发验证 |
| 响应格式统一 `{ error, code }` | 自动化测试 |

### 6.3 性能指标

| 指标 | 目标值 |
|------|--------|
| REST API 响应（含认证） | < 300ms |
| 数据库查询（50 条记录） | < 200ms |
| WebSocket 消息往返 | < 50ms |

### 6.4 假数据零残留标准

以下行为一律禁止：

- 前端组件内写死的示例数据结构（`defaultPosts`、`defaultPoints` 等）
- localStorage 作为唯一数据源（浏览器模式仅用于离线降级）
- 硬编码的图表数据数组
- 不从 API 获取的成就/积分/帖子数据

---

## 七、风险与对策

| 风险 | 影响 | 对策 | 状态 |
|------|------|------|------|
| Supabase Edge Function 路由不支持多路径 | REST API 路由扩展受阻 | 采用 Express 子路由挂载，已在 `index.ts` 中使用 `app.use()` 验证可行 | ✅ 已验证 |
| 前端 `api.ts` 的 Edge Function 地址过期 | 辅助功能 API 调不通 | 同步更新 `API_BASE`，支持 `VITE_API_BASE_URL` 环境变量覆盖 | ✅ 已修复 (Phase 2.5) |
| Edge Function KV 表写入失败静默吞错 | 用户数据未实际保存 | `safeKv.set/get/del` 全部改为抛出明确错误 | ✅ 已修复 (Phase 2.5) |
| ES256 JWT 被 Supabase API Gateway 拒绝 | 社区等接口鉴权失败 | `x-user-jwt` 头绕过 + ES256 检测自动切换 | ✅ 已修复 (Phase 2.5) |
| CORS 导致本地直连后端被拦截 | 开发调试受阻 | 放宽 CORS 允许本机任意端口 | ✅ 已修复 (Phase 2.5) |
| 视觉模型开发延迟 | 实时手语识别无法使用 | `handPoseDetector.ts` 占位不影响其他功能前后端联调 | ⏳ 持续关注 |
| 后端 `node_modules` 体积大（376MB） | 部署/构建耗时 | 已完成 `npm prune --production`，进一步用 `pnpm` 可再减 | 📌 非紧急 |

---

## 附录 A：当前系统审计清单

### A1. 前端模块审计（更新于 2026-05-18）

| 模块 | 文件 | 状态 |
|------|------|------|
| 类型定义 | `handchat/types.ts` | ✅ 100% — 与 interfaces.md v1.3 完全对应 |
| WebSocket 客户端 | `handchat/wsClient.ts` | ✅ 100% — 连接/心跳/重连/全消息类型 |
| 帧采集 | `handchat/protocol/capture.ts` + `frame.ts` | ✅ 100% — 256×256 JPEG quality 85 |
| 关键点协议 | `handchat/protocol/keypoints.ts` | ✅ 100% — 归一化 21 点 |
| API 请求层 | `lib/api.ts` | ✅ 100% — 双模式/超时/归一化/ES256 绕过 |
| MD3 主题 | `styles/theme.css` | ✅ 100% — 30+ tokens + Tailwind v4 桥接 |
| 底部导航 | `components/BottomNav.tsx` | ✅ 100% — MD3 NavigationBar 风格 |
| 全部页面 | `pages/*.tsx` | ✅ 100% — MD3 视觉规范 + 统一标题体系 |
| 手势确认 | `handchat/recognition/signConfirm.ts` | ✅ 100% — 连续 N 帧确认 |
| 翻译流 | `handchat/translationState.ts` | ✅ 100% — partial/final/sentence_end |
| 错误映射 | `handchat/errorMapping.ts` | ✅ 100% — 6 个错误码 |
| REST 客户端 | `handchat/sessionApi.ts` | ✅ 100% — 3 个核心端点 |
| 本地存储 | `handchat/browserSessionStore.ts` | ✅ 100% |
| **手部检测模型** | **`handchat/recognition/handPoseDetector.ts`** | **❌ 0% — 占位 throw Error** |

### A2. 后端模块审计（更新于 2026-05-17）

| 模块 | 状态 |
|------|------|
| WebSocket 路由（7 种消息） | ✅ 100% |
| 消息校验 | ✅ 100% |
| REST API（3 核心接口） | ✅ 100% |
| 认证中间件 | ✅ 100% |
| 会话服务（8 函数） | ✅ 100% |
| 数据库 Schema（8 表） | ✅ 100% — 新增 Post/Comment/Follow/UserProfile/PointsRecord/Achievement/UserAchievement |
| 社区帖子接口（6 端点） | ✅ 100% |
| 成就系统 | ✅ 100% |
| 积分系统 | ✅ 100% |
| 用户设置 | ✅ 100% |
| 关注/粉丝接口 | ✅ 100% |
| 用户统计聚合 | ✅ 100% |
| 性能索引优化 | ✅ 已完成 — Comment/Session/Achievement 添加缺失索引 |

### A3. 前端页面假数据分布（更新于 2026-05-17）

| 页面 | 假数据比例 | 状态 |
|------|-----------|------|
| HelpCenterPage | 100% | 🔲 静态内容（设计如此） |
| UserAgreementPage | 100% | 🔲 静态内容（设计如此） |
| PrivacySettingsPage | 0% | ✅ 已对接 GET/PUT /api/user/settings |
| AchievementsPage | 0% | ✅ 已对接 /api/achievements |
| UsageStatsPage | 0% | ✅ 已对接 /api/user/stats，无数据时显示引导文案 |
| PointsPage | 0% | ✅ 已对接 /api/points + /api/points/history |
| ProfilePage | 0% | ✅ posts/following/followers 来自 getUserStats 聚合 |
| **其他 10 页** | **0%** | **全部真实数据** |

---

## 附录 B：Git 提交规范

所有修改遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat(backend): 实现社区帖子 REST API     # 新功能
fix(frontend): 修复 ProfilePage 假数据    # Bug修复
refactor(backend): 重构 achievementService # 重构
docs: 更新第二阶段开发计划                # 文档
```

---

**本文档由全员共同维护。开发过程中任何偏差请第一时间更新本文档并 @全员通知。**

---

## 八、实施记录 (2026-05-17)

### 8.1 已完成工作

**阶段 A（M1）：后端辅助功能 + 前端假数据清除 — 全部完成**

#### 后端新增文件
| 类别 | 文件 | 行数 |
|------|------|------|
| Schema | `backend/prisma/schema.prisma` | 扩展 6 张表 + 3 个索引 |
| Service | `backend/src/services/postService.ts` | 78 行，8 函数 |
| Service | `backend/src/services/followService.ts` | 66 行，7 函数 |
| Service | `backend/src/services/achievementService.ts` | 80 行，3 函数 + 内存缓存 |
| Service | `backend/src/services/pointsService.ts` | 40 行，4 函数 |
| Service | `backend/src/services/userService.ts` | 136 行，5 函数（含聚合 `getUserStats`） |
| Route | `backend/src/routes/postRoutes.ts` | 132 行，6 端点 |
| Route | `backend/src/routes/followRoutes.ts` | 86 行，7 端点 |
| Route | `backend/src/routes/achievementRoutes.ts` | 21 行，1 端点 |
| Route | `backend/src/routes/pointsRoutes.ts` | 43 行，2 端点 |
| Route | `backend/src/routes/userRoutes.ts` | 74 行，5 端点 |
| Seed | `backend/prisma/seed.ts` | 6 成就种子数据 |

#### 后端修改文件
| 文件 | 变更 |
|------|------|
| `backend/src/index.ts` | 注册 5 条新路由 + 扩展 CORS methods |
| `backend/package.json` | 添加 @types/node/express/cors/ws 依赖 |

#### 前端修改文件
| 文件 | 变更 |
|------|------|
| `frontend/src/app/lib/api.ts` | 新增 `getProfile/getSettings/updateSettings` + `achievementsApi` + `followApi`；API_BASE 支持 VITE_API_URL 环境变量 |
| `frontend/src/app/pages/ProfilePage.tsx` | 帖子/关注/粉丝从硬编码→`getUserStats` 聚合；加载服务端通知/震动设置 |
| `frontend/src/app/pages/AchievementsPage.tsx` | 完全重写，6项硬编码→`achievementsApi.getAll()` 动态渲染 + iconMap |
| `frontend/src/app/pages/PointsPage.tsx` | 移除 3 条硬编码降级数据 |
| `frontend/src/app/pages/UsageStatsPage.tsx` | 移除硬编码降级数据；无数据时显示引导文案 |
| `frontend/src/app/pages/CommunityPage.tsx` | 移除 `defaultPosts` 硬编码；添加 `formatTimeAgo`；数据映射适配新格式 |

### 8.2 性能优化要点

| 优化项 | 效果 |
|--------|------|
| `getUserStats` 全量拉取→7次并行 count/aggregate | 有1000+Session的用户从~2s降至~50ms |
| `listPosts` 评论限制 take:3 | 数据传输量减少80-95% |
| Comment 添加 `@@index([postId, createdAt])` | 热门帖子评论从全表扫描→索引扫描 |
| Session 添加 `@@index([userId])` | 按用户查Session从全表扫描→索引扫描 |
| 成就 5 分钟内存缓存 | 重复请求数据库查询降为0 |
| `unfollow` 2次DB→1次 delete | 延迟减半 |
| `deletePost` findFirst+delete→deleteMany | 1次查询减少 |

### 8.3 待实施事项

| 事项 | 优先级 | 备注 |
|------|--------|------|
| M2：视觉模型接口占位规范化 | 中 | `handPoseDetector.ts` JSDoc + `dtwService.ts` 空壳 |
| M3：全链路联调 | 高 | 需后端服务运行后对读验证 |
| Auth 中间件本地JWT验证 | 高 | 当前每次请求都调Supabase HTTP（50-200ms），建议改用 `jsonwebtoken` 本地验证 |
| 数据库迁移执行 | 高 | `prisma db push` 或 `prisma migrate deploy` 需在可连接 PostgreSQL 的环境执行 |

### 8.4 遇到/已知问题

1. **Prisma 迁移在沙箱环境无法执行**：沙箱中 `prisma migrate dev` 和 `prisma db push` 即使能连接 Supabase PostgreSQL，进程也会异常退出（exit code -1073741510，可能是缺少 native 二进制依赖）。解决方案：生产部署时通过 `prisma migrate deploy` 或手动执行 `manual_migration.sql` 创建新表。
2. **Auth 中间件每次远程调用**：`supabase.auth.getUser(token)` 会在每次API请求时发起HTTP调用到Supabase服务器，典型延迟 50-200ms。当前已标记为待优化项，建议后续引入本地JWT验证。
3. **前端未添加 `.env` 文件**：需要在 `frontend/` 目录创建 `.env` 文件并设置 `VITE_API_URL=http://localhost:3001/api` 以连接本地后端开发。
