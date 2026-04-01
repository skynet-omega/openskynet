from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

import torch
from torch import nn


LABELS = ["progress", "relief", "stall", "frustration", "damage"]
LOOKBACK = 4
HIDDEN_SIZE = 48
EPOCHS = 180
LEARNING_RATE = 0.01
WEIGHT_DECAY = 1e-4
MIN_TRAIN = 24
MIN_TEST = 8
MIN_IMPROVEMENT = 0.08


@dataclass
class Row:
    id: str
    session_key: str
    recorded_at: int
    target_label: str
    features: List[float]


class SequenceObserver(nn.Module):
    def __init__(self, feature_dim: int, hidden_size: int, label_count: int):
        super().__init__()
        self.proj = nn.Linear(feature_dim, hidden_size)
        self.rnn = nn.GRU(hidden_size, hidden_size, batch_first=True)
        self.head = nn.Sequential(
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, label_count),
        )

    def forward(self, batch: torch.Tensor) -> torch.Tensor:
        projected = torch.relu(self.proj(batch))
        _, hidden = self.rnn(projected)
        return self.head(hidden[-1])


def load_rows(dataset_path: Path) -> List[Row]:
    payload = json.loads(dataset_path.read_text())
    rows = []
    for row in payload.get("rows", []):
        label = row.get("targetLabel")
        if label not in LABELS:
            continue
        rows.append(
            Row(
                id=str(row["id"]),
                session_key=str(row["sessionKey"]),
                recorded_at=int(row["recordedAt"]),
                target_label=label,
                features=[float(value) for value in row["features"]],
            )
        )
    return rows


def build_windows(rows: Sequence[Row], lookback: int) -> List[Tuple[List[List[float]], str]]:
    grouped: Dict[str, List[Row]] = defaultdict(list)
    for row in rows:
        grouped[row.session_key].append(row)
    windows: List[Tuple[List[List[float]], str]] = []
    for session_rows in grouped.values():
        session_rows.sort(key=lambda row: row.recorded_at)
        for index, row in enumerate(session_rows):
            history = session_rows[max(0, index - lookback + 1) : index + 1]
            windows.append(([item.features for item in history], row.target_label))
    return windows


def split_windows(
    windows: Sequence[Tuple[List[List[float]], str]],
) -> Tuple[List[Tuple[List[List[float]], str]], List[Tuple[List[List[float]], str]]]:
    if len(windows) < (MIN_TRAIN + MIN_TEST):
        return list(windows), []
    cutoff = max(MIN_TRAIN, int(len(windows) * 0.7))
    cutoff = min(cutoff, len(windows) - MIN_TEST)
    return list(windows[:cutoff]), list(windows[cutoff:])


def pad_batch(batch: Sequence[Tuple[List[List[float]], str]]) -> Tuple[torch.Tensor, torch.Tensor]:
    label_map = {label: index for index, label in enumerate(LABELS)}
    feature_dim = len(batch[0][0][0])
    max_len = max(len(sequence) for sequence, _ in batch)
    xs = torch.zeros((len(batch), max_len, feature_dim), dtype=torch.float32)
    ys = torch.zeros((len(batch),), dtype=torch.long)
    for row_index, (sequence, label) in enumerate(batch):
        start = max_len - len(sequence)
        xs[row_index, start:, :] = torch.tensor(sequence, dtype=torch.float32)
        ys[row_index] = label_map[label]
    return xs, ys


def majority_baseline(test_rows: Sequence[Tuple[List[List[float]], str]]) -> float:
    if not test_rows:
        return 0.0
    counter = Counter(label for _, label in test_rows)
    return max(counter.values()) / len(test_rows)


def train_and_eval(
    train_rows: Sequence[Tuple[List[List[float]], str]],
    test_rows: Sequence[Tuple[List[List[float]], str]],
) -> Dict[str, object]:
    if not train_rows or not test_rows:
        return {
            "status": "insufficient_data",
            "accuracy": 0.0,
            "baseline": 0.0,
            "improvement": 0.0,
            "evaluated": 0,
            "failureReasons": ["need enough train and test sequence windows"],
        }

    feature_dim = len(train_rows[0][0][0])
    train_x, train_y = pad_batch(train_rows)
    test_x, test_y = pad_batch(test_rows)

    model = SequenceObserver(feature_dim, HIDDEN_SIZE, len(LABELS))
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)
    loss_fn = nn.CrossEntropyLoss()

    model.train()
    for _ in range(EPOCHS):
        optimizer.zero_grad(set_to_none=True)
        logits = model(train_x)
        loss = loss_fn(logits, train_y)
        loss.backward()
        optimizer.step()

    model.eval()
    with torch.no_grad():
        logits = model(test_x)
        predictions = torch.argmax(logits, dim=1)
        accuracy = float((predictions == test_y).float().mean().item())

    baseline = majority_baseline(test_rows)
    improvement = accuracy - baseline
    failure_reasons: List[str] = []
    if improvement < MIN_IMPROVEMENT:
        failure_reasons.append(
            f"improvement {improvement:.4f} < {MIN_IMPROVEMENT:.4f}"
        )

    return {
        "status": "pass" if not failure_reasons else "fail",
        "accuracy": round(accuracy, 4),
        "baseline": round(baseline, 4),
        "improvement": round(improvement, 4),
        "evaluated": len(test_rows),
        "failureReasons": failure_reasons,
    }


def main() -> None:
    workspace_root = Path.cwd()
    dataset_path = (
        workspace_root
        / ".openskynet"
        / "skynet-experiments"
        / "agent_openskynet_main-runtime-observer-dataset-01.json"
    )
    out_path = (
        workspace_root
        / ".openskynet"
        / "skynet-experiments"
        / "agent_openskynet_main-runtime-observer-torch-01.json"
    )

    rows = load_rows(dataset_path)
    windows = build_windows(rows, LOOKBACK)
    train_rows, test_rows = split_windows(windows)
    result = train_and_eval(train_rows, test_rows)
    result.update(
        {
            "projectName": "Skynet",
            "updatedAt": int(torch.tensor(0).new_empty(()).fill_(0).item() + __import__("time").time() * 1000),
            "rows": len(rows),
            "sequenceWindows": len(windows),
            "trainWindows": len(train_rows),
            "testWindows": len(test_rows),
            "lookback": LOOKBACK,
            "featureDimensions": len(rows[0].features) if rows else 0,
            "labelCoverage": dict(Counter(row.target_label for row in rows)),
            "datasetPath": str(dataset_path),
        }
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2) + "\n")
    print("--- Skynet Experiment: Runtime Observer Torch 01 ---")
    print(f"Status: {result['status']}")
    print(f"Rows: {result['rows']}")
    print(f"Train windows: {result['trainWindows']}")
    print(f"Test windows: {result['testWindows']}")
    print(f"Accuracy: {result['accuracy']:.4f}")
    print(f"Baseline: {result['baseline']:.4f}")
    print(f"Improvement: {result['improvement']:.4f}")


if __name__ == "__main__":
    main()
