---
name: guest-search-audit
description: Аудит поиска жилья для гостя (2026-11-17): этапы 1–4 (PR #125–#128) слиты; повторный аудит; этап 5 «Ничего не теряем» — PR #129 слит (main 657e283)
metadata:
  type: project
---

Отчёты (Claude Docs): первый аудит https://claude.ai/artifact/SxQk1ARE7yV4HUmdNmVXuJ, повторный https://claude.ai/artifact/NixssMW7WTVmsFtVchp1Lf. Снимки в /mnt/project-files/guest-search-audit/ (stage1…stage5, audit2).

Главное: строка на карте разбирает текст правилами (lib/map-search-request.ts, mobile/src/ai-request.ts); модель зовётся, только когда правила не поняли ничего (lib/search-understand.ts, POST operations/search/understand, нужны разрешение гостя и ключ OpenAI).

Слито 2026-11-17 (main 1b1f6bb, опубликовано):
- Этап 1, PR #125: тип жилья и комнаты (GuestDraft kinds/rooms), чужой город называется, бюджет «за сутки», новая фраза сбрасывает условия, причина пустой выдачи (emptyHint в lib/smart-matching.ts).
- Этап 2, PR #126: «Сейчас» (now: только готовое и мгновенное), тариф night, чипы в head-line.ts.
- Этап 3, PR #127: guest_favorites (миграция 0060, lib/favorites.ts), сердечко, «Ваше избранное» первым, «Снова туда же» (mobile/src/Favorites.tsx).
- Этап 4, PR #128: ИИ в строке, одна кнопка «Забронировать» (askFirst, prefer в фильтрах подбора).

Этап 5 «Ничего не теряем» — PR #129 (слит 2026-11-17, main 657e283; «без …» снимает пожелание): новая фраза без слова-уточнения сбрасывает и срок (сутки с сегодня; REFINE в ai-request.ts, уточнения: «а», «ещё», «с …», «без»); features ['pets'] = правило владельца details.pets; все удобства владельца в WISHES; UNSEARCHED (баня, отзывы, ориентир) называется гостю; emptyHint отдаёт blocker (kinds/rooms/district/features/near); «на месяц», «на новый год», «хочу снять», «студия или однушка».

Этап 6 — PR #131 слит 2026-11-17 (main 6d81047, перед слиянием ветка соединена с main после PR #130 «Баня»): statedPlace в парсере, POST operations/search/place (findPlace в lib/map-workspace.ts, Stadia + Nominatim, 40/час), near.label и nearPlace в ai-request.ts, pinPrice, ★ в shownReasons. Со стенда геопоиск недоступен: после слияния проверить «у вокзала» на опубликованном сервисе (обещано пользователю).

Осталось из повторного аудита: проверка ИИ в строке с настоящей моделью, «Сообщить, когда освободится», пометка «Постоянный гость», «⚡ сразу» на метке. На настоящем телефоне не проверено.

Ограничения: начало подбора не больше 42 запросов к базе (tests/smart-matching.test.mjs).

Стенд: сервер 5174 (scripts/start-browser-qa.mjs, фоновая задача живёт ограниченное время, перезапускать), прокси 5175, Expo 8090 перезапускать с --clear; expo меняет mobile/tsconfig.json, не коммитить. Новую миграцию применять к outputs/browser-qa/state/v3/d1/.../*.sqlite вручную (node:sqlite); детали жилья лежат в property_details.details. Данные: seed-demo.mjs, см. [[demo-recording-stand]], [[qa-stand]].
Настоящий геопоиск «у вокзала» НЕ проверен: из облачной сессии нет сети к Stadia, Nominatim и workers.dev; проверить может только пользователь в приложении (фраза «у вокзала» в Павлодаре).
