# ASL Citizen ML Pipeline

This directory contains dataset preparation and isolated-sign recognition infrastructure. It is deliberately separate from the React application.

## Verified dataset facts

The official ASL Citizen Version 1.0 documentation describes:

- 83,399 `.mp4` videos
- 2,731 isolated ASL signs/glosses
- 52 signers
- RGB webcam recordings
- `train`, `val`, and `test` splits that are signer-independent
- Version 1.0 split counts of 40,154 train, 10,304 validation, and 32,941 test videos
- Gloss labels and anonymous user identifiers in the released metadata

Exact local filenames and metadata column names are discovered by `inspect_dataset.py`; they are not assumed by the pipeline.

ASL Citizen is intended primarily for isolated sign recognition and dictionary retrieval. It must not be treated as a complete continuous English-to-ASL translation dataset. The videos contain identifiable people and are licensed by Microsoft for non-commercial, non-revenue-generating research use. The dataset and derived data must not be redistributed. Review the official [dataset license](https://www.microsoft.com/en-us/research/project/asl-citizen/dataset-license/) before use.

## Environment

The repository was checked with Python 3.12.2 and an existing CPU-only installation:

- PyTorch 2.2.2+cpu
- torchvision 0.17.2+cpu
- OpenCV 4.9.0
- NumPy 1.26.4
- pandas 2.2.3
- scikit-learn 1.6.1

No packages were installed by this phase. `requirements.txt` records the pipeline dependencies for a separate environment.

## Dataset preparation

Place an authorized local copy outside the React assets, for example:

```text
data/asl_citizen/
```

The root can also be supplied through `ASL_CITIZEN_ROOT` or `--dataset-root`.

Inspect and create a manifest without downloading anything:

```bash
python ml/scripts/inspect_dataset.py --dataset-root data/asl_citizen --num-classes 100
```

The command writes `summary.json` and `manifest.csv` under `ml/outputs/dataset_audit` by default. Use `--skip-video-check` for a metadata-only pass; the default checks whether each referenced video can be opened and has readable frames.

Class selection is deterministic. The default `frequency` strategy selects the most frequent training glosses, breaking ties lexicographically. It does not create a random frame split and it does not move samples between the official splits.

## Baseline training and evaluation

Training uses only the manifest's official `train` rows and validates on `val` rows:

```bash
python ml/scripts/train.py --dataset-root data/asl_citizen --manifest ml/outputs/dataset_audit/manifest.csv --epochs 10
```

Evaluation uses only official `test` rows:

```bash
python ml/scripts/evaluate.py --dataset-root data/asl_citizen --manifest ml/outputs/dataset_audit/manifest.csv --checkpoint ml/outputs/checkpoints/best.pt
```

The baseline is a small 3D CNN that samples a fixed number of frames while retaining temporal order. It is an infrastructure baseline for an 8 GB RAM laptop, not a claim that 3D CNNs are the best architecture. The model interface can later be replaced with a pose model, CNN-LSTM, transformer, or another video architecture.

CUDA is selected automatically when available; otherwise the scripts use CPU. The current verified environment has no CUDA device.

## Data safety

- Do not place ASL Citizen videos under `src/`, `public/`, or `build/`.
- Do not commit `ml/data/`, model checkpoints, generated outputs, or videos.
- Preserve official signer-independent splits.
- Do not inspect or tune against the test set during model development.
- Involve Deaf community members meaningfully in project decisions and do not present isolated-sign recognition as interpreter replacement.
