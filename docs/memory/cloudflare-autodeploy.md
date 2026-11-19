---
name: cloudflare-autodeploy
description: Автопубликация main в Cloudflare через GitHub Actions работает с 2026-11-12 (PR #9 слит); как проверять публикацию и что умеет коннектор Cloudflare
metadata:
  type: project
  modified: 2026-11-11T19:52:17.651Z
---

Публикация: достаточно слить изменения в main. Сценарий `.github/workflows/deploy.yml` («Publish to Cloudflare») после успешных проверок собирает проект, находит аккаунт и базу D1 `ai-arenda` по токену (`scripts/resolve-cloudflare-ids.mjs`), применяет миграции, публикует Worker `ai-arenda` с `--keep-vars` (серверные секреты остаются в Cloudflare) и проверяет, что главная, вход и каталог отвечают 200. Описание в `deploy/CLOUDFLARE_FREE.md`.

Состояние: PR #9 слит 2026-11-12 00:49 (UTC+5), main = 7103a5b. Пользователь сам сохранил секрет репозитория `CLOUDFLARE_API_TOKEN`. Первая автопубликация прошла успешно: https://github.com/NIgan1989/ai_arenda/actions/runs/43090961675.

Коннектор «Cloudflare Developer Platform» (`mcp__Cloudflare_Developer_Platform__*`) подключён 2026-11-12. Читает Worker и их код, выполняет запросы к D1, работает с KV, R2, Hyperdrive. Публиковать Worker и создавать токены не умеет. Плагин Cloudflare и сайт workers.dev из облачной сессии недоступны по сети.

**Why:** пользователь раздражён ручными шагами («чат джипити сам все делал»): Codex работал на его компьютере с готовым входом wrangler, облачная сессия такого входа не имеет.

**How to apply:** после слияния смотреть запуск «Publish to Cloudflare» (GitHub MCP `actions_list`), для перепроверки `workers_list` (поле `modified_on`) и таблицу `d1_migrations` через коннектор. Повторить публикацию без коммита можно запуском сценария вручную. С компьютера пользователя публиковать только для смены серверных секретов. Не просить то, что можно узнать через коннектор или GitHub; никогда не просить токен в чат. См. [[design-system]], [[mobile-map-home]].
2026-11-13: моему доступу GitHub запрещены workflow_dispatch и rerun (403 Resource not accessible by integration) — перезапуск публикации делает пользователь кнопкой Re-run jobs. После правки токена (добавление R2) публикация run 43383399901 упала: «The API token does not give access to any Cloudflare account» (у токена должны быть Workers Scripts Edit, D1 Edit, Workers R2 Storage Edit, Account Settings Read и Account Resources = аккаунт).
2026-11-13: Workers не поддерживают fetch redirect:'error' (TypeError до отправки). Это ломало в проде Telegram, web-push, SMS, импорт календарей, маршруты, платёжный шлюз. PR #44 заменил на 'manual' + тест tests/workers-fetch-redirect.test.mjs. Диагностика прода: D1 читается коннектором Cloudflare (d1_database_query), сайт workers.dev из сессии недоступен.
