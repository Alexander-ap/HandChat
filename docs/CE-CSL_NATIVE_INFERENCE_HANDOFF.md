# CE-CSL 原生推理链路交接文档

## 交接目标

本分支把 HandChat 手语转文字的“真实服务”模式改为接入 CE-CSL 原生图像识别链路。目标不是把浏览器关键点硬喂给模型，而是让网页尽量复刻 `CE-CSL/realtime_custom.py` 的输入和后处理方式。

## 当前实现状态

- 前端真实服务模式会采集浏览器摄像头画面，按约定裁剪为 JPEG frame，并通过 WebSocket 发送到后端。
- 后端负责 Supabase 鉴权、WebSocket session、协议校验、调用 Python 推理服务、下发 translation、保存稳定识别结果。
- Python 推理服务负责按 CE-CSL 原生逻辑处理图像帧：OpenCV 解码、MediaPipe Tasks、双手关键点提取、30 帧滑窗、`normalize_data()`、TinySignModel 推理、规则引擎兜底、MediaPipe 内置手势兜底、多数投票。
- 前端真实服务鉴权已统一复用项目 API token 刷新逻辑，修复了“我的页已登录但手语页提示登录态失效”的问题。
- WebSocket 主动停止摄像时使用正常关闭码，避免停止后误显示“连接异常”。

## 核心链路

```text
浏览器摄像头
  → frontend/src/app/pages/SignLanguagePage.tsx
  → frontend/src/app/lib/handchat/wsClient.ts
  → backend/src/wsRouter.ts
  → backend/src/services/ceCslInferenceClient.ts
  → CE-CSL/inference_service.py
  → CE-CSL/native_recognizer.py
  → translation 消息返回前端并保存历史
```

## 关键文件

### Python / CE-CSL

- `CE-CSL/native_recognizer.py`
  - 新增原生识别核心。
  - 复用 `TinySignModel`、`normalize_data()`、MediaPipe Tasks、规则引擎和多数投票。
  - 每个 session 有独立状态和锁，避免多个用户共用滑窗。

- `CE-CSL/inference_service.py`
  - 新增 FastAPI 推理服务。
  - 保留 `/health` 和旧 `/predict`。
  - 新增 `POST /sessions/{session_id}/frame` 处理 JPEG 图像帧。
  - 新增 `DELETE /sessions/{session_id}` 释放 session 状态。

- `CE-CSL/realtime_custom.py`
  - 改为调用 `native_recognizer.py`，继续作为原生摄像头基准工具。

- `CE-CSL/requirements.txt`
  - 记录 Python 服务依赖。

### 后端

- `backend/src/wsRouter.ts`
  - `frame` 消息分支调用 Python 图像帧接口。
  - `keypoints` 分支不再触发真实 CE-CSL 推理，只保留校验/预览用途。
  - session 结束或 socket 关闭时释放 Python session。

- `backend/src/services/ceCslInferenceClient.ts`
  - 新增调用 Python `/sessions/{session_id}/frame` 的 client。

- `backend/src/services/serverTranslationStream.ts`
  - 将 Python 当前识别结果转换为 `partial` / `final` / `sentence_end`。
  - Python 负责原生识别融合；Node 只做轻量稳定确认和落库。

- `backend/src/config.ts`、`backend/.env.example`
  - 新增 CE-CSL 服务地址、阈值、超时等配置。

### 前端

- `frontend/src/app/pages/SignLanguagePage.tsx`
  - 真实服务模式发送 JPEG frame。
  - 服务端模式不再依赖浏览器本地 hand detector 作为真实模型输入。
  - 修复旧错误提示缓存和登录态同步问题。

- `frontend/src/app/lib/handchat/sessionApi.ts`
  - 会话接口统一使用 `getCurrentAuthToken()`。
  - 修复浏览器原生 `fetch` 被当类方法调用时的 `Illegal invocation`。

- `frontend/src/app/lib/api.ts`
  - token 缓存返回前会检查 JWT 过期时间，临近过期会重新刷新。

- `frontend/src/app/lib/handchat/wsClient.ts`
  - `session_start` 返回 error 时会 reject 连接。
  - 主动断开使用 WebSocket close code `1000`。

## 本地运行方式

### 1. 启动 Python 推理服务

```bash
cd CE-CSL
pip install -r requirements.txt
uvicorn inference_service:app --host 127.0.0.1 --port 8008
```

健康检查预期：

```text
GET http://127.0.0.1:8008/health
```

应返回 `status: ok`、`model_loaded: true`、`vocab_size: 12`。

### 2. 启动后端

```bash
cd backend
npm install
npm run dev
```

后端 `.env` 至少需要：

```text
DATABASE_URL=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
PORT=3001
CORS_ORIGIN=http://127.0.0.1:5173,http://localhost:5173
CECSL_ENABLED=true
CECSL_INFERENCE_URL=http://127.0.0.1:8008
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:5173/sign-language
```

进入“手语转文字” → 选择“真实服务” → 点击“实时识别”。

## 已完成验证

- `python -m py_compile "CE-CSL/native_recognizer.py" "CE-CSL/inference_service.py" "CE-CSL/realtime_custom.py"`
- `npm run build --prefix backend`
- `npm run selfcheck --prefix backend`
- `npm run build --prefix frontend`
- 浏览器验证：
  - 真实服务会话接口可连接。
  - 点击实时识别后 WebSocket 可创建 session。
  - 页面进入“真实服务 · 已连接 / active”。
  - 可以收到 Python 返回的识别结果。
  - 点击停止摄像后状态回到“未连接”，不再误显示连接异常。

## 重点验收建议

请用同一台电脑、同一摄像头、同一环境对比：

1. 运行 `python CE-CSL/realtime_custom.py`。
2. 运行网页真实服务模式。
3. 依次测试词表内动作：`下午`、`休息`、`你`、`吃饭`、`喝水`、`好`、`我`、`打电话`、`爱`、`睡觉`、`音乐`。
4. 对比原生脚本和网页输出是否接近。

如果原生脚本准确但网页不准确，优先排查：

- 镜像方向是否一致。
- 前端裁剪是否截掉手部。
- JPEG 帧率是否过低。
- 摄像头距离、光照、背景是否和原生脚本测试时一致。

## 已知风险

- 网页通过浏览器采集画面，无法完全等同 OpenCV 直接读取摄像头；这主要影响镜像、裁剪和帧率。
- Python MediaPipe / PyTorch 依赖较重，首次启动可能较慢。
- 当前前端包体积仍有 Vite warning，但不影响本次功能。
- 临时缓存、`__pycache__`、一次性探针和旧模型目录不是交付内容，已通过 `.gitignore` 排除。
- 仓库中还有两个未提交旧路线辅助文件：`backend/src/services/ceCslFeatureBuilder.ts`、`backend/src/services/ceCslSessionState.ts`。当前原生图像链路没有引用，后续确认无用后再清理。

## PR 审查重点

- Python `native_recognizer.py` 是否确实与 `realtime_custom.py` 的识别流程保持一致。
- 后端 `frame` 分支是否只做转发、轻量稳定确认和落库，不重新构造模型输入。
- 前端真实服务模式是否只把 JPEG frame 作为模型输入，不再把本地 keypoints 当真实推理输入。
- 登录态刷新和 WebSocket 关闭状态是否符合用户体验预期。
