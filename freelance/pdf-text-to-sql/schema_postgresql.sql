-- PostgreSQL schema for PDF text import

CREATE TABLE IF NOT EXISTS pdf_text (
    id          BIGSERIAL PRIMARY KEY,
    file_name   VARCHAR(512) NOT NULL,
    page_number INTEGER      NOT NULL,
    text_block  TEXT         NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pdf_text_file_page ON pdf_text (file_name, page_number);

-- Tracks imported files so re-runs skip unchanged PDFs
CREATE TABLE IF NOT EXISTS pdf_import_log (
    file_name   VARCHAR(512) PRIMARY KEY,
    file_hash   CHAR(64)     NOT NULL,
    page_count  INTEGER      NOT NULL,
    row_count   INTEGER      NOT NULL,
    imported_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
