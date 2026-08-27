#!/usr/bin/env python3
"""Verifica a integridade mínima do laboratório sem executar inferência."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("lab", type=Path)
    args = parser.parse_args()
    errors: list[str] = []
    required_tools = ("ffmpeg", "ffprobe", "python3")
    missing_tools = [tool for tool in required_tools if shutil.which(tool) is None]
    if missing_tools:
        errors.append(f"ferramentas ausentes: {', '.join(missing_tools)}")

    manifest_path = args.lab / "corpus" / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("privacy", {}).get("consentRequired") is not True:
            errors.append("manifesto não exige consentimento")
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"manifesto inválido: {exc}")

    for relative in (
        Path("models/candidates.json"),
        Path("notes/result-schema.json"),
        Path("notes/audition-template.json"),
    ):
        try:
            json.loads((args.lab / relative).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"JSON inválido em {relative}: {exc}")

    script_paths = sorted((args.lab / "scripts").glob("*.py"))
    compile_result = subprocess.run(
        ["python3", "-m", "py_compile", *(str(path) for path in script_paths)],
        check=False,
        capture_output=True,
        text=True,
    )
    if compile_result.returncode != 0:
        errors.append(f"falha de sintaxe: {compile_result.stderr.strip()}")

    model_path = args.lab / "models" / "htdemucs_embedded.onnx"
    checksum_path = args.lab / "models" / "htdemucs_embedded.onnx.sha256"
    if model_path.is_file() and checksum_path.is_file():
        expected = checksum_path.read_text(encoding="utf-8").split()[0]
        actual = file_sha256(model_path)
        if expected != actual:
            errors.append("hash do HT-Demucs não confere")

    print(json.dumps({
        "lab": str(args.lab),
        "scriptsChecked": len(script_paths),
        "modelHashChecked": model_path.is_file() and checksum_path.is_file(),
        "errors": errors,
    }, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
