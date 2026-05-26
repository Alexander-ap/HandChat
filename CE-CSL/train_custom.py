import json
import os
import random
import wave
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

# ----------------- 配置 -----------------
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "custom_dataset"
MODEL_SAVE_PATH = str(BASE_DIR / "custom_model.pth")
VOCAB_SAVE_PATH = str(BASE_DIR / "custom_vocab.json")
FRAMES_PER_SAMPLE = 30
FEATURES_PER_FRAME = 126
AUDIO_FEATURE_DIM = 32
SEMANTIC_FEATURE_DIM = 26
EPOCHS = 260
BATCH_SIZE = 16
LEARNING_RATE = 0.002
WEIGHT_DECAY = 8e-4
LABEL_SMOOTHING = 0.12
AUGMENT_FACTOR = 40
TARGET_CLASS_AUGMENT = {
    "喝水": 96,
    "音乐": 112,
    "爱": 112,
}
FOCUS_CLASS_LOSS_SCALE = {
    "喝水": 1.35,
    "音乐": 1.25,
    "爱": 1.40,
}
SCENE_METRICS = {
    "喝水连续动作": ["喝水"],
    "音乐相关动作": ["音乐"],
    "抽象情感动作": ["爱"],
}


# ----------------- 标准化 -----------------
def normalize_data(data_array):
    norm = np.zeros_like(data_array, dtype=np.float32)
    ref_lx = ref_ly = ref_lz = None
    ref_rx = ref_ry = ref_rz = None
    for i in range(data_array.shape[0]):
        lx, ly, lz = data_array[i, 0], data_array[i, 1], data_array[i, 2]
        rx, ry, rz = data_array[i, 63], data_array[i, 64], data_array[i, 65]
        if (lx != 0 or ly != 0) and ref_lx is None:
            ref_lx, ref_ly, ref_lz = lx, ly, lz
        if (rx != 0 or ry != 0) and ref_rx is None:
            ref_rx, ref_ry, ref_rz = rx, ry, rz
        for j in range(21):
            if lx != 0 or ly != 0:
                norm[i, j * 3] = data_array[i, j * 3] - (ref_lx if ref_lx is not None else 0)
                norm[i, j * 3 + 1] = data_array[i, j * 3 + 1] - (ref_ly if ref_ly is not None else 0)
                norm[i, j * 3 + 2] = data_array[i, j * 3 + 2] - (ref_lz if ref_lz is not None else 0)
            if rx != 0 or ry != 0:
                norm[i, 63 + j * 3] = data_array[i, 63 + j * 3] - (ref_rx if ref_rx is not None else 0)
                norm[i, 63 + j * 3 + 1] = data_array[i, 63 + j * 3 + 1] - (ref_ry if ref_ry is not None else 0)
                norm[i, 63 + j * 3 + 2] = data_array[i, 63 + j * 3 + 2] - (ref_rz if ref_rz is not None else 0)
    return norm


def pad_or_trim_sequence(data, target_frames=FRAMES_PER_SAMPLE):
    if data.shape[0] == 60:
        data = data[::2, :]
    if data.shape[0] == target_frames:
        return data.astype(np.float32)

    indices = np.linspace(0, max(data.shape[0] - 1, 0), target_frames)
    resampled = np.zeros((target_frames, data.shape[1]), dtype=np.float32)
    for idx, src in enumerate(indices):
        resampled[idx] = data[int(np.clip(round(src), 0, data.shape[0] - 1))]
    return resampled


def _hand_valid_mask(block):
    return (np.abs(block[:, 0]) + np.abs(block[:, 1])) > 1e-6


def _safe_mean(values):
    return float(np.mean(values)) if len(values) else 0.0


def _tip_distances(block):
    coords = block.reshape(block.shape[0], 21, 3)
    wrist = coords[:, 0:1, :]
    tips = coords[:, [4, 8, 12, 16, 20], :]
    return np.linalg.norm(tips - wrist, axis=2)


def compute_semantic_features(raw_data):
    left = raw_data[:, :63]
    right = raw_data[:, 63:]
    left_valid = _hand_valid_mask(left)
    right_valid = _hand_valid_mask(right)

    left_coords = left.reshape(FRAMES_PER_SAMPLE, 21, 3)
    right_coords = right.reshape(FRAMES_PER_SAMPLE, 21, 3)
    left_wrist = left_coords[:, 0, :]
    right_wrist = right_coords[:, 0, :]

    both_valid = left_valid & right_valid
    one_hand = left_valid ^ right_valid
    no_hand = ~(left_valid | right_valid)

    left_span = _tip_distances(left).mean(axis=1)
    right_span = _tip_distances(right).mean(axis=1)

    left_velocity = np.linalg.norm(np.diff(left_wrist, axis=0, prepend=left_wrist[:1]), axis=1)
    right_velocity = np.linalg.norm(np.diff(right_wrist, axis=0, prepend=right_wrist[:1]), axis=1)

    inter_wrist = np.linalg.norm(left_wrist - right_wrist, axis=1)
    symmetry = np.abs(left_span - right_span)

    def zone_ratio(mask, low, high):
        values = []
        left_mask = mask & left_valid
        right_mask = mask & right_valid
        if left_mask.any():
            values.append(np.mean((left_wrist[left_mask, 1] > low) & (left_wrist[left_mask, 1] < high)))
        if right_mask.any():
            values.append(np.mean((right_wrist[right_mask, 1] > low) & (right_wrist[right_mask, 1] < high)))
        return _safe_mean(values)

    semantic = np.array([
        np.mean(left_valid),
        np.mean(right_valid),
        np.mean(one_hand),
        np.mean(both_valid),
        np.mean(no_hand),
        left_wrist[left_valid, 1].mean() if left_valid.any() else 0.0,
        right_wrist[right_valid, 1].mean() if right_valid.any() else 0.0,
        left_wrist[left_valid, 0].mean() if left_valid.any() else 0.0,
        right_wrist[right_valid, 0].mean() if right_valid.any() else 0.0,
        np.mean(inter_wrist[both_valid]) if both_valid.any() else 0.0,
        np.std(inter_wrist[both_valid]) if both_valid.any() else 0.0,
        np.mean(left_span[left_valid]) if left_valid.any() else 0.0,
        np.mean(right_span[right_valid]) if right_valid.any() else 0.0,
        np.std(left_span[left_valid]) if left_valid.any() else 0.0,
        np.std(right_span[right_valid]) if right_valid.any() else 0.0,
        np.mean(left_velocity[left_valid]) if left_valid.any() else 0.0,
        np.mean(right_velocity[right_valid]) if right_valid.any() else 0.0,
        np.max(left_velocity[left_valid]) if left_valid.any() else 0.0,
        np.max(right_velocity[right_valid]) if right_valid.any() else 0.0,
        np.mean(symmetry[both_valid]) if both_valid.any() else 0.0,
        zone_ratio(left_valid | right_valid, 0.38, 0.82),  # chest-like range
        zone_ratio(left_valid | right_valid, 0.0, 0.42),   # face-like range
        np.mean((left_span > 0.22).astype(np.float32)),
        np.mean((right_span > 0.22).astype(np.float32)),
        np.mean(np.linalg.norm(np.diff(raw_data, axis=0, prepend=raw_data[:1]), axis=1)),
        np.max(np.linalg.norm(np.diff(raw_data, axis=0, prepend=raw_data[:1]), axis=1)),
    ], dtype=np.float32)
    return semantic


def _resample_audio_vector(features, target_dim=AUDIO_FEATURE_DIM):
    if len(features) == 0:
        return np.zeros(target_dim, dtype=np.float32)
    indices = np.linspace(0, len(features) - 1, target_dim)
    return np.asarray([features[int(round(idx))] for idx in indices], dtype=np.float32)


def _audio_feature_from_wave(path):
    with wave.open(str(path), "rb") as wav_file:
        channels = wav_file.getnchannels()
        sample_width = wav_file.getsampwidth()
        frame_rate = wav_file.getframerate()
        frame_count = wav_file.getnframes()
        raw_bytes = wav_file.readframes(frame_count)

    dtype_map = {1: np.int8, 2: np.int16, 4: np.int32}
    dtype = dtype_map.get(sample_width)
    if dtype is None:
        return np.zeros(AUDIO_FEATURE_DIM, dtype=np.float32)

    waveform = np.frombuffer(raw_bytes, dtype=dtype).astype(np.float32)
    if channels > 1:
        waveform = waveform.reshape(-1, channels).mean(axis=1)
    scale = max(np.iinfo(dtype).max, 1)
    waveform = waveform / float(scale)
    if waveform.size == 0:
        return np.zeros(AUDIO_FEATURE_DIM, dtype=np.float32)

    bins = np.array_split(waveform, 8)
    rms = [float(np.sqrt(np.mean(np.square(chunk))) if len(chunk) else 0.0) for chunk in bins]
    zcr = [float(np.mean(np.abs(np.diff(np.sign(chunk)))) / 2.0) if len(chunk) > 1 else 0.0 for chunk in bins]

    spectrum = np.abs(np.fft.rfft(waveform))
    freqs = np.fft.rfftfreq(len(waveform), d=1.0 / max(frame_rate, 1))
    if spectrum.size <= 1:
        band_energy = np.zeros(8, dtype=np.float32)
        centroid = np.zeros(8, dtype=np.float32)
    else:
        spectrum_bins = np.array_split(spectrum, 8)
        freq_bins = np.array_split(freqs, 8)
        band_energy = np.array([float(np.mean(chunk)) if len(chunk) else 0.0 for chunk in spectrum_bins], dtype=np.float32)
        centroid = np.array([
            float(np.sum(f * s) / max(np.sum(s), 1e-6)) if len(s) else 0.0
            for f, s in zip(freq_bins, spectrum_bins)
        ], dtype=np.float32)

    features = np.concatenate([
        np.asarray(rms, dtype=np.float32),
        np.asarray(zcr, dtype=np.float32),
        band_energy,
        centroid / max(frame_rate / 2.0, 1.0),
    ])
    return _resample_audio_vector(features, AUDIO_FEATURE_DIM)


def load_audio_features(sample_path):
    stem = Path(sample_path).with_suffix("")
    audio_feature_path = Path(str(stem) + ".audio.npy")
    if audio_feature_path.exists():
        features = np.load(audio_feature_path).astype(np.float32).reshape(-1)
        return _resample_audio_vector(features, AUDIO_FEATURE_DIM)

    for suffix in [".wav", ".mp3", ".flac"]:
        candidate = Path(str(stem) + suffix)
        if candidate.exists():
            if candidate.suffix.lower() == ".wav":
                return _audio_feature_from_wave(candidate)
            return np.zeros(AUDIO_FEATURE_DIM, dtype=np.float32)
    return np.zeros(AUDIO_FEATURE_DIM, dtype=np.float32)


def augment_audio_features(audio_features, label_name):
    aug = audio_features.copy()
    if np.allclose(aug, 0):
        return aug
    noise_scale = 0.01 if label_name != "音乐" else 0.02
    aug += np.random.normal(0, noise_scale, size=aug.shape).astype(np.float32)
    if label_name == "音乐":
        aug = np.roll(aug, np.random.randint(1, 4))
        aug *= np.random.uniform(0.90, 1.10)
    return aug.astype(np.float32)


def _transform_hand(block, scale_xy, shift_xy, z_shift):
    coords = block.reshape(FRAMES_PER_SAMPLE, 21, 3).copy()
    valid = _hand_valid_mask(block)
    if not valid.any():
        return coords.reshape(FRAMES_PER_SAMPLE, 63)

    wrist = coords[:, 0:1, :]
    local = coords - wrist
    local[..., :2] *= scale_xy
    coords = wrist + local
    coords[valid, :, 0] += shift_xy[0]
    coords[valid, :, 1] += shift_xy[1]
    coords[valid, :, 2] += z_shift
    return coords.reshape(FRAMES_PER_SAMPLE, 63)


def temporal_resample(data, scale):
    indices = np.linspace(0, FRAMES_PER_SAMPLE - 1, max(2, int(FRAMES_PER_SAMPLE * scale)))
    resampled = np.zeros_like(data)
    for dst_index in range(FRAMES_PER_SAMPLE):
        src_pos = dst_index / max(FRAMES_PER_SAMPLE - 1, 1) * (len(indices) - 1)
        src_idx = int(np.clip(round(indices[int(np.clip(round(src_pos), 0, len(indices) - 1))]), 0, FRAMES_PER_SAMPLE - 1))
        resampled[dst_index] = data[src_idx]
    return resampled


def augment_sample(data, label_name="", heavy=False):
    aug = data.copy().astype(np.float32)

    left_shift = np.random.uniform(-0.03, 0.03, size=2)
    right_shift = np.random.uniform(-0.03, 0.03, size=2)
    if label_name == "喝水":
        left_shift[1] += np.random.uniform(-0.02, 0.05)
        right_shift[1] += np.random.uniform(-0.02, 0.05)
    elif label_name == "爱":
        left_shift[1] += np.random.uniform(-0.03, 0.02)
        right_shift[1] += np.random.uniform(-0.03, 0.02)

    left_scale = np.random.uniform(0.86, 1.18)
    right_scale = np.random.uniform(0.86, 1.18)
    aug[:, :63] = _transform_hand(aug[:, :63], left_scale, left_shift, np.random.uniform(-0.01, 0.01))
    aug[:, 63:] = _transform_hand(aug[:, 63:], right_scale, right_shift, np.random.uniform(-0.01, 0.01))

    aug += np.random.normal(0, 0.0035, size=aug.shape).astype(np.float32)

    if heavy:
        factor = np.random.uniform(0.78, 1.22) if label_name == "喝水" else np.random.uniform(0.84, 1.18)
        aug = temporal_resample(aug, factor)

        if label_name in {"喝水", "音乐", "爱"} and np.random.random() < 0.65:
            shift = np.random.randint(-4, 5)
            aug = np.roll(aug, shift, axis=0)

        if np.random.random() < 0.35:
            mask_len = np.random.randint(2, 6)
            start = np.random.randint(0, FRAMES_PER_SAMPLE - mask_len + 1)
            aug[start:start + mask_len] *= np.random.uniform(0.4, 0.85)

    if np.random.random() < 0.4:
        drop_n = np.random.randint(1, 6)
        drop_idx = np.random.choice(FRAMES_PER_SAMPLE, drop_n, replace=False)
        aug[drop_idx] *= np.random.uniform(0.15, 0.50)

    if np.random.random() < 0.5:
        temp = aug[:, :63].copy()
        aug[:, :63] = aug[:, 63:]
        aug[:, 63:] = temp

    return aug.astype(np.float32)


def synthesize_no_action(base_sample):
    noise = np.random.normal(0, 0.002, size=base_sample.shape).astype(np.float32)
    silent = base_sample * np.random.uniform(0.03, 0.08) + noise
    return silent.astype(np.float32)


def blend_same_class(sample_a, sample_b):
    weight = np.random.uniform(0.55, 0.75)
    mixed = sample_a * weight + sample_b * (1.0 - weight)
    return mixed.astype(np.float32)


# ----------------- 数据集 -----------------
class SignDataset(Dataset):
    def __init__(self, data_dir, load_vocab=True):
        if load_vocab and os.path.exists(VOCAB_SAVE_PATH):
            with open(VOCAB_SAVE_PATH, "r", encoding="utf-8") as file:
                self.vocab = json.load(file)
        else:
            self.vocab = sorted([d for d in os.listdir(data_dir) if os.path.isdir(os.path.join(data_dir, d))])

        self.raw_samples = []
        self.raw_audio_features = []
        self.raw_labels = []
        self.raw_paths = []
        nonzeros_per_class = {}

        for label_idx, word in enumerate(self.vocab):
            word_path = os.path.join(data_dir, word)
            if not os.path.isdir(word_path):
                continue
            npy_files = [f for f in os.listdir(word_path) if f.endswith(".npy")]
            for filename in npy_files:
                file_path = os.path.join(word_path, filename)
                data = np.load(file_path)
                data = pad_or_trim_sequence(data, FRAMES_PER_SAMPLE)
                if data.shape != (FRAMES_PER_SAMPLE, FEATURES_PER_FRAME):
                    continue
                nonzeros_per_class.setdefault(word, []).append(np.count_nonzero(data))
                self.raw_samples.append(data.astype(np.float32))
                self.raw_audio_features.append(load_audio_features(file_path))
                self.raw_labels.append(label_idx)
                self.raw_paths.append(file_path)

        print(f"\nData quality report ({len(self.raw_samples)} raw files):")
        for word, nzs in nonzeros_per_class.items():
            avg_nz = sum(nzs) / len(nzs) if nzs else 0
            flag = "WARN: low keypoints!" if avg_nz < 500 else ""
            print(f"  {word}: {len(nzs):3d} files, avg nonzero={avg_nz:.0f}  {flag}")

        if "无动作" in self.vocab:
            no_action_idx = self.vocab.index("无动作")
            has_no_action = any(label == no_action_idx for label in self.raw_labels)
            if not has_no_action:
                real_items = [
                    (sample, audio, label)
                    for sample, audio, label in zip(self.raw_samples, self.raw_audio_features, self.raw_labels)
                    if label != no_action_idx
                ]
                print(f"\nGenerating {len(real_items)} 'no action' samples via motion suppression...")
                for sample, _, _ in real_items:
                    self.raw_samples.append(synthesize_no_action(sample))
                    self.raw_audio_features.append(np.zeros(AUDIO_FEATURE_DIM, dtype=np.float32))
                    self.raw_labels.append(no_action_idx)
                    self.raw_paths.append("__synthetic_no_action__")

        self.samples = list(self.raw_samples)
        self.audio_features = list(self.raw_audio_features)
        self.labels = list(self.raw_labels)
        self.sample_paths = list(self.raw_paths)

        count = {}
        for label in self.labels:
            count[label] = count.get(label, 0) + 1

        for label_idx, count_value in count.items():
            label_name = self.vocab[label_idx]
            target_count = TARGET_CLASS_AUGMENT.get(label_name, AUGMENT_FACTOR)
            needed = max(0, target_count - count_value)
            available = [
                (sample, audio)
                for sample, audio, label in zip(self.raw_samples, self.raw_audio_features, self.raw_labels)
                if label == label_idx
            ]
            if needed <= 0 or not available:
                continue

            for _ in range(needed):
                base_sample, base_audio = random.choice(available)
                synthetic = augment_sample(base_sample, label_name=label_name, heavy=True)
                if len(available) > 1 and label_name in {"喝水", "音乐", "爱"} and np.random.random() < 0.45:
                    partner_sample, _ = random.choice(available)
                    synthetic = blend_same_class(synthetic, augment_sample(partner_sample, label_name=label_name, heavy=True))
                self.samples.append(synthetic.astype(np.float32))
                self.audio_features.append(augment_audio_features(base_audio, label_name))
                self.labels.append(label_idx)
                self.sample_paths.append(f"__augmented__/{label_name}")

        with open(VOCAB_SAVE_PATH, "w", encoding="utf-8") as file:
            json.dump(self.vocab, file, ensure_ascii=False)

        final_count = {}
        for label in self.labels:
            final_count[label] = final_count.get(label, 0) + 1
        print(f"\nFinal dataset: {len(self.samples)} samples, {len(self.vocab)} classes")
        for index, word in enumerate(self.vocab):
            audio_count = sum(
                1
                for sample_audio, label in zip(self.audio_features, self.labels)
                if label == index and not np.allclose(sample_audio, 0)
            )
            print(f"  {word}: {final_count.get(index, 0)} | audio_sidecar={audio_count}")
        print()

    def __len__(self):
        return len(self.samples)

    def get_item(self, idx, augment=False):
        raw = self.samples[idx].copy().astype(np.float32)
        label = self.labels[idx]
        label_name = self.vocab[label]
        audio = self.audio_features[idx].copy().astype(np.float32)

        if augment:
            raw = augment_sample(raw, label_name=label_name, heavy=False)
            audio = augment_audio_features(audio, label_name)

        semantic = compute_semantic_features(raw)
        normalized = normalize_data(raw)
        return (
            torch.from_numpy(normalized),
            torch.from_numpy(audio),
            torch.from_numpy(semantic),
            torch.tensor(label, dtype=torch.long),
        )

    def __getitem__(self, idx):
        return self.get_item(idx, augment=False)


class DatasetView(Dataset):
    def __init__(self, base_dataset, indices, augment):
        self.base_dataset = base_dataset
        self.indices = list(indices)
        self.augment = augment

    def __len__(self):
        return len(self.indices)

    def __getitem__(self, idx):
        return self.base_dataset.get_item(self.indices[idx], augment=self.augment)


# ----------------- 模型 -----------------
class TemporalSEBlock(nn.Module):
    def __init__(self, channels, reduction=4):
        super().__init__()
        hidden = max(channels // reduction, 8)
        self.net = nn.Sequential(
            nn.AdaptiveAvgPool1d(1),
            nn.Conv1d(channels, hidden, kernel_size=1),
            nn.ReLU(),
            nn.Conv1d(hidden, channels, kernel_size=1),
            nn.Sigmoid(),
        )

    def forward(self, x):
        return x * self.net(x)


class CompactSignModel(nn.Module):
    """多尺度时序 + 语义注意力 + 可选音频融合，小数据集友好。"""

    def __init__(self, num_classes, audio_feature_dim=AUDIO_FEATURE_DIM, semantic_feature_dim=SEMANTIC_FEATURE_DIM):
        super().__init__()
        in_channels = FEATURES_PER_FRAME * 2
        self.stem = nn.Sequential(
            nn.Conv1d(in_channels, 96, kernel_size=1),
            nn.BatchNorm1d(96),
            nn.GELU(),
        )
        self.temporal_branches = nn.ModuleList([
            nn.Sequential(
                nn.Conv1d(96, 64, kernel_size=3, padding=1),
                nn.BatchNorm1d(64),
                nn.GELU(),
            ),
            nn.Sequential(
                nn.Conv1d(96, 64, kernel_size=5, padding=2),
                nn.BatchNorm1d(64),
                nn.GELU(),
            ),
            nn.Sequential(
                nn.Conv1d(96, 64, kernel_size=7, padding=3),
                nn.BatchNorm1d(64),
                nn.GELU(),
            ),
        ])
        self.temporal_pool = nn.MaxPool1d(kernel_size=2, stride=2)
        self.temporal_se = TemporalSEBlock(192)
        self.temporal_mix = nn.Sequential(
            nn.Conv1d(192, 128, kernel_size=3, padding=1),
            nn.BatchNorm1d(128),
            nn.GELU(),
        )
        self.encoder = nn.GRU(
            input_size=128,
            hidden_size=72,
            num_layers=1,
            batch_first=True,
            bidirectional=True,
        )

        self.semantic_proj = nn.Sequential(
            nn.Linear(semantic_feature_dim, 64),
            nn.LayerNorm(64),
            nn.GELU(),
            nn.Dropout(0.15),
            nn.Linear(64, 144),
        )
        self.semantic_gate = nn.Sequential(
            nn.Linear(semantic_feature_dim, 64),
            nn.GELU(),
            nn.Linear(64, 144),
            nn.Sigmoid(),
        )
        self.audio_proj = nn.Sequential(
            nn.Linear(audio_feature_dim, 64),
            nn.LayerNorm(64),
            nn.GELU(),
            nn.Dropout(0.15),
            nn.Linear(64, 48),
        )
        self.audio_gate = nn.Sequential(
            nn.Linear(144 + 64, 48),
            nn.GELU(),
            nn.Linear(48, 48),
            nn.Sigmoid(),
        )
        self.dropout = nn.Dropout(0.35)
        self.classifier = nn.Sequential(
            nn.Linear(144 * 3 + 64 + 48, 192),
            nn.LayerNorm(192),
            nn.GELU(),
            nn.Dropout(0.35),
            nn.Linear(192, num_classes),
        )

    def forward(self, x, audio_features=None, semantic_features=None):
        motion = torch.diff(x, dim=1, prepend=x[:, :1, :])
        stacked = torch.cat([x, motion], dim=-1).permute(0, 2, 1)

        encoded = self.stem(stacked)
        multi_scale = torch.cat([branch(encoded) for branch in self.temporal_branches], dim=1)
        multi_scale = self.temporal_pool(multi_scale)
        multi_scale = self.temporal_se(multi_scale)
        tokens = self.temporal_mix(multi_scale).permute(0, 2, 1)
        tokens, _ = self.encoder(tokens)
        temporal_mean = tokens.mean(dim=1)
        temporal_max = tokens.max(dim=1).values

        if semantic_features is None:
            semantic_features = x.new_zeros((x.size(0), SEMANTIC_FEATURE_DIM))
        semantic_embed = self.semantic_proj(semantic_features)
        semantic_gate = self.semantic_gate(semantic_features)
        gated_tokens = tokens * semantic_gate.unsqueeze(1)
        attention_scores = torch.sum(gated_tokens * semantic_embed.unsqueeze(1), dim=-1) / np.sqrt(tokens.size(-1))
        attention_weights = torch.softmax(attention_scores, dim=1)
        semantic_context = torch.sum(tokens * attention_weights.unsqueeze(-1), dim=1)

        if audio_features is None:
            audio_features = x.new_zeros((x.size(0), AUDIO_FEATURE_DIM))
        audio_embed = self.audio_proj(audio_features)
        audio_gate = self.audio_gate(torch.cat([semantic_context, semantic_embed[:, :64]], dim=1))
        audio_presence = (audio_features.abs().sum(dim=1, keepdim=True) > 1e-6).float()
        audio_embed = audio_embed * (audio_gate * audio_presence + (1.0 - audio_presence) * 0.25)

        fused = torch.cat([temporal_mean, temporal_max, semantic_embed[:, :64], semantic_context, audio_embed], dim=1)
        fused = self.dropout(fused)
        return self.classifier(fused)


# ----------------- 评估 -----------------
def build_stratified_split(labels, val_ratio=0.2):
    train_indices = []
    val_indices = []
    grouped = {}
    for idx, label in enumerate(labels):
        grouped.setdefault(label, []).append(idx)

    for _, indices in grouped.items():
        random.shuffle(indices)
        val_count = max(1, int(round(len(indices) * val_ratio))) if len(indices) > 1 else 0
        val_indices.extend(indices[:val_count])
        train_indices.extend(indices[val_count:])
    random.shuffle(train_indices)
    random.shuffle(val_indices)
    return train_indices, val_indices


def compute_classification_report(preds, labels, vocab):
    report = {}
    num_classes = len(vocab)
    for idx, name in enumerate(vocab):
        tp = sum(1 for pred, target in zip(preds, labels) if pred == idx and target == idx)
        fp = sum(1 for pred, target in zip(preds, labels) if pred == idx and target != idx)
        fn = sum(1 for pred, target in zip(preds, labels) if pred != idx and target == idx)
        tn = len(labels) - tp - fp - fn
        precision = tp / max(tp + fp, 1)
        recall = tp / max(tp + fn, 1)
        accuracy = (tp + tn) / max(len(labels), 1)
        report[name] = {
            "precision": precision,
            "recall": recall,
            "accuracy": accuracy,
            "support": sum(1 for target in labels if target == idx),
        }
    return report


def summarize_scene_metrics(report, vocab):
    summaries = {}
    for scene_name, labels in SCENE_METRICS.items():
        metrics = [report[label] for label in labels if label in report]
        if not metrics:
            continue
        summaries[scene_name] = {
            "accuracy": float(np.mean([item["accuracy"] for item in metrics])),
            "precision": float(np.mean([item["precision"] for item in metrics])),
            "recall": float(np.mean([item["recall"] for item in metrics])),
            "support": int(sum(item["support"] for item in metrics)),
        }
    return summaries


def evaluate(model, loader, device, vocab, criterion):
    model.eval()
    all_preds = []
    all_labels = []
    total_loss = 0.0
    total_correct = 0
    total_count = 0

    with torch.no_grad():
        for bx, ba, bs, by in loader:
            bx = bx.to(device)
            ba = ba.to(device)
            bs = bs.to(device)
            by = by.to(device)
            logits = model(bx, audio_features=ba, semantic_features=bs)
            loss = criterion(logits, by)
            total_loss += loss.item()
            preds = logits.argmax(dim=1)
            total_correct += (preds == by).sum().item()
            total_count += by.size(0)
            all_preds.extend(preds.cpu().tolist())
            all_labels.extend(by.cpu().tolist())

    report = compute_classification_report(all_preds, all_labels, vocab)
    scene_metrics = summarize_scene_metrics(report, vocab)
    return {
        "loss": total_loss / max(len(loader), 1),
        "acc": 100.0 * total_correct / max(total_count, 1),
        "report": report,
        "scene_metrics": scene_metrics,
    }


# ----------------- 训练 -----------------
def main():
    random.seed(42)
    np.random.seed(42)
    torch.manual_seed(42)

    dataset = SignDataset(DATA_DIR)
    if len(dataset) == 0:
        print("ERROR: No data!")
        return

    train_idx, val_idx = build_stratified_split(dataset.labels, val_ratio=0.2)
    train_loader = DataLoader(
        DatasetView(dataset, train_idx, augment=True),
        batch_size=BATCH_SIZE,
        shuffle=True,
        drop_last=True,
    )
    val_loader = DataLoader(
        DatasetView(dataset, val_idx, augment=False),
        batch_size=BATCH_SIZE,
        shuffle=False,
    )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    model = CompactSignModel(num_classes=len(dataset.vocab)).to(device)

    class_weights = torch.ones(len(dataset.vocab), dtype=torch.float32)
    for label_name, scale in FOCUS_CLASS_LOSS_SCALE.items():
        if label_name in dataset.vocab:
            class_weights[dataset.vocab.index(label_name)] = scale
    class_weights = class_weights.to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=LABEL_SMOOTHING)
    eval_criterion = nn.CrossEntropyLoss(weight=class_weights)

    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=18)

    best_score = -1.0
    patience_counter = 0

    param_count = sum(param.numel() for param in model.parameters())
    print(f"\nTraining... (model params: {param_count:,})")

    for epoch in range(1, EPOCHS + 1):
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for bx, ba, bs, by in train_loader:
            bx = bx.to(device)
            ba = ba.to(device)
            bs = bs.to(device)
            by = by.to(device)

            optimizer.zero_grad()
            logits = model(bx, audio_features=ba, semantic_features=bs)
            loss = criterion(logits, by)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            train_loss += loss.item()
            preds = logits.argmax(dim=1)
            train_correct += (preds == by).sum().item()
            train_total += by.size(0)

        train_acc = 100.0 * train_correct / max(train_total, 1)
        eval_result = evaluate(model, val_loader, device, dataset.vocab, eval_criterion)
        val_acc = eval_result["acc"]
        scene_metrics = eval_result["scene_metrics"]
        focus_score = val_acc
        for scene_name in SCENE_METRICS:
            focus_score += scene_metrics.get(scene_name, {}).get("recall", 0.0) * 100.0
        scheduler.step(focus_score)

        if focus_score >= best_score:
            best_score = focus_score
            torch.save(model.state_dict(), MODEL_SAVE_PATH)
            patience_counter = 0
        else:
            patience_counter += 1

        if epoch <= 5 or epoch % 20 == 0 or epoch == EPOCHS:
            lr = optimizer.param_groups[0]["lr"]
            scene_text = " | ".join(
                f"{name}: acc {scene_metrics.get(name, {}).get('accuracy', 0.0) * 100:.1f}% "
                f"recall {scene_metrics.get(name, {}).get('recall', 0.0) * 100:.1f}%"
                for name in SCENE_METRICS
            )
            print(
                f"Epoch {epoch:3d} | train_loss {train_loss / max(len(train_loader), 1):.4f} "
                f"train_acc {train_acc:.1f}% | val_loss {eval_result['loss']:.4f} "
                f"val_acc {val_acc:.1f}% | lr {lr:.6f}"
            )
            print(f"  Scene metrics -> {scene_text}")

        if patience_counter >= 50:
            print(f"Early stop at epoch {epoch}")
            break

    if os.path.exists(MODEL_SAVE_PATH):
        model.load_state_dict(torch.load(MODEL_SAVE_PATH, map_location=device))
    final_eval = evaluate(model, val_loader, device, dataset.vocab, eval_criterion)

    print("\nFocused validation summary:")
    for scene_name, metrics in final_eval["scene_metrics"].items():
        print(
            f"  {scene_name}: accuracy={metrics['accuracy'] * 100:.1f}% "
            f"precision={metrics['precision'] * 100:.1f}% "
            f"recall={metrics['recall'] * 100:.1f}% support={metrics['support']}"
        )

    print("\nPer-class report:")
    for label_name in dataset.vocab:
        metrics = final_eval["report"][label_name]
        print(
            f"  {label_name}: precision={metrics['precision'] * 100:.1f}% "
            f"recall={metrics['recall'] * 100:.1f}% "
            f"accuracy={metrics['accuracy'] * 100:.1f}% support={metrics['support']}"
        )

    print(f"\nDone! Best focus_score={best_score:.1f} model saved to {MODEL_SAVE_PATH}")


if __name__ == "__main__":
    main()
