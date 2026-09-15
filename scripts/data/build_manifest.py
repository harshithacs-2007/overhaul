#!/usr/bin/env python3
"""Create a metadata-only inventory for an OVERHAUL local Dataset folder.

This script never copies dataset bytes into Git and never extracts archives unless
--inspect-zips is explicitly requested. It is intended for local/offline use.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path
from typing import Any

DOMAIN_HINTS = {
    "climate": ("climate", "power", "weather", "temperature", "design"),
    "hvac": ("rtu", "ahu", "ddahu", "sdahu", "fcu", "chiller", "boiler", "hvac"),
    "buildings": ("rescast", "house", "building", "energy"),
    "retrofit": ("remdb", "retrofit"),
    "materials": ("material", "embodied", "carbon"),
    "3d": ("structured3d", "objaverse", "lvis", "3d", "object-paths"),
}

EXTENSIONS = {
    ".csv": "csv",
    ".xlsx": "xlsx",
    ".parquet": "parquet",
    ".nc": "netcdf",
    ".json": "json",
    ".jsonl": "jsonl",
    ".zip": "zip",
    ".pdf": "pdf",
}


def infer_domain(name: str) -> str:
    lower = name.lower()
    for domain, hints in DOMAIN_HINTS.items():
        if any(hint in lower for hint in hints):
            return domain
    return "unknown"


def sha256(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def zip_summary(path: Path) -> dict[str, Any]:
    try:
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
            files = [m for m in members if not m.is_dir()]
            return {
                "valid": True,
                "fileCount": len(files),
                "totalUncompressedBytes": sum(m.file_size for m in files),
                "extensions": sorted({Path(m.filename).suffix.lower() or "<none>" for m in files}),
            }
    except zipfile.BadZipFile:
        return {"valid": False, "error": "bad-zip"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_root", type=Path)
    parser.add_argument("--output", type=Path, default=Path("data/manifests/local-generated-inventory.json"))
    parser.add_argument("--inspect-zips", action="store_true")
    args = parser.parse_args()

    root = args.dataset_root.resolve()
    if not root.is_dir():
        raise SystemExit(f"Dataset directory not found: {root}")

    entries: list[dict[str, Any]] = []
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        if path.name.endswith(".crdownload"):
            continue
        relative = path.relative_to(root).as_posix()
        suffix = path.suffix.lower()
        entry: dict[str, Any] = {
            "id": path.stem.lower().replace(" ", "-").replace("_", "-"),
            "name": path.name,
            "relativePath": relative,
            "domain": infer_domain(relative),
            "format": EXTENSIONS.get(suffix, "other"),
            "sizeBytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        if suffix == ".zip" and args.inspect_zips:
            entry["archive"] = zip_summary(path)
        entries.append(entry)

    payload = {
        "version": 1,
        "root": str(root),
        "generatedBy": "scripts/data/build_manifest.py",
        "datasets": entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {len(entries)} dataset records to {args.output}")


if __name__ == "__main__":
    main()
