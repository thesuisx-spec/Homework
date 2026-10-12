#!/usr/bin/env python3
"""Extract text from text-based PDFs into a single SQL table.

Table layout (see schema_postgresql.sql / schema_mysql.sql):
    pdf_text(id, file_name, page_number, text_block)

Each row holds one line of text (default) or one whole page (--granularity page).
Row order within a file is preserved by `id`, so
    SELECT text_block FROM pdf_text WHERE file_name = ? ORDER BY page_number, id
reproduces the document.

Re-running is safe: files already imported (same SHA-256) are skipped; a file
whose content changed is re-imported and its old rows are replaced.

Usage:
    python pdf_to_sql.py ./pdfs --db postgresql://user:pass@localhost/dbname
    python pdf_to_sql.py ./pdfs --db mysql://user:pass@localhost/dbname
    python pdf_to_sql.py ./pdfs --db sqlite:///pdf_text.db
"""
from __future__ import annotations

import argparse
import hashlib
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlparse

from pdfminer.high_level import extract_pages
from pdfminer.layout import LAParams, LTTextContainer, LTTextLine

log = logging.getLogger("pdf_to_sql")

SCHEMA_DIR = Path(__file__).resolve().parent


# --------------------------------------------------------------------------- #
# Extraction
# --------------------------------------------------------------------------- #

@dataclass
class PageText:
    page_number: int        # 1-based
    blocks: list[str]       # lines or a single page block
    char_count: int         # non-whitespace characters extracted from the page


def _clean(text: str) -> str:
    # PostgreSQL rejects NUL bytes in text columns; some PDFs contain them.
    return text.replace("\x00", "").rstrip()


def _non_ws_len(text: str) -> int:
    return sum(1 for c in text if not c.isspace())


def extract_pdf(path: Path, granularity: str) -> list[PageText]:
    pages: list[PageText] = []
    laparams = LAParams()
    for page_number, layout in enumerate(extract_pages(str(path), laparams=laparams), start=1):
        lines: list[str] = []
        for element in layout:
            if not isinstance(element, LTTextContainer):
                continue
            for item in element:
                text = item.get_text() if isinstance(item, LTTextLine) else ""
                text = _clean(text)
                if text.strip():
                    lines.append(text)
        char_count = sum(_non_ws_len(line) for line in lines)
        if granularity == "page":
            blocks = ["\n".join(lines)] if lines else []
        else:
            blocks = lines
        pages.append(PageText(page_number, blocks, char_count))
    return pages


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #

class Database:
    """Thin wrapper over DB-API drivers for PostgreSQL, MySQL and SQLite."""

    def __init__(self, url: str):
        parsed = urlparse(url)
        scheme = parsed.scheme.split("+")[0]
        if scheme in ("postgresql", "postgres"):
            import psycopg
            self.kind = "postgresql"
            self.conn = psycopg.connect(url.replace("postgres://", "postgresql://", 1))
            self.ph = "%s"
        elif scheme == "mysql":
            import pymysql
            self.kind = "mysql"
            self.conn = pymysql.connect(
                host=parsed.hostname or "localhost",
                port=parsed.port or 3306,
                user=unquote(parsed.username or ""),
                password=unquote(parsed.password or ""),
                database=parsed.path.lstrip("/"),
                charset="utf8mb4",
            )
            self.ph = "%s"
        elif scheme == "sqlite":
            import sqlite3
            self.kind = "sqlite"
            self.conn = sqlite3.connect(url[len("sqlite:///"):] or ":memory:")
            self.ph = "?"
        else:
            raise SystemExit(f"Unsupported database URL scheme: {parsed.scheme!r}")

    def create_schema(self) -> None:
        schema_file = {"postgresql": "schema_postgresql.sql",
                       "mysql": "schema_mysql.sql",
                       "sqlite": "schema_sqlite.sql"}[self.kind]
        sql = (SCHEMA_DIR / schema_file).read_text(encoding="utf-8")
        cur = self.conn.cursor()
        for statement in (s.strip() for s in sql.split(";")):
            if statement and not all(l.strip().startswith("--") for l in statement.splitlines()):
                cur.execute(statement)
        self.conn.commit()

    def q(self, sql: str) -> str:
        return sql.replace("?", self.ph)

    def imported_hash(self, file_name: str) -> str | None:
        cur = self.conn.cursor()
        cur.execute(self.q("SELECT file_hash FROM pdf_import_log WHERE file_name = ?"), (file_name,))
        row = cur.fetchone()
        return row[0] if row else None

    def replace_file(self, file_name: str, file_hash: str, pages: list[PageText]) -> int:
        """Delete old rows for the file and insert new ones in one transaction."""
        rows = [(file_name, p.page_number, block) for p in pages for block in p.blocks]
        cur = self.conn.cursor()
        try:
            cur.execute(self.q("DELETE FROM pdf_text WHERE file_name = ?"), (file_name,))
            cur.execute(self.q("DELETE FROM pdf_import_log WHERE file_name = ?"), (file_name,))
            if rows:
                cur.executemany(
                    self.q("INSERT INTO pdf_text (file_name, page_number, text_block) VALUES (?, ?, ?)"),
                    rows,
                )
            cur.execute(
                self.q("INSERT INTO pdf_import_log (file_name, file_hash, page_count, row_count) "
                       "VALUES (?, ?, ?, ?)"),
                (file_name, file_hash, len(pages), len(rows)),
            )
            self.conn.commit()
        except Exception:
            self.conn.rollback()
            raise
        return len(rows)

    def stored_char_counts(self, file_name: str) -> dict[int, int]:
        cur = self.conn.cursor()
        cur.execute(self.q("SELECT page_number, text_block FROM pdf_text WHERE file_name = ?"), (file_name,))
        counts: dict[int, int] = {}
        for page_number, text in cur.fetchall():
            counts[page_number] = counts.get(page_number, 0) + _non_ws_len(text)
        return counts

    def close(self) -> None:
        self.conn.close()


# --------------------------------------------------------------------------- #
# Main flow
# --------------------------------------------------------------------------- #

def verify(db: Database, file_name: str, pages: list[PageText]) -> list[str]:
    """Check that every extracted character made it into the database."""
    problems = []
    stored = db.stored_char_counts(file_name)
    for p in pages:
        got = stored.get(p.page_number, 0)
        if got != p.char_count:
            problems.append(f"page {p.page_number}: extracted {p.char_count} chars, stored {got}")
    return problems


def collect_pdfs(inputs: list[Path]) -> list[tuple[Path, str]]:
    """Return (path, file_name) pairs; file_name is relative to the input folder,
    so same-named PDFs in different subfolders do not overwrite each other."""
    files: list[tuple[Path, str]] = []
    for item in inputs:
        if item.is_dir():
            found = sorted(p for p in item.rglob("*") if p.suffix.lower() == ".pdf")
            files.extend((p, p.relative_to(item).as_posix()) for p in found)
        elif item.is_file():
            files.append((item, item.name))
        else:
            log.warning("Not found: %s", item)
    return files


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Import text from PDF files into an SQL table.")
    ap.add_argument("inputs", nargs="+", type=Path, help="PDF files and/or folders (searched recursively)")
    ap.add_argument("--db", required=True,
                    help="postgresql://user:pass@host/db | mysql://user:pass@host/db | sqlite:///file.db")
    ap.add_argument("--granularity", choices=["line", "page"], default="line",
                    help="one row per text line (default) or per page")
    ap.add_argument("--force", action="store_true", help="re-import files even if unchanged")
    ap.add_argument("--no-create", action="store_true", help="do not run CREATE TABLE IF NOT EXISTS")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(levelname)s %(message)s")
    logging.getLogger("pdfminer").setLevel(logging.WARNING)

    files = collect_pdfs(args.inputs)
    if not files:
        log.error("No PDF files found.")
        return 1

    db = Database(args.db)
    if not args.no_create:
        db.create_schema()

    imported = skipped = failed = 0
    for path, file_name in files:
        try:
            file_hash = sha256_of(path)
            if not args.force and db.imported_hash(file_name) == file_hash:
                log.info("SKIP   %s (already imported, unchanged)", file_name)
                skipped += 1
                continue

            pages = extract_pdf(path, args.granularity)
            row_count = db.replace_file(file_name, file_hash, pages)

            empty = [p.page_number for p in pages if p.char_count == 0]
            if empty:
                log.warning("       %s: no text on page(s) %s (scanned image? needs OCR)",
                            file_name, ", ".join(map(str, empty)))

            problems = verify(db, file_name, pages)
            if problems:
                failed += 1
                log.error("VERIFY %s: %s", file_name, "; ".join(problems))
            else:
                imported += 1
                total_chars = sum(p.char_count for p in pages)
                log.info("OK     %s: %d pages, %d rows, %d chars verified",
                         file_name, len(pages), row_count, total_chars)
        except Exception as exc:  # keep going with other files
            failed += 1
            log.error("FAIL   %s: %s", file_name, exc)

    db.close()
    log.info("Done: %d imported, %d skipped, %d failed", imported, skipped, failed)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
