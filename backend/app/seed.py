"""Seed the database from the bundled dataset.

Run with:  python -m app.seed   (from the backend/ directory)

Re-runnable: ingestion upserts by question_id, so seeding twice is safe.
"""
from __future__ import annotations

import sys
from pathlib import Path

from .config import settings
from .database import SessionLocal, init_db
from .ingestion import ingest, parse_file


def main(seed_path: str | None = None) -> None:
    path = Path(seed_path or settings.seed_file)
    if not path.exists():
        print(f"[seed] dataset not found: {path}", file=sys.stderr)
        sys.exit(1)

    init_db()
    content = path.read_bytes()
    raw = parse_file(path.name, content)

    db = SessionLocal()
    try:
        report = ingest(db, raw, shuffle=settings.shuffle_options_on_ingest)
    finally:
        db.close()

    print(f"[seed] source: {path}")
    print(
        f"[seed] received={report.received} inserted={report.inserted} "
        f"updated={report.updated} duplicates={report.duplicates} skipped={report.skipped}"
    )
    if report.errors:
        print(f"[seed] {len(report.errors)} validation issue(s):")
        for e in report.errors[:20]:
            print(f"        - {e}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
