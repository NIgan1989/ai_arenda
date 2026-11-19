---
name: map-memory-pr78
description: PR #78 (2026-11-13): живая карта перенесена на сайт + «На карте», память карты и волны в приложении; слит и опубликован 2026-11-13 (main 887ef5f)
metadata:
  type: project
---

После концепта [[live-map-concept]] пользователь согласился на связку карты со страницами. PR #78 https://github.com/NIgan1989/ai_arenda/pull/78 (ветка claude/project-thread-l5h1lm), только мобильное приложение:
- mobile/src/map-memory.ts: память карты по аккаунту и роли на 30 минут (вид, выбранная метка, ответ map/search, состояния меток); restoreStep, withEchoes, targetPin.
- «На карте» (MapLink в RecordCard.tsx) в карточках брони, уборки и объекта и в строке темы чата; App.tsx mapTarget → MapHome target.
- Pin с was отзывается двумя волнами акцента (MapPins, ECHO_DELAY 450 мс).
Скриншоты /mnt/project-files/map-memory/, страница https://claude.ai/artifact/4b128GxT2PgxgsYbHykwHL. Статус: слит и опубликован 2026-11-13 (main 887ef5f, Publish to Cloudflare, iOS-сборка 188 и Android зелёные).
Пользователь пользуется сайтом с иконки на айфоне и выбрал перенос живой карты на сайт; сделано в том же PR #78 (коммит cb31899):
- components/map-pills.tsx/.css (таблетки и анимации поверх MapLibre), lib/map-pin-of.ts; сайт импортирует чистые модули из mobile/src.
- Вкладки нижнего меню сайта — обычные <a>, полная перезагрузка, поэтому map-memory пишет и в sessionStorage (без data).
- Скриншоты /mnt/project-files/live-map-site/, страница https://claude.ai/artifact/2GAPhc3gxAbgpL3z5c37a7.
- Гость на сайте без поиска не видит объектов на карте (метки только после подбора) — так было и раньше.
Заметка: expo web в песочнице не пересобирает бандл при правке файлов, перезапускать с --clear.

CI: сайт импортирует mobile/src, поэтому mobile/tsconfig.json не должен ссылаться на expo/tsconfig.base (mobile/node_modules нет в проверке сайта) — настройки записаны целиком.
