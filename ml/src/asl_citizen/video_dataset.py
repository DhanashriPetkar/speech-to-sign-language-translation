import csv
from pathlib import Path
from typing import Dict, List, Sequence

import cv2
import numpy as np
import torch
from torch.utils.data import Dataset


class ManifestVideoDataset(Dataset):
    """Read manifest rows and return temporally sampled RGB video tensors."""

    def __init__(
        self,
        manifest_path: str | Path,
        split: str,
        class_to_idx: Dict[str, int],
        dataset_root: str | Path = ".",
        frame_count: int = 16,
        image_size: int = 112,
        mean: Sequence[float] = (0.485, 0.456, 0.406),
        std: Sequence[float] = (0.229, 0.224, 0.225),
    ) -> None:
        self.manifest_path = Path(manifest_path)
        self.dataset_root = Path(dataset_root).expanduser().resolve()
        self.split = split
        self.class_to_idx = class_to_idx
        self.frame_count = frame_count
        self.image_size = image_size
        self.mean = torch.tensor(mean, dtype=torch.float32).view(3, 1, 1, 1)
        self.std = torch.tensor(std, dtype=torch.float32).view(3, 1, 1, 1)
        self.rows = self._read_rows()

    def _read_rows(self) -> List[dict]:
        with self.manifest_path.open("r", encoding="utf-8", newline="") as handle:
            rows = [row for row in csv.DictReader(handle) if row.get("split", "").lower() == self.split]
        return [row for row in rows if row.get("gloss", "") in self.class_to_idx]

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int):
        row = self.rows[index]
        frames = self._read_video(self.dataset_root / row["video_path"])
        video = torch.from_numpy(frames).permute(3, 0, 1, 2).float() / 255.0
        video = (video - self.mean) / self.std
        label = self.class_to_idx[row["gloss"]]
        return video, torch.tensor(label, dtype=torch.long)

    def _read_video(self, path: Path) -> np.ndarray:
        capture = cv2.VideoCapture(str(path))
        if not capture.isOpened():
            raise RuntimeError(f"Unable to open video: {path}")

        frames = []
        try:
            while True:
                success, frame = capture.read()
                if not success:
                    break
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frame = cv2.resize(frame, (self.image_size, self.image_size), interpolation=cv2.INTER_AREA)
                frames.append(frame)
        finally:
            capture.release()

        if not frames:
            raise RuntimeError(f"Video contains no readable frames: {path}")

        indices = np.linspace(0, len(frames) - 1, self.frame_count).round().astype(int)
        return np.stack([frames[index] for index in indices])
