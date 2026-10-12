# PDF Text → SQL

Extracts all text from text-based PDF files and stores it in one SQL table:

| column        | type    | meaning                                  |
|---------------|---------|------------------------------------------|
| `id`          | bigint  | auto-increment; preserves reading order  |
| `file_name`   | varchar | PDF name (relative path inside the input folder) |
| `page_number` | int     | 1-based page number                      |
| `text_block`  | text    | one line of text (or one page, see below) |

Works with **PostgreSQL** and **MySQL/MariaDB** (SQLite is supported for quick local tests).

## Setup

```bash
python -m pip install -r requirements.txt
```

Python 3.9+ is required.

## Create the table

The script creates the tables automatically (`CREATE TABLE IF NOT EXISTS`).
If you prefer to create them yourself, run the SQL file and pass `--no-create`:

```bash
psql  -d mydb -f schema_postgresql.sql
mysql mydb    <  schema_mysql.sql
```

## Run

```bash
# PostgreSQL
python pdf_to_sql.py ./pdfs --db postgresql://user:password@localhost:5432/mydb

# MySQL / MariaDB
python pdf_to_sql.py ./pdfs --db mysql://user:password@localhost:3306/mydb
```

You can pass folders (searched recursively) and/or individual files.

Example output:

```
INFO OK     invoice.pdf: 2 pages, 5 rows, 94 chars verified
WARNING        report.pdf: no text on page(s) 2 (scanned image? needs OCR)
INFO OK     report.pdf: 3 pages, 4 rows, 75 chars verified
INFO Done: 2 imported, 0 skipped, 0 failed
```

The exit code is `0` on success and `1` if any file failed, so the script can be used in cron or CI.

## Adding new PDFs later

Drop new files into the folder and run the **same command** again.

- Files already imported and unchanged are skipped (tracked by SHA-256 in `pdf_import_log`).
- A file whose content changed is re-imported; its old rows are replaced in a single transaction, so there are never duplicates or half-imported files.
- `--force` re-imports everything.

## Accuracy checks

After each file is written, the script reads the rows back from the database and compares
the number of non-whitespace characters per page with what was extracted from the PDF.
Any mismatch is reported as `VERIFY` error and the run exits with code 1.

Pages with no extractable text are reported — this usually means the page is a scanned image
and needs OCR (not part of this tool).

## Options

| option | description |
|---|---|
| `--granularity line` | (default) one row per text line |
| `--granularity page` | one row per page, lines joined with `\n` |
| `--force` | re-import files even if unchanged |
| `--no-create` | do not run `CREATE TABLE IF NOT EXISTS` |
| `-v` | verbose logging |

## Example queries

```sql
-- Full text of a document in reading order
SELECT text_block FROM pdf_text
WHERE file_name = 'invoice.pdf'
ORDER BY page_number, id;

-- Find which files/pages mention a word
SELECT file_name, page_number, text_block FROM pdf_text
WHERE text_block ILIKE '%invoice%';      -- use LIKE in MySQL
```

## Tests

```bash
python -m pip install pytest reportlab
python -m pytest tests -q
# optionally against real servers:
TEST_PG_URL=postgresql://... TEST_MYSQL_URL=mysql://... python -m pytest tests -q
```

The tests generate PDFs with known content (including Cyrillic and Unicode symbols, an empty page,
same-named files in subfolders) and assert that every line lands in the table, in order.
