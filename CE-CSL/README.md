# 微型中国手语识别系统 (Tiny-CSL)

这是一个极其轻量级、高精度的实时手语识别系统。该项目摒弃了沉重的 CTC 序列模型，采用“MediaPipe 空间特征提取 + 数据标准化 + 1D-CNN/LSTM 孤立词分类”的创新架构，极大地降低了算力要求，非常适合移植到移动端（Android / iOS / 小程序）。

---

## 🛠️ 核心架构与原理 (供客户端开发参考)

本系统的识别流程分为三层优先级，客户端需要完整复刻这一逻辑：

1. **第一步：特征提取 (MediaPipe Hands)**
   - 使用 MediaPipe 实时捕捉摄像头画面。
   - 提取**双手共 42 个关键点**（左手 21 个，右手 21 个），每个点取 `(x, y, z)` 三维坐标，一帧画面固定输出 `126` 维的浮点数数组。
   - *注意：若某只手未检测到，该手对应的 63 维数据填 `0`。*

2. **第二步：动态手势识别 (AI 神经网络 - 最高优先级)**
   - 维护一个长度为 **30 帧**（约 1 秒）的滑动窗口。
   - **核心步骤（空间标准化）**：将这 30 帧内的所有手指坐标，减去当前帧对应的**手腕坐标（第 0 号关键点）**。这一步消除了手在屏幕中的绝对位置干扰，是模型高准确率的灵魂！
   - 将这 `30 x 126` 的张量喂给预训练的 PyTorch 模型 (`custom_model.pth`)。
   - 若模型输出的最高概率类别的置信度 **> 0.85** 且不为“无动作”，则直接输出该词汇（如“下午”、“水果”、“打电话”）。

3. **第三步：静态手势识别 (几何规则引擎 - 第二优先级)**
   - 若 AI 模型未触发（置信度低或判定为“无动作”），则启动底层规则引擎。
   - 规则引擎通过直接计算手指开合度（指尖 Y 坐标是否高于指关节 Y 坐标）来判定静态动作。
   - 例如：只有食指伸出且指尖朝向自己 -> “我”；只有大拇指伸出且静止 -> “好”。

4. **第四步：平滑输出 (多数投票)**
   - 维护一个长度为 **5 帧**的队列，取众数作为最终 UI 渲染结果，防止画面文字闪烁。

---

## 📱 移动端移植指南 (To 安卓/iOS 同学)

为了将此 Python 模型放入手机 APP 中，你需要完成以下工作：

### 1. 模型格式转换 (ONNX / TFLite)
当前训练出的神经网络模型为 PyTorch 格式 (`custom_model.pth`)，手机端无法直接运行。你需要将其转换为手机端友好的格式。
**转换脚本示例 (Python):**
```python
import torch
from train_custom import TinySignModel
import json

# 1. 加载模型
with open("custom_vocab.json", 'r') as f:
    vocab = json.load(f)
model = TinySignModel(num_classes=len(vocab))
model.load_state_dict(torch.load("custom_model.pth", map_location="cpu"))
model.eval()

# 2. 导出为 ONNX (推荐)
dummy_input = torch.randn(1, 30, 126) # 模拟 1 个 batch, 30 帧, 126 维特征
torch.onnx.export(model, dummy_input, "tiny_sign_model.onnx", 
                  input_names=['input_frames'], output_names=['logits'])
print("ONNX 模型导出成功！")
```
*(你也可以进一步使用 `onnx2tflite` 将其转换为 TensorFlow Lite 格式，视你的客户端引擎而定)*

### 2. 客户端推理引擎选择
- **安卓端**：推荐使用 **ONNX Runtime for Android** 或 **TensorFlow Lite** 加载转换后的模型。
- **iOS端**：推荐使用 **CoreML** (需将 ONNX 转为 `.mlmodel`) 或 **ONNX Runtime**。
- **Web/小程序**：推荐使用 **ONNX Runtime Web** 或 **TensorFlow.js**。

### 3. 数据预处理对齐 (关键)
你在 Java/Kotlin/Swift 中手写的预处理逻辑，必须和 Python 端 **100% 严格一致**，否则模型预测将完全错乱：
1. **排序对齐**：数组必须是 `[左手21个点x3, 右手21个点x3]`。
2. **标准化对齐**：必须实现“所有点减去手腕坐标”的逻辑（参考 Python 中的 `normalize_data` 函数）。
3. **形状对齐**：喂给 ONNX 模型的张量形状必须严格是 `[1, 30, 126]`。

### 4. 几何规则移植
请阅读 Python 代码 `realtime_custom.py` 中的 `get_finger_states()` 和 `recognize_number_gesture()` 函数，使用 Java/Swift 将这几个基础几何判定（如手指伸直判定、指尖距离计算）重写一遍。这部分代码只有不到 100 行，非常容易复刻。

---

## 📁 交付物清单
发给客户端同学时，请务必打包以下文件：
1. `custom_model.pth` (原始 PyTorch 模型权重)
2. `custom_vocab.json` (类别索引与中文词汇的映射字典)
3. `train_custom.py` (包含网络架构定义，用于 ONNX 转换)
4. `realtime_custom.py` (包含数据标准化和规则引擎的核心逻辑参考)
5. `README.md` (本说明文档)