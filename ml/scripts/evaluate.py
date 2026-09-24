#!/usr/bin/env python3
"""Evaluate a checkpoint once on the official untouched test split."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import torch
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
    precision_score,
    recall_score,
)
from torch.utils.data import DataLoader

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from asl_citizen.models import TinyVideoClassifier
from asl_citizen.video_dataset import ManifestVideoDataset


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--dataset-root", default="data/asl_citizen")
    parser.add_argument("--output-dir", default="ml/outputs/evaluation")
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    args = parser.parse_args()

    if args.device == "cuda" and not torch.cuda.is_available():
        raise SystemExit("CUDA was requested but is not available.")
    device = torch.device("cuda" if args.device == "cuda" or (args.device == "auto" and torch.cuda.is_available()) else "cpu")
    checkpoint = torch.load(Path(args.checkpoint).expanduser().resolve(), map_location=device)
    class_to_idx = checkpoint["class_to_idx"]
    idx_to_class = {index: gloss for gloss, index in class_to_idx.items()}
    manifest = Path(args.manifest).expanduser().resolve()
    dataset = ManifestVideoDataset(manifest, "test", class_to_idx, args.dataset_root, checkpoint["frame_count"], checkpoint["image_size"])
    if not dataset:
        raise SystemExit("Manifest has no labeled test rows for the checkpoint classes.")

    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=False, num_workers=args.num_workers)
    model = TinyVideoClassifier(len(class_to_idx)).to(device)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()
    predictions, labels = [], []
    with torch.no_grad():
        for videos, batch_labels in loader:
            logits = model(videos.to(device))
            predictions.extend(logits.argmax(dim=1).cpu().tolist())
            labels.extend(batch_labels.tolist())

    label_ids = list(range(len(class_to_idx)))
    metrics = {
        "device": str(device),
        "test_samples": len(labels),
        "accuracy": accuracy_score(labels, predictions),
        "macro_precision": precision_score(labels, predictions, labels=label_ids, average="macro", zero_division=0),
        "macro_recall": recall_score(labels, predictions, labels=label_ids, average="macro", zero_division=0),
        "macro_f1": f1_score(labels, predictions, labels=label_ids, average="macro", zero_division=0),
        "class_wise": {},
    }
    precision, recall, f1, support = precision_recall_fscore_support(labels, predictions, labels=label_ids, zero_division=0)
    for index, label_id in enumerate(label_ids):
        metrics["class_wise"][idx_to_class[label_id]] = {"precision": precision[index], "recall": recall[index], "f1": f1[index], "support": int(support[index])}

    matrix = confusion_matrix(labels, predictions, labels=label_ids).tolist()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    metrics["classes"] = [idx_to_class[index] for index in label_ids]
    metrics["confusion_matrix"] = matrix
    with (output_dir / "metrics.json").open("w", encoding="utf-8") as handle:
        json.dump(metrics, handle, indent=2)
    with (output_dir / "confusion_matrix.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["actual\\predicted", *metrics["classes"]])
        writer.writerows([[metrics["classes"][row_index], *row] for row_index, row in enumerate(matrix)])

    print(json.dumps({key: metrics[key] for key in ("test_samples", "accuracy", "macro_precision", "macro_recall", "macro_f1")}, indent=2))
    print(f"Metrics: {output_dir / 'metrics.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
