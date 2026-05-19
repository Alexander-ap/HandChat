import cv2
import mediapipe as mp
import numpy as np
import os
import time
from PIL import Image, ImageDraw, ImageFont

# ----------------- 配置参数 -----------------
# 你要录制的词汇列表
WORDS = ["你", "我", "爱", "好", "下午", "休息", "睡觉", "打电话", "喝水", "吃饭", "音乐", "无动作"]

TARGET_COUNT = 10         # 每个动作录制的样本数（为了省事，咱们先录 10 个）
FRAMES_PER_SAMPLE = 30    # 每个样本包含的帧数（1秒 = 30帧）
DATA_DIR = "custom_dataset"

# 初始化数据存放目录
for word in WORDS:
    os.makedirs(os.path.join(DATA_DIR, word), exist_ok=True)

# ----------------- MediaPipe 初始化 -----------------
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False, 
    max_num_hands=2, 
    min_detection_confidence=0.5
)
mp_drawing = mp.solutions.drawing_utils

def get_chinese_font():
    candidates = ["simhei.ttf", "C:/Windows/Fonts/simhei.ttf", "C:/Windows/Fonts/msyh.ttc"]
    for path in candidates:
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
    """
    提取双手共 126 维特征 (左手63 + 右手63)
    如果有一只手没检测到，对应位置自动填 0
    """
    lh = np.zeros(63)
    rh = np.zeros(63)
    if results.multi_hand_landmarks:
        for hand_landmarks, handedness in zip(results.multi_hand_landmarks, results.multi_handedness):
            # 这里的 label 已经是镜像后的物理左右手
            label = handedness.classification[0].label
            coords = np.array([[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark]).flatten()
            if label == 'Left':
                lh = coords
            else:
                rh = coords
    return np.concatenate([lh, rh])

def main():
    cap = cv2.VideoCapture(0)
    font = get_chinese_font()
    
    current_word_idx = 0
    is_recording = False
    frames_data = []
    
    print(f"启动录制脚本！目标：每个词录制 {TARGET_COUNT} 遍。")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        
        # 水平镜像，像照镜子一样
        frame = cv2.flip(frame, 1) 
        
        current_word = WORDS[current_word_idx]
        saved_count = len(os.listdir(os.path.join(DATA_DIR, current_word)))
        
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb_frame)
        
        # 画骨骼点
        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)
                
        # 录制逻辑
        if is_recording:
            keypoints = extract_keypoints(results)
            frames_data.append(keypoints)
            
            # 显示下方红色进度条
            progress = len(frames_data) / FRAMES_PER_SAMPLE
            cv2.rectangle(frame, (0, 400), (int(640 * progress), 430), (0, 0, 255), -1)
            frame = draw_text(frame, "录制中...", (250, 350), font, (0, 0, 255))
            
            # 录满 30 帧，保存一个 .npy
            if len(frames_data) == FRAMES_PER_SAMPLE:
                is_recording = False
                npy_path = os.path.join(DATA_DIR, current_word, f"{int(time.time()*1000)}.npy")
                np.save(npy_path, np.array(frames_data))
                frames_data = []
                saved_count += 1
        else:
            # 提示文字
            color = (0, 255, 0) if saved_count >= TARGET_COUNT else (0, 255, 255)
            frame = draw_text(frame, f"当前: {current_word} ({saved_count}/{TARGET_COUNT})", (30, 50), font, color)
            frame = draw_text(frame, "A/D: 切换单词 | 空格: 录制1次", (30, 100), font, (200, 200, 200))
            
        cv2.imshow("Record Dataset", frame)
        
        # 按键监听
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('a') and not is_recording:
            current_word_idx = (current_word_idx - 1) % len(WORDS)
        elif key == ord('d') and not is_recording:
            current_word_idx = (current_word_idx + 1) % len(WORDS)
        elif key == 32 and not is_recording: # 32是空格键的ASCII码
            is_recording = True
            frames_data = []
            
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()