---
name: photo-zoom-pr61
description: PR #61 (2026-11-13): кнопка «Открыть фотографии» на карточке квартиры падала; исправлено, слито и опубликовано
metadata:
  type: project
  modified: 2026-11-13T10:41:12.322Z
---

2026-11-13: на карточке квартиры (сайт) кнопка «Открыть фотографии» роняла страницу: `Cannot read properties of undefined (reading 'root')`. Причина в `components/photo-viewer.tsx`: в yet-another-react-lightbox передавался `portal={undefined}`, а явный undefined затирает настройку по умолчанию. Исправлено в PR #61 https://github.com/NIgan1989/ai_arenda/pull/61 (ветка claude/project-thread-couj23): портал передаётся только если задан, для одного фото скрыты стрелки, добавлен тест tests/photo-viewer.test.mjs. Скриншоты лежат в /mnt/project-files/photo-zoom/. Слит 2026-11-13 (main 967b6a5) и опубликован (run 43411875433 успешно).

Совет для стенда: у учебных объявлений (описание начинается со «СИНТЕТИЧЕСКОЕ ОБЪЯВЛЕНИЕ») галерея не показывается. Для проверки фото нужно убрать этот префикс у одной квартиры в QA-базе, а фото лежат в `property_details.photos` и `media`. См. [[design-system]].
