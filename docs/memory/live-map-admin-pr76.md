---
name: live-map-admin-pr76
description: Этап 5 «Админ» живой карты — PR #76 (2026-11-13): пульс, проблемы кольцами, соты нехватки жилья в админке сайта; слит и опубликован 2026-11-13 (main 4b45a0c)
metadata:
  type: project
---

2026-11-13 сделан этап 5 концепта [[live-map-concept]]: PR #76 https://github.com/NIgan1989/ai_arenda/pull/76 (ветка claude/project-thread-l5h1lm). Только сайт: Админка → Обзор → «Живая карта города» (components/admin-activity-map.tsx, слои в components/map-canvas.tsx, сервер lib/admin-map.ts через /api/admin/map). Режимы «Пульс» (вспышки событий, счётчики дня, лента с действиями ИИ), «Проблемы» (обращения, просроченные уборки и без исполнителя, решённые за 3 ч зелёным), «Нехватка» (соты 1 км, поиски за 14 дней без жилья, от 2 поисков).
Скриншоты: /mnt/project-files/live-map-admin/, страница https://claude.ai/artifact/SDAtoHZMSbgFDTJMGJYb6g. Статус: слит и опубликован 2026-11-13 (main 4b45a0c).

Стенд для веб-скриншотов карты без сети: в Playwright подменять стиль tiles.openfreemap.org на пустой фон и отдавать глифы, сгенерированные TinySDF (node_modules/@mapbox/tiny-sdf) в браузере; учебный админ qa-owner (+77000000001); при «лимите входов» чистить auth_attempt_limits. См. [[design-system]].
