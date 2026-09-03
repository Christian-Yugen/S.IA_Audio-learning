#!/usr/bin/env python3
"""Obtém metadados de um arquivo do Wikimedia Commons."""

from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("title")
    args = parser.parse_args()
    query = urllib.parse.urlencode({
        "action": "query",
        "format": "json",
        "titles": args.title,
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
    })
    request = urllib.request.Request(
        "https://commons.wikimedia.org/w/api.php?" + query,
        headers={"User-Agent": "SIA-audio-separation-lab/0.1 (local experiment)"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.load(response)
    page = next(iter(data["query"]["pages"].values()))
    if "imageinfo" not in page:
        raise SystemExit(f"arquivo não localizado: {args.title}")
    info = page["imageinfo"][0]
    metadata = info.get("extmetadata", {})
    result = {
        "title": page.get("title"),
        "url": info.get("url"),
        "mime": info.get("mime"),
        "size": info.get("size"),
        "license": metadata.get("LicenseShortName", {}).get("value"),
        "credit": metadata.get("Credit", {}).get("value"),
        "description": metadata.get("ImageDescription", {}).get("value"),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
