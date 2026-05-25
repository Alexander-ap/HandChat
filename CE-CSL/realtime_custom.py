import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import torch
import json
import os
import math
from collections import deque, Counter
from PIL import Image, ImageDraw, ImageFont

# 导入刚才写的网络结构
from train_custom import TinySignModel, MODEL_SAVE_PATH, VOCAB_SAVE_PATH

FRAMES_PER_SAMPLE = 30

# ----------------- 加载词表和神经网络模型 -----------------
if not os.path.exists(VOCAB_SAVE_PATH) or not os.path.exists(MODEL_SAVE_PATH):
    print("❌ 找不到模型或词表文件，请先运行 train_custom.py 进行训练！")
    exit(1)

with open(VOCAB_SAVE_PATH, 'r', encoding='utf-8') as f:
    VOCAB = json.load(f)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = TinySignModel(num_classes=len(VOCAB)).to(device)
model.load_state_dict(torch.load(MODEL_SAVE_PATH, map_location=device))
model.eval()
print(f"✅ 神经网络模型加载成功！词表: {VOCAB}")

# ----------------- 初始化 MediaPipe (含内置手势模型) -----------------
# 屏蔽掉内置手势识别器以大幅提升帧率(FPS)
# GESTURE_MODEL_PATH = "gesture_recognizer.task"
# ... 
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(static_image_mode=False, max_num_hands=2, min_detection_confidence=0.5)
mp_drawing = mp.solutions.drawing_utils

# ----------------- 数据标准化函数 -----------------
def normalize_data(data_array):
    """
    将所有坐标点减去第一帧有效手腕的坐标，保留手部的相对运动轨迹！
    （修复了之前每帧都减去当前帧手腕，导致完全丢失运动轨迹的致命 Bug）
    data_array shape: (frames, 126)
    """
    norm_data = np.zeros_like(data_array)
    ref_lx, ref_ly, ref_lz = None, None, None
    ref_rx, ref_ry, ref_rz = None, None, None
    
    for i in range(data_array.shape[0]):
        lx, ly, lz = data_array[i, 0], data_array[i, 1], data_array[i, 2]
        rx, ry, rz = data_array[i, 63], data_array[i, 64], data_array[i, 65]
        
        # 记录第一帧出现的手腕坐标作为全局锚点
        if (lx != 0 or ly != 0) and ref_lx is None:
            ref_lx, ref_ly, ref_lz = lx, ly, lz
        if (rx != 0 or ry != 0) and ref_rx is None:
            ref_rx, ref_ry, ref_rz = rx, ry, rz
            
        for j in range(21):
            if lx != 0 or ly != 0:
                norm_data[i, j*3]   = data_array[i, j*3] - (ref_lx if ref_lx is not None else 0)
                norm_data[i, j*3+1] = data_array[i, j*3+1] - (ref_ly if ref_ly is not None else 0)
                norm_data[i, j*3+2] = data_array[i, j*3+2] - (ref_lz if ref_lz is not None else 0)
            if rx != 0 or ry != 0:
                norm_data[i, 63+j*3]   = data_array[i, 63+j*3] - (ref_rx if ref_rx is not None else 0)
                norm_data[i, 63+j*3+1] = data_array[i, 63+j*3+1] - (ref_ry if ref_ry is not None else 0)
                norm_data[i, 63+j*3+2] = data_array[i, 63+j*3+2] - (ref_rz if ref_rz is not None else 0)
    return norm_data

# ----------------- 辅助函数 -----------------
def get_chinese_font():
    for path in ["simhei.ttf", "C:/Windows/Fonts/simhei.ttf", "C:/Windows/Fonts/msyh.ttc"]:
        if os.path.exists(path):
            try: return ImageFont.truetype(path, 40)
            except: pass
    return ImageFont.load_default()

def draw_text(img, text, position, font, color=(0, 255, 0)):
    pil_img = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(pil_img)
    draw.text(position, text, font=font, fill=color)
    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

def extract_keypoints(results):
    lh = np.zeros(63)
    rh = np.zeros(63)
    if results.multi_hand_landmarks:
        for hand_landmarks, handedness in zip(results.multi_hand_landmarks, results.multi_handedness):
            label = handedness.classification[0].label
            coords = np.array([[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark]).flatten()
            if label == 'Left': lh = coords
            else: rh = coords
    return np.concatenate([lh, rh])

def get_finger_states(hand_landmarks, handedness_label):
    fingers = []
    if handedness_label == 'Right':
        fingers.append(1 if hand_landmarks.landmark[4].x < hand_landmarks.landmark[3].x else 0)
    else:
        fingers.append(1 if hand_landmarks.landmark[4].x > hand_landmarks.landmark[3].x else 0)
    for tip, mcp in [(8, 5), (12, 9), (16, 13), (20, 17)]:
        fingers.append(1 if hand_landmarks.landmark[tip].y < hand_landmarks.landmark[mcp].y else 0)
    return fingers

def calc_distance(p1, p2):
    return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)

def is_hand_near_face(landmark, face_y_approx=0.4):
    return landmark[0].y < face_y_approx

def get_palm_normal(lm):
    v1 = np.array([lm[5].x - lm[0].x, lm[5].y - lm[0].y, lm[5].z - lm[0].z])
    v2 = np.array([lm[17].x - lm[0].x, lm[17].y - lm[0].y, lm[17].z - lm[0].z])
    normal = np.cross(v1, v2)
    norm = np.linalg.norm(normal)
    if norm == 0: return np.array([0, 0, 1])
    return normal / norm

def recognize_number_gesture(fingers):
    """根据手指竖起列表识别数字 0-5"""
    total = sum(fingers)
    if total == 0:
        return "数字0 (拳头)"
    if total == 1:
        if fingers[1] == 1: return "数字1"
        elif fingers[2] == 1: return "中指"
        elif fingers[3] == 1: return "无名指"
        elif fingers[4] == 1: return "小指"
        elif fingers[0] == 1: return "数字1 (拇指)"
    if total == 2:
        if fingers[1] == 1 and fingers[2] == 1: return "数字2"
        if fingers[0] == 1 and fingers[1] == 1: return "数字8 (L形)"
        if fingers[0] == 1 and fingers[4] == 1: return "数字6"
    if total == 3:
        if (fingers[1] == 1 and fingers[2] == 1 and fingers[3] == 1) or \
           (fingers[0] == 1 and fingers[1] == 1 and fingers[2] == 1):
            return "数字3"
    if total == 4:
        if fingers[1] == 1 and fingers[2] == 1 and fingers[3] == 1 and fingers[4] == 1:
            return "数字4"
    if total == 5:
        return "数字5 (手掌)"
    return None

def main():
    cap = cv2.VideoCapture(0)
    font = get_chinese_font()
    
    # NN 滑动窗口
    frames_buffer = deque(maxlen=FRAMES_PER_SAMPLE)
    
    # 规则引擎历史轨迹
    x_history_left = deque(maxlen=15)
    y_history_left = deque(maxlen=15)
    x_history_right = deque(maxlen=15)
    y_history_right = deque(maxlen=15)
    fingers_sum_history = deque(maxlen=15)
    can_stable_left = deque(maxlen=10)
    can_stable_right = deque(maxlen=10)
    
    # 多数投票窗口缩小，加快响应
    sign_history = deque(maxlen=5)
    
    nn_prediction = "等待输入..."
    nn_confidence = 0.0

    print("启动融合版实时推理！(神经网络 + 规则引擎 + MediaPipe手势)")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        
        frame = cv2.flip(frame, 1)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # 1. (已移除耗时的内置手势识别)
        mp_builtin_gesture = ""

        # 2. 提取特征并运行规则引擎
        results = hands.process(rgb_frame)
        raw_rule_sign = "无"
        
        if results.multi_hand_landmarks and results.multi_handedness:
            hand_data = []
            for idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
                mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)
                label = results.multi_handedness[idx].classification[0].label
                fingers = get_finger_states(hand_landmarks, label)
                hand_data.append({'label': label, 'fingers': fingers, 'landmarks': hand_landmarks.landmark})
                
                if label == 'Left':
                    x_history_left.append(hand_landmarks.landmark[0].x)
                    y_history_left.append(hand_landmarks.landmark[0].y)
                    can_stable_left.append((hand_landmarks.landmark[0].x, hand_landmarks.landmark[0].y))
                else:
                    x_history_right.append(hand_landmarks.landmark[0].x)
                    y_history_right.append(hand_landmarks.landmark[0].y)
                    can_stable_right.append((hand_landmarks.landmark[0].x, hand_landmarks.landmark[0].y))
                    
            num_hands = len(hand_data)
            
            # ------ 规则引擎逻辑 ------
            if num_hands == 1:
                fingers = hand_data[0]['fingers']
                lm = hand_data[0]['landmarks']
                label = hand_data[0]['label']
                fingers_sum_history.append(sum(fingers[1:]))
                
                # 动静分离核心逻辑：计算手部是否在显著移动
                x_hist = x_history_left if label == 'Left' else x_history_right
                y_hist = y_history_left if label == 'Left' else y_history_right
                var_x = np.var(x_hist) if len(x_hist) > 10 else 0
                var_y = np.var(y_hist) if len(y_hist) > 10 else 0
                # 调低判定移动的阈值，意味着手必须“极其静止”才能触发静态规则，防止规则太敏感
                is_moving = max(var_x, var_y) > 0.0008  
                
                # 1. 优先判定特定单手规则动作 (只在手稳定时判定静态手势！)
                if not is_moving:
                    dist_thumb_index = calc_distance(lm[4], lm[8])
                    if fingers == [0, 0, 0, 0, 1]: raw_rule_sign = "对不起 (Sorry)"
                    # 新增：极其精准的 OK 手势判定（食指拇指捏合，其余三指伸出）
                    elif dist_thumb_index < 0.06 and fingers[2] == 1 and fingers[3] == 1 and fingers[4] == 1:
                        raw_rule_sign = "好 (OK)"
                    # 兼容：点赞手势也算“好”
                    elif fingers[0] == 1 and sum(fingers[1:]) == 0 and lm[4].y < lm[3].y:
                        raw_rule_sign = "好 (点赞)"
                    elif fingers == [0, 1, 0, 0, 0]:
                        z_diff = lm[8].z - lm[0].z
                        if z_diff < -0.05: raw_rule_sign = "你 (You)"
                        elif z_diff > 0.02: raw_rule_sign = "我 (Me)"
                    
                    # 2. 兜底检测数字手势 (数字手势也必须是静态的)
                    if raw_rule_sign == "无":
                        num_gesture = recognize_number_gesture(fingers)
                        if num_gesture:
                            raw_rule_sign = num_gesture
                else:
                    # 动态规则手势 (只有手在动时才触发)
                    if sum(fingers) >= 4 and lm[0].y < 0.6 and var_x > 0.002: 
                        raw_rule_sign = "再见 (Goodbye)"
                    elif fingers[0] == 1 and sum(fingers[1:]) == 0 and lm[4].y < lm[3].y:
                        if len(fingers_sum_history) > 5 and np.var(fingers_sum_history) > 0.5:
                            raw_rule_sign = "可以 (Can)"
            
            elif num_hands == 2:
                fingers1, fingers2 = hand_data[0]['fingers'], hand_data[1]['fingers']
                lm1, lm2 = hand_data[0]['landmarks'], hand_data[1]['landmarks']
                
                # 仅保留“真”这种简单的双手指尖接触规则
                if fingers1 == [0, 1, 0, 0, 0] and fingers2 == [0, 1, 0, 0, 0]:
                    if calc_distance(lm1[8], lm2[8]) < 0.1: raw_rule_sign = "真 (Really)"

            # （已移除冲突屏蔽机制，因为规则引擎优先且只保留了最精准的静态手势）

        # 3. 神经网络推理
        keypoints = extract_keypoints(results)
        frames_buffer.append(keypoints)
        
        if len(frames_buffer) == FRAMES_PER_SAMPLE:
            input_array = np.array(frames_buffer)
            # 对特征进行空间标准化（极其重要）
            input_array = normalize_data(input_array)
            input_tensor = torch.FloatTensor(input_array).unsqueeze(0).to(device)
            with torch.no_grad():
                logits = model(input_tensor)
                probs = torch.nn.functional.softmax(logits, dim=-1)[0]
                max_prob, predicted_idx = torch.max(probs, dim=0)
                nn_confidence = max_prob.item()
                
                if nn_confidence > 0.8:
                    nn_prediction = VOCAB[predicted_idx.item()]
                else:
                    nn_prediction = "无动作"
        
        # 4. 融合决策：调整优先级
        current_frame_sign = "无"
        
        # 【全新优先级逻辑】：用户反馈“数字识别概率太高把训练的都弄没了”
        # 现在，我们绝对优先信任用户训练的 AI 模型！
        # 只要 AI 模型的置信度超过 0.85，直接采纳 AI 的预测结果，彻底压制规则引擎
        if "好" in raw_rule_sign:
            # 【特权通道】：因为 OK 手势具有完美的几何特征（食指拇指捏合），
            # 规则引擎判断它 100% 准确！为了防止 AI 将其误判为喝水/睡觉，给它最高特权！
            current_frame_sign = f"[规则] {raw_rule_sign}"
        elif nn_prediction != "无动作" and nn_prediction != "等待输入..." and nn_confidence > 0.85:
            current_frame_sign = f"[AI训练] {nn_prediction}"
        # 只有当 AI 模型认为“无动作”或置信度很低时，才去触发底层的规则（比如数字、对不起等）
        elif raw_rule_sign != "无":
            current_frame_sign = f"[规则] {raw_rule_sign}"
        # 最后，如果没有规则触发，看看是不是内置的手势
        elif mp_builtin_gesture != "":
            current_frame_sign = f"[内置] {mp_builtin_gesture}"
            
        # 多数投票平滑 (降低窗口大小，提升响应速度)
        sign_history.append(current_frame_sign)
        if len(sign_history) > 0:
            most_common_sign = Counter(sign_history).most_common(1)[0][0]
        else:
            most_common_sign = "无"

        # 5. UI 渲染
        if most_common_sign != "无":
            if "[AI训练]" in most_common_sign: color = (0, 255, 255) # 黄色
            elif "[规则]" in most_common_sign: color = (0, 255, 0)   # 绿色
            else: color = (255, 100, 100) # 浅蓝色
            frame = draw_text(frame, f"动作: {most_common_sign}", (30, 50), font, color)
        else:
            frame = draw_text(frame, "请做出手势...", (30, 50), font, (200, 200, 200))
            
        # 显示底层信息供调试
        frame = draw_text(frame, f"模型置信度: {nn_confidence:.2f}", (30, 100), font, (150, 150, 150))
        
        cv2.imshow("Unified Sign Inference", frame)
        
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'): break
        elif key == ord('c'):
            frames_buffer.clear()
            sign_history.clear()
            
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()