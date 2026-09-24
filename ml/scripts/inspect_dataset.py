#!/usr/bin/env python3
"""Inspect an authorized local ASL Citizen copy and create a safe manifest."""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
FIELD_ALIASES = {
    "video_path": ("video_path", "videopath", "path", "filepath", "filename", "file", "video", "videoid", "id"),
    "gloss": ("gloss", "label", "sign", "class", "classname", "target"),
    "split": ("split", "subset", "partition", "set"),
    "signer_id": ("signerid", "userid", "user", "participant", "participantid", "subjectid"),
    "class_id": ("classid", "labelid", "glossid", "signid", "code"),
}


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def choose_field(fieldnames: Iterable[str], aliases: Iterable[str]) -> str | None:
    normalized = {normalize_key(field): field for field in fieldnames}
    for alias in aliases:
        if alias in normalized:
            return normalized[alias]
    return None


def discover_metadata(root: Path) -> list[Path]:
    candidates = [
        path for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in {".csv", ".tsv", ".json", ".jsonl"}
    ]
    return sorted(candidates, key=lambda path: ("metadata" not in path.name.lower(), "label" not in path.name.lower(), str(path)))


def read_json_records(path: Path) -> list[dict]:
    if path.suffix.lower() == ".jsonl":
        with path.open("r", encoding="utf-8") as handle:
            return [json.loads(line) for line in handle if line.strip()]

    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("data", "records", "videos", "instances", "annotations"):
            if isinstance(payload.get(key), list):
                return [item for item in payload[key] if isinstance(item, dict)]
    return []


def read_tabular_records(path: Path) -> list[dict]:
    delimiter = "\t" if path.suffix.lower() == ".tsv" else ","
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle, delimiter=delimiter))


def read_records(path: Path) -> list[dict]:
    return read_json_records(path) if path.suffix.lower() in {".json", ".jsonl"} else read_tabular_records(path)


def metadata_score(records: list[dict]) -> int:
    if not records:
        return -1
    fields = records[0].keys()
    return sum(1 for aliases in FIELD_ALIASES.values() if choose_field(fields, aliases)) + min(len(records), 1000) / 100000


def find_video_index(root: Path) -> dict[str, Path]:
    index = {}
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in VIDEO_EXTENSIONS:
            index.setdefault(path.name.lower(), path)
            index.setdefault(path.stem.lower(), path)
    return index


def resolve_video(root: Path, raw_value: str, video_index: dict[str, Path]) -> Path | None:
    value = str(raw_value or "").strip().replace("\\", "/")
    if not value:
        return None
    candidates = [root / value, root / "videos" / value, root / "video" / value]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    return video_index.get(Path(value).name.lower()) or video_index.get(Path(value).stem.lower())


def inspect_video(path: Path) -> tuple[bool, int, int, int, float, str | None]:
    try:
        import cv2

        capture = cv2.VideoCapture(str(path))
        if not capture.isOpened():
            return False, 0, 0, 0, 0.0, "video could not be opened"
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        success, _ = capture.read()
        capture.release()
        if not success or frame_count <= 0:
            return False, frame_count, width, height, fps, "video has no readable frames"
        return True, frame_count, width, height, fps, None
    except Exception as error:  # pragma: no cover - depends on local codecs
        return False, 0, 0, 0, 0.0, str(error)


def select_classes(rows: list[dict], num_classes: int | None, strategy: str) -> list[str]:
    available = sorted({row["gloss"] for row in rows if row.get("gloss")})
    if not num_classes or num_classes >= len(available):
        return available
    if strategy == "alphabetical":
        return available[:num_classes]
    train_counts = Counter(row["gloss"] for row in rows if row.get("split") == "train")
    return sorted(available, key=lambda gloss: (-train_counts[gloss], gloss))[:num_classes]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", default=os.environ.get("ASL_CITIZEN_ROOT", "data/asl_citizen"))
    parser.add_argument("--output-dir", default="ml/outputs/dataset_audit")
    parser.add_argument("--num-classes", type=int, default=None)
    parser.add_argument("--selection-strategy", choices=("frequency", "alphabetical"), default="frequency")
    parser.add_argument("--skip-video-check", action="store_true")
    args = parser.parse_args()

    root = Path(args.dataset_root).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    if not root.is_dir():
        raise SystemExit(f"Dataset root does not exist: {root}")

    metadata_candidates = []
    for path in discover_metadata(root):
        try:
            records = read_records(path)
            score = metadata_score(records)
            if score >= 1:
                metadata_candidates.append((score, len(records), path, records))
        except (OSError, ValueError, json.JSONDecodeError):
            continue

    video_index = find_video_index(root)
    metadata_path = None
    raw_records = []
    if metadata_candidates:
        _, _, metadata_path, raw_records = max(metadata_candidates, key=lambda item: (item[0], item[1], str(item[2])))

    if not raw_records:
        raw_records = [{"video_path": str(path.relative_to(root))} for path in sorted(set(video_index.values()))]

    fields = raw_records[0].keys() if raw_records else []
    field_map = {name: choose_field(fields, aliases) for name, aliases in FIELD_ALIASES.items()}
    rows = []
    missing_files = []
    corrupt_files = []
    seen_paths = defaultdict(list)

    for raw in raw_records:
        video_path = resolve_video(root, raw.get(field_map["video_path"], "") if field_map["video_path"] else "", video_index)
        split = str(raw.get(field_map["split"], "") if field_map["split"] else "").strip().lower()
        gloss = str(raw.get(field_map["gloss"], "") if field_map["gloss"] else "").strip()
        signer_id = str(raw.get(field_map["signer_id"], "") if field_map["signer_id"] else "").strip()
        if video_path is None:
            missing_files.append({"raw_value": raw.get(field_map["video_path"], "") if field_map["video_path"] else "", "gloss": gloss})
            continue

        relative_path = str(video_path.relative_to(root)).replace("\\", "/")
        seen_paths[relative_path].append(gloss)
        frame_count = None
        width = None
        height = None
        fps = None
        if not args.skip_video_check:
            valid, frame_count, width, height, fps, error = inspect_video(video_path)
            if not valid:
                corrupt_files.append({"video_path": relative_path, "error": error})

        rows.append({"video_path": relative_path, "gloss": gloss, "split": split, "signer_id": signer_id, "frame_count": frame_count or "", "width": width or "", "height": height or "", "fps": fps or ""})

    duplicate_paths = [{"video_path": path, "occurrences": values} for path, values in seen_paths.items() if len(values) > 1]
    selected_classes = select_classes(rows, args.num_classes, args.selection_strategy)
    selected_rows = [row for row in rows if not selected_classes or row["gloss"] in selected_classes]
    split_counts = Counter(row["split"] or "unknown" for row in selected_rows)
    class_counts = Counter(row["gloss"] or "<missing>" for row in selected_rows)
    signer_counts = Counter(row["signer_id"] for row in selected_rows if row["signer_id"])
    video_properties = Counter((row["width"], row["height"], row["fps"]) for row in selected_rows if row["width"] and row["height"])

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "manifest.csv"
    with manifest_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=("video_path", "gloss", "split", "signer_id", "frame_count", "width", "height", "fps"))
        writer.writeheader()
        writer.writerows(selected_rows)

    summary = {
        "dataset_root": str(root),
        "metadata_file": str(metadata_path) if metadata_path else None,
        "metadata_fields": field_map,
        "videos_discovered": len(video_index),
        "videos_referenced": len(rows),
        "classes": len({row["gloss"] for row in selected_rows if row["gloss"]}),
        "selected_classes": selected_classes,
        "selection_strategy": args.selection_strategy,
        "split_counts": dict(sorted(split_counts.items())),
        "top_classes": [{"gloss": gloss, "count": count} for gloss, count in class_counts.most_common(20)],
        "signer_count": len(signer_counts),
        "videos_by_signer": dict(sorted(signer_counts.items())),
        "video_properties": [{"width": width, "height": height, "fps": fps, "count": count} for (width, height, fps), count in video_properties.items()],
        "missing_files": missing_files,
        "corrupt_files": corrupt_files,
        "duplicate_paths": duplicate_paths,
        "video_check_performed": not args.skip_video_check,
        "manifest": str(manifest_path),
    }
    with (output_dir / "summary.json").open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)

    print("Dataset summary")
    print("---------------")
    print(f"Classes: {summary['classes']}")
    print(f"Videos: {summary['videos_referenced']}")
    print(f"Splits: {summary['split_counts']}")
    print(f"Missing files: {len(missing_files)}")
    print(f"Corrupt files: {len(corrupt_files)}")
    print(f"Duplicate paths: {len(duplicate_paths)}")
    print(f"Signer count: {summary['signer_count']}")
    print(f"Summary: {output_dir / 'summary.json'}")
    print(f"Manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
