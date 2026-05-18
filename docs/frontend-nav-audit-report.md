# HandChat 前端导航补线审计报告

> **审计分支基线：** `5045dff` (`feat(frontend): Phase 2.5 - nav restructure, follow/follower lists, dev docs`)  
> **同步目标分支：** `feat/backend-phase2-gaps`  
> **本次开发分支：** `feat/frontend-post-detail-page`  
> **审计日期：** 2026-05-17

---

## 一、版本同步结果

- 已从 `https://github.com/Alexander-ap/HandChat.git` 拉取 `feat/backend-phase2-gaps` 最新代码。
- 已基于同步后的代码创建规范分支：`feat/frontend-post-detail-page`。
- 当前前端开发目录为 `frontend/`，本轮未修改 `backend/`。

---

## 二、与上一个稳定版本的差异对比

本报告将 `5045dff` 视为“上一稳定版本”，原因如下：

- 该提交完成了 Phase 2.5 的导航重组、关注/粉丝列表和前端开发文档补充。
- 其后进入 `feat/backend-phase2-gaps` 的改动主要集中在后端能力补齐与协作文档完善，更适合作为本轮前端补线开发的同步基线。

### 2.1 提交差异

自 `5045dff` 以来，目标分支新增提交如下：

1. `ed3adc0` `docs: add frontend-onboarding git collaboration guide`
2. `c489c96` `docs: comprehensive backend specification v2.0`
3. `7c47b18` `feat(backend): 新增 Bookmark 数据模型`
4. `95ef2a7` `feat(backend): 新增 Service 层 4 个功能模块`
5. `2e1fdd9` `feat(backend): 新增 4 个 REST API 端点`

### 2.2 文件差异范围

- `backend/prisma/schema.prisma`
- `backend/src/routes/postRoutes.ts`
- `backend/src/routes/userRoutes.ts`
- `backend/src/services/postService.ts`
- `backend/src/services/userService.ts`
- `docs/backend-specification.md`
- `docs/git-workflow.md`

### 2.3 差异原因归纳

- **后端补口：** 为收藏、用户资料、统计等前端辅助功能补齐服务端能力。
- **接口与业务文档落地：** 增加完整后端规范，降低前后端联调歧义。
- **协作流程标准化：** 新增前端专用 Git 协作指南，明确分支、提交、提审要求。

---

## 三、页面跳转审计结论

### 3.1 已核对路由

- `/`
- `/sign-language`
- `/sign-language/history`
- `/sign-language/history/:sessionId`
- `/home`
- `/sound`
- `/community`
- `/profile`
- `/profile/follow`
- `/profile/edit`
- `/help`
- `/privacy`
- `/agreement`
- `/points`
- `/achievements`
- `/usage`
- `/change-password`
- `/login`
- `/reset-password`

### 3.2 审计发现

本轮重点审查了 `frontend/src/app/pages/` 和 `frontend/src/app/components/` 中所有可见导航入口，结果如下：

1. **社区帖子缺少独立详情跳转**
   - 现状：帖子卡片仅支持点赞、评论弹窗、收藏，没有进入独立详情页的导航。
   - 文档依据：`docs/frontend-dev-doc.md` 已将“帖子详情页（点击帖子进入独立页）”列为 P1 待办。

2. **个人中心“帖子”统计卡片缺少有效去向**
   - 现状：点击后只弹 `功能开发中` 提示。
   - 处理原则：在不新增后端依赖的前提下，先接到现有社区首页，保证入口有明确页面承接。

3. **评论接口返回结构与前端读取方式不一致**
   - 现状：评论接口返回数组，但页面按 `{ comments }` 结构消费，导致详情页/评论视图存在兼容风险。
   - 处理原则：在 `api.ts` 中做统一归一化，避免多页面重复兜底。

---

## 四、本轮落地改动

### 4.1 新增页面

- `frontend/src/app/pages/PostDetailPage.tsx`
  - 支持根据 `postId` 展示帖子完整内容、图片和评论列表。
  - 支持从社区列表点击进入，也支持直接访问路由后重新拉取详情数据。

### 4.2 路由补线

- `frontend/src/app/routes.tsx`
  - 新增路由：`/community/posts/:postId`

### 4.3 现有页面改造

- `frontend/src/app/pages/CommunityPage.tsx`
  - 帖子正文与图片接入详情页跳转。

- `frontend/src/app/pages/ProfilePage.tsx`
  - “帖子”统计卡片由占位提示改为跳转至 `/community`。

- `frontend/src/app/lib/api.ts`
  - 新增 `postsApi.getById(postId)`。
  - 统一 `postsApi.getComments(postId)` 的返回结构为 `{ comments: [] }`。

- `docs/frontend-dev-doc.md`
  - 将帖子详情页同步更新为已完成项。
  - 补充社区详情路由说明。

---

## 五、验证清单

### 5.1 构建验证

- 执行 `npm.cmd run build`（目录：`frontend/`）
- 预期：构建通过，无 TypeScript/Vite 报错

### 5.2 跳转验证

- **PC 视口**
  1. 进入社区页
  2. 点击帖子正文
  3. 验证进入 `/community/posts/:postId`
  4. 点击返回，回到社区页
  5. 进入个人中心，点击“帖子”，验证跳转到社区页

- **移动端窄屏**
  1. 在手机宽度下重复上述流程
  2. 确认标题、内容、评论区无溢出
  3. 确认返回按钮始终可点击

---

## 六、提审材料

### 6.1 本轮功能清单

- 新增社区帖子详情页
- 补齐社区帖子卡片到详情页的跳转
- 补齐个人中心“帖子”统计卡片的页面跳转
- 统一帖子评论接口的前端返回结构
- 同步更新 Phase 2.5 前端文档

### 6.2 Code Review 关注点

- 是否只修改了 `frontend/` 与 `docs/`
- 新路由是否与现有 `react-router` 规范一致
- 评论列表是否兼容接口数组返回
- 从社区进入详情页后，返回路径是否稳定
- 个人中心“帖子”入口是否仍存在空跳转

### 6.3 建议合并顺序

1. 合并 `feat/frontend-post-detail-page`
2. 再继续处理社区关注流、Usage 日图表等 P1 能力

