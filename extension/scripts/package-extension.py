from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

FILES = (
    "manifest.json",
    "content.js",
    "sync-engine.js",
    "dom-fallback.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "sidepanel.html",
    "sidepanel.css",
    "sidepanel.js",
    "learning/learning-engine.js",
    "service-worker.js",
    "platform-selection.js",
    "platform-selection-bootstrap.js",
    "offscreen.html",
    "offscreen.js",
    "platform-adapters/caption-input.js",
    "platform-adapters/platform-router.js",
    "platform-adapters/core-event-bridge.js",
    "platform-adapters/core-diagnostic-state.js",
    "platform-adapters/udemy/shaka-caption-bridge.js",
    "platform-adapters/udemy/udemy-host.js",
    "platform-adapters/udemy/udemy-adapter.js",
    "platform-adapters/udemy/udemy-adapter-contract.js",
    "platform-adapters/youtube/youtube-adapter-contract.js",
    "platform-adapters/youtube/youtube-adapter.js",
    "platform-adapters/youtube/youtube-caption-aggregator.js",
    "platform-adapters/youtube/youtube-caption-parser.js",
    "platform-adapters/youtube/youtube-caption-bridge.js",
    "platform-adapters/youtube/youtube-host.js",
)
DIRECTORIES = ("icons", "neural-tts")
FIXED_DATE_TIME = (1980, 1, 1, 0, 0, 0)


def package_extension(output_directory: Path) -> Path:
    project_root = Path(__file__).resolve().parent.parent
    manifest = json.loads((project_root / "manifest.json").read_text(encoding="utf-8"))
    version = str(manifest["version"])
    output_directory.mkdir(parents=True, exist_ok=True)
    archive_path = output_directory / f"sia-extension-{version}.zip"

    relative_paths = set(FILES)
    for directory in DIRECTORIES:
        directory_path = project_root / directory
        relative_paths.update(
            path.relative_to(project_root).as_posix()
            for path in directory_path.rglob("*")
            if path.is_file()
        )

    paths = sorted(relative_paths)
    missing = [path for path in paths if not (project_root / path).is_file()]
    if missing:
        raise FileNotFoundError(f"Arquivos ausentes na allowlist: {', '.join(missing)}")

    temporary_path = archive_path.with_suffix(".zip.tmp")
    if temporary_path.exists():
        temporary_path.unlink()
    try:
        with ZipFile(temporary_path, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
            for relative_path in paths:
                data = (project_root / relative_path).read_bytes()
                info = ZipInfo(relative_path, date_time=FIXED_DATE_TIME)
                info.compress_type = ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o644 << 16
                archive.writestr(info, data)
        os.replace(temporary_path, archive_path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()
    print(f"Pacote determinístico criado: {archive_path}")
    print(f"Arquivos incluídos: {len(paths)}")
    return archive_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Empacota a extensão S·IA com allowlist determinística.")
    parser.add_argument("--output-directory", default="dist", help="Diretório de saída relativo à extensão ou absoluto.")
    args = parser.parse_args()
    output_directory = Path(args.output_directory)
    if not output_directory.is_absolute():
        output_directory = Path(__file__).resolve().parent.parent / output_directory
    package_extension(output_directory)


if __name__ == "__main__":
    main()
