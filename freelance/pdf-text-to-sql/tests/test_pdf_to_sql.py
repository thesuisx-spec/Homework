"""End-to-end test: generate PDFs with known text, import them, check every line.

Run:  python -m pytest tests -q
Set TEST_PG_URL / TEST_MYSQL_URL to also test against real servers.
"""
import os
import sqlite3
import sys
from pathlib import Path

import pytest
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import pdf_to_sql  # noqa: E402

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# page -> lines; an empty list simulates a scanned (image-only) page
DOC_A = {
    1: ["Invoice 2026-001", "Customer: ACME Corp", "Total due: $1,250.00"],
    2: ["Terms and conditions apply.", "Payment within 30 days."],
}
DOC_B = {
    1: ["Отчёт за октябрь", "Ünïcödé — test “quotes” & symbols ½"],
    2: [],
    3: ["Last page, line one", "Last page, line two"],
}


def make_pdf(path: Path, pages: dict[int, list[str]]) -> None:
    font = "Helvetica"
    if Path(FONT_PATH).exists():
        pdfmetrics.registerFont(TTFont("DejaVu", FONT_PATH))
        font = "DejaVu"
    c = canvas.Canvas(str(path), pagesize=A4)
    for _, lines in sorted(pages.items()):
        y = 780
        c.setFont(font, 12)
        for line in lines:
            c.drawString(72, y, line)
            y -= 40  # wide spacing so each line stays a separate text line
        c.showPage()
    c.save()


@pytest.fixture
def pdf_dir(tmp_path):
    d = tmp_path / "pdfs"
    d.mkdir()
    make_pdf(d / "a.pdf", DOC_A)
    make_pdf(d / "b.pdf", DOC_B)
    return d


def db_urls(tmp_path):
    urls = [f"sqlite:///{tmp_path / 'test.db'}"]
    for env in ("TEST_PG_URL", "TEST_MYSQL_URL"):
        if os.environ.get(env):
            urls.append(os.environ[env])
    return urls


def fetch_rows(url):
    db = pdf_to_sql.Database(url)
    cur = db.conn.cursor()
    cur.execute("SELECT file_name, page_number, text_block FROM pdf_text ORDER BY file_name, page_number, id")
    rows = [tuple(r) for r in cur.fetchall()]
    db.close()
    return rows


def reset(url):
    db = pdf_to_sql.Database(url)
    cur = db.conn.cursor()
    for table in ("pdf_text", "pdf_import_log"):
        cur.execute(f"DROP TABLE IF EXISTS {table}")
    db.conn.commit()
    db.close()


def expected_rows():
    rows = []
    for name, doc in (("a.pdf", DOC_A), ("b.pdf", DOC_B)):
        for page, lines in sorted(doc.items()):
            rows += [(name, page, line) for line in lines]
    return rows


def test_every_line_imported_in_order(pdf_dir, tmp_path):
    for url in db_urls(tmp_path):
        reset(url)
        assert pdf_to_sql.main([str(pdf_dir), "--db", url]) == 0
        assert fetch_rows(url) == expected_rows(), url


def test_rerun_skips_unchanged_and_reimports_changed(pdf_dir, tmp_path, caplog):
    url = f"sqlite:///{tmp_path / 'rerun.db'}"
    assert pdf_to_sql.main([str(pdf_dir), "--db", url]) == 0
    assert pdf_to_sql.main([str(pdf_dir), "--db", url]) == 0
    assert fetch_rows(url) == expected_rows()  # no duplicates

    make_pdf(pdf_dir / "a.pdf", {1: ["Replaced content"]})
    caplog.clear()
    with caplog.at_level("INFO"):
        assert pdf_to_sql.main([str(pdf_dir), "--db", url]) == 0
    assert "SKIP   b.pdf" in caplog.text
    rows = fetch_rows(url)
    assert [r for r in rows if r[0] == "a.pdf"] == [("a.pdf", 1, "Replaced content")]


def test_empty_page_is_reported(pdf_dir, tmp_path, caplog):
    url = f"sqlite:///{tmp_path / 'scan.db'}"
    with caplog.at_level("WARNING"):
        pdf_to_sql.main([str(pdf_dir), "--db", url])
    assert "b.pdf: no text on page(s) 2" in caplog.text


def test_page_granularity(pdf_dir, tmp_path):
    url = f"sqlite:///{tmp_path / 'page.db'}"
    assert pdf_to_sql.main([str(pdf_dir), "--db", url, "--granularity", "page"]) == 0
    conn = sqlite3.connect(tmp_path / "page.db")
    rows = conn.execute("SELECT page_number, text_block FROM pdf_text WHERE file_name='b.pdf' ORDER BY id").fetchall()
    assert rows == [(1, "\n".join(DOC_B[1])), (3, "\n".join(DOC_B[3]))]


def test_same_name_in_subfolders_kept_apart(tmp_path):
    root = tmp_path / "in"
    (root / "x").mkdir(parents=True)
    (root / "y").mkdir()
    make_pdf(root / "x" / "doc.pdf", {1: ["from x"]})
    make_pdf(root / "y" / "doc.pdf", {1: ["from y"]})
    url = f"sqlite:///{tmp_path / 'sub.db'}"
    assert pdf_to_sql.main([str(root), "--db", url]) == 0
    assert fetch_rows(url) == [("x/doc.pdf", 1, "from x"), ("y/doc.pdf", 1, "from y")]
