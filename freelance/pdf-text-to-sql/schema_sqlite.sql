-- SQLite schema (for local testing without a database server)

CREATE TABLE IF NOT EXISTS pdf_text (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name   TEXT    NOT NULL,
    page_number INTEGER NOT NULL,
    text_block  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pdf_text_file_page ON pdf_text (file_name, page_number);

CREATE TABLE IF NOT EXISTS pdf_import_log (
    file_name   TEXT PRIMARY KEY,
    file_hash   TEXT    NOT NULL,
    page_count  INTEGER NOT NULL,
    row_count   INTEGER NOT NULL,
    imported_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
