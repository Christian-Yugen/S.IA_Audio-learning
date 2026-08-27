#!/usr/bin/env python3
"""Executa jobs de benchmark declarados em JSON, um por vez."""

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import time
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timeout-seconds", type=int, default=1800)
    parser.add_argument("--stop-on-error", action="store_true")
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    jobs = config.get("jobs", [])
    if not jobs:
        raise SystemExit("configuração sem jobs")
    args.output.mkdir(parents=True, exist_ok=False)
    results = []
    failed = False
    for index, job in enumerate(jobs, start=1):
        job_id = job.get("id", f"job-{index:03d}")
        command = job.get("command")
        if not isinstance(command, list) or not all(isinstance(part, str) for part in command):
            result = {"id": job_id, "status": "invalid", "error": "command precisa ser lista de strings"}
            results.append(result)
            failed = True
            if args.stop_on_error:
                break
            continue
        started = time.perf_counter()
        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=job.get("timeoutSeconds", args.timeout_seconds),
            )
            elapsed = time.perf_counter() - started
            stdout_path = args.output / f"{index:03d}-{job_id}.stdout.log"
            stderr_path = args.output / f"{index:03d}-{job_id}.stderr.log"
            stdout_path.write_text(completed.stdout, encoding="utf-8")
            stderr_path.write_text(completed.stderr, encoding="utf-8")
            result = {
                "id": job_id,
                "status": "passed" if completed.returncode == 0 else "failed",
                "returnCode": completed.returncode,
                "wallSeconds": elapsed,
                "command": command,
                "commandDisplay": shlex.join(command),
                "stdoutLog": str(stdout_path),
                "stderrLog": str(stderr_path),
            }
            if completed.returncode != 0:
                failed = True
        except subprocess.TimeoutExpired as exc:
            elapsed = time.perf_counter() - started
            (args.output / f"{index:03d}-{job_id}.stdout.log").write_text(exc.stdout or "", encoding="utf-8")
            (args.output / f"{index:03d}-{job_id}.stderr.log").write_text(exc.stderr or "", encoding="utf-8")
            result = {
                "id": job_id,
                "status": "timeout",
                "wallSeconds": elapsed,
                "command": command,
            }
            failed = True
        results.append(result)
        if failed and args.stop_on_error:
            break

    report = {
        "schemaVersion": 1,
        "config": str(args.config),
        "jobCount": len(jobs),
        "completedCount": len(results),
        "failed": failed,
        "results": results,
    }
    report_path = args.output / "batch-results.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "jobCount": len(jobs),
        "completedCount": len(results),
        "failed": failed,
        "report": str(report_path),
    }, ensure_ascii=False))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
