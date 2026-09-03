#!/usr/bin/env python3
"""Cria um pacote de escuta cega a partir de um plano JSON."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("plan", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--normalizer", type=Path, required=True)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    items = plan.get("items", [])
    if not items:
        raise SystemExit("o plano não contém items")
    if args.output.exists():
        raise SystemExit(f"saída já existe; não sobrescrevendo: {args.output}")
    args.output.mkdir(parents=True, exist_ok=False)
    answer_key = []
    for index, item in enumerate(items, start=1):
        source = Path(item["source"])
        blind_id = item.get("blindId", f"A{index:03d}")
        if not source.is_file():
            raise SystemExit(f"fonte não encontrada: {source}")
        if not blind_id.replace("-", "").isalnum():
            raise SystemExit(f"blindId inválido: {blind_id}")
        with tempfile.TemporaryDirectory(prefix="sia-blind-") as temporary:
            normalized = Path(temporary) / "normalized.wav"
            subprocess.run([
                "python3", str(args.normalizer), str(source), str(normalized),
            ], check=True, stdout=subprocess.DEVNULL)
            target = args.output / f"{blind_id}.wav"
            shutil.copy2(normalized, target)
        answer_key.append({
            "blindId": blind_id,
            "sourceSha256": sha256(source),
            "modelAlias": item.get("modelAlias", ""),
            "sampleId": item.get("sampleId", ""),
            "scenario": item.get("scenario", ""),
            "source": str(source),
        })
    (args.output / "answer-key.private.json").write_text(
        json.dumps({"sessionId": plan.get("sessionId", ""), "items": answer_key}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (args.output / "README.txt").write_text(
        "Pacote cego de escuta. Use os IDs como estão; não abra answer-key.private.json antes de registrar as notas.\n",
        encoding="utf-8",
    )
    print(json.dumps({"sessionId": plan.get("sessionId", ""), "items": len(answer_key), "output": str(args.output)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
