#!/usr/bin/env python3
"""Normaliza previews para um loudness-alvo sem sobrescrever entradas."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


def run_probe(input_path: Path, target_i: float) -> dict:
    filter_graph = f"loudnorm=I={target_i}:TP=-1.5:LRA=11:print_format=json"
    command = [
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(input_path),
        "-af", filter_graph, "-f", "null", "-",
    ]
    completed = subprocess.run(command, check=True, capture_output=True, text=True)
    matches = re.findall(r"\{[^{}]+\}", completed.stderr, flags=re.DOTALL)
    if not matches:
        raise RuntimeError(f"loudnorm não retornou medições para {input_path}")
    return json.loads(matches[-1])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--target-i", type=float, default=-20.0)
    args = parser.parse_args()
    if not args.input.is_file():
        raise SystemExit(f"entrada não encontrada: {args.input}")
    if args.output.exists():
        raise SystemExit(f"saída já existe; não sobrescrevendo: {args.output}")
    measured = run_probe(args.input, args.target_i)
    filter_graph = (
        f"loudnorm=I={args.target_i}:TP=-1.5:LRA=11:"
        f"measured_I={measured['input_i']}:"
        f"measured_TP={measured['input_tp']}:"
        f"measured_LRA={measured['input_lra']}:"
        f"measured_thresh={measured['input_thresh']}:"
        f"offset={measured['target_offset']}:linear=true:print_format=summary"
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(args.input), "-af", filter_graph,
        "-c:a", "pcm_s16le", str(args.output),
    ]
    subprocess.run(command, check=True)
    sidecar = args.output.with_suffix(args.output.suffix + ".json")
    sidecar.write_text(json.dumps({
        "input": str(args.input),
        "output": str(args.output),
        "targetIntegratedLufs": args.target_i,
        "measured": measured,
        "truePeakTargetDbtp": -1.5,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"input": str(args.input), "output": str(args.output), "targetI": args.target_i}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
