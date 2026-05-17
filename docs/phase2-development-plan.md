# HandChat 第二阶段开发计划

> **版本：** v1.0  
> **编写日期：** 2026-05-17  
> **冻结接口文档：** [interfaces.md](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/interfaces.md)  
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

通过全面审计，当前系统状态如下：

| 模块 | 完成度 | 关键缺口 |
|------|--------|---------|
| **前端 handchat 协议层** | 95% | `handPoseDetector.ts` 占位（模型未接入） |
| **前端页面（核心 5 页）** | 100% | 均真实实现 |
| **前端页面（辅助 12 页）** | 80% | 部分使用假数据/纯本地状态 |
| **后端 WebSocket** | 100% | 全部 7 种消息类型已实现 |
| **后端 REST API（核心 3 接口）** | 100% | 完全符合规范 |
| **后端 REST API（4.2 预留）** | 30% | 仅 posts 接口超前实现 |
| **后端认证/安全** | 100% | JWT + userId 校验 + 统一 404 |
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
}

model Comment {
  id        String   @id @default(uuid())
  content   String
  authorId  String
  postId    String
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
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
| `postService` | `backend/src/services/postService.ts` | `createPost`, `listPosts`, `deletePost`, `likePost`, `addComment`, `getComments` |
| `achievementService` | `backend/src/services/achievementService.ts` | `listAchievements`, `unlockAchievement`, `getUserProgress` |
| `pointsService` | `backend/src/services/pointsService.ts` | `getBalance`, `addPoints`, `getHistory` |
| `userService` | `backend/src/services/userService.ts` | `getProfile`, `updateProfile`, `getSettings`, `updateSettings` |

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

#### A4. 前端假数据替换

| 页面 | 当前状态 | 改造目标 |
|------|---------|---------|
| `ProfilePage` | 帖子/关注/粉丝硬编码 | 调用 `/api/posts?authorId=` + `/api/user/stats` |
| `PointsPage` | 积分明细硬编码降级 | 对接 `/api/points` + `/api/points/history` |
| `AchievementsPage` | 成就列表全硬编码 | 对接 `/api/achievements`，逐个成就查询解锁状态 |
| `UsageStatsPage` | 图表数据硬编码 | 调用 `/api/points/history` 聚合真实数据绘图 |
| `PrivacySettingsPage` | 纯本地状态 | 对接 `GET/PUT /api/user/settings`，服务端持久化 |
| `CommunityPage` | 已对接 API ✅ | 补充 `author` 字段（当前缺失 `authorId → nickname` 映射） |
| `EditProfilePage` | 已对接 API ✅ | `nickname`/`avatar`/`bio` 对齐 `UserProfile` 模型 |

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

- [ ] `ProfilePage` — 帖子/关注/粉丝来自 API
- [ ] `PointsPage` — 积分明细全量来自 API
- [ ] `AchievementsPage` — 成就列表全量来自 API
- [ ] `UsageStatsPage` — 图表数据来自真实统计
- [ ] `PrivacySettingsPage` — 设置持久化到服务端
- [ ] `CommunityPage` — `author` 字段补齐

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

| 里程碑 | 内容 | 预估 |
|--------|------|------|
| **M1** | 阶段 A 完成：全部辅助功能接口后端实现 + 前端假数据清除 | — |
| **M2** | 阶段 B 完成：视觉模型接口占位规范化 | — |
| **M3** | 阶段 C 完成：全量联调 + 假数据零残留验证 | — |

### 详细任务分解

#### M1：辅助功能实现

| 子任务 | 负责方 | 依赖 |
|--------|--------|------|
| 1.1 Schema 扩展（5 张新表） | 后端 | — |
| 1.2 `postService` 实现 | 后端 | 1.1 |
| 1.3 `achievementService` 实现 | 后端 | 1.1 |
| 1.4 `pointsService` 实现 | 后端 | 1.1 |
| 1.5 `userService` 实现 | 后端 | 1.1 |
| 1.6 REST API 路由注册 + authMiddleware | 后端 | 1.2-1.5 |
| 1.7 `ProfilePage` 假数据清除 | 前端 | 1.6 |
| 1.8 `PointsPage` 假数据清除 | 前端 | 1.6 |
| 1.9 `AchievementsPage` 假数据清除 | 前端 | 1.6 |
| 1.10 `UsageStatsPage` 假数据清除 | 前端 | 1.6 |
| 1.11 `PrivacySettingsPage` API 对接 | 前端 | 1.6 |
| 1.12 `CommunityPage` author 字段补齐 | 前端 | 1.6 |

#### M2：模型接口规范化

| 子任务 | 负责方 | 依赖 |
|--------|--------|------|
| 2.1 `handPoseDetector.ts` JSDoc 标注 | 前端 | — |
| 2.2 后端 `dtwService.ts` 接口定义（空壳） | 后端 | — |

#### M3：联调与验证

| 子任务 | 负责方 | 依赖 |
|--------|--------|------|
| 3.1 全链路接口契约验证 | 全部 | M1 + M2 |
| 3.2 假数据零残留逐页确认 | 前端 | M1 |
| 3.3 Git commit + tag v0.2.0 | 全部 | 3.1 + 3.2 |

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

| 风险 | 影响 | 对策 |
|------|------|------|
| Supabase Edge Function 路由不支持多路径 | REST API 路由扩展受阻 | 采用 Express 子路由挂载，已在 `index.ts` 中使用 `app.use()` 验证可行 |
| 前端 `api.ts` 的 Edge Function 地址过期 | 辅助功能 API 调不通 | 同步更新 `API_BASE`，或迁移到独立后端地址 |
| 视觉模型开发延迟 | 实时手语识别无法使用 | `handPoseDetector.ts` 占位不影响其他功能前后端联调 |
| 后端 `node_modules` 体积大（376MB） | 部署/构建耗时 | 已完成 `npm prune --production`，进一步用 `pnpm` 可再减 |

---

## 附录 A：当前系统审计清单

### A1. 前端模块审计

| 模块 | 文件 | 状态 |
|------|------|------|
| 类型定义 | `handchat/types.ts` | ✅ 100% — 与 interfaces.md 完全对应 |
| WebSocket 客户端 | `handchat/wsClient.ts` | ✅ 100% — 连接/心跳/重连/全消息类型 |
| 帧采集 | `handchat/protocol/capture.ts` + `frame.ts` | ✅ 100% — 256×256 JPEG quality 85 |
| 关键点协议 | `handchat/protocol/keypoints.ts` | ✅ 100% — 归一化 21 点 |
| 手势确认 | `handchat/recognition/signConfirm.ts` | ✅ 100% — 连续 N 帧确认 |
| 翻译流 | `handchat/translationState.ts` | ✅ 100% — partial/final/sentence_end |
| 错误映射 | `handchat/errorMapping.ts` | ✅ 100% — 6 个错误码 |
| REST 客户端 | `handchat/sessionApi.ts` | ✅ 100% — 3 个核心端点 |
| 本地存储 | `handchat/browserSessionStore.ts` | ✅ 100% |
| **手部检测模型** | **`handchat/recognition/handPoseDetector.ts`** | **❌ 0% — 占位 throw Error** |

### A2. 后端模块审计

| 模块 | 状态 |
|------|------|
| WebSocket 路由（7 种消息） | ✅ 100% |
| 消息校验 | ✅ 100% |
| REST API（3 核心接口） | ✅ 100% |
| 认证中间件 | ✅ 100% |
| 会话服务（8 函数） | ✅ 100% |
| 数据库 Schema（2 表） | ✅ 100% |
| **社区帖子接口（6 端点）** | **⚠️ 超前实现但无独立路由文件** |
| **成就系统** | **❌ 未实现** |
| **积分系统** | **❌ 未实现（部分散落在通用 /api/user/points）** |
| **用户设置** | **❌ 未实现** |

### A3. 前端页面假数据分布

| 页面 | 假数据比例 | 类型 |
|------|-----------|------|
| HelpCenterPage | 100% | 静态内容 |
| UserAgreementPage | 100% | 静态内容 |
| PrivacySettingsPage | 100% | 本地状态无持久化 |
| AchievementsPage | 90% | 成就列表硬编码 |
| UsageStatsPage | 50% | 图表数据硬编码 |
| PointsPage | 30% | 积分明细降级假数据 |
| ProfilePage | 20% | 帖子/关注/粉丝硬编码 |
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
