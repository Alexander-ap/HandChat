# HandChat 前端开发文档 — Phase 2.5

> **编写日期：** 2026-05-17  
> **版本：** v1.0  
> **依赖接口文档：** [interfaces.md](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/docs/interfaces.md)  
> **适用阶段：** Phase 2 辅助功能完成后的前端冲刺

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

---

## 二、当前前端页面导航体系

```
底部Tab栏（5个Tab）
├── 🖐 手语  →  /sign-language              [首屏 / index路由]
├── 📷 识别  →  /home                        [原首屏，现为次页]
├── 🔊 声音  →  /sound
├── 💬 社区  →  /community
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

已在 [api.ts](file:///c:/Users/Lenovo/Desktop/HandChatFinal/HandChatFinal/frontend/src/app/lib/api.ts) 中封装 `followApi`，包含5个方法：

| 方法 | REST 端点 | 认证 | 说明 |
|------|----------|------|------|
| `getFollowerCount(userId)` | `GET /api/user/:id/followers/count` | 可选 | 粉丝数 |
| `getFollowingCount(userId)` | `GET /api/user/:id/following/count` | 可选 | 关注数 |
| `follow(userId)` | `POST /api/user/:id/follow` | 必须 | 关注用户 |
| `unfollow(userId)` | `DELETE /api/user/:id/follow` | 必须 | 取关 |
| `isFollowing(userId)` | `GET /api/user/:id/is-following` | 必须 | 检查关注状态 |

### 3.3 FollowListPage 数据流

```
初始化:
  supabase.auth.getSession() → 取当前userId
  ├─ followApi.getFollowingCount() → 显示关注数
  ├─ followApi.getFollowerCount()  → 显示粉丝数
  └─ supabase.from("follows").select("following_id") → 关注列表

粉丝列表: supabase.from("follows").select("follower_id") → 粉丝列表
  └─ 交叉比对关注列表，判断是否已回关

关注/取关: 乐观更新 + API调用失败自动回滚
```

### 3.4 ProfilePage 统计卡片

| 卡片 | 点击前 | 点击后 |
|------|--------|--------|
| 帖子 | `toast.info("帖子功能开发中")` | 同（保留占位） |
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
| 发帖后的非空提示 | 当前按"发布"后无反馈 | 空内容时按钮置灰（`disabled`），提前拦截 |
| 关注/取关按钮防抖 | 无 | 添加 300ms 防抖，防止连点导致重复请求 |
| 列表加载骨架屏 | 转圈 Loader | 改为骨架屏 Skeleton 组件（已引入 shadcn/ui Skeleton） |
| 社区Tab"关注" | 仅过滤 `verified` | 改为真实关注用户的动态流（需后端支持） |

---

## 六、待完成功能清单（P1 / P2）

| 优先级 | 功能 | 涉及文件 | 依赖 |
|--------|------|---------|------|
| **P1** | 社区"关注"Tab → 真实关注流 | CommunityPage.tsx | 需要后端 `/api/posts?feed=following` 接口 |
| **P1** | 近7天使用时长图表 | UsageStatsPage.tsx | 需要后端 `/api/user/stats/daily` 接口 |
| **P1** | 帖子详情页（点击帖子进入独立页） | 新建 PostDetailPage.tsx | 无 |
| **P1** | 积分抽奖/商城/会员快捷入口 | PointsPage.tsx | 产品设计确认 |
| **P2** | FollowListPage 用户名展示（非ID） | FollowListPage.tsx | 需要后端 `/api/user/:id/basic` 批量查询接口 |
| **P2** | 好友系统 | 全新增 | 架构设计确认（是否区别于关注） |
| **P2** | SignLanguageHistory 移除Mock模式 | SignLanguageHistoryPage.tsx | 后端 WS 服务稳定 |

---

## 七、环境变量说明

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `VITE_API_URL` | REST API 基础路径 | 开发：`http://localhost:3001/api`<br>生产：自动 fallback 到 Supabase Edge Function |

开发环境无需手动创建 `.env`，代码已自动检测 `import.meta.env.DEV` 并使用 `localhost:3001`。

---

**本文档由前端团队维护。任何新功能开发请先更新本文档。**
