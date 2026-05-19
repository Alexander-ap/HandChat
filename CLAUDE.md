# CLAUDE.md

本文件用于指导 Claude Code 在本仓库中工作。回复用户和编写仓库文档默认使用中文。

## 项目概览

HandChat 当前是一个前后端分离的手语/无障碍助手项目，并新增了 CE-CSL 手语识别模型参考实现。

- 前端：`frontend/`，Vite + React + TypeScript，移动端优先 UI，集成 Supabase Auth、手语识别、声音检测、社区、个人资料等页面。
- 后端：`backend/`，Express + WebSocket + Prisma，负责 REST API、实时手语会话、翻译历史、社区、积分、成就、用户资料等能力。
- 模型：`CE-CSL/`，Python + MediaPipe + PyTorch 的 Tiny-CSL 参考实现，包含数据录制、训练和实时推理脚本。
- 文档：`docs/`，包含后端规格、前端开发文档、接口说明、阶段计划和 Git 工作流说明。

当前仓库已通过 GitNexus 建立索引：`HandChat`，约 165 个文件、3060 个节点、180 条流程。

## 当前仓库结构

```text
backend/   Express、WebSocket、Prisma 后端
frontend/  Vite React TypeScript 前端
CE-CSL/    Tiny-CSL 手语识别模型参考实现
docs/      项目文档与接口说明
```

## 常用命令

前端：

```bash
cd frontend
npm install
npm run dev
npm run build
```

后端：

```bash
cd backend
npm install
npm run dev
npm run build
npm run db:generate
npm run db:migrate
npm run selfcheck
npm run test:integration
npm run test:stress
```

当前前端 `package.json` 只有 `dev` 和 `build` 脚本；没有前端项目级 `test`、`lint` 或 `typecheck` 脚本，不要编造不存在的命令。

## 前端架构要点

- `frontend/src/main.tsx`：React 挂载入口。
- `frontend/src/app/App.tsx`：组合 `LanguageProvider`、`ThemeProvider`、`RouterProvider` 和全局 Toaster。
- `frontend/src/app/routes.tsx`：React Router 路由表；`/login` 和 `/reset-password` 独立于受保护主布局。
- `frontend/src/app/components/Root.tsx`：主布局和认证守卫，负责 Supabase session 同步、欢迎页、底部导航显隐、页面临时状态缓存。
- `frontend/src/app/lib/api.ts`：传统 REST API 统一封装，包含 token 获取/刷新、错误处理、用户/社区/积分等 API。
- `frontend/src/app/lib/supabase.ts`：浏览器端 Supabase client 单例，配置来自 `frontend/utils/supabase/info.tsx`。
- `frontend/utils/supabase/info.tsx`：自动生成的 Supabase 项目配置，标记为 `DO NOT EDIT`，不要手改。
- `frontend/src/app/pages/SignLanguagePage.tsx`：手语模块主页面，包含文字转手语、图片识别、摄像头实时识别、本地/服务端模式切换、会话历史展示。
- `frontend/src/app/lib/handchat/`：实时手语会话协议、WebSocket client、本地历史、识别辅助、错误映射和运行模式配置。
- `frontend/src/app/lib/signLanguageStore.ts`：本地手语词库、localStorage 持久化、文件转 data URL、中文最长匹配分词。

## 后端架构要点

- `backend/src/index.ts`：Express 应用入口，注册 CORS、全局限流、REST 路由、WebSocket Server、心跳检测和错误处理。
- `backend/src/config.ts`：环境变量读取，要求 `DATABASE_URL`、`SUPABASE_URL`、`SUPABASE_ANON_KEY`。
- `backend/src/wsRouter.ts`：实时手语 WebSocket 协议入口，处理 `session_start`、`frame`、`keypoints`、`translation`、`session_end`、`ping`。
- `backend/src/services/sessionService.ts`：会话和翻译历史持久化。
- `backend/src/routes/sessionRoutes.ts`：会话列表、会话详情、会话历史 REST API。
- `backend/prisma/schema.prisma`：PostgreSQL 数据模型，核心表包括 `Session`、`Translation`、`Post`、`Comment`、`Follow`、`Bookmark`、`Like`、`UserProfile`、`PointsRecord`、`Achievement`。
- `backend/src/fakeTranslator.ts`：仅用于模拟翻译流，真实 CE-CSL 接入时不要把它当成正式推理实现。

## 手语识别现状

现有前端实时识别流程：

1. `createHandDetector()` 使用 TensorFlow.js + MediaPipe Hands 加载轻量手部检测模型。
2. `SignLanguagePage` 通过摄像头逐帧调用 `estimateHands()`。
3. `buildFramePayload()` 构造裁剪后的 JPEG 帧。
4. `buildKeypointsPayload()` 构造归一化关键点协议。
5. 浏览器本地模式下，`guessSign()` 执行规则识别，`SignConfirmationTracker` 做稳定确认，`LocalTranslationStream` 生成 partial/final/sentence_end。
6. 服务端模式下，前端通过 `HandChatWsClient` 发送 `frame`、`keypoints`、`translation`；后端目前主要做协议校验和 translation 持久化，尚未真正运行 CE-CSL 推理。

`guessSign()` 当前被以下入口使用：

- `frontend/src/app/pages/SignLanguagePage.tsx`：图片识别和实时识别。
- `frontend/src/app/pages/HomePage.tsx`：首页相关手势识别入口。

修改 `guessSign()`、关键点协议或实时会话格式前，应先评估这两个页面的影响。

## CE-CSL 模型说明

`CE-CSL/` 是 Tiny-CSL 参考实现，当前关键文件：

- `CE-CSL/README.md`：模型架构、移动端移植说明和交付物清单。
- `CE-CSL/record_data.py`：通过摄像头录制训练样本，输出 `custom_dataset/<词汇>/*.npy`。
- `CE-CSL/train_custom.py`：定义 `normalize_data()`、`CustomSignDataset`、`TinySignModel`，训练并保存 `custom_model.pth` 和 `custom_vocab.json`。
- `CE-CSL/realtime_custom.py`：融合 PyTorch 模型、MediaPipe 手势、几何规则和多数投票的实时推理参考。
- `CE-CSL/gesture_recognizer.task`、`CE-CSL/hand_landmarker.task`：MediaPipe 任务模型文件。

CE-CSL 关键协议约束：

- 输入窗口：30 帧。
- 每帧维度：双手 42 个关键点，每点 `(x, y, z)`，共 126 维。
- 排列顺序：左手 21 点 × 3 + 右手 21 点 × 3。
- 缺失手：对应 63 维填 0。
- 标准化：每只手所有点分别减去该手手腕坐标；必须与 `CE-CSL/train_custom.py` 和 `CE-CSL/realtime_custom.py` 的 `normalize_data()` 保持一致。
- 推理输出：模型 softmax 最高置信度足够高时采用 AI 结果，否则回退规则引擎或 MediaPipe 内置手势。
- 平滑：最终 UI 输出前使用短窗口多数投票降低闪烁。

## CE-CSL 接入方向

优先采用分阶段接入，不要一次性大改前后端。

### 推荐路线

1. 先稳定前端关键点采集协议。
   - 复用 `buildKeypointsPayload()` 的双手关键点消息。
   - 核对前端 handedness、镜像、坐标归一化与 CE-CSL 的左/右手排列是否一致。
2. 后端新增 CE-CSL 推理边界。
   - 不要把 Python 推理逻辑直接混进 `wsRouter.ts`。
   - 优先独立成服务、子进程或清晰的推理模块，由 WebSocket 层调用。
   - 后端收到 `keypoints` 后维护 30 帧滑窗，执行标准化和推理，再返回 `translation`。
3. 保持浏览器本地模式可用。
   - 浏览器本地规则识别可以作为降级方案。
   - 服务端 CE-CSL 失败时，应允许用户切回本地模式。
4. 模型格式转换作为独立阶段。
   - Web 端可考虑 ONNX Runtime Web 或 TensorFlow.js。
   - 移动端可考虑 ONNX Runtime Android、TFLite 或 CoreML。
   - 转换前必须用相同输入样本对比 PyTorch 与目标格式输出。

### 接入时优先关注的文件

- 前端实时识别页：`frontend/src/app/pages/SignLanguagePage.tsx`
- 前端关键点协议：`frontend/src/app/lib/handchat/protocol/keypoints.ts`
- 前端 WebSocket client：`frontend/src/app/lib/handchat/wsClient.ts`
- 前端本地规则识别：`frontend/src/app/lib/handchat/recognition/guessSign.ts`
- 前端运行模式配置：`frontend/src/app/lib/handchat/runtime.ts`
- 后端 WebSocket 协议入口：`backend/src/wsRouter.ts`
- 后端协议校验：`backend/src/validators.ts`
- 后端会话持久化：`backend/src/services/sessionService.ts`
- CE-CSL 标准化和模型结构：`CE-CSL/train_custom.py`
- CE-CSL 实时推理参考：`CE-CSL/realtime_custom.py`

## 开发约束

- 编码前先说明方案并等待用户批准；需求不明确时先澄清。
- 修改超过 3 个文件的任务先拆成更小单元。
- 优先做最小必要修改，不重构无关代码，不引入过度抽象。
- 不要用假数据、临时 demo 或硬编码冒充完整实现。
- 不主动删除文件、清理 Git 索引、修改 Git 历史、推送远程、修改 CI、修改共享环境配置或执行数据库破坏性操作，除非用户明确确认。
- 前端改动完成后尽量运行 `npm run build`；涉及 UI 行为时启动前端 dev server 并用浏览器验证。
- 后端改动完成后至少运行 `npm run build`；涉及接口或 WebSocket 时按影响范围运行 `npm run selfcheck`、`npm run test:integration` 或手动联调。
- 发现 bug 时先写或补充复现测试，再修复到测试通过；如果当前没有合适测试框架，至少给出可重复的手动复现和验收步骤。
- 新增后端请求优先放在 `frontend/src/app/lib/api.ts` 或 `frontend/src/app/lib/handchat/` 对应模块，不要在页面里分散写裸 `fetch`。
- 认证相关请求必须使用 Supabase session token，服务端必须校验 token，不要信任前端传入的 userId。

## GitNexus 使用约定

开发跨模块功能、排查调用链、评估影响范围或提交前检查变更时，优先使用 GitNexus。

本机推荐命令：

```bash
"/c/Users/rxccccc/AppData/Roaming/npm/pnpm.cmd" dlx --allow-build=gitnexus --allow-build=@ladybugdb/core gitnexus@latest status
"/c/Users/rxccccc/AppData/Roaming/npm/pnpm.cmd" dlx --allow-build=gitnexus --allow-build=@ladybugdb/core gitnexus@latest analyze --embeddings --skip-agents-md
"/c/Users/rxccccc/AppData/Roaming/npm/pnpm.cmd" dlx --allow-build=gitnexus --allow-build=@ladybugdb/core gitnexus@latest list
```

官方文档常写 `npx gitnexus ...`，但本机此前 `npx gitnexus@latest` 触发过 npm 解析问题，优先使用上面的 pnpm 命令。

常用 MCP 工具：

- `mcp__gitnexus__list_repos`：确认当前仓库是否在索引中。
- `mcp__gitnexus__query`：按业务概念查询执行流和模块关系。
- `mcp__gitnexus__context`：查看具体函数/类的调用方、被调方和参与流程。
- `mcp__gitnexus__detect_changes`：提交前分析当前 diff 影响的执行流。

修改代码后如果 GitNexus 提示索引落后 HEAD，重新运行 analyze 命令。

## 当前风险与后续任务

- `CE-CSL/` 当前包含模型参考代码和 `.task` 文件，但 `custom_model.pth`、`custom_vocab.json`、`custom_dataset/` 不一定存在；接入前要确认模型权重、词表和训练数据是否齐全。
- CE-CSL README 中推荐的 `custom_model.pth` 当前不在已查看文件清单中，不能假设已训练好可用模型。
- 前端当前 `createHandDetector({ maxHands: 1 })` 多处只取单手；CE-CSL 需要双手 126 维输入，接入时要确认是否改为 `maxHands: 2` 并处理双手排序。
- 前端 MediaPipe/TensorFlow.js 的 handedness、镜像显示和 CE-CSL Python OpenCV 镜像逻辑可能不一致，接入前必须用样本验证左右手排列。
- 后端 WebSocket 的 `session_created` payload 当前返回字段名为 `session_id`，而前端类型期望 `id`；如果真实服务端模式异常，优先排查该协议不一致。
- `backend/.env.example` 含 Supabase anon key 示例；anon key 可公开但不要把 service role、数据库密码或真实私密凭据提交。
- `.gitignore` 当前忽略 `.claude`、`.gitnexus`、构建产物、调试产物和本地环境文件；不要主动提交这些本地工具目录。
- 仓库当前没有前端测试脚本；如果要为 CE-CSL 接入建立质量保障，应单独规划测试策略。