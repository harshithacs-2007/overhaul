# OVERHAUL local data layout

The application code is versioned in Git. Raw and processed datasets stay outside GitHub and are intentionally ignored.

Recommended local layout:

```text
Dataset/
├── climate/
├── buildings/
├── hvac/
├── equipment/
├── retrofit/
├── materials/
├── 3d/
└── unknown/
```

For the eventual ingestion workspace, copy or link the locally organized datasets into:

```text
/data/raw/<domain>/
/data/processed/<domain>/
```

Keep original ZIP archives. Extract a working copy only when an adapter needs the contents.

Do not commit dataset binaries, parquet/CSV dumps, model weights, or generated training outputs to this repository.

Dataset manifests belong under `data/manifests/` and contain metadata only: source, domain, file format, units, time coverage, provenance, license, and adapter information.
