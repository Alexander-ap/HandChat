from __future__ import annotations

import base64
import binascii
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from native_recognizer import FEATURES_PER_FRAME, NativeRecognizerEngine
from train_custom import FRAMES_PER_SAMPLE


class PredictRequest(BaseModel):
    frames: list[list[float]] = Field(..., min_length=FRAMES_PER_SAMPLE, max_length=FRAMES_PER_SAMPLE)
    top_k: int = Field(default=3, ge=1, le=10)

    @field_validator("frames")
    @classmethod
    def validate_frame_shape(cls, frames: list[list[float]]) -> list[list[float]]:
        for index, frame in enumerate(frames):
            if len(frame) != FEATURES_PER_FRAME:
                raise ValueError(f"frames[{index}] must contain {FEATURES_PER_FRAME} values")
            for value in frame:
                if not np.isfinite(value):
                    raise ValueError("frames must contain only finite numbers")
        return frames


class FrameRequest(BaseModel):
    frame_id: int = Field(..., ge=0)
    image_base64_jpeg: str = Field(..., min_length=1)
    mirror: bool = True


class PredictionItem(BaseModel):
    label: str
    confidence: float


class PredictResponse(BaseModel):
    label: str
    confidence: float
    source: Literal["ce-csl"]
    top_k: list[PredictionItem]


class FrameResponse(BaseModel):
    frame_id: int
    label: str
    display_text: str
    confidence: float
    source: Literal["ai", "rule", "mediapipe", "none"]
    ready: bool
    hands_count: int
    nn_label: str
    nn_confidence: float
    raw_rule_sign: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    model_loaded: bool
    vocab_size: int
    device: str
    active_sessions: int
    model_path: str
    vocab_path: str
    gesture_model_path: str
    labels: list[str]


app = FastAPI(title="CE-CSL Inference Service")
ENGINE = NativeRecognizerEngine()
SESSION_MAX_IDLE_SECONDS = 30 * 60


@dataclass
class ManagedSession:
    recognizer: object
    last_used_at: float


SESSIONS: dict[str, ManagedSession] = {}
SESSIONS_LOCK = threading.Lock()


def cleanup_stale_sessions(now: float) -> None:
    stale_ids = [
        session_id
        for session_id, managed in SESSIONS.items()
        if now - managed.last_used_at > SESSION_MAX_IDLE_SECONDS
    ]
    for session_id in stale_ids:
        SESSIONS.pop(session_id, None)


def get_session(session_id: str):
    now = time.time()
    with SESSIONS_LOCK:
        cleanup_stale_sessions(now)
        managed = SESSIONS.get(session_id)
        if managed is None:
            managed = ManagedSession(recognizer=ENGINE.create_session(), last_used_at=now)
            SESSIONS[session_id] = managed
        else:
            managed.last_used_at = now
        return managed.recognizer


def decode_jpeg(image_base64_jpeg: str) -> np.ndarray:
    try:
        payload = image_base64_jpeg.split(",", 1)[1] if "," in image_base64_jpeg[:64] else image_base64_jpeg
        image_bytes = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(status_code=422, detail="image_base64_jpeg is not valid base64") from error

    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=422, detail="image_base64_jpeg is not a valid JPEG image")
    return frame


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    with SESSIONS_LOCK:
        active_sessions = len(SESSIONS)

    return HealthResponse(
        status="ok",
        model_loaded=True,
        vocab_size=len(ENGINE.vocab),
        device=str(ENGINE.device),
        active_sessions=active_sessions,
        model_path=str(ENGINE.model_path),
        vocab_path=str(ENGINE.vocab_path),
        gesture_model_path=str(ENGINE.gesture_model_path),
        labels=ENGINE.vocab,
    )


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest) -> PredictResponse:
    data = np.asarray(request.frames, dtype=np.float32)
    if data.shape != (FRAMES_PER_SAMPLE, FEATURES_PER_FRAME):
        raise HTTPException(status_code=422, detail="frames shape must be [30,126]")

    prediction = ENGINE.predict_window(data, top_k=request.top_k)
    return PredictResponse(
        label=prediction.label,
        confidence=prediction.confidence,
        source="ce-csl",
        top_k=[PredictionItem(label=label, confidence=confidence) for label, confidence in prediction.top_k],
    )


@app.post("/sessions/{session_id}/frame", response_model=FrameResponse)
def predict_frame(session_id: str, request: FrameRequest) -> FrameResponse:
    frame = decode_jpeg(request.image_base64_jpeg)
    session = get_session(session_id)
    result = session.process_frame(frame, request.frame_id, mirror=request.mirror)

    return FrameResponse(
        frame_id=result.frame_id,
        label=result.label,
        display_text=result.display_text,
        confidence=result.confidence,
        source=result.source,
        ready=result.ready,
        hands_count=result.hands_count,
        nn_label=result.nn_label,
        nn_confidence=result.nn_confidence,
        raw_rule_sign=result.raw_rule_sign,
    )


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str) -> dict[str, bool]:
    with SESSIONS_LOCK:
        existed = session_id in SESSIONS
        SESSIONS.pop(session_id, None)
    return {"deleted": existed}


@app.post("/sessions/{session_id}/reset")
def reset_session(session_id: str) -> dict[str, bool]:
    with SESSIONS_LOCK:
        SESSIONS[session_id] = ManagedSession(recognizer=ENGINE.create_session(), last_used_at=time.time())
    return {"reset": True}
