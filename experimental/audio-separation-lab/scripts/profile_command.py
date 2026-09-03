#!/usr/bin/env python3
"""Executa um comando experimental e registra métricas de processo."""

from __future__ import annotations

import argparse
import json
import resource
import subprocess
import time
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise SystemExit("informe o comando depois de --")

    started = time.perf_counter()
    completed = subprocess.run(command, check=False, text=True, capture_output=True)
    elapsed = time.perf_counter() - started
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    result = {
        "command": command,
        "returnCode": completed.returncode,
        "wallSeconds": elapsed,
        "maxResidentSetKb": usage.ru_maxrss,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "returnCode": completed.returncode,
        "wallSeconds": round(elapsed, 4),
        "maxResidentSetKb": usage.ru_maxrss,
        "output": str(args.output),
    }, ensure_ascii=False))
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
