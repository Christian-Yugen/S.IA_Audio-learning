from __future__ import annotations

import json
import sys
from urllib.request import Request, urlopen


def main() -> None:
    tag = sys.argv[1] if len(sys.argv) > 1 else "v1.13.6"
    url = f"https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/{tag}"
    request = Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "sia-build-inspection",
        },
    )
    with urlopen(request, timeout=30) as response:
        release = json.load(response)

    print(f"tag={release.get('tag_name')}")
    print(f"published_at={release.get('published_at')}")
    for asset in release.get("assets", []):
        name = asset.get("name", "")
        if any(token in name.lower() for token in ("wasm", "tts", "piper", "onnx")):
            print(
                f"{name}\t{asset.get('size')}\t{asset.get('browser_download_url')}"
            )


if __name__ == "__main__":
    main()
