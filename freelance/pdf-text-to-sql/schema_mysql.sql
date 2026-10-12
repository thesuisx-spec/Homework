-- MySQL / MariaDB schema for PDF text import

CREATE TABLE IF NOT EXISTS pdf_text (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    file_name   VARCHAR(512) NOT NULL,
    page_number INT          NOT NULL,
    text_block  MEDIUMTEXT   NOT NULL,
    INDEX idx_pdf_text_file_page (file_name(191), page_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tracks imported files so re-runs skip unchanged PDFs
CREATE TABLE IF NOT EXISTS pdf_import_log (
    file_name   VARCHAR(191) PRIMARY KEY,
    file_hash   CHAR(64)     NOT NULL,
    page_count  INT          NOT NULL,
    row_count   INT          NOT NULL,
    imported_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
