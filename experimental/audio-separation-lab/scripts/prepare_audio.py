#!/usr/bin/env python3
"""Converte amostras autorizadas para WAV PCM de trabalho sem sobrescrever originais."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def has_audio_stream(path: Path) -> bool:
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
            str(path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    return bool(probe.stdout.strip())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--sample-rate", type=int, default=44100)
    args = parser.parse_args()

    if not args.input.is_file():
        raise SystemExit(f"entrada não encontrada: {args.input}")
    if not has_audio_stream(args.input):
        raise SystemExit(f"entrada sem faixa de áudio: {args.input}")
    if args.output.exists():
        raise SystemExit(f"saída já existe; não sobrescrevendo: {args.output}")
    args.output.parent.mkdir(parents=True, exist_ok=True)

    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(args.input),
        "-vn",
        "-ac",
        "2",
        "-ar",
        str(args.sample_rate),
        "-c:a",
        "pcm_s16le",
        str(args.output),
    ]
    subprocess.run(command, check=True)
    metadata = {
        "input": str(args.input),
        "output": str(args.output),
        "sampleRate": args.sample_rate,
        "channels": 2,
        "codec": "pcm_s16le",
    }
    sidecar = args.output.with_suffix(args.output.suffix + ".json")
    sidecar.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
