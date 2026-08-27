#!/usr/bin/env python3
"""Calcula métricas básicas de PCM16 estéreo para os stems do laboratório."""

from __future__ import annotations

import argparse
import json
import math
import struct
import wave
from pathlib import Path


def read_pcm16(path: Path) -> tuple[int, int, list[float]]:
    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        sample_rate = wav.getframerate()
        sample_width = wav.getsampwidth()
        frames = wav.readframes(wav.getnframes())
    if channels not in (1, 2) or sample_width != 2:
        raise ValueError(f"{path}: esperado PCM16 mono/estéreo")
    values = struct.unpack("<" + "h" * (len(frames) // 2), frames)
    return sample_rate, channels, [value / 32768.0 for value in values]


def summarize(path: Path) -> dict:
    sample_rate, channels, values = read_pcm16(path)
    if not values:
        raise ValueError(f"{path}: sem amostras")
    rms = math.sqrt(sum(value * value for value in values) / len(values))
    peak = max(abs(value) for value in values)
    return {
        "file": path.name,
        "sampleRate": sample_rate,
        "channels": channels,
        "sampleCount": len(values),
        "durationSeconds": len(values) / sample_rate / channels,
        "rms": rms,
        "rmsDbfs": 20 * math.log10(max(rms, 1e-12)),
        "peak": peak,
        "peakDbfs": 20 * math.log10(max(peak, 1e-12)),
        "clippedSamples": sum(1 for value in values if abs(value) >= 0.999),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    files = sorted(args.directory.glob("*.wav"))
    report = {"directory": str(args.directory), "stems": [summarize(path) for path in files]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
