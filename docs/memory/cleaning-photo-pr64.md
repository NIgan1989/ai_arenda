---
name: cleaning-photo-pr64
description: PR #64 (2026-11-13): фото уборки с iPhone падало «Не удалось уменьшить фото»; надёжное сжатие и упрощённый отчёт об уборке
metadata:
  type: project
  modified: 2026-11-13T12:03:53.998Z
---

2026-11-13 пользователь не мог загрузить фото уборки с камеры iPhone (сайт): «Не удалось уменьшить фото». Причина: `preparePhoto` в `components/media.tsx` пробовал только 1600 px, а JPEG не влезал в лимит 475 000 символов base64 (на сервере 360 КБ и 1600 px в `lib/listings.ts` jpegInput). Вероятно, это защита холста в Safari (шум при чтении) или шумный кадр. Исправлено в PR #64 https://github.com/NIgan1989/ai_arenda/pull/64, ветка claude/project-thread-5rnkt9: размеры 1600→640, createImageBitmap с resize или уменьшение по шагам, HEIC, предел файла 60 МБ. То же ступенчатое уменьшение в `mobile/src/ListingMedia.tsx`.

В том же PR по просьбе пользователя упрощена карточка «Отчёт об уборке» (`components/cleaning-report.tsx/.css`, `job-operations.tsx`, `job-evidence.css`): плитки «До/После» открывают системное меню камеры и галереи, есть плашка «Замечание», шкала из трёх шагов и круглые отметки в чек-листе. Скриншоты лежат в /mnt/project-files/cleaning-report/. Слит по «сливай» 2026-11-13 (main 6b521e1) и опубликован (run 43424488133 успешно). На настоящем iPhone не проверено.

Стенд: уборку qa-cleaner переводят в in_progress так: сначала `booking_id=null` (иначе триггер checkout_required), потом `status='in_progress'`. Затем /workspace/cleaner/assignments → карточка → «Отправить отчёт». См. [[design-system]].

