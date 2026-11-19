---
name: map-motion-pr14
description: PR #14 (2026-11-12): анимация всех событий на карте в мобильном приложении; сайт не сделан; как снималось превью
metadata:
  type: project
  modified: 2026-11-12T18:09:51.188Z
---

2026-11-12 пользователь попросил «проработать анимацию в карте по всем вариантам событий» (страница профиля шла в соседнем треде). Сделано только для мобильного приложения: PR #14 https://github.com/NIgan1989/ai_arenda/pull/14, ветка claude/project-thread-5abjtg, слит по «сливай» 2026-11-12 (main 709a4a9); публикация в Cloudflare (run 43278056838), Android APK и сборка iPhone прошли. До слияния исправлены 2 замечания Codex (зависшие исчезающие метки; дальний перелёт камеры ограничен одной плиткой). Логика в mobile/src/map-motion.ts (pinEvent, перелёт камеры), анимации в mobile/src/TileMap.tsx, новые тоны меток booked/active, проп scanning (радар). Список событий: docs/MAP_MOTION.md (тест сверяет его с MAP_EVENTS). Превью (mp4/gif/кадры) лежит в /mnt/project-files/map-motion/.

Не сделано: те же события на сайте (MapLibre, components/map-canvas.tsx), проверка на телефоне.

Превью: временный демо-компонент вместо App в mobile/index.ts, Expo web на 8090, playwright recordVideo; плитки OSM из облака недоступны, их подменяли SVG-заглушкой через page.route. Metro может не подхватить правку демо без перезапуска. См. [[mobile-map-home]], [[design-system]].
