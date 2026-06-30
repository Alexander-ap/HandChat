# HandChat 当前迭代基线

> 日期：2026-06-30
> 当前真实迭代分支：`feat/frontend-sync-current-code`
> 默认基线分支：`main`

## 分支状态

远端 `main` 只有一个初始 `README.md` 提交，当前业务代码历史原本和 `main` 没有共同祖先。本分支已经通过 `chore(git): merge default main baseline` 将 `origin/main` 合入，因此后续迭代可以把当前分支视为主开发基线。

历史上仍存在 `master` 分支和若干 `feat/*` 分支。新功能开发建议从当前基线分支继续拉出分支，待确认后再合入 GitHub 默认分支。

## 本轮基线功能

- 后端认证中间件增加 Supabase Auth 超时、重试和 token 缓存；Auth 网络失败统一返回 `503`，不再误判为 `401`。
- 前端路由守卫在未登录访问受保护页面时直接进入登录页；数据库已有用户资料时不再重复进入新手教程。
- 社区列表减少重复加载；关注流使用稳定的登录态判断；发帖展示用户昵称而不是用户编号。
- 社区帖子卡增加关注/取消关注入口，并支持批量同步关注状态。
- “我的”模块新增独立的已发布帖子和已发布评论管理页，支持查看、定位、转发和删除。
- 成就徽章按用户真实状态同步进度和解锁状态，避免预置假解锁。
- 注册 API 修正为 Supabase Edge Function 根路径，避免错误拼接 `/api` 导致网络失败。

## 本地服务

```powershell
# 后端 API
cd backend
npm run dev

# 前端
cd frontend
npm run dev

# CE-CSL 推理服务
cd CE-CSL
python app.py
```

默认端口：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3001/api`
- 推理服务：`http://localhost:8008`

调试遥测默认关闭；仅在需要浏览器调试探针时设置 `VITE_ENABLE_DEBUG_TELEMETRY=true`。

## 已验证项

- `backend`: `npm run build`
- `backend`: `npm run selfcheck`
- `frontend`: `npm run build`
- 未登录访问 `/api/user/posts`、`/api/user/comments`、`/api/user/following/status?ids=test` 返回 `401`，不是缺路由。
- `UserAchievement.unlockedAt` 已允许为空，未解锁成就不会被错误计数。

## 提交范围建议

应提交：

- `backend/src/**`、`backend/prisma/schema.prisma` 中的业务修复。
- `frontend/src/app/**` 中的页面、路由和 API 调用修复。
- `frontend/package.json`、`frontend/package-lock.json`、`frontend/tsconfig.json` 中的构建依赖和类型配置。
- `frontend/capacitor.config.ts` 与必要 Android 源文件，如果本轮需要同步移动端配置。
- `README.md`、`docs/current-iteration-baseline.md` 和 `.gitignore`。

不应提交：

- 本地端口清理脚本、临时 API 探针、debug markdown、probe 输出。
- `backend/scripts/_*.mjs`、`backend/tests/` 中的一次性联调脚本。
- 旧模型目录 `CE-CSL/checkpoints/`、`CE-CSL/models/`；正式模型文件使用 `CE-CSL/custom_model.pth` 和 `CE-CSL/custom_vocab.json`。
- `.env`、真实数据库密码、service role key 或任何私密凭据。
