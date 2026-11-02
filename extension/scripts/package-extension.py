from __future__ import annotations

import argparse
import json
import os
import re
from fnmatch import fnmatch
from html.parser import HTMLParser
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

PACKAGE_CONFIG = json.loads(Path(__file__).with_name("package-files.json").read_text(encoding="utf-8"))
FILES = tuple(PACKAGE_CONFIG["files"])
DIRECTORIES = tuple(PACKAGE_CONFIG["directories"])
FIXED_DATE_TIME = (1980, 1, 1, 0, 0, 0)


class LocalReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ("src", "href") and value and ":" not in value and not value.startswith("#"):
                self.paths.append(value.split("?", 1)[0].split("#", 1)[0])


def validate_package(project_root: Path, paths: set[str], manifest: dict) -> None:
    required = set(manifest.get("icons", {}).values())
    required.update(manifest.get("action", {}).get("default_icon", {}).values())
    required.update([manifest["background"]["service_worker"], manifest["action"]["default_popup"], manifest["side_panel"]["default_path"]])
    for entry in manifest.get("content_scripts", []):
        required.update(entry.get("js", []))
        required.update(entry.get("css", []))
    for entry in manifest.get("web_accessible_resources", []):
        for pattern in entry["resources"]:
            if not any(fnmatch(path, pattern) for path in paths):
                raise ValueError(f"Recurso do manifesto fora do pacote: {pattern}")
    for name in paths:
        file = project_root / name
        if not file.is_file():
            raise FileNotFoundError(f"Arquivo ausente: {name}")
        if file.suffix == ".html":
            parser = LocalReferences()
            parser.feed(file.read_text(encoding="utf-8"))
            required.update((Path(name).parent / ref).as_posix() for ref in parser.paths)
        if file.name == "service-worker.js":
            # Dynamic YouTube injection and importScripts are also package dependencies.
            required.update(re.findall(r'"([a-zA-Z0-9_./-]+\.js)"', file.read_text(encoding="utf-8")))
    missing = sorted(required - paths)
    if missing:
        raise ValueError("Dependências fora da allowlist: " + ", ".join(missing))


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
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(project_root).parts)
        )

    validate_package(project_root, relative_paths, manifest)
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
        with ZipFile(temporary_path) as archive:
            invalid = archive.testzip()
            if invalid:
                raise ValueError(f"ZIP inválido: {invalid}")
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
