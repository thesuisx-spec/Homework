# Отклик на заказ «PDF Text Extraction to SQL»

Ссылка: https://www.freelancer.com/projects/pdf/pdf-text-extraction-sql

## Что поставить в форме отклика

| Поле | Значение |
|---|---|
| Bid amount | **₹15 000** (заказчик указал ₹12 500–37 500, средняя ставка ~₹19 000) |
| Delivery | **2 days** |
| Milestone | одна вехa на всю сумму: заказчик резервирует деньги, вы сдаёте работу |

## Текст отклика (скопировать как есть, ~1 200 символов)

```
Hi! I've already built a working version of exactly this, so I can deliver fast.

What you get:
- Python script that walks a folder of PDFs and writes every line into pdf_text (id, file_name, page_number, text_block), keeping reading order
- SQL files for both PostgreSQL and MySQL
- README with setup and re-run instructions

Accuracy (your main requirement):
- After each file is loaded, the script reads the rows back and compares character counts per page with the PDF, so nothing is silently lost
- Pages with no extractable text are flagged (usually scanned images needing OCR)

Re-runs are safe: files are tracked by SHA-256, so unchanged PDFs are skipped, changed ones are replaced in one transaction, no duplicates.

Tested end-to-end on PostgreSQL with automated tests (multi-page docs, Unicode, empty pages).

Quick questions:
1. MySQL or PostgreSQL in your setup?
2. Roughly how many PDFs/pages?
3. One row per line or per page - which suits your queries better? (both supported)

Happy to share a screenshot of a test run. Can start immediately.
```

## Если заказчик ответит — что делать

1. **Ответить на вопросы** и попросить 1–2 реальных PDF, чтобы проверить их до сдачи. Присылайте их мне — прогоню и скажу, всё ли извлекается (особенно таблицы, колонки, сканы).
2. **Не отправлять код до того, как заказчик создал milestone** (зарезервировал оплату). Скриншот вывода — можно.
3. **Сдача:** архив папки `pdf-text-to-sql` (без папки `tests`, если не просит) + короткое сообщение:

```
Done! Attached: pdf_to_sql.py, schema_postgresql.sql, schema_mysql.sql, requirements.txt, README.md.
Run: pip install -r requirements.txt, then
python pdf_to_sql.py ./pdfs --db postgresql://user:pass@host/db
I tested it on your sample files - all pages verified. Let me know if you'd like any changes.
```

4. После оплаты — попросить отзыв: это главное для следующих заказов.

## Перевод отклика (для вас)

> Привет! У меня уже есть рабочая версия именно этого, поэтому сдам быстро.
> Вы получите: скрипт на Python, который проходит по папке PDF и записывает каждую строку в pdf_text с сохранением порядка; SQL-файлы для PostgreSQL и MySQL; README с установкой и инструкцией повторного запуска.
> Точность: после загрузки файла скрипт перечитывает строки из базы и сверяет число символов на каждой странице с PDF. Страницы без текста (сканы) помечаются.
> Повторный запуск безопасен: неизменённые файлы пропускаются, изменённые заменяются в одной транзакции, без дублей.
> Протестировано на PostgreSQL автотестами.
> Вопросы: 1) MySQL или PostgreSQL? 2) Сколько примерно PDF/страниц? 3) Строка на линию или на страницу?
