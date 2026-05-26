import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision
import numpy as np
import torch
import json
import os
import math
from collections import deque, Counter
from PIL import Image, ImageDraw, ImageFont

from train_custom import (
    AUDIO_FEATURE_DIM,
    CompactSignModel,
    MODEL_SAVE_PATH,
    VOCAB_SAVE_PATH,
    compute_semantic_features,
)

FRAMES_PER_SAMPLE = 30
HAND_LANDMARKER_MODEL = os.path.join(os.path.dirname(__file__), "hand_landmarker.task")

# ----------------- load vocab and model -----------------
if not os.path.exists(VOCAB_SAVE_PATH) or not os.path.exists(MODEL_SAVE_PATH):
    print("ERROR: model/vocab not found, run train_custom.py first")
    exit(1)

with open(VOCAB_SAVE_PATH, 'r', encoding='utf-8') as f:
    VOCAB = json.load(f)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = CompactSignModel(num_classes=len(VOCAB)).to(device)
model.load_state_dict(torch.load(MODEL_SAVE_PATH, map_location=device))
model.eval()
print(f"Model loaded: {VOCAB}")

# ----------------- MediaPipe HandLandmarker (Task API) -----------------
_HAND_LANDMARKER_PATH = os.path.join(os.path.dirname(__file__), "hand_landmarker.task")
_hand_landmarker_data = None
if os.path.exists(_HAND_LANDMARKER_PATH):
    with open(_HAND_LANDMARKER_PATH, "rb") as _f:
        _hand_landmarker_data = _f.read()

hand_landmarker_options = vision.HandLandmarkerOptions(
    base_options=mp_tasks.BaseOptions(
        model_asset_path=_HAND_LANDMARKER_PATH if _hand_landmarker_data is None else None,
        model_asset_buffer=_hand_landmarker_data,
    ),
    num_hands=2,
    min_hand_detection_confidence=0.5,
    min_hand_presence_confidence=0.5,
    min_tracking_confidence=0.5,
)
hand_landmarker = vision.HandLandmarker.create_from_options(hand_landmarker_options)

# ----------------- normalize -----------------
def normalize_data(data_array):
    norm_data = np.zeros_like(data_array)
    ref_lx, ref_ly, ref_lz = None, None, None
    ref_rx, ref_ry, ref_rz = None, None, None

    for i in range(data_array.shape[0]):
        lx, ly, lz = data_array[i, 0], data_array[i, 1], data_array[i, 2]
        rx, ry, rz = data_array[i, 63], data_array[i, 64], data_array[i, 65]

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

# ----------------- helpers -----------------
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

def extract_keypoints(detection_result):
    lh = np.zeros(63)
    rh = np.zeros(63)
    if detection_result.hand_landmarks:
        for hand_landmarks, handedness in zip(detection_result.hand_landmarks, detection_result.handedness):
            label = handedness[0].category_name
            coords = np.array([[lm.x, lm.y, lm.z] for lm in hand_landmarks]).flatten()
            if label == 'Left':
                lh = coords
            else:
                rh = coords
    return np.concatenate([lh, rh])

def get_finger_states(hand_landmarks, handedness_label):
    fingers = []
    lm = hand_landmarks
    if handedness_label == 'Right':
        fingers.append(1 if lm[4].x < lm[3].x else 0)
    else:
        fingers.append(1 if lm[4].x > lm[3].x else 0)
    for tip, mcp in [(8, 5), (12, 9), (16, 13), (20, 17)]:
        fingers.append(1 if lm[tip].y < lm[mcp].y else 0)
    return fingers

def calc_distance(p1, p2):
    return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)

def is_hand_near_face(hand_landmarks, face_y_approx=0.4):
    return hand_landmarks[0].y < face_y_approx

def get_palm_normal(lm):
    v1 = np.array([lm[5].x - lm[0].x, lm[5].y - lm[0].y, lm[5].z - lm[0].z])
    v2 = np.array([lm[17].x - lm[0].x, lm[17].y - lm[0].y, lm[17].z - lm[0].z])
    normal = np.cross(v1, v2)
    norm = np.linalg.norm(normal)
    if norm == 0: return np.array([0, 0, 1])
    return normal / norm

def recognize_number_gesture(fingers):
    total = sum(fingers)
    if total == 0:
        return "0 (fist)"
    if total == 1:
        if fingers[1] == 1: return "1"
        elif fingers[2] == 1: return "middle"
        elif fingers[3] == 1: return "ring"
        elif fingers[4] == 1: return "pinky"
        elif fingers[0] == 1: return "1 (thumb)"
    if total == 2:
        if fingers[1] == 1 and fingers[2] == 1: return "2"
        if fingers[0] == 1 and fingers[1] == 1: return "8 (L)"
        if fingers[0] == 1 and fingers[4] == 1: return "6"
    if total == 3:
        if fingers[1] == 1 and fingers[2] == 1 and fingers[3] == 1: return "3"
        if fingers[0] == 1 and fingers[1] == 1 and fingers[2] == 1: return "3 (OK)"
    if total == 4:
        if fingers[2] == 0: return "4"
    if total == 5:
        return "5 (open)"
    return None

def main():
    cap = cv2.VideoCapture(0)
    font = get_chinese_font()
    
    frames_buffer = deque(maxlen=FRAMES_PER_SAMPLE)
    
    x_history_left = deque(maxlen=15)
    y_history_left = deque(maxlen=15)
    x_history_right = deque(maxlen=15)
    y_history_right = deque(maxlen=15)
    fingers_sum_history = deque(maxlen=15)
    can_stable_left = deque(maxlen=10)
    can_stable_right = deque(maxlen=10)
    
    sign_history = deque(maxlen=5)
    
    nn_prediction = "idle"
    nn_confidence = 0.0

    HAND_CONNECTIONS = [
        (0,1),(1,2),(2,3),(3,4),(0,5),(5,6),(6,7),(7,8),
        (0,9),(9,10),(10,11),(11,12),(0,13),(13,14),(14,15),(15,16),
        (0,17),(17,18),(18,19),(19,20),(5,9),(9,13),(13,17),
    ]

    def draw_landmarks_on_frame(frame, hand_landmarks, color=(0,255,0)):
        h, w = frame.shape[:2]
        for idx in range(21):
            cx, cy = int(hand_landmarks[idx].x * w), int(hand_landmarks[idx].y * h)
            cv2.circle(frame, (cx, cy), 4, color, -1)
        for i, j in HAND_CONNECTIONS:
            pt1 = (int(hand_landmarks[i].x * w), int(hand_landmarks[i].y * h))
            pt2 = (int(hand_landmarks[j].x * w), int(hand_landmarks[j].y * h))
            cv2.line(frame, pt1, pt2, color, 2)

    print("Realtime inference started (NN + rules + MediaPipe)")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        
        frame = cv2.flip(frame, 1)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        
        mp_builtin_gesture = ""

        # 2. Rules engine (keypoint-based)
        detection_result = hand_landmarker.detect(mp_image)
        raw_rule_sign = "none"
        
        if detection_result.hand_landmarks and detection_result.handedness:
            hand_data = []
            for idx, hand_landmarks in enumerate(detection_result.hand_landmarks):
                draw_landmarks_on_frame(frame, hand_landmarks)
                label = detection_result.handedness[idx][0].category_name
                fingers = get_finger_states(hand_landmarks, label)
                hand_data.append({'label': label, 'fingers': fingers, 'landmarks': hand_landmarks})
                
                if label == 'Left':
                    x_history_left.append(hand_landmarks[0].x)
                    y_history_left.append(hand_landmarks[0].y)
                    can_stable_left.append((hand_landmarks[0].x, hand_landmarks[0].y))
                else:
                    x_history_right.append(hand_landmarks[0].x)
                    y_history_right.append(hand_landmarks[0].y)
                    can_stable_right.append((hand_landmarks[0].x, hand_landmarks[0].y))
                    
            num_hands = len(hand_data)
            
            # ============ RULE ENGINE ============
            if num_hands == 1:
                fingers = hand_data[0]['fingers']
                lm = hand_data[0]['landmarks']
                label = hand_data[0]['label']
                fingers_sum_history.append(sum(fingers[1:]))
                
                x_hist = x_history_left if label == 'Left' else x_history_right
                y_hist = y_history_left if label == 'Left' else y_history_right
                var_x = np.var(x_hist) if len(x_hist) > 10 else 0
                var_y = np.var(y_hist) if len(y_hist) > 10 else 0
                is_moving = max(var_x, var_y) > 0.0015

                # "Love" — hand at chest level, thumb only up
                is_chest = 0.38 < lm[0].y < 0.82
                is_thumb_only = (fingers[0] == 1 and sum(fingers[1:]) == 0)
                if is_chest and is_thumb_only and not is_moving:
                    raw_rule_sign = "Love"

                # "I/Me" or "You" — index finger pointing
                if raw_rule_sign == "none" and fingers == [0, 1, 0, 0, 0]:
                    z_diff = lm[8].z - lm[0].z
                    if z_diff > 0.005:
                        raw_rule_sign = "I/Me"
                    elif z_diff < -0.07:
                        raw_rule_sign = "You"

                # Static gestures
                if raw_rule_sign == "none" and not is_moving:
                    dist_thumb_index = calc_distance(lm[4], lm[8])
                    if fingers == [0, 0, 0, 0, 1]:
                        raw_rule_sign = "Sorry"
                    elif dist_thumb_index < 0.06 and fingers[2] == 1 and fingers[3] == 1 and fingers[4] == 1:
                        raw_rule_sign = "OK"
                    elif fingers[0] == 1 and sum(fingers[1:]) == 0 and lm[4].y < lm[3].y:
                        raw_rule_sign = "OK (thumbs)"

                # Numbers (always)
                if raw_rule_sign == "none":
                    num_gesture = recognize_number_gesture(fingers)
                    if num_gesture:
                        raw_rule_sign = num_gesture

                # Dynamic
                if raw_rule_sign == "none" and is_moving:
                    if sum(fingers) >= 4 and lm[0].y < 0.6 and var_x > 0.002:
                        raw_rule_sign = "Goodbye"
                    elif fingers[0] == 1 and sum(fingers[1:]) == 0 and lm[4].y < lm[3].y:
                        if len(fingers_sum_history) > 5 and np.var(fingers_sum_history) > 0.5:
                            raw_rule_sign = "Can"
            
            elif num_hands == 2:
                fingers1, fingers2 = hand_data[0]['fingers'], hand_data[1]['fingers']
                lm1, lm2 = hand_data[0]['landmarks'], hand_data[1]['landmarks']
                
                if fingers1 == [0, 1, 0, 0, 0] and fingers2 == [0, 1, 0, 0, 0]:
                    if calc_distance(lm1[8], lm2[8]) < 0.1:
                        raw_rule_sign = "Really"

        # 3. Neural network
        keypoints = extract_keypoints(detection_result)
        frames_buffer.append(keypoints)
        
        if len(frames_buffer) == FRAMES_PER_SAMPLE:
            raw_array = np.array(frames_buffer, dtype=np.float32)
            input_array = normalize_data(raw_array)
            input_tensor = torch.FloatTensor(input_array).unsqueeze(0).to(device)
            semantic_tensor = torch.FloatTensor(compute_semantic_features(raw_array)).unsqueeze(0).to(device)
            audio_tensor = torch.zeros((1, AUDIO_FEATURE_DIM), dtype=torch.float32, device=device)
            with torch.no_grad():
                logits = model(input_tensor, audio_features=audio_tensor, semantic_features=semantic_tensor)
                probs = torch.nn.functional.softmax(logits, dim=-1)[0]
                max_prob, predicted_idx = torch.max(probs, dim=0)
                nn_confidence = max_prob.item()
                
                if nn_confidence > 0.45:
                    nn_prediction = VOCAB[predicted_idx.item()]
                else:
                    nn_prediction = "idle"
        
        # 4. Fusion
        current_frame_sign = "none"
        
        # Rule "OK" is geometrically perfect → highest priority
        if raw_rule_sign in ("OK", "OK (thumbs)"):
            current_frame_sign = f"[Rule] {raw_rule_sign}"
        # NN prediction with confidence > 0.5 takes priority over rules
        elif nn_prediction != "idle" and nn_confidence > 0.58:
            current_frame_sign = f"[NN] {nn_prediction}"
        # Fallback: rule engine
        elif raw_rule_sign != "none":
            current_frame_sign = f"[Rule] {raw_rule_sign}"
        elif mp_builtin_gesture != "":
            current_frame_sign = f"[Builtin] {mp_builtin_gesture}"
            
        sign_history.append(current_frame_sign)
        if len(sign_history) > 0:
            most_common_sign = Counter(sign_history).most_common(1)[0][0]
        else:
            most_common_sign = "none"

        # 5. Render
        if most_common_sign != "none":
            if "[NN]" in most_common_sign:
                color = (0, 255, 255)
            elif "[Rule]" in most_common_sign:
                color = (0, 255, 0)
            else:
                color = (255, 100, 100)
            frame = draw_text(frame, f"Sign: {most_common_sign}", (30, 50), font, color)
        else:
            frame = draw_text(frame, "Make a gesture...", (30, 50), font, (200, 200, 200))
            
        frame = draw_text(frame, f"NN conf: {nn_confidence:.2f}", (30, 100), font, (150, 150, 150))
        
        cv2.imshow("HandChat Realtime", frame)
        
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('c'):
            frames_buffer.clear()
            sign_history.clear()
            
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
