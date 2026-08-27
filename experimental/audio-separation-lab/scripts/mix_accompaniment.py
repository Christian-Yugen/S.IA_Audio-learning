#!/usr/bin/env python3
"""Soma stems não vocais em um WAV PCM16 estéreo."""

from __future__ import annotations

import argparse
import struct
import wave
from pathlib import Path


def read_wav(path: Path) -> tuple[int, int, list[int]]:
    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        rate = wav.getframerate()
        width = wav.getsampwidth()
        frames = wav.readframes(wav.getnframes())
    if channels != 2 or rate != 44100 or width != 2:
        raise ValueError(f"{path}: esperado PCM16 estéreo a 44100 Hz")
    return rate, channels, list(struct.unpack("<" + "h" * (len(frames) // 2), frames))


def write_wav(path: Path, rate: int, channels: int, values: list[int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(struct.pack("<" + "h" * len(values), *values))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--gain", type=float, default=1.0)
    args = parser.parse_args()
    sources = [args.directory / f"{name}.wav" for name in ("drums", "bass", "other")]
    loaded = [read_wav(path) for path in sources]
    rate, channels, first = loaded[0]
    frame_count = min(len(values) for _, _, values in loaded)
    mixed = []
    for index in range(frame_count):
        value = sum(values[index] for _, _, values in loaded) * args.gain
        mixed.append(max(-32768, min(32767, round(value))))
    write_wav(args.output, rate, channels, mixed)
    print(f"acompanhamento criado: {args.output} ({frame_count // channels} frames)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
