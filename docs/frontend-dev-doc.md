# HandChat 前端开发文档

> 更新日期：2026-06-30
> 当前基线：`feat/frontend-sync-current-code`
> 技术栈：React + Vite + TypeScript + Tailwind + Capacitor

## 运行方式

```powershell
cd frontend
npm install
npm run dev
```

生产构建检查：

```powershell
npm run build
```

默认前端地址：`http://localhost:5173`

## API 连接

前端 API 统一封装在：

```text
frontend/src/app/lib/api.ts
```

当前默认生产注册链路使用 Supabase Edge Function：

```text
https://<project>.supabase.co/functions/v1/make-server-481f4acb
```

本地业务 API 推荐连接 Express 后端：

```text
http://localhost:3001/api
```

认证请求统一通过 Supabase session token。`api.ts` 会处理：

- access token 缓存与同步。
- ES256 token 的 `x-user-jwt` 兼容头。
- 401 后刷新 session 并重试。
- 请求超时、网络失败、非 JSON 响应容错。
- 调试遥测默认关闭，只有设置 `VITE_ENABLE_DEBUG_TELEMETRY=true` 才开启。

## 路由结构

核心路由集中在：

```text
frontend/src/app/routes.tsx
```

当前重点页面：

| 路由 | 页面 |
| --- | --- |
| `/` | 受登录保护的首页入口 |
| `/login` | 登录 |
| `/register` | 注册 |
| `/sign-language` | 手语识别 |
| `/community` | 社区 |
| `/community/post/:postId` | 帖子详情 |
| `/profile` | 我的 |
| `/profile/posts` | 我的帖子管理 |
| `/profile/comments` | 我的评论管理 |
| `/profile/follow` | 关注/粉丝列表 |
| `/points` | 积分 |
| `/achievements` | 成就 |
| `/usage` | 使用统计 |

## 当前已完成的关键修复

- 未登录访问受保护页面时，路由守卫直接跳转登录页。
- 数据库中已有用户资料时，不再重复显示新手教程。
- 注册接口修正为 Supabase Edge Function 根路径，避免错误拼接 `/api`。
- 社区关注流使用稳定 token 判断，不再误判未登录。
- 社区帖子卡支持关注/取消关注作者。
- 发帖作者展示昵称，不再直接展示用户编号。
- 评论发布后的积分记录改为后台异步，不阻塞评论成功态。
- 个人中心新增独立帖子和评论管理页，支持删除、转发、定位。
- 成就页对进度做保护，避免 `NaN%`。

## 页面开发约定

- 新页面放在 `frontend/src/app/pages/`。
- 后端请求先封装到 `frontend/src/app/lib/api.ts`，页面不要散写 `fetch`。
- 登录态判断优先使用 `getCurrentAuthToken()` 或 `getCurrentAuthUserId()`。
- 用户可见错误使用 toast 或页面内错误态，不要静默失败。
- 涉及社区列表时，注意同时更新推荐、关注、收藏三个集合的 UI 状态。

## 移动端配置

已跟踪的 Capacitor 配置为：

```text
frontend/capacitor.config.json
frontend/android/
```

未跟踪的 `frontend/capacitor.config.ts` 与 JSON 配置重复，除非团队决定切换到 TS 配置，否则不要提交。

## 提交前检查

```powershell
cd frontend
npm run build
```

当前构建会出现 Vite 大 chunk 警告，但不影响构建通过。后续可通过路由级动态导入或 manual chunks 优化体积。
