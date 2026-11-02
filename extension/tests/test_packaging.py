"""Exercise the real release packager, including rejection of incomplete allowlists."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

EXTENSION = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("sia_packager", EXTENSION / "scripts/package-extension.py")
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


class PackagingTests(unittest.TestCase):
    def test_archive_extracts_with_all_manifest_html_and_runtime_dependencies(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            archive_path = packager.package_extension(output)
            with ZipFile(archive_path) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(len(archive.namelist()), len(set(archive.namelist())))
                archive.extractall(output / "extracted")
                names = set(archive.namelist())
                manifest = json.loads(archive.read("manifest.json"))
                self.assertEqual(manifest["version"], json.loads((EXTENSION / "manifest.json").read_text())["version"])
                self.assertTrue({"audio-settings.js", "learning/neuro-director.js", "translation/translation-engine.js"} <= names)
                self.assertFalse(any(name.startswith(("tests/", "scripts/", "platform-adapters/test/")) for name in names))
                self.assertFalse(any(part.startswith(".") for name in names for part in Path(name).parts))
                packager.validate_package(output / "extracted", names, manifest)
                for name in names:
                    self.assertEqual((output / "extracted" / name).read_bytes(), (EXTENSION / name).read_bytes(), name)

    def test_rejects_missing_director_translation_and_shared_settings(self):
        manifest = json.loads((EXTENSION / "manifest.json").read_text())
        names = set(packager.FILES)
        for directory in packager.DIRECTORIES:
            names.update(file.relative_to(EXTENSION).as_posix() for file in (EXTENSION / directory).rglob("*") if file.is_file())
        for dependency in ("learning/neuro-director.js", "translation/translation-engine.js", "audio-settings.js", "platform-adapters/ai-guru/ai-guru-adapter.js", "platform-adapters/ai-guru/ai-guru-host.js"):
            with self.subTest(dependency=dependency):
                with self.assertRaisesRegex(ValueError, dependency):
                    packager.validate_package(EXTENSION, names - {dependency}, manifest)

    def test_scripts_share_one_allowlist(self):
        config_path = EXTENSION / "scripts/package-files.json"
        config = json.loads(config_path.read_text())
        self.assertEqual(list(packager.FILES), config["files"])
        self.assertIn('"package-files.json"', (EXTENSION / "scripts/package-extension.ps1").read_text())


if __name__ == "__main__":
    unittest.main(verbosity=2)
