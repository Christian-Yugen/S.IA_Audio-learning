#!/usr/bin/env python3
"""Gera configuração declarativa de benchmark a partir do manifesto."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def absolute(path: Path) -> str:
    return str(path.resolve())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--lab", type=Path, required=True)
    parser.add_argument("--runner-dir", type=Path, required=True)
    parser.add_argument("--node", default="node")
    parser.add_argument("--htdemucs-model", type=Path)
    parser.add_argument("--spleeter-dir", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    jobs: list[dict] = []
    skipped: list[dict] = []
    for sample in manifest.get("samples", []):
        sample_id = sample["id"]
        raw_path = Path(sample["path"])
        working_path = Path(sample.get(
            "workingPath",
            str(args.lab / "corpus" / "working" / f"{sample_id}.wav"),
        ))
        if not working_path.is_file():
            skipped.append({"sampleId": sample_id, "reason": "working WAV not found", "path": str(working_path)})
            continue
        if args.htdemucs_model:
            if args.htdemucs_model.is_file():
                jobs.append({
                    "id": f"{sample_id}-htdemucs",
                    "sampleId": sample_id,
                    "modelId": "htdemucs-onnx",
                    "command": [
                        args.node,
                        absolute(args.runner_dir / "run-separation.mjs"),
                        absolute(working_path),
                        absolute(args.htdemucs_model),
                        absolute(args.lab / "results" / f"{sample_id}-htdemucs"),
                    ],
                })
            else:
                skipped.append({"sampleId": sample_id, "modelId": "htdemucs-onnx", "reason": "model not found"})
        if args.spleeter_dir:
            vocals = args.spleeter_dir / "vocals.fp16.onnx"
            accompaniment = args.spleeter_dir / "accompaniment.fp16.onnx"
            if vocals.is_file() and accompaniment.is_file():
                jobs.append({
                    "id": f"{sample_id}-spleeter",
                    "sampleId": sample_id,
                    "modelId": "spleeter-sherpa-fp16",
                    "command": [
                        args.node,
                        absolute(args.runner_dir / "run-spleeter.mjs"),
                        absolute(working_path),
                        absolute(vocals),
                        absolute(accompaniment),
                        absolute(args.lab / "results" / f"{sample_id}-spleeter"),
                    ],
                })
            else:
                skipped.append({"sampleId": sample_id, "modelId": "spleeter-sherpa-fp16", "reason": "one or more models not found"})
    if not jobs:
        raise SystemExit("nenhum job gerado; verifique WAVs e pesos")
    result = {
        "schemaVersion": 1,
        "generatedFrom": absolute(args.manifest),
        "jobs": jobs,
        "skipped": skipped,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"jobs": len(jobs), "skipped": len(skipped), "output": str(args.output)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
