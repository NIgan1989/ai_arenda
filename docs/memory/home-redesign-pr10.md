---
name: home-redesign-pr10
description: PR #10 (2026-11-12): карта «как в такси» с одной строкой ИИ на сайте и в приложении, сборка Android APK; что проверено и что нет
metadata:
  type: project
---

PR #10 https://github.com/NIgan1989/ai_arenda/pull/10, ветка claude/project-thread-sjtqme, коммит 32ff115, открыт и слит 2026-11-12 по просьбе пользователя («сливай»), main = b1abae6. Публикация в Cloudflare прошла (Worker изменён 06:21 UTC), APK опубликован в релизе android-latest. Реализует [[home-screen-direction]].

Что внутри: общие блоки components/ai-line.tsx, components/now-card.tsx, lib/now-card.ts, components/map-home.css; разбор свободного текста гостя по правилам в lib/map-search-request.ts (его же использует приложение); ответы AI администратора на подсказанные вопросы из данных аккаунта без модели (lib/administrator-process-read.ts); `.github/workflows/android.yml` собирает тестовый APK и публикует его в релиз `android-latest` только из main (docs/ANDROID_BUILD.md). Передача вопроса ассистенту по ссылке `?ask=` запрещена, используется sessionStorage.

Проверено локально: tsc, 316 тестов сайта, 72 теста приложения, производственная сборка, экраны на стенде. Не проверено: приложение на реальном телефоне, клавиатура Android, первая сборка APK в CI, повторный независимый проход после исправлений.

**How to apply:** длинные многоагентные прогоны упираются в 5-часовой лимит использования и обрываются; пользователь недоволен ожиданием, крупную работу лучше делить на небольшие PR. Скриншоты лежат в /mnt/project-files/home-redesign/.
