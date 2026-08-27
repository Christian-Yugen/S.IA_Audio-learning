#!/usr/bin/env python3
"""Inspeciona mídia do corpus sem alterar os arquivos de entrada."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".mp4", ".webm", ".flac", ".ogg"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def probe(path: Path) -> dict:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration,format_name,size:stream=index,codec_type,codec_name,sample_rate,channels",
        "-of",
        "json",
        str(path),
    ]
    completed = subprocess.run(command, check=True, capture_output=True, text=True)
    data = json.loads(completed.stdout or "{}")
    streams = data.get("streams", [])
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    return {
        "path": str(path),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "format": data.get("format", {}),
        "audioStreams": audio_streams,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    files = sorted(
        path for path in args.root.rglob("*")
        if path.is_file() and path.suffix.lower() in ALLOWED_EXTENSIONS
    )
    inspected = []
    errors = []
    for path in files:
        try:
            inspected.append(probe(path))
        except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
            errors.append({"path": str(path), "error": str(exc)})

    report = {
        "schemaVersion": 1,
        "root": str(args.root),
        "files": inspected,
        "errors": errors,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"files": len(inspected), "errors": len(errors), "output": str(args.output)}, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
