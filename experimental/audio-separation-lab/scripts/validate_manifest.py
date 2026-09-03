#!/usr/bin/env python3
"""Valida o manifesto do corpus antes de qualquer processamento."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REQUIRED_FIELDS = {
    "id",
    "path",
    "sourceType",
    "scenario",
    "language",
    "authorization",
    "durationExpectedSeconds",
}
ALLOWED_AUTHORIZATIONS = {
    "user-provided",
    "public-domain",
    "permissive-license",
}
ALLOWED_SCENARIOS = {
    "clean-speech",
    "speech-over-music",
    "speech-over-ambience",
    "reverberant-speech",
    "practical-demonstration",
    "edited-educational-video",
    "fragmented-captions",
    "difficult-mix",
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()

    data = json.loads(args.manifest.read_text(encoding="utf-8"))
    if data.get("privacy", {}).get("consentRequired") is not True:
        raise SystemExit("privacy.consentRequired precisa ser true")
    samples = data.get("samples")
    if not isinstance(samples, list):
        raise SystemExit("samples precisa ser uma lista")

    errors: list[str] = []
    ids: set[str] = set()
    for index, sample in enumerate(samples, start=1):
        prefix = f"samples[{index}]"
        if not isinstance(sample, dict):
            errors.append(f"{prefix}: entrada precisa ser objeto")
            continue
        missing = REQUIRED_FIELDS - sample.keys()
        if missing:
            errors.append(f"{prefix}: campos ausentes: {', '.join(sorted(missing))}")
        sample_id = str(sample.get("id", ""))
        if not sample_id:
            errors.append(f"{prefix}: id vazio")
        elif sample_id in ids:
            errors.append(f"{prefix}: id duplicado: {sample_id}")
        ids.add(sample_id)
        authorization = sample.get("authorization")
        if authorization not in ALLOWED_AUTHORIZATIONS:
            errors.append(f"{prefix}: autorização não permitida ou não documentada: {authorization!r}")
        scenario = sample.get("scenario")
        if scenario not in ALLOWED_SCENARIOS:
            errors.append(f"{prefix}: cenário desconhecido: {scenario!r}")
        duration = sample.get("durationExpectedSeconds")
        if not isinstance(duration, (int, float)) or not 30 <= duration <= 90:
            errors.append(f"{prefix}: duração esperada precisa estar entre 30 e 90 segundos")
        media_path = Path(str(sample.get("path", "")))
        if not media_path.is_file():
            errors.append(f"{prefix}: arquivo não encontrado: {media_path}")

    if errors:
        print("Manifesto inválido:")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print(f"Manifesto válido: {len(samples)} amostra(s) autorizada(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
