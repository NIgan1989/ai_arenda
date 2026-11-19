---
name: design-system
description: Единая система размеров и цветов веба и мобильного приложения, PR #8 от 2026-11-11, и как поднимать стенд для скриншотов
metadata:
  type: project
  modified: 2026-11-11T19:13:50.679Z
---

2026-11-11: проведён аудит дизайна и введена единая шкала. Источник `design/tokens.json`, из него `scripts/build-design-tokens.mjs` создаёт `app/tokens.css` и `mobile/src/tokens.ts`. `scripts/design-scale.mjs --check|--write` держит стили на шкале, тест `tests/design-tokens.test.mjs`. Отчёт: `docs/DESIGN_AUDIT_2026-11-11.md`. PR #8 (https://github.com/NIgan1989/ai_arenda/pull/8) слит в main 2026-11-11 (768dc29) по просьбе пользователя; main 768dc29 опубликован в Cloudflare 2026-11-11 (https://ai-arenda.ai-arenda-kz.workers.dev, версия воркера bc9af490) через Remote Control в папке «ай аренда»: первую попытку `node scripts/deploy-cloudflare.mjs` заблокировала защита (Production Deploy), повторная после явной просьбы пользователя прошла. Из облачной сессии сайт недоступен по сети, проверка делалась с компьютера пользователя. Скриншоты «до и после» лежат в `/mnt/project-files/design-audit/`.

Решения: акцент один, терракотовый `#9D452F` как у логотипа (мобильное приложение раньше было зелёным, это был дрейф, а не замысел); текст не мельче 12, поля 16, области нажатия от 44, отступы кратны 4. Не сделано: объединение старых слоёв CSS, тёмная тема, проверка на физическом телефоне.

**How to apply:** новые стили писать на токенах (`var(--t-…)` в вебе, `C`, `T`, `type` из `mobile/src/styles.ts` и `tokens.ts` в приложении), после правок запускать `node scripts/design-scale.mjs --check`.

Стенд для скриншотов в облачной сессии: `node scripts/start-browser-qa.mjs` (порт 5174), база пустая, поэтому сначала применить все `drizzle/*.sql` к sqlite в `outputs/browser-qa/state/v3/d1/miniflare-D1DatabaseObject/`, затем `seed-browser-qa.mjs`, `seed-kazakhstan-qa.mjs`, `seed-map-qa.mjs` с `--confirm-isolated`. Вход только со страницы того же origin (иначе 403), пароль учебных аккаунтов в `scripts/seed-browser-qa.mjs`; после нескольких входов срабатывает лимит, таблица `auth_attempt_limits`. Приложение: `npx expo start --web --port 8090` в `mobile/`, запросы к 5174 надо проксировать без заголовка Origin; Metro в песочнице не всегда подхватывает правки, помогает перезапуск с `--clear`. Плитки карты в песочнице не грузятся.
