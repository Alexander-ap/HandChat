# HandChat 前端开发文档 — Phase 2.5

> **编写日期：** 2026-05-18  
> **版本：** v1.3  
> **依赖接口文档：** [interfaces.md](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/interfaces.md)  
> **适用阶段：** Phase 2 辅助功能完成后的前端冲刺与稳定性加固

---

## 一、本阶段已完成功能清单（优先级 P0）

| # | 功能 | 涉及文件 | 状态 |
|---|------|---------|------|
| 1 | 导航重组：手语识别置顶为首屏 | [routes.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/routes.tsx#L27) + [BottomNav.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/components/BottomNav.tsx#L5) | ✅ |
| 2 | 关注/粉丝列表页面 | [FollowListPage.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/pages/FollowListPage.tsx) | ✅ |
| 3 | 个人中心统计卡片点击跳转 | [ProfilePage.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/pages/ProfilePage.tsx#L195-L203) | ✅ |
| 4 | 社区发帖系统（完整CRUD+点赞+评论） | [CommunityPage.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/pages/CommunityPage.tsx) + [api.ts](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/lib/api.ts) | ✅ |
| 5 | 成就/积分/设置 API 对接 | AchievementsPage / PointsPage / PrivacySettingsPage | ✅ |
| 6 | UsageStatsPage 假数据清除 | [UsageStatsPage.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/pages/UsageStatsPage.tsx) | ✅ |
| 7 | 帖子详情页（点击帖子进入独立页） | `PostDetailPage.tsx` + `routes.tsx` + `CommunityPage.tsx` | ✅ |
| 8 | 关注/粉丝列表昵称与头像展示 | `FollowListPage.tsx` + `api.ts` | ✅ |
| 9 | UsageStatsPage 近 7 天统计图表真实对接 | `UsageStatsPage.tsx` + `api.ts` | ✅ |
| 10 | ProfilePage 资料与设置服务端同步 | `ProfilePage.tsx` + `api.ts` | ✅ |
| 11 | 社区"关注"Tab 真实关注流 | `CommunityPage.tsx` + `api.ts` + `frontend/supabase/functions/server/index.tsx` | ✅ |
| 12 | SignLanguageHistory 移除 Mock 模式入口 | `SignLanguageHistoryPage.tsx` + `runtime.ts` + `sessionDataSource.ts` | ✅ |
| 13 | 积分页快捷入口交互收口 | `PointsPage.tsx` | ✅ |
| 14 | 前端 Edge 服务函数补齐资料/设置/关注/帖子详情接口 | `frontend/supabase/functions/server/index.tsx` | ✅ |
| 15 | **Bug 修复：社区评论误判未登录** | [CommunityPage.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/pages/CommunityPage.tsx) | ✅ |
| 16 | **Bug 修复：音量检测 100% 问题** | [SoundDetectionPage.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/pages/SoundDetectionPage.tsx) | ✅ |
| 17 | **Bug 修复：随机登出（路由守卫 + API 401）** | [Root.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/components/Root.tsx) + [api.ts](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/lib/api.ts) | ✅ |
| 18 | **UI 美化：Material Design 3 全量视觉重构** | [theme.css](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/styles/theme.css) + [BottomNav.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/components/BottomNav.tsx) + 全部页面 | ✅ |
| 19 | **统一标题体系：全页面 title-large 级别** | HomePage / CommunityPage / SoundDetectionPage / SignLanguagePage / ProfilePage | ✅ |
| 20 | **社区页面错误态与重试机制** | [CommunityPage.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/pages/CommunityPage.tsx) | ✅ |
| 21 | **API 层超时/AbortError/非 JSON 响应容错** | [api.ts](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/lib/api.ts) | ✅ |
| 22 | **调试上报改为显式开关（默认关闭）** | [api.ts](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/lib/api.ts) + [Root.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/components/Root.tsx) | ✅ |
| 23 | **前端 API 双模式运行支持** | [api.ts](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/lib/api.ts) + [.env.local](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/.env.local) | ✅ |

---

## 二、当前前端页面导航体系

```
底部Tab栏（5个Tab）
├── 🖐 手语  →  /sign-language              [首屏 / index路由]
├── 📷 识别  →  /home                        [原首屏，现为次页]
├── 🔊 声音  →  /sound
├── 💬 社区  →  /community
│   └── /community/posts/:postId           帖子详情页     [🆕 新增]
└── 👤 我的  →  /profile

个人中心二级页面
├── /profile/edit          编辑资料
├── /profile/follow        关注/粉丝列表     [🆕 新增]
├── /change-password       修改密码
├── /points                积分页
├── /achievements          成就页
├── /usage                 使用统计
├── /privacy               隐私设置
├── /help                  帮助中心
└── /agreement             用户协议

手语模块二级页面
├── /sign-language/history             会话历史
└── /sign-language/history/:sessionId  会话详情
```

### 导航重组说明

- **原设计：** `HomePage` (OCR文字识别) 为应用首页（`/` index路由）
- **新设计：** `SignLanguagePage` (手语识别) 为应用首页
- **原因：** 手语识别是 HandChat 核心差异化功能，应处于用户第一眼接触到的最显眼位置
- **兼容性：** 保留 `/home` 路由指向原 HomePage，底部Tab"识别"可正常访问；`/` 和 `/sign-language` 两个URL均渲染手语页面

---

## 三、关注/粉丝系统实现细节

### 3.1 数据结构

关注关系由后端 `Follow` 表存储：
```
Follow { id, followerId, followingId, createdAt }
```

### 3.2 前端API调用

已在 [api.ts](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/lib/api.ts) 中封装 `followApi`，当前包含 7 个方法：

| 方法 | REST 端点 | 认证 | 说明 |
|------|----------|------|------|
| `getFollowerCount(userId)` | `GET /api/user/:id/followers/count` | 可选 | 粉丝数 |
| `getFollowingCount(userId)` | `GET /api/user/:id/following/count` | 可选 | 关注数 |
| `follow(userId)` | `POST /api/user/:id/follow` | 必须 | 关注用户 |
| `unfollow(userId)` | `DELETE /api/user/:id/follow` | 必须 | 取关 |
| `isFollowing(userId)` | `GET /api/user/:id/is-following` | 必须 | 检查关注状态 |
| `getFollowers(userId)` | `GET /api/user/:id/followers` | 可选 | 粉丝列表 |
| `getFollowing(userId)` | `GET /api/user/:id/following` | 可选 | 关注列表 |

### 3.3 FollowListPage 数据流

```
初始化:
  supabase.auth.getSession() → 取当前userId
  ├─ followApi.getFollowingCount() → 显示关注数
  ├─ followApi.getFollowerCount()  → 显示粉丝数
  └─ followApi.getFollowing() → 关注列表

粉丝列表: followApi.getFollowers() → 粉丝列表
  └─ 交叉比对关注列表，判断是否已回关

关注/取关: 乐观更新 + API调用失败自动回滚
```

### 3.4 ProfilePage 统计卡片

| 卡片 | 点击前 | 点击后 |
|------|--------|--------|
| 帖子 | `toast.info("帖子功能开发中")` | `navigate("/community")` |
| 关注 | `toast.info("关注功能开发中")` | `navigate("/profile/follow?tab=following")` |
| 粉丝 | `toast.info("粉丝功能开发中")` | `navigate("/profile/follow?tab=followers")` |

---

## 四、前端开发规范建议

### 4.1 代码风格

| 规范项 | 当前实践 | 建议 |
|--------|---------|------|
| 分号 | 不一致（部分文件有，部分无） | 统一无分号，遵循后端风格 |
| 缩进 | 2空格（React组件）/ 不一致 | 统一 2 空格 |
| 导入顺序 | 未规范 | 建议：React/Hooks → 第三方库 → 内部组件 → lib/API → 类型 |
| 类型定义 | interface 分散在各文件内 | 新增 `src/app/types/` 目录统一管理 |

### 4.2 组件设计

| 规范项 | 说明 |
|--------|------|
| 页面命名 | 统一 `XxxPage.tsx` 后缀，如 `FollowListPage.tsx` |
| 组件拆分 | 超过 200 行的页面考虑抽取子组件，如 `CommunityPage` 中的 `PostList`/`PostCard` |
| Props 类型 | 始终定义显式 interface，避免 inline `{...}` |
| 导出方式 | 页面用 `export default`，工具/API用 `export const` |

### 4.3 状态管理

| 状态类型 | 当前方案 | 建议 |
|---------|---------|------|
| 页面局部状态 | `useState` | ✅ 保持 |
| 跨页面共享（认证用户） | Supabase session | ✅ 保持 |
| 跨页面共享（主题） | `ThemeContext` | ✅ 保持 |
| 跨页面共享（用户统计） | 每页独立 fetch `getUserStats()` | 建议引入 React Query 或 简单 context 缓存，避免 ProfilePage 和 UsageStatsPage 重复请求 |
| 乐观更新 | `CommunityPage` 点赞/关注 | ✅ 保持模式，适用于所有互动操作 |

### 4.4 错误处理

| 规范项 | 建议 |
|--------|------|
| API 调用 | 始终 try/catch + toast 友好提示 |
| 网络失败 | 区分"网络连接失败"和"服务器错误"，前者引导用户检查网络 |
| 认证过期 | 检测 401 → `navigate("/login")`（当前社区页已有） |
| 组件挂载 | `useEffect` return 清理函数，防止内存泄漏 |

---

## 五、代码优化方案

### 5.1 性能优化

| 优化项 | 现状 | 方案 | 预计提升 |
|--------|------|------|---------|
| API 重复请求 | ProfilePage + UsageStatsPage 各自 fetch stats | 引入 UserStatsContext，页面mount时只读缓存 | 减少 50% `/api/user/stats` 调用 |
| 列表虚拟化 | FollowListPage 全量渲染 | 关注数>50时引入 `react-window` | 大列表渲染速度 10x |
| 图片懒加载 | CommunityPage 帖子图片即时加载 | `loading="lazy"` + IntersectionObserver | 首屏加载减少 30% |
| Bundle 体积 | lucide-react 全量导入 | 按需导入（当前已做到） | ✅ |
| API 响应缓存 | 每次切换Tab都重新请求 | SWR/stale-while-revalidate 5分钟 | 减少 80% 重复请求 |

### 5.2 可维护性提升

| 优化项 | 说明 |
|--------|------|
| 提取 `formatTimeAgo` 为工具函数 | 当前在 CommunityPage 和 PointsPage 各自定义，应提取到 `src/app/lib/dateUtils.ts` |
| API base URL 统一 | 当前硬编码在 api.ts 中，`VITE_API_URL` 环境变量方案已实现但需写文档 |
| 类型提取 | `FollowUser`、`PointRecord` 等接口类型从各自页面提取到 `src/app/types/` |
| 常量提取 | 成就图标映射、颜色映射等提取为独立常量文件 |

### 5.3 用户体验改进

| 改进项 | 现状 | 方案 |
|--------|------|------|
| 发帖按钮置灰/中间态 | ✅ 已实现：空内容按钮置灰 + Posting 状态 | — |
| 关注/取关按钮防抖 | 无 | 添加 300ms 防抖，防止连点导致重复请求 |
| 列表加载骨架屏 | ✅ 已实现：CommunityPage 帖子列表 Skeleton | 其他列表可按需迁移 |
| 社区Tab"关注" | 已接 `feed=following` | 建议后续补分页与下拉刷新 |

---

## 六、Material Design 3 视觉重构（Phase 2.5）

### 6.1 设计体系

基于 MD3 Design Tokens 建立统一的色彩、字体、圆角、阴影体系，文件位于 [theme.css](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/styles/theme.css)。

| Token 类别 | 核心变量 | 说明 |
|-----------|---------|------|
| 色彩体系 | `--md-sys-color-*` (30+ tokens) | 以蓝色(#0061a4)为 seed 色生成的完整 MD3 调色板 |
| 字体层级 | `--md-sys-typescale-*` (15 levels) | display / headline / title / body / label 五组，含 small/medium/large |
| 阴影层级 | `--md-sys-elevation-level1~3` | 卡片/浮层/对话框三级阴影 |
| 表面容器 | `--md-sys-color-surface-container-*` (5 levels) | lowest → highest 五级表面色，用于卡片/面板差异化 |
| 圆角 | `--radius` (1rem) | 统一圆角基准，派生 sm/md/lg/xl |

**Tailwind 桥接**：MD3 tokens 通过 `:root` → `--background` / `--primary` 等变量映射到 Tailwind v4 `@theme inline`，实现双向兼容。

### 6.2 组件级视觉规范

| 组件 | 视觉策略 |
|------|---------|
| 底部导航 `BottomNav` | MD3 NavigationBar 风格：圆形高亮指示器 + 标签文字 + Surface Container 背景 |
| 顶部标题栏 | `app-topbar` 类：Surface 背景 + 底部 border + level1 阴影 |
| 卡片 | `app-panel`（基础）/ `app-panel-strong`（强调）/ `app-soft-card`（弱化）三档 |
| 页面标题 | 统一 `text-[length:--md-sys-typescale-title-large-size] font-medium` |
| 按钮 | Primary Container 填充 + On-Primary-Container 文字 |
| 开关 | MD3 Switch 风格：`--switch-background` 映射到 `--md-sys-color-surface-variant` |

### 6.3 已覆盖页面

所有 5 个底部 Tab 页面 + 全部二级页面均已应用 MD3 视觉规范：

- ✅ SignLanguagePage（手语识别首屏）
- ✅ HomePage（OCR 文字识别）
- ✅ SoundDetectionPage（环境音感知）
- ✅ CommunityPage（社区）+ PostDetailPage（帖子详情）
- ✅ ProfilePage（个人中心）+ EditProfilePage + FollowListPage + PointsPage + AchievementsPage + UsageStatsPage + PrivacySettingsPage + HelpPage + AgreementPage

---

## 七、Phase 2.5 Bug 修复详情

### 7.1 社区评论误判未登录

**问题**：已登录用户评论自己帖子时被误判为未登录，弹出"请先登录"提示。

**根因**：评论提交和积分记录在同一个 `try/catch` 中，积分接口鉴权失败将评论结果污染为认证错误。

**修复**：
- 评论成功立即更新 UI 状态（不等待积分接口）
- 积分记录 (`pointsApi.add()`) 置于独立 `try/catch`，失败不影响评论结果
- 发帖接口前后端均追加强制鉴权，防止未登录可发帖

### 7.2 音量检测 100% 问题

**问题**：进入声音感知页面后音量立即飙升至 100%。

**根因**：`GainNode` 增益值设置过高，模拟音频输入振幅被放大到满幅。

**修复**：在 [SoundDetectionPage.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/pages/SoundDetectionPage.tsx) 中将 `gain.value` 从初始值调低至合理范围。

### 7.3 随机登出问题

**问题**：已登录用户在社区/个人页面频繁被跳转到登录页。

**根因**（三处连锁触发）：
1. `Root.tsx` 路由守卫在 `INITIAL_SESSION` 事件中 `!session` 时强制 `navigate("/login")`
2. `api.ts` 的 `apiCall()` 在 401 后直接 `throw Error("认证失败，请重新登录")`
3. UI 组件层 catch 块捕获认证错误后调 `navigate("/login")`

**修复**：
- Root 守卫：移除 `!session` 时的强制跳转，改为静默等待
- apiCall：401 后自动刷新 token + 降级 anon key 重试，而非直接抛错
- apiCall：requireAuth=false 时返回 `{}` 而非抛错
- Token 恢复后立即回写 `cachedAuthToken` 缓存
- 增加 `x-user-jwt` 头处理 ES256 JWT 绕过 Supabase API Gateway 限制

### 7.4 API 层容错加固

| 改进项 | 实现 |
|--------|------|
| 请求超时 | `AbortController` + 12s 超时 → `"请求超时，请稍后重试"` |
| AbortError | 单独捕获，区别于网络错误 |
| 非 JSON 响应 | `parseResponseBody()` 检测 `content-type`，非 JSON 返回 `{ error: text }` |
| 网络失败 | `"网络连接失败，请检查网络后重试"` 友好提示 |
| 调试上报 | `VITE_ENABLE_DEBUG_TELEMETRY=true` 显式开启，默认关闭 |

### 7.5 社区页面错误态

[CommunityPage.tsx](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/pages/CommunityPage.tsx) 新增：

- `recommendedError` / `followingError` 状态变量
- 帖子列表空 + 有错误时渲染错误提示 + "重新加载"按钮
- 异常仅影响当前页面，不再触发全局路由跳转

---

## 八、API 双模式运行

### 8.1 架构说明

前端支持两种运行时 API 目标，通过 `VITE_API_BASE_URL` 环境变量切换：

```
模式 A：Supabase Edge Function（生产/默认）
  frontend ── /edge (Vite 同源代理) ── https://xxx.supabase.co/functions/v1/api
  
模式 B：本地 Express 后端（开发/调试）
  frontend ── http://localhost:3001 ── Express + Prisma + Supabase Postgres
```

| 模式 | `VITE_API_BASE_URL` | 配置文件 | 适用场景 |
|------|---------------------|---------|---------|
| **A — Edge Function** | `/edge`（默认） | `.env.local` | 无需启动本地后端，直连 Supabase 部署 |
| **B — 本地后端** | `http://localhost:3001` | `.env.local` | 本地调试、数据库直连验证、断点排查 |

### 8.2 模式切换

编辑 [frontend/.env.local](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/.env.local)：

```env
# 模式 A（默认，无需修改）
VITE_API_BASE_URL="/edge"

# 模式 B（需先启动本地后端 npm run dev）
# VITE_API_BASE_URL="http://localhost:3001"
```

### 8.3 Vite 代理配置

[`/edge` 同源代理](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/vite.config.ts) 将 `/edge` 前缀的请求转发到 Supabase Edge Function，消除浏览器跨域限制。

---

## 九、环境变量说明

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `VITE_API_BASE_URL` | REST API 基础路径 | `/edge`（Vite 同源代理 → Supabase Edge Function）<br>可选：`http://localhost:3001`（本地 Express 后端） |
| `VITE_ENABLE_DEBUG_TELEMETRY` | 调试上报开关 | （不设置 = 关闭）<br>开发调试时设 `true` 开启，上报到 `127.0.0.1:3939/log` |
| `VITE_HANDCHAT_WS_URL` | WebSocket 地址 | `ws://localhost:3001` |
| `VITE_HANDCHAT_API_URL` | HandChat 模块 API 地址 | `https://<project>.supabase.co/functions/v1/api` |

---

## 十、功能清单（完成状态）

### 10.1 已完成 ✅

| 优先级 | 功能 | 涉及文件 | 完成日期 |
|--------|------|---------|----------|
| **P1** | 社区收藏持久化 | api.ts + CommunityPage.tsx + postService.ts + userRoutes.ts | 2026-05-19 |
| **P1** | 点赞去重（toggle 模式） | api.ts + CommunityPage.tsx + postService.ts + postRoutes.ts | 2026-05-19 |
| **P1** | 帖子编辑功能 | api.ts + postService.ts + postRoutes.ts | 2026-05-19 |
| **P1** | 关注流（following feed） | api.ts + CommunityPage.tsx + postService.ts + postRoutes.ts | 2026-05-19 |
| **P1** | 社区会话校准（评论/点赞/收藏前主动校验登录态） | CommunityPage.tsx | 2026-05-18 |
| **P1** | 帖子本地持久化兜底（sessionStorage） | CommunityPage.tsx | 2026-05-18 |
| **P1** | 关注/粉丝真实列表接口 | followRoutes.ts + FollowListPage.tsx | 2026-05-19 |
| **P1** | 内容审核（违禁词 + 刷屏检测） | moderationService.ts + postRoutes.ts | 2026-05-19 |

### 10.2 待完成

| 优先级 | 功能 | 涉及文件 | 依赖 |
|--------|------|---------|------|
| **P2** | 好友系统 | 全新增 | 架构设计确认（是否区别于关注） |
| **P2** | 积分抽奖 / 商城 / 会员独立页面 | PointsPage.tsx | 产品设计确认 |
| **P2** | `/api/posts` 列表性能优化（N+1 收敛 + Redis 缓存） | postService.ts | 数据库查询重构 |

---

**本文档由前端团队维护。任何新功能开发请先更新本文档。**
