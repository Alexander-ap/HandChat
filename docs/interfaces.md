# HandChat 全项目接口文档

> **版本：** v1.1  
> **冻结日期：** 2026-05-17  
> **维护规则：** 任何人对任何字段做任何修改，必须先更新本文档并在团队群 @所有人，再改代码。  
> **冻结粒度：** 字段名 + 类型 + 必填/可选 全部冻结。数值范围标为"推荐值"的允许调整。  
> **适用范围：** 前端（成员A）、模型（成员B）、后端（成员C）。所有人只依赖本文档，不依赖其他人代码。

---

## 一、总则

### 1.1 文档符号约定

| 标记 | 含义 |
|------|------|
| 🔒 **冻结** | 字段名、类型、必填/可选均不可改，需全队同意 |
| 📌 **推荐** | 建议遵守，可根据实际情况调整 |
| 🔲 **预留** | MVP 阶段不实现，后续版本启用 |

### 1.2 数据流总览

```
┌─────────────────────────────────────────────────────────────┐
│                      浏览器（前端 + 本地模型）                   │
│                                                               │
│  摄像头 ──▶ getUserMedia ──▶ 居中裁剪 256×256 ──▶ JPEG Base64  │
│                │                                               │
│                ▼                                               │
│         MediaPipe Hands WASM ──▶ 21 关键点 (2D + 3D)          │
│                │                                               │
│                ▼                                               │
│         DTW 分类器 ──▶ text + gesture_label + confidence       │
│                │                                               │
├────────────────│──────────────────────────────────────────────┤
│                │  WebSocket (FrameMessage / KeypointsMessage    │
│                │        / TranslationResult)                   │
│                ▼                                               │
│  ┌─────────────────────────┐                                  │
│  │      后端 (Express+WS)   │                                  │
│  │                         │                                  │
│  │  WS Router ──▶ Validator ──▶ saveTranslation() ──▶ DB     │
│  │                         │                                  │
│  │  REST API ──▶ authMiddleware ──▶ sessionService ──▶ DB    │
│  └─────────────────────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

**关键说明：** MVP 阶段不存在独立的模型服务。MediaPipe Hands + DTW 分类器均运行在浏览器内，翻译结果由前端本地产出后通过 WebSocket 发给后端存储。

---

## 二、手语识别核心数据协议

### 2.1 视频帧规范 (FrameMessage)

#### 🔒 2.1.1 帧数据格式

```json
{
  "type": "frame",
  "payload": {
    "session_id": "string（必填。后端生成的 UUID v4）",
    "frame_id": "number（必填。从 0 递增的整数。服务端按此检测丢帧）",
    "timestamp_ms": "number（必填。客户端采集时刻，Unix 毫秒）",
    "image": {
      "data": "string（必填。Base64 编码 JPEG，不包含 'data:image/jpeg;base64,' 前缀，≤ 2MB）",
      "width": "number（必填。正整数，推荐 256）",
      "height": "number（必填。正整数，推荐 256）",
      "colorspace": "string（必填。固定值 'RGB'）",
      "crop": {
        "x": "number（可选。裁剪区域左上角 x，默认 0）",
        "y": "number（可选。裁剪区域左上角 y，默认 0）",
        "width": "number（可选。裁剪区域宽，默认等于 image.width）",
        "height": "number（可选。裁剪区域高，默认等于 image.height）"
      }
    },
    "client_metadata": {
      "fps_actual": "number（可选。客户端实际帧率，用于后端自适应）",
      "device_pixel_ratio": "number（可选。设备像素比，用于调试）"
    }
  },
  "trace_id": "string（必填。UUID v4，全链路日志追踪）",
  "timestamp_ms": "number（必填。消息发送时刻，Unix 毫秒）"
}
```

#### 🔒 2.1.2 预处理参数（必须一致）

| 参数 | 冻结值 | 前端职责 | 模型侧约束 |
|------|--------|---------|-----------|
| 输入分辨率 | **256×256** | 采集后缩放到此尺寸 | 模型输入层 = 256×256 |
| 色彩空间 | **RGB**（非 BGR） | `canvas.toBlob('image/jpeg')` 前确保 RGB | 解码 JPEG 后即 RGB |
| 像素值范围 | **[0, 255] uint8** | 不做归一化 | 模型侧自行归一化到 [0,1] |
| 图像格式 | **JPEG quality=85** | `canvas.toBlob('image/jpeg', 0.85)` | 解码 JPEG |
| 裁剪策略 | **居中裁剪为正方形** | `drawImage` 时取 min(w,h) 居中 | 假设输入已是正方形 |
| 镜像 | **不镜像** | 不调用 `ctx.scale(-1,1)` | 不翻转 |

**⚠️ 此表打印出来贴在每个成员显示器旁边。任何一方擅自改值，集成时必定翻车。**

#### 📌 2.1.3 帧提取实现指南（推荐，非强制）

| 参数 | 推荐值 | 理由 |
|------|--------|------|
| 帧率 | **20fps**（50ms/帧） | MediaPipe 推理 10-15ms + Canvas 编码 10-15ms ≤ 50ms |
| 采集 API | `requestVideoFrameCallback` | 比 `requestAnimationFrame` 更精确对齐摄像头硬件帧 |
| 摄像头分辨率 | 640×480（ideal） | 足够居中裁剪为 256×256 |
| 跳帧策略 | 关键点平均位移 > 5px 才保留 | 避免 DTW 序列冗余 |
| 编码 | `canvas.toBlob('image/jpeg', 0.85)` | quality 85 在清晰度和体积间最优 |
| 镜像 | **不镜像** | 左右手混淆会导致手势识别错误 |

**跳帧实现建议（模型侧）：** 底层以 20fps 持续采集（frame_id 递增不休），但 DTW 分类器只消费"手部关键点平均位移 > 阈值"的帧。丢弃的帧 frame_id 不回溯。

---

### 2.2 关键点协议 (KeypointsMessage)

#### 🔒 2.2.1 关键点数据格式

```json
{
  "type": "keypoints",
  "payload": {
    "session_id": "string（必填。后端生成的 UUID）",
    "frame_id": "number（必填。对应帧的 frame_id）",
    "hands": [
      {
        "handedness": "string（必填。'Left' 或 'Right'）",
        "score": "number（必填。检测置信度 0-1）",
        "keypoints": [
          {
            "x": "number（必填。归一化 x 坐标 ∈ [0,1]，图像左上角为原点）",
            "y": "number（必填。归一化 y 坐标 ∈ [0,1]）",
            "z": "number（必填。相对深度，正值=靠近镜头）"
          }
        ],
        "keypoints_3d": [
          {
            "x": "number（必填。世界坐标 x，单位 mm）",
            "y": "number（必填。世界坐标 y，单位 mm）",
            "z": "number（必填。世界坐标 z，单位 mm）"
          }
        ]
      }
    ]
  },
  "trace_id": "string（必填）",
  "timestamp_ms": "number（必填）"
}
```

**约束：**
- `keypoints` 和 `keypoints_3d` 数组长度固定为 **21**——对应 MediaPipe Hands 的 21 个关键点
- `hands` 数组长度 ∈ [0, 2]，支持双手检测
- 坐标系原点为**图像左上角**（MediaPipe 原生输出，不翻转）

#### 📌 2.2.2 21 个关键点索引

| 索引 | 名称 | 索引 | 名称 |
|------|------|------|------|
| 0 | WRIST（手腕） | 11 | MIDDLE_FINGER_DIP |
| 1 | THUMB_CMC | 12 | MIDDLE_FINGER_TIP |
| 2 | THUMB_MCP | 13 | RING_FINGER_MCP |
| 3 | THUMB_IP | 14 | RING_FINGER_PIP |
| 4 | THUMB_TIP | 15 | RING_FINGER_DIP |
| 5 | INDEX_FINGER_MCP | 16 | RING_FINGER_TIP |
| 6 | INDEX_FINGER_PIP | 17 | PINKY_MCP |
| 7 | INDEX_FINGER_DIP | 18 | PINKY_PIP |
| 8 | INDEX_FINGER_TIP | 19 | PINKY_DIP |
| 9 | MIDDLE_FINGER_MCP | 20 | PINKY_TIP |
| 10 | MIDDLE_FINGER_PIP | | |

#### 📌 2.2.3 DTW 分类器特征工程（模型侧参考）

分类器输入为 **10 维特征向量**，由关键点坐标计算得出：
- 5 维：每根手指是否伸直（tip-to-wrist > pip-to-wrist × 1.1）
- 5 维：拇指-食指、食指-中指等相邻手指间的向量夹角

---

### 2.3 翻译结果协议 (TranslationResult)

#### 🔒 2.3.1 翻译结果数据格式

```json
{
  "type": "translation",
  "payload": {
    "session_id": "string（必填）",
    "frame_id": "number（必填。触发该结果的最后一帧 ID）",
    "type": "string（必填。'partial' | 'final' | 'sentence_end' | 'sentence_final'）",
    "text": "string（必填。当前翻译文本）",
    "confidence": "number（必填。置信度 0-1）",
    "gesture_label": "string（可选。原始手势标签，如 'wave', 'me', 'thank_you'，用于调试和回放）"
  },
  "trace_id": "string（必填）",
  "timestamp_ms": "number（必填。服务器生成时间）"
}
```

#### 🔒 2.3.2 type 字段行为约定

| type | 触发条件 | 前端行为 |
|------|---------|---------|
| `partial` | 每 3 帧（~150ms）推送一次，文本为当前最可能手势 | 灰色斜体显示，可被下一条覆盖 |
| `final` | 手势被 DTW 分类器确认（连续 N 帧一致，置信度 ≥ 阈值） | 蓝色气泡显示，不再变化 |
| `sentence_end` | 检测到双手落下 / 停顿 ≥ 1.5s | 插入句号，段落分隔 |
| `sentence_final` | 🔲 LLM 句子整合输出（未来阶段） | 追加显示（不覆盖原始词），蓝色加粗 |

#### 🔒 2.3.3 LLM 句子整合架构（未来阶段）

```
原始词流：  "你好" → "我" → "叫" → "李明" → [sentence_end]
LLM 整合：  检测到 sentence_end → 调 LLM API → "你好，我叫李明"
推送方式：  作为新的 sentence_final 追加，不覆盖
```

---

## 三、WebSocket 通信协议

### 3.1 消息信封格式

```json
{
  "type": "string（必填。消息类型标识）",
  "payload": "object（必填。消息体，结构取决于 type）",
  "trace_id": "string（必填。UUID v4，全链路日志追踪）",
  "timestamp_ms": "number（必填。消息生成时刻，Unix 毫秒）"
}
```

### 3.2 消息类型矩阵

| 消息类型 | 方向 | 校验要求 | 后端动作 | 回复 |
|---------|------|---------|---------|------|
| `session_start` | 前端→后端 | token（JWT）非空→Supabase验证→失败4003 | 检查 `resume_session_id`→创建/恢复会话→启动假翻译 | `session_created` |
| `frame` | 前端→后端 | `session_id` 匹配当前会话→`validateFrameMessage()`→失败4001 | 日志记录 | 无 |
| `keypoints` | 前端→后端 | `session_id` 匹配→hands 非空→失败4001 | 日志记录 | 无 |
| `translation` | 前端→后端 | `session_id` 匹配→text 非空 | `saveTranslation()` 写 DB | 无（LLM阶段推 `sentence_final`） |
| `session_end` | 前端→后端 | `payload.session_id` 严格匹配当前会话→不匹配4004 | 停止假翻译→`endSession()`→`ws.close(1000)` | 无 |
| `ping` | 前端→后端 | 无 | 重置 `isAlive` | `pong` |
| `session_created` | 后端→前端 | — | — | — |
| `pong` | 后端→前端 | — | — | — |
| `error` | 后端→前端 | — | — | — |

### 3.3 错误码

| 错误码 | 含义 | 触发条件 | 客户端处理 |
|--------|------|---------|-----------|
| 4001 | 消息格式错误 | 帧/关键点消息缺少必填字段或字段类型不对 | 丢弃该消息，不重试 |
| 4002 | 无活跃会话 | 发 `frame`/`keypoints`/`translation` 时 sessionId 为 null | 重新发起 `session_start` |
| 4003 | 认证失败 | `session_start` 缺 token 或 token 无效 | 重新登录获取 token |
| 4004 | session_id 不匹配 | `session_end` 带的 ID 与当前会话不一致 | 检查本地 sessionId |
| 5001 | 推理超时 | 后端处理帧超过 500ms | 跳过该帧，继续下一帧 |
| 5002 | 服务器过载 | 后端 CPU/内存超限 | 降级为本地推理模式 |

### 3.4 会话生命周期

```
Client                          Server
  │                                │
  ├─ WS connect ──────────────────▶│
  │                                │
  ├─ session_start {token} ───────▶│  验证 JWT → 校验 resume_session_id
  │                                │  ├─ 有效 active → 沿用旧 session
  │                                │  └─ 无效/不存在 → createSession(新UUID, userId)
  │◀── session_created {id} ──────┤
  │                                │
  ├─ frame / keypoints ───────────▶│  校验 → 日志
  │                                │
  ├─ translation ─────────────────▶│  saveTranslation → DB
  │                                │
  ├─ ping ────────────────────────▶│  重置 isAlive
  │◀── pong ──────────────────────┤
  │                                │
  ├─ session_end {id} ────────────▶│  停止假翻译 → endSession → DB
  │◀── close (1000) ──────────────┤
  │                                │
```

**会话恢复：** `session_start` 的 `payload` 中可带 `resume_session_id`。后端查 DB：若该 session 存在且 status='active'，沿用旧 sessionId；否则创建新会话。

**心跳检测：** 服务端每 30s 扫描所有连接，`isAlive=false` 的连接执行 `terminate()`。客户端任何消息均重置 `isAlive=true`。

### 3.5 连接信息

| 环境 | 地址 |
|------|------|
| 本地开发 | `ws://localhost:3001` |
| 生产环境 | `wss://<app>.up.railway.app` |

---

## 四、REST API

**认证方式：** `Authorization: Bearer <Supabase JWT>`  
**基础路径：**
- 本地：`http://localhost:3001/api`
- 生产：`https://<app>.up.railway.app/api`  
**格式约定：** 所有响应为 `application/json`。时间字段均为 ISO 8601 字符串。

---

### 4.1 核心接口（🔒 冻结，MVP 阶段实现）

#### 4.1.1 GET /api/sessions — 我的会话列表

**描述：** 返回当前用户的所有会话，按 `startedAt` 倒序。

**认证：** 必须（Bearer Token）

**查询参数：**  
`limit` (number, 默认 20, 最大 50)  
`offset` (number, 默认 0)

**成功响应 200：**
```json
[
  {
    "id": "uuid",
    "status": "active | ended",
    "startedAt": "2026-05-14T10:30:00.000Z",
    "endedAt": "2026-05-14T10:35:00.000Z | null",
    "translationCount": 42,
    "lastTranslation": "很高兴认识你 | null"
  }
]
```

**错误响应：**
- 401 — 未带 Token 或 Token 无效
- 500 — 服务器错误

---

#### 4.1.2 GET /api/sessions/:id — 会话详情

**描述：** 返回指定会话的信息。

**认证：** 必须。只能查询自己的会话（`session.userId === req.userId`）。

**成功响应 200：**
```json
{
  "id": "uuid",
  "status": "active | ended",
  "startedAt": "2026-05-14T10:30:00.000Z",
  "endedAt": "2026-05-14T10:35:00.000Z | null",
  "translationCount": 42
}
```

**错误响应：**
- 401 — 未认证
- 404 — 会话不存在（含"不存在或不属于你"，统一返回 404 不暴露权限信息）

---

#### 4.1.3 GET /api/sessions/:id/history — 会话翻译历史

**描述：** 返回指定会话的所有翻译记录，按 `createdAt` 倒序。

**认证：** 必须。只能查询自己的会话。

**查询参数：**  
`limit` (number, 默认 100, 最大 500)

**成功响应 200：**
```json
[
  {
    "text": "你好",
    "confidence": 0.95,
    "type": "final",
    "gestureLabel": "wave | null",
    "frameId": 128,
    "createdAt": "2026-05-14T10:30:05.000Z"
  }
]
```

**错误响应：**
- 401 — 未认证
- 404 — 会话不存在（统一 404）
- 500 — 服务器错误

---

### 4.2 辅助功能接口（🔒 冻结，第二阶段实现）

> **状态：** ✅ 全部已实现（2026-05-17）  
> **认证方式：** 标注"必须"的端点须带 `Authorization: Bearer <Supabase JWT>`  
> **时间格式：** 所有时间字段均为 ISO 8601 字符串  
> **错误格式：** REST API 错误按 HTTP 状态码统一返回 `{ "error": "描述" }`

#### 4.2.1 社区帖子

##### 4.2.1.1 GET /api/posts — 帖子列表

**描述：** 返回所有帖子，按 `createdAt` 倒序。每帖附带前 3 条评论预览。

**认证：** 可选

**查询参数：**  
`limit` (number, 默认 20, 最大 50)  
`offset` (number, 默认 0)

**成功响应 200：**
```json
[
  {
    "id": "uuid",
    "title": "string",
    "content": "string",
    "author": "string (authorId alias)",
    "authorId": "uuid",
    "avatar": "string (预留，当前为空)",
    "likes": 0,
    "commentCount": 3,
    "comments": [
      {
        "id": "uuid",
        "content": "string",
        "author": "uuid",
        "authorId": "uuid",
        "createdAt": "2026-05-17T10:30:00.000Z"
      }
    ],
    "createdAt": "2026-05-17T10:30:00.000Z"
  }
]
```

**错误响应：**
- 500 — 服务器错误

---

##### 4.2.1.2 POST /api/posts — 创建帖子

**描述：** 创建一篇新帖子。

**认证：** 必须

**请求体 (JSON)：**
| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `title` | string | 是 | 长度 ≤ 200 |
| `content` | string | 是 | 长度 ≤ 10000 |

**成功响应 201：**
```json
{
  "id": "uuid",
  "title": "string",
  "content": "string",
  "authorId": "uuid",
  "likes": 0,
  "createdAt": "2026-05-17T10:30:00.000Z"
}
```

**错误响应：**
- 400 — `Title and content are required`（缺必填字段）
- 400 — `Title or content exceeds maximum length`（超长）
- 401 — 未认证
- 500 — 服务器错误

---

##### 4.2.1.3 DELETE /api/posts/:id — 删除帖子

**描述：** 删除指定帖子。仅帖主可操作。

**认证：** 必须

**成功响应 200：**
```json
{ "success": true }
```

**错误响应：**
- 401 — 未认证
- 404 — 帖子不存在或不属于当前用户
- 500 — 服务器错误

---

##### 4.2.1.4 POST /api/posts/:id/like — 点赞

**描述：** 为指定帖子点赞（+1）。

**认证：** 必须

**成功响应 200：**
```json
{ "likes": 1 }
```

**错误响应：**
- 401 — 未认证
- 500 — 服务器错误

---

##### 4.2.1.5 POST /api/posts/:id/comments — 添加评论

**描述：** 为指定帖子添加一条评论。

**认证：** 必须

**请求体 (JSON)：**
| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `content` | string | 是 | 长度 ≤ 5000 |

**成功响应 201：**
```json
{
  "id": "uuid",
  "content": "string",
  "authorId": "uuid",
  "createdAt": "2026-05-17T10:30:00.000Z"
}
```

**错误响应：**
- 400 — `Content is required`
- 400 — `Comment too long`
- 401 — 未认证
- 500 — 服务器错误

---

##### 4.2.1.6 GET /api/posts/:id/comments — 帖子评论列表

**描述：** 返回指定帖子的全部评论，按 `createdAt` 正序。

**认证：** 可选

**查询参数：**  
`limit` (number, 默认 20, 最大 100)  
`offset` (number, 默认 0)

**成功响应 200：**
```json
[
  {
    "id": "uuid",
    "content": "string",
    "authorId": "uuid",
    "createdAt": "2026-05-17T10:30:00.000Z"
  }
]
```

**错误响应：**
- 500 — 服务器错误

---

#### 4.2.2 成就系统

##### 4.2.2.1 GET /api/achievements — 成就列表

**描述：** 返回全量成就定义，并附当前用户的解锁状态和进度。

**认证：** 必须

**成功响应 200：**
```json
[
  {
    "id": "string",
    "name": "初识手语",
    "description": "完成第一次手语识别",
    "icon": "hand",
    "sortOrder": 1,
    "unlockedAt": "2026-05-17T10:30:00.000Z | null",
    "progress": 0
  }
]
```

**成就图标枚举 (`icon`)：** `hand` / `message_circle` / `target` / `volume2` / `star` / `trophy` / `heart` / `zap`

**错误响应：**
- 401 — 未认证
- 500 — 服务器错误

---

#### 4.2.3 积分系统

##### 4.2.3.1 GET /api/points — 积分余额

**描述：** 返回当前用户的积分余额与累计获得总和。

**认证：** 必须

**成功响应 200：**
```json
{
  "balance": 150,
  "totalEarned": 180
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `balance` | number | 当前可用积分（全部流水代数和） |
| `totalEarned` | number | 累计获得积分（仅正向流水累加） |

**错误响应：**
- 401 — 未认证
- 500 — 服务器错误

---

##### 4.2.3.2 GET /api/points/history — 积分明细

**描述：** 返回当前用户的积分变动记录，按 `createdAt` 倒序。

**认证：** 必须

**查询参数：**  
`limit` (number, 默认 20, 最大 100)  
`offset` (number, 默认 0)

**成功响应 200：**
```json
{
  "records": [
    {
      "id": "uuid",
      "amount": 10,
      "reason": "每日登录",
      "createdAt": "2026-05-17T08:30:00.000Z"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `records` | array | 当前页积分记录 |
| `total` | number | 记录总数（不受分页影响） |
| `limit` | number | 当前页容量 |
| `offset` | number | 当前偏移量 |

**错误响应：**
- 401 — 未认证
- 500 — 服务器错误

---

#### 4.2.4 用户资料与设置

##### 4.2.4.1 GET /api/user/profile — 用户资料

**描述：** 返回当前用户的个人资料。

**认证：** 必须

**成功响应 200：**
```json
{
  "nickname": "string | null",
  "avatar": "string | null",
  "bio": "string | null"
}
```

**错误响应：**
- 401 — 未认证
- 500 — 服务器错误

---

##### 4.2.4.2 PUT /api/user/profile — 更新资料

**描述：** 更新当前用户的个人资料。

**认证：** 必须

**请求体 (JSON)：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nickname` | string | 否 | 昵称 |
| `avatar` | string | 否 | 头像 URL |
| `bio` | string | 否 | 个人简介 |

**成功响应 200：**
```json
{
  "nickname": "string",
  "avatar": "string",
  "bio": "string"
}
```

**错误响应：**
- 401 — 未认证
- 500 — 服务器错误

---

##### 4.2.4.3 GET /api/user/settings — 用户设置

**描述：** 返回当前用户的应用偏好设置。

**认证：** 必须

**成功响应 200：**
```json
{
  "notification": true,
  "vibration": true,
  "language": "zh-CN"
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `notification` | boolean | `true` | 是否开启通知 |
| `vibration` | boolean | `true` | 是否开启震动 |
| `language` | string | `"zh-CN"` | 界面语言 |

**错误响应：**
- 401 — 未认证
- 500 — 服务器错误

---

##### 4.2.4.4 PUT /api/user/settings — 更新设置

**描述：** 更新当前用户的偏好设置。

**认证：** 必须

**请求体 (JSON)：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `notification` | boolean | 否 | 通知开关 |
| `vibration` | boolean | 否 | 震动开关 |
| `language` | string | 否 | 语言代码 |

**成功响应 200：**
```json
{
  "notification": true,
  "vibration": true,
  "language": "zh-CN"
}
```

**错误响应：**
- 401 — 未认证
- 500 — 服务器错误

---

#### 4.2.5 用户统计

##### 4.2.5.1 GET /api/user/stats — 用户综合统计

**描述：** 一次性返回个人中心所需的全部统计数据。后端通过 7 路并行聚合查询实现。

**认证：** 必须

**成功响应 200：**
```json
{
  "stats": {
    "postCount": 3,
    "followingCount": 5,
    "followerCount": 12,
    "points": 150,
    "achievementCount": 2,
    "days": 7,
    "loginStreak": 1,
    "totalTranslations": 15,
    "totalOcr": 0,
    "totalSoundDetections": 0
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `postCount` | number | 发帖总数 |
| `followingCount` | number | 关注人数 |
| `followerCount` | number | 粉丝数 |
| `points` | number | 当前积分余额 |
| `achievementCount` | number | 已解锁成就数 |
| `days` | number | 活跃天数（有 Session 记录的天数） |
| `loginStreak` | number | 连续登录天数（预留，当前固定 1） |
| `totalTranslations` | number | 累计翻译次数 |
| `totalOcr` | number | OCR 次数（预留，当前固定 0） |
| `totalSoundDetections` | number | 声音检测次数（预留，当前固定 0） |

**错误响应：**
- 401 — 未认证
- 500 — 服务器错误

---

#### 4.2.6 关注与粉丝

##### 4.2.6.1 GET /api/user/:id/followers/count — 粉丝数

**描述：** 返回指定用户的粉丝数量。

**认证：** 可选

**成功响应 200：**
```json
{ "count": 12 }
```

**错误响应：**
- 500 — 服务器错误

---

##### 4.2.6.2 GET /api/user/:id/following/count — 关注数

**描述：** 返回指定用户的关注数量。

**认证：** 可选

**成功响应 200：**
```json
{ "count": 5 }
```

**错误响应：**
- 500 — 服务器错误

---

##### 4.2.6.3 POST /api/user/:id/follow — 关注用户

**描述：** 当前用户关注指定用户。

**认证：** 必须

**成功响应 200：**
```json
{ "success": true, "following": true }
```

**错误响应：**
- 400 — `Cannot follow yourself`（不能关注自己）
- 401 — 未认证
- 500 — 服务器错误

---

##### 4.2.6.4 DELETE /api/user/:id/follow — 取消关注

**描述：** 当前用户取消关注指定用户。

**认证：** 必须

**成功响应 200：**
```json
{ "success": true, "following": false }
```

**错误响应：**
- 401 — 未认证
- 500 — 服务器错误

---

##### 4.2.6.5 GET /api/user/:id/is-following — 关注状态

**描述：** 检查当前用户是否关注了指定用户。

**认证：** 必须

**成功响应 200：**
```json
{ "following": true }
```

**错误响应：**
- 401 — 未认证
- 500 — 服务器错误

---

## 五、认证与安全

### 5.1 认证方式

| 通道 | 认证方式 | 说明 |
|------|---------|------|
| REST API | `Authorization: Bearer <JWT>` | `authMiddleware` 验证 |
| WebSocket | `session_start` payload 中携带 `token` | 连接后第一条消息必须认证 |

### 5.2 JWT 签发与验证

- **签发方：** Supabase Auth（`auth.users` 表）
- **后端验证：** 使用 `@supabase/supabase-js` 的 `supabase.auth.getUser(token)` 验证
- **userId 来源：** Supabase Auth 的 `sub`（`auth.users.id`），直接存入数据库
- **用户表策略：** 不额外建 User 表，避免双写和同步问题

### 5.3 数据传输安全

| 项目 | 本地 | 生产 |
|------|------|------|
| WebSocket | `ws://` | `wss://`（Railway 自动 TLS） |
| REST API | `http://` | `https://` |
| 数据库连接 | Supabase Session Pooler (port 6543, TLS) | 同左 |

### 5.4 安全注意事项

- **前端不直连数据库：** 前端仅通过 REST API + WebSocket 与后端交互，不使用 Supabase SDK 直连数据库
- **帧大小限制：** Base64 数据 ≤ 2MB
- **请求体限制：** `express.json({ limit: '1mb' })`
- **权限模型：** 统一 404——不存在和没有权限返回相同错误，不暴露"存在但不是你的"
- **userId 校验：** 所有会话查询均加 `userId` 过滤

---

## 六、性能指标要求

| 指标 | 目标值 | 测量方法 |
|------|--------|---------|
| 端到端延迟（手势完成→文字显示） | < 200ms | MediaPipe 推理 ~15ms + DTW ~5ms + Canvas ~15ms + 网络 ~5ms + 渲染 ~5ms |
| 帧率（前端采集） | ≥ 20fps（50ms/帧） | `requestVideoFrameCallback` 回调间隔 |
| WebSocket 消息往返（ping/pong） | < 50ms | 前端打点 |
| 假翻译推送间隔 | ~1800ms | `setInterval` |
| 数据库查询（历史记录 50条） | < 200ms | Prisma 查询计时 |
| REST API 响应（含认证） | < 300ms | `curl -w` |
| MediaPipe Hands 单帧推理 | < 20ms | 浏览器 Performance API |
| DTW 分类（30帧序列 vs 5模板） | < 10ms | 前端打点 |
| WebSocket 心跳间隔 | 30s | 服务端 `setInterval` |
| 生产可用性目标 | 99% uptime | Railway 监控面板 |

---

## 七、兼容性说明

### 7.1 浏览器支持

| 特性 | 最低要求 |
|------|---------|
| WebSocket | 所有现代浏览器 |
| `getUserMedia` | Chrome 53+, Safari 11+, Edge 79+ |
| `OffscreenCanvas` | Chrome 69+（Web Worker 中使用 MediaPipe） |
| `requestVideoFrameCallback` | Chrome 83+（降级方案：`requestAnimationFrame`） |
| `crypto.randomUUID()` | Chrome 92+, Safari 15.4+, Edge 92+（降级方案：polyfill） |

### 7.2 移动端适配

- **iOS Safari：** `getUserMedia` 需要 HTTPS（本地开发 localhost 例外）
- **Android Chrome：** 完全支持
- **前置摄像头：** `facingMode: 'user'` 优先，失败降级 `video: true`

### 7.3 数据格式兼容

- `timestamp_ms` 字段使用 Unix 毫秒（JavaScript `Date.now()` 格式）
- 所有浮点数使用标准 JSON number 格式（不支持 `NaN`、`Infinity`）
- 字符串统一使用 UTF-8 编码

### 7.4 升级策略

| 场景 | 策略 |
|------|------|
| 新增字段 | 向后兼容——新增可选字段不断已有客户端 |
| 删除字段 | 标记 `deprecated` 一个版本后移除 |
| 修改字段类型 | 禁止——新增替代字段，废弃旧字段 |
| 新增消息类型 | 客户端忽略未知 type（不回传 error） |

---

## 附录A：错误响应格式

所有错误响应（REST API 和 WebSocket `error` 消息）遵循统一格式：

```json
{
  "error": "Human-readable message",
  "code": "number（可选，WebSocket 错误消息中使用）"
}
```

---

## 附录B：变更记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-05-14 | v1.0 | 初始版本，冻结核心数据协议 + WebSocket 协议 + 核心 REST API |
| 2026-05-17 | v1.1 | 4.2 节从 🔲 预留升级为 🔒 冻结：补充 21 个辅助功能接口的完整文档（社区帖子6端点/成就1端点/积分2端点/用户资料5端点/用户统计1端点/关注粉丝5端点），含请求体、响应格式、错误码 |

---

**本文档由全员共同维护。任何修改须先提 Pull Request 到本文档，@所有人审阅后方可合并。**
