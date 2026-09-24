#!/usr/bin/env python3
"""Train the small isolated-sign baseline using official train/val splits."""

from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader
from tqdm import tqdm

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from asl_citizen.models import TinyVideoClassifier
from asl_citizen.video_dataset import ManifestVideoDataset


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def read_rows(manifest: Path) -> list[dict]:
    with manifest.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def run_epoch(model, loader, loss_fn, optimizer, device, training: bool) -> tuple[float, float]:
    model.train(training)
    total_loss = 0.0
    correct = 0
    total = 0
    context = torch.enable_grad() if training else torch.no_grad()
    with context:
        for videos, labels in tqdm(loader, leave=False, desc="train" if training else "val"):
            videos, labels = videos.to(device), labels.to(device)
            if training:
                optimizer.zero_grad(set_to_none=True)
            logits = model(videos)
            loss = loss_fn(logits, labels)
            if training:
                loss.backward()
                optimizer.step()
            total_loss += loss.item() * labels.size(0)
            correct += (logits.argmax(dim=1) == labels).sum().item()
            total += labels.size(0)
    return total_loss / max(total, 1), correct / max(total, 1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--dataset-root", default="data/asl_citizen")
    parser.add_argument("--output-dir", default="ml/outputs/checkpoints")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--frame-count", type=int, default=16)
    parser.add_argument("--image-size", type=int, default=112)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    args = parser.parse_args()

    set_seed(args.seed)
    manifest = Path(args.manifest).expanduser().resolve()
    rows = read_rows(manifest)
    classes = sorted({row["gloss"] for row in rows if row.get("split") == "train" and row.get("gloss")})
    if not classes:
        raise SystemExit("Manifest has no labeled training rows.")
    class_to_idx = {gloss: index for index, gloss in enumerate(classes)}

    if args.device == "cuda" and not torch.cuda.is_available():
        raise SystemExit("CUDA was requested but is not available.")
    device = torch.device("cuda" if args.device == "cuda" or (args.device == "auto" and torch.cuda.is_available()) else "cpu")

    train_set = ManifestVideoDataset(manifest, "train", class_to_idx, args.dataset_root, args.frame_count, args.image_size)
    val_set = ManifestVideoDataset(manifest, "val", class_to_idx, args.dataset_root, args.frame_count, args.image_size)
    if not train_set or not val_set:
        raise SystemExit("Both train and val splits must contain selected classes.")

    train_loader = DataLoader(train_set, batch_size=args.batch_size, shuffle=True, num_workers=args.num_workers)
    val_loader = DataLoader(val_set, batch_size=args.batch_size, shuffle=False, num_workers=args.num_workers)
    model = TinyVideoClassifier(len(classes)).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.learning_rate)
    loss_fn = torch.nn.CrossEntropyLoss()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    best_val_accuracy = -1.0
    history = []
    for epoch in range(1, args.epochs + 1):
        train_loss, train_accuracy = run_epoch(model, train_loader, loss_fn, optimizer, device, True)
        val_loss, val_accuracy = run_epoch(model, val_loader, loss_fn, optimizer, device, False)
        result = {"epoch": epoch, "train_loss": train_loss, "train_accuracy": train_accuracy, "val_loss": val_loss, "val_accuracy": val_accuracy}
        history.append(result)
        print(json.dumps(result))
        if val_accuracy > best_val_accuracy:
            best_val_accuracy = val_accuracy
            torch.save({"model_state": model.state_dict(), "class_to_idx": class_to_idx, "frame_count": args.frame_count, "image_size": args.image_size, "seed": args.seed}, output_dir / "best.pt")

    with (output_dir / "history.json").open("w", encoding="utf-8") as handle:
        json.dump({"device": str(device), "classes": classes, "history": history}, handle, indent=2)
    print(f"Best checkpoint: {output_dir / 'best.pt'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
