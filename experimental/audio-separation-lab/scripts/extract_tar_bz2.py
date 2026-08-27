#!/usr/bin/env python3
"""Extrai um tar.bz2 usando apenas a biblioteca padrão."""

from __future__ import annotations

import argparse
import bz2
import io
import tarfile
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)
    payload = bz2.decompress(args.archive.read_bytes())
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:") as archive:
        for member in archive.getmembers():
            target = (args.destination / member.name).resolve()
            if not str(target).startswith(str(args.destination.resolve()) + "/"):
                raise SystemExit(f"membro fora do destino: {member.name}")
        archive.extractall(args.destination)
    print(f"extraído: {args.archive} -> {args.destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
