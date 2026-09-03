#!/usr/bin/env python3
"""Gera um preview de imersão com ducking do ambiente sob a narração."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("bed", type=Path, help="ambiente/acompanhamento sem voz")
    parser.add_argument("narration", type=Path, help="voz da S·IA ou faixa de teste")
    parser.add_argument("output", type=Path)
    parser.add_argument("--delay-ms", type=int, default=0)
    parser.add_argument("--bed-gain-db", type=float, default=-2.0)
    parser.add_argument("--narration-gain-db", type=float, default=0.0)
    args = parser.parse_args()
    if not args.bed.is_file() or not args.narration.is_file():
        raise SystemExit("bed e narration precisam existir")
    if args.delay_ms < 0 or args.delay_ms > 5000:
        raise SystemExit("delay-ms precisa estar entre 0 e 5000")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    delay = f"{args.delay_ms}|{args.delay_ms}"
    filter_graph = (
        f"[0:a]aresample=44100,volume={args.bed_gain_db}dB[bed];"
        f"[1:a]aresample=44100,adelay={delay},volume={args.narration_gain_db}dB,asplit=2[side][voice];"
        "[bed][side]sidechaincompress=threshold=0.08:ratio=8:attack=20:release=250:makeup=1[ducked];"
        "[ducked][voice]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[mix]"
    )
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(args.bed), "-i", str(args.narration),
        "-filter_complex", filter_graph, "-map", "[mix]",
        "-c:a", "pcm_s16le", str(args.output),
    ]
    subprocess.run(command, check=True)
    metadata = {
        "bed": str(args.bed),
        "narration": str(args.narration),
        "output": str(args.output),
        "delayMs": args.delay_ms,
        "bedGainDb": args.bed_gain_db,
        "narrationGainDb": args.narration_gain_db,
        "ducking": {"threshold": 0.08, "ratio": 8, "attackMs": 20, "releaseMs": 250},
        "note": "Preview de laboratório; não representa a voz neural da S·IA se narration for uma faixa de teste.",
    }
    args.output.with_suffix(args.output.suffix + ".json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(metadata, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
