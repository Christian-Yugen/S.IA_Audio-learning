#!/usr/bin/env python3
"""Agrega fichas auditivas por alias de modelo e cenário."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

SCORES = (
    "voiceSuppression",
    "ambiencePreservation",
    "artifactSeverity",
    "siaClarity",
    "naturalness",
    "syncPerception",
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    errors: list[str] = []
    for index, sample in enumerate(data.get("samples", []), start=1):
        alias = sample.get("modelAlias")
        scenario = sample.get("scenario")
        if not alias or not scenario:
            errors.append(f"samples[{index}]: modelAlias e scenario são obrigatórios")
            continue
        missing = [score for score in SCORES if not isinstance(sample.get(score), (int, float))]
        if missing:
            errors.append(f"samples[{index}]: notas ausentes: {', '.join(missing)}")
            continue
        invalid = [score for score in SCORES if not 1 <= sample[score] <= 5]
        if invalid:
            errors.append(f"samples[{index}]: notas fora de 1–5: {', '.join(invalid)}")
            continue
        groups[(alias, scenario)].append(sample)

    summary = []
    for (alias, scenario), samples in sorted(groups.items()):
        averages = {
            score: round(sum(sample[score] for sample in samples) / len(samples), 3)
            for score in SCORES
        }
        summary.append({
            "modelAlias": alias,
            "scenario": scenario,
            "sampleCount": len(samples),
            "averages": averages,
            "usableRate": round(sum(sample.get("usable") is True for sample in samples) / len(samples), 3),
        })
    result = {
        "schemaVersion": 1,
        "blindSessionId": data.get("blindSessionId", ""),
        "summary": summary,
        "errors": errors,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"groups": len(summary), "errors": len(errors), "output": str(args.output)}, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
