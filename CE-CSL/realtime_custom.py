import os

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from native_recognizer import NativeRecognizerEngine


def get_chinese_font():
    for path in ["simhei.ttf", "C:/Windows/Fonts/simhei.ttf", "C:/Windows/Fonts/msyh.ttc"]:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, 40)
            except Exception:
                pass
    return ImageFont.load_default()


def draw_text(img, text, position, font, color=(0, 255, 0)):
    pil_img = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(pil_img)
    draw.text(position, text, font=font, fill=color)
    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)


def main():
    engine = NativeRecognizerEngine()
    session = engine.create_session()
    cap = cv2.VideoCapture(0)
    font = get_chinese_font()
    frame_id = 0

    print(f"✅ 神经网络模型加载成功！词表: {engine.vocab}")
    print("启动融合版实时推理！(神经网络 + 规则引擎 + MediaPipe手势)")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        result = session.process_frame(frame, frame_id, mirror=True, draw_landmarks=True)
        frame_id += 1
        display_frame = result.rendered_frame if result.rendered_frame is not None else frame

        if result.display_text != "无":
            if result.source == "ai":
                color = (0, 255, 255)
            elif result.source == "rule":
                color = (0, 255, 0)
            else:
                color = (255, 100, 100)
            display_frame = draw_text(display_frame, f"动作: {result.display_text}", (30, 50), font, color)
        else:
            display_frame = draw_text(display_frame, "请做出手势...", (30, 50), font, (200, 200, 200))

        display_frame = draw_text(display_frame, f"模型置信度: {result.nn_confidence:.2f}", (30, 100), font, (150, 150, 150))
        cv2.imshow("Unified Sign Inference", display_frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("c"):
            session = engine.create_session()

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
