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
GESTURE_MODEL_PATH = "gesture_recognizer.task"
if not os.path.exists(GESTURE_MODEL_PATH):
    import urllib.request
    print("正在下载 MediaPipe 手势识别模型...")
    url = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task"
    urllib.request.urlretrieve(url, GESTURE_MODEL_PATH)
    print("模型下载完成！")

with open(GESTURE_MODEL_PATH, 'rb') as f:
    model_data = f.read()

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(static_image_mode=False, max_num_hands=2, min_detection_confidence=0.5)
mp_drawing = mp.solutions.drawing_utils

base_options = python.BaseOptions(model_asset_buffer=model_data)
options = vision.GestureRecognizerOptions(base_options=base_options, num_hands=2, min_hand_detection_confidence=0.5)
gesture_recognizer = vision.GestureRecognizer.create_from_options(options)

MP_GESTURE_MAP = {
    "None": "", "Closed_Fist": "紧握拳头", "Open_Palm": "张开手掌", "Pointing_Up": "向上指",
    "Thumb_Down": "踩 (Thumb Down)", "Thumb_Up": "赞 (Thumb Up)", "Victory": "胜利 (V字手)", "ILoveYou": "我爱你 (Spider-Man)"
}

# ----------------- 数据标准化函数 -----------------
def normalize_data(data_array):
    norm_data = np.zeros_like(data_array)
    for i in range(data_array.shape[0]):
        lx, ly, lz = data_array[i, 0], data_array[i, 1], data_array[i, 2]
        rx, ry, rz = data_array[i, 63], data_array[i, 64], data_array[i, 65]
        for j in range(21):
            if lx != 0 or ly != 0:
                norm_data[i, j*3]   = data_array[i, j*3] - lx
                norm_data[i, j*3+1] = data_array[i, j*3+1] - ly
                norm_data[i, j*3+2] = data_array[i, j*3+2] - lz
            if rx != 0 or ry != 0:
                norm_data[i, 63+j*3]   = data_array[i, 63+j*3] - rx
                norm_data[i, 63+j*3+1] = data_array[i, 63+j*3+1] - ry
                norm_data[i, 63+j*3+2] = data_array[i, 63+j*3+2] - rz
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
        
        # 1. MediaPipe 预训练手势识别
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        gesture_result = gesture_recognizer.recognize(mp_image)
        mp_builtin_gesture = ""
        if gesture_result.gestures:
            top_gesture = gesture_result.gestures[0][0]
            if top_gesture.category_name in MP_GESTURE_MAP and top_gesture.category_name != "None":
                if top_gesture.score > 0.6:
                    mp_builtin_gesture = MP_GESTURE_MAP[top_gesture.category_name]

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
                
                x_hist = x_history_left if label == 'Left' else x_history_right
                y_hist = y_history_left if label == 'Left' else y_history_right
                var_x = np.var(x_hist) if len(x_hist) > 10 else 0
                
                if sum(fingers) >= 4 and is_hand_near_face(lm, 0.4):
                    if abs(get_palm_normal(lm)[0]) > 0.4: raw_rule_sign = "睡觉 (Sleep)"
                elif fingers == [0, 0, 0, 0, 1]: raw_rule_sign = "对不起 (Sorry)"
                elif sum(fingers) >= 4 and lm[0].y < 0.6 and var_x > 0.002: raw_rule_sign = "再见 (Goodbye)"
                elif fingers[0] == 1 and sum(fingers[1:]) == 0 and lm[4].y < lm[3].y:
                    # 区分“好”和“可以”：好是静止的，可以的四指有轻微弯曲伸展动作
                    stable = False
                    if label == 'Left' and len(can_stable_left) >= 5:
                        xs = [p[0] for p in list(can_stable_left)[-5:]]
                        ys = [p[1] for p in list(can_stable_left)[-5:]]
                        if np.var(xs) < 0.001 and np.var(ys) < 0.001:
                            stable = True
                    elif label == 'Right' and len(can_stable_right) >= 5:
                        xs = [p[0] for p in list(can_stable_right)[-5:]]
                        ys = [p[1] for p in list(can_stable_right)[-5:]]
                        if np.var(xs) < 0.001 and np.var(ys) < 0.001:
                            stable = True
                    
                    if stable:
                        # 增加更严格的方差阈值，并且要求大拇指是明显向上的
                        if len(fingers_sum_history) > 5 and np.var(fingers_sum_history) > 0.5:
                            raw_rule_sign = "可以 (Can)"
                        else:
                            raw_rule_sign = "好 (Good)"
                elif fingers == [0, 1, 0, 0, 0]:
                    z_diff = lm[8].z - lm[0].z
                    if z_diff < -0.05: raw_rule_sign = "你 (You)"
                    elif z_diff > 0.02: raw_rule_sign = "我 (Me)"
            
            elif num_hands == 2:
                fingers1, fingers2 = hand_data[0]['fingers'], hand_data[1]['fingers']
                lm1, lm2 = hand_data[0]['landmarks'], hand_data[1]['landmarks']
                
                var_x_l = np.var(x_history_left) if len(x_history_left) > 10 else 0
                var_y_l = np.var(y_history_left) if len(y_history_left) > 10 else 0
                var_x_r = np.var(x_history_right) if len(x_history_right) > 10 else 0
                var_y_r = np.var(y_history_right) if len(y_history_right) > 10 else 0
                
                if sum(fingers1) <= 1 and sum(fingers2) <= 1:
                    if var_y_l > 0.001 and var_y_r > 0.001: raw_rule_sign = "工作 (Work)"
                elif sum(fingers1[1:]) >= 3 and sum(fingers2[1:]) >= 3:
                    dist_x = abs(lm1[0].x - lm2[0].x)
                    if dist_x < 0.15 and lm1[0].y > 0.4 and lm2[0].y > 0.4: raw_rule_sign = "休息 (Rest)"
                    elif dist_x > 0.15 and var_y_l > 0.002 and var_y_r > 0.002: raw_rule_sign = "洗澡 (Bath)"
                elif fingers1 == [0, 1, 0, 0, 0] and fingers2 == [0, 1, 0, 0, 0]:
                    if calc_distance(lm1[8], lm2[8]) < 0.1: raw_rule_sign = "真 (Really)"
                elif sum(fingers1[1:]) >= 3 and sum(fingers2[1:]) >= 3:
                    if var_y_l > 0.001 and var_y_r > 0.001 and var_y_l > var_x_l and var_y_r > var_x_r:
                        if raw_rule_sign == "无": raw_rule_sign = "高兴 (Happy)"
                    elif var_x_l > 0.001 and var_x_r > 0.001 and lm1[0].y > 0.4 and lm2[0].y > 0.4:
                        raw_rule_sign = "请 (Please)"

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
        
        # 因为现在 AI 是你专门训练的，如果它非常有自信（>0.85），我们就完全信任 AI
        if nn_prediction != "无动作" and nn_prediction != "等待输入..." and nn_confidence > 0.85:
            current_frame_sign = f"[AI训练] {nn_prediction}"
        # 否则，退回规则引擎 (静态手势最准)
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