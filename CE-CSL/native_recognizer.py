from __future__ import annotations

import json
import math
import os
import sys
import threading
import urllib.request
from collections import Counter, deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import torch
import torch.nn.functional as F

from train_custom import (
    AUDIO_FEATURE_DIM,
    FRAMES_PER_SAMPLE,
    MODEL_SAVE_PATH as TRAIN_MODEL_SAVE_PATH,
    VOCAB_SAVE_PATH as TRAIN_VOCAB_SAVE_PATH,
    CompactSignModel,
    compute_semantic_features,
    normalize_data,
)

BASE_DIR = Path(__file__).resolve().parent
FEATURES_PER_FRAME = 126

HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (0, 9), (9, 10), (10, 11), (11, 12),
    (0, 13), (13, 14), (14, 15), (15, 16),
    (0, 17), (17, 18), (18, 19), (19, 20),
    (5, 9), (9, 13), (13, 17),
]

MP_GESTURE_MAP = {
    "None": "",
    "Closed_Fist": "紧握拳头",
    "Open_Palm": "张开手掌",
    "Pointing_Up": "向上指",
    "Thumb_Down": "踩 (Thumb Down)",
    "Thumb_Up": "赞 (Thumb Up)",
    "Victory": "胜利 (V字手)",
    "ILoveYou": "我爱你 (Spider-Man)",
}

GestureSource = Literal["ai", "rule", "mediapipe", "none"]


@dataclass
class NativeRecognitionResult:
    frame_id: int
    label: str
    display_text: str
    confidence: float
    source: GestureSource
    ready: bool
    hands_count: int
    nn_label: str
    nn_confidence: float
    raw_rule_sign: str
    rendered_frame: np.ndarray | None = field(default=None, repr=False)


@dataclass
class WindowPrediction:
    label: str
    confidence: float
    top_k: list[tuple[str, float]]


def resolve_asset_path(env_key: str, candidates: list[Path], asset_name: str) -> Path:
    configured = os.environ.get(env_key)
    if configured:
        configured_path = Path(configured).expanduser()
        if not configured_path.is_absolute():
            configured_path = (BASE_DIR / configured_path).resolve()
        if not configured_path.exists():
            raise RuntimeError(f"{asset_name} file not found: {configured_path}")
        return configured_path

    for candidate in candidates:
        if candidate.exists():
            return candidate

    searched = ", ".join(str(candidate) for candidate in candidates)
    raise RuntimeError(f"{asset_name} file not found. searched: {searched}")


def resolve_model_path() -> Path:
    return resolve_asset_path(
        "CECSL_MODEL_PATH",
        [
            BASE_DIR / TRAIN_MODEL_SAVE_PATH,
        ],
        "model",
    )


def resolve_vocab_path() -> Path:
    return resolve_asset_path(
        "CECSL_VOCAB_PATH",
        [
            BASE_DIR / TRAIN_VOCAB_SAVE_PATH,
        ],
        "vocab",
    )


def resolve_gesture_model_path() -> Path:
    return resolve_asset_path(
        "CECSL_GESTURE_MODEL_PATH",
        [
            BASE_DIR / "gesture_recognizer.task",
        ],
        "gesture model",
    )


def load_vocab() -> list[str]:
    vocab_path = resolve_vocab_path()
    if not vocab_path.exists():
        raise RuntimeError(f"vocab file not found: {vocab_path}")
    with vocab_path.open("r", encoding="utf-8") as file:
        vocab = json.load(file)
    if not isinstance(vocab, list) or not all(isinstance(item, str) for item in vocab):
        raise RuntimeError("custom_vocab.json must be a JSON string array")
    if not vocab:
        raise RuntimeError("custom_vocab.json is empty")
    return vocab


def ensure_gesture_model(model_path: Path) -> bytes:
    if not model_path.exists():
        url = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task"
        urllib.request.urlretrieve(url, model_path)
    return model_path.read_bytes()


def get_result_landmarks(results):
    return getattr(results, "multi_hand_landmarks", None) or getattr(results, "hand_landmarks", None) or []


def get_result_handedness(results):
    return getattr(results, "multi_handedness", None) or getattr(results, "handedness", None) or []


def get_landmark_list(hand_landmarks):
    return getattr(hand_landmarks, "landmark", hand_landmarks)


def get_handedness_label(handedness):
    if hasattr(handedness, "classification"):
        return handedness.classification[0].label
    if isinstance(handedness, (list, tuple)) and handedness:
        return handedness[0].category_name
    return getattr(handedness, "category_name", "Right")


def draw_hand_landmarks(frame: np.ndarray, landmarks) -> None:
    height, width = frame.shape[:2]
    points = [(int(lm.x * width), int(lm.y * height)) for lm in landmarks]
    for start, end in HAND_CONNECTIONS:
        if start < len(points) and end < len(points):
            cv2.line(frame, points[start], points[end], (0, 255, 0), 2)
    for x, y in points:
        cv2.circle(frame, (x, y), 3, (0, 0, 255), -1)


def extract_keypoints(results) -> np.ndarray:
    lh = np.zeros(63)
    rh = np.zeros(63)
    landmarks_list = get_result_landmarks(results)
    handedness_list = get_result_handedness(results)
    if landmarks_list:
        for hand_landmarks, handedness in zip(landmarks_list, handedness_list):
            label = get_handedness_label(handedness)
            landmarks = get_landmark_list(hand_landmarks)
            coords = np.array([[lm.x, lm.y, lm.z] for lm in landmarks]).flatten()
            if label == "Left":
                lh = coords
            else:
                rh = coords
    return np.concatenate([lh, rh])


def get_finger_states(hand_landmarks, handedness_label: str) -> list[int]:
    lm = get_landmark_list(hand_landmarks)
    fingers = []
    if handedness_label == "Right":
        fingers.append(1 if lm[4].x < lm[3].x else 0)
    else:
        fingers.append(1 if lm[4].x > lm[3].x else 0)
    for tip, mcp in [(8, 5), (12, 9), (16, 13), (20, 17)]:
        fingers.append(1 if lm[tip].y < lm[mcp].y else 0)
    return fingers


def calc_distance(p1, p2) -> float:
    return math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)


def is_hand_near_face(landmark, face_y_approx=0.4) -> bool:
    return landmark[0].y < face_y_approx


def get_palm_normal(lm) -> np.ndarray:
    v1 = np.array([lm[5].x - lm[0].x, lm[5].y - lm[0].y, lm[5].z - lm[0].z])
    v2 = np.array([lm[17].x - lm[0].x, lm[17].y - lm[0].y, lm[17].z - lm[0].z])
    normal = np.cross(v1, v2)
    norm = np.linalg.norm(normal)
    if norm == 0:
        return np.array([0, 0, 1])
    return normal / norm


def parse_display_sign(display_text: str) -> tuple[str, GestureSource]:
    if not display_text or display_text == "无":
        return "无", "none"

    source: GestureSource = "none"
    text = display_text
    prefixes: list[tuple[str, GestureSource]] = [
        ("[AI训练]", "ai"),
        ("[规则]", "rule"),
        ("[内置]", "mediapipe"),
    ]
    for prefix, prefix_source in prefixes:
        if text.startswith(prefix):
            source = prefix_source
            text = text[len(prefix):].strip()
            break

    if "(" in text:
        text = text.split("(", 1)[0].strip()
    return text or "无", source


class NativeRecognizerEngine:
    def __init__(self) -> None:
        self.model_path = resolve_model_path()
        self.vocab_path = resolve_vocab_path()
        self.gesture_model_path = resolve_gesture_model_path()
        self.vocab = load_vocab()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = CompactSignModel(num_classes=len(self.vocab)).to(self.device)
        self.model.load_state_dict(torch.load(self.model_path, map_location=self.device))
        self.model.eval()

        base_options = python.BaseOptions(model_asset_buffer=ensure_gesture_model(self.gesture_model_path))
        options = vision.GestureRecognizerOptions(
            base_options=base_options,
            num_hands=2,
            min_hand_detection_confidence=0.5,
        )
        self.gesture_recognizer = vision.GestureRecognizer.create_from_options(options)
        self.lock = threading.Lock()

    def create_session(self) -> "NativeRecognizerSession":
        return NativeRecognizerSession(self)

    def recognize_rgb(self, rgb_frame: np.ndarray):
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb_frame))
        with self.lock:
            return self.gesture_recognizer.recognize(image)

    def predict_window(self, frames: np.ndarray, top_k: int = 3) -> WindowPrediction:
        normalized = normalize_data(frames)
        input_tensor = torch.from_numpy(normalized).float().unsqueeze(0).to(self.device)
        semantic_tensor = torch.from_numpy(compute_semantic_features(frames)).float().unsqueeze(0).to(self.device)
        audio_tensor = torch.zeros((1, AUDIO_FEATURE_DIM), dtype=torch.float32, device=self.device)
        with self.lock, torch.no_grad():
            logits = self.model(input_tensor, audio_features=audio_tensor, semantic_features=semantic_tensor)
            probs = F.softmax(logits, dim=-1)[0]
            top_count = min(top_k, len(self.vocab))
            top_probs, top_indices = torch.topk(probs, k=top_count)

        items = [
            (self.vocab[index.item()], float(prob.item()))
            for prob, index in zip(top_probs, top_indices)
        ]
        top = items[0]
        return WindowPrediction(label=top[0], confidence=top[1], top_k=items)


class NativeRecognizerSession:
    def __init__(self, engine: NativeRecognizerEngine) -> None:
        self.engine = engine
        self.frames_buffer = deque(maxlen=FRAMES_PER_SAMPLE)
        self.x_history_left = deque(maxlen=15)
        self.y_history_left = deque(maxlen=15)
        self.x_history_right = deque(maxlen=15)
        self.y_history_right = deque(maxlen=15)
        self.fingers_sum_history = deque(maxlen=15)
        self.can_stable_left = deque(maxlen=10)
        self.can_stable_right = deque(maxlen=10)
        self.sign_history = deque(maxlen=5)
        self.display_confidences: dict[str, float] = {"无": 0.0}
        self.nn_prediction = "等待输入..."
        self.nn_confidence = 0.0
        self.lock = threading.Lock()

    def process_frame(
        self,
        frame: np.ndarray,
        frame_id: int,
        *,
        mirror: bool = True,
        draw_landmarks: bool = False,
    ) -> NativeRecognitionResult:
        with self.lock:
            return self._process_frame(frame, frame_id, mirror=mirror, draw_landmarks=draw_landmarks)

    def _process_frame(
        self,
        frame: np.ndarray,
        frame_id: int,
        *,
        mirror: bool,
        draw_landmarks: bool,
    ) -> NativeRecognitionResult:
        working_frame = cv2.flip(frame, 1) if mirror else frame.copy()
        rgb_frame = cv2.cvtColor(working_frame, cv2.COLOR_BGR2RGB)
        gesture_result = self.engine.recognize_rgb(rgb_frame)

        mp_builtin_gesture = ""
        mp_builtin_score = 0.0
        if gesture_result.gestures:
            top_gesture = gesture_result.gestures[0][0]
            if top_gesture.category_name in MP_GESTURE_MAP and top_gesture.category_name != "None" and top_gesture.score > 0.6:
                mp_builtin_gesture = MP_GESTURE_MAP[top_gesture.category_name]
                mp_builtin_score = float(top_gesture.score)

        raw_rule_sign = self.apply_rules(gesture_result, working_frame if draw_landmarks else None)
        keypoints = extract_keypoints(gesture_result)
        self.frames_buffer.append(keypoints)

        if len(self.frames_buffer) == FRAMES_PER_SAMPLE:
            prediction = self.engine.predict_window(np.array(self.frames_buffer, dtype=np.float32), top_k=3)
            self.nn_confidence = prediction.confidence
            self.nn_prediction = prediction.label if self.nn_confidence > 0.65 else "无动作"

        current_frame_sign = "无"
        current_confidence = 0.0
        if self.nn_prediction not in ("无动作", "等待输入...") and self.nn_confidence > 0.72:
            current_frame_sign = f"[AI训练] {self.nn_prediction}"
            current_confidence = self.nn_confidence
        elif raw_rule_sign != "无":
            current_frame_sign = f"[规则] {raw_rule_sign}"
            current_confidence = 1.0
        elif mp_builtin_gesture:
            current_frame_sign = f"[内置] {mp_builtin_gesture}"
            current_confidence = mp_builtin_score

        self.sign_history.append(current_frame_sign)
        self.display_confidences[current_frame_sign] = current_confidence
        most_common_sign = Counter(self.sign_history).most_common(1)[0][0] if self.sign_history else "无"
        label, source = parse_display_sign(most_common_sign)

        return NativeRecognitionResult(
            frame_id=frame_id,
            label=label,
            display_text=most_common_sign,
            confidence=self.display_confidences.get(most_common_sign, 0.0),
            source=source,
            ready=len(self.frames_buffer) == FRAMES_PER_SAMPLE or most_common_sign != "无",
            hands_count=len(get_result_landmarks(gesture_result)),
            nn_label=self.nn_prediction,
            nn_confidence=self.nn_confidence,
            raw_rule_sign=raw_rule_sign,
            rendered_frame=working_frame if draw_landmarks else None,
        )

    def apply_rules(self, results, draw_frame: np.ndarray | None = None) -> str:
        landmarks_list = get_result_landmarks(results)
        handedness_list = get_result_handedness(results)
        raw_rule_sign = "无"

        if not landmarks_list or not handedness_list:
            return raw_rule_sign

        hand_data = []
        for idx, hand_landmarks in enumerate(landmarks_list):
            landmarks = get_landmark_list(hand_landmarks)
            if draw_frame is not None:
                draw_hand_landmarks(draw_frame, landmarks)
            label = get_handedness_label(handedness_list[idx])
            fingers = get_finger_states(landmarks, label)
            hand_data.append({"label": label, "fingers": fingers, "landmarks": landmarks})

            if label == "Left":
                self.x_history_left.append(landmarks[0].x)
                self.y_history_left.append(landmarks[0].y)
                self.can_stable_left.append((landmarks[0].x, landmarks[0].y))
            else:
                self.x_history_right.append(landmarks[0].x)
                self.y_history_right.append(landmarks[0].y)
                self.can_stable_right.append((landmarks[0].x, landmarks[0].y))

        if len(hand_data) == 1:
            fingers = hand_data[0]["fingers"]
            lm = hand_data[0]["landmarks"]
            label = hand_data[0]["label"]
            self.fingers_sum_history.append(sum(fingers[1:]))

            x_hist = self.x_history_left if label == "Left" else self.x_history_right
            var_x = np.var(x_hist) if len(x_hist) > 10 else 0

            if sum(fingers) >= 4 and is_hand_near_face(lm, 0.4):
                if abs(get_palm_normal(lm)[0]) > 0.4:
                    raw_rule_sign = "睡觉 (Sleep)"
            elif fingers == [0, 0, 0, 0, 1]:
                raw_rule_sign = "对不起 (Sorry)"
            elif sum(fingers) >= 4 and lm[0].y < 0.6 and var_x > 0.002:
                raw_rule_sign = "再见 (Goodbye)"
            elif fingers[0] == 1 and sum(fingers[1:]) == 0 and lm[4].y < lm[3].y:
                stable = False
                if label == "Left" and len(self.can_stable_left) >= 5:
                    xs = [p[0] for p in list(self.can_stable_left)[-5:]]
                    ys = [p[1] for p in list(self.can_stable_left)[-5:]]
                    stable = np.var(xs) < 0.001 and np.var(ys) < 0.001
                elif label == "Right" and len(self.can_stable_right) >= 5:
                    xs = [p[0] for p in list(self.can_stable_right)[-5:]]
                    ys = [p[1] for p in list(self.can_stable_right)[-5:]]
                    stable = np.var(xs) < 0.001 and np.var(ys) < 0.001

                if stable:
                    if len(self.fingers_sum_history) > 5 and np.var(self.fingers_sum_history) > 0.5:
                        raw_rule_sign = "可以 (Can)"
                    else:
                        raw_rule_sign = "好 (Good)"
            elif fingers == [0, 1, 0, 0, 0]:
                z_diff = lm[8].z - lm[0].z
                if z_diff < -0.05:
                    raw_rule_sign = "你 (You)"
                elif z_diff > 0.02:
                    raw_rule_sign = "我 (Me)"

        elif len(hand_data) == 2:
            fingers1, fingers2 = hand_data[0]["fingers"], hand_data[1]["fingers"]
            lm1, lm2 = hand_data[0]["landmarks"], hand_data[1]["landmarks"]

            var_x_l = np.var(self.x_history_left) if len(self.x_history_left) > 10 else 0
            var_y_l = np.var(self.y_history_left) if len(self.y_history_left) > 10 else 0
            var_x_r = np.var(self.x_history_right) if len(self.x_history_right) > 10 else 0
            var_y_r = np.var(self.y_history_right) if len(self.y_history_right) > 10 else 0

            if sum(fingers1) <= 1 and sum(fingers2) <= 1:
                if var_y_l > 0.001 and var_y_r > 0.001:
                    raw_rule_sign = "工作 (Work)"
            elif sum(fingers1[1:]) >= 3 and sum(fingers2[1:]) >= 3:
                dist_x = abs(lm1[0].x - lm2[0].x)
                if dist_x < 0.15 and lm1[0].y > 0.4 and lm2[0].y > 0.4:
                    raw_rule_sign = "休息 (Rest)"
                elif dist_x > 0.15 and var_y_l > 0.002 and var_y_r > 0.002:
                    raw_rule_sign = "洗澡 (Bath)"
            elif fingers1 == [0, 1, 0, 0, 0] and fingers2 == [0, 1, 0, 0, 0]:
                if calc_distance(lm1[8], lm2[8]) < 0.1:
                    raw_rule_sign = "真 (Really)"
            elif sum(fingers1[1:]) >= 3 and sum(fingers2[1:]) >= 3:
                if var_y_l > 0.001 and var_y_r > 0.001 and var_y_l > var_x_l and var_y_r > var_x_r:
                    if raw_rule_sign == "无":
                        raw_rule_sign = "高兴 (Happy)"
                elif var_x_l > 0.001 and var_x_r > 0.001 and lm1[0].y > 0.4 and lm2[0].y > 0.4:
                    raw_rule_sign = "请 (Please)"

        return raw_rule_sign
