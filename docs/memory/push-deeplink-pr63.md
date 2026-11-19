---
name: push-deeplink-pr63
description: Как устроены push (только веб-push, в APK push нет) и PR #63 — точный текст и переход на нужный экран, слит и опубликован 2026-11-13
metadata:
  type: project
  modified: 2026-11-13T11:29:41.556Z
---

Push сегодня только веб-push (сайт или ярлык сайта на телефоне): запись в `notifications` → триггер `notification_push` ставит доставку в `push_deliveries` → крон `deliverWebPush` (lib/web-push.ts) шлёт через VAPID → `public/sw.js` показывает. В нативном приложении (APK) push нет совсем: FCM/APNs не подключены, нужен проект Firebase (Android) и аккаунт Apple (iOS).

PR #63 https://github.com/NIgan1989/ai_arenda/pull/63 (ветка claude/project-thread-oxmj8o): push несёт текст события и заголовок «Бронь/Уборка/Сообщение · квартира»; `pushTarget` проверяет id по базе и даёт адрес `?entity=` или `chats?room=`; сайт сразу открывает карточку или чат; миграция 0047 — текст уведомления о сообщении в чате. Скриншоты в `/mnt/project-files/push-deeplink/`. Слит по «сливай» 2026-11-13 (main bcd0532), опубликован (run 43419022454, миграция 0047 применена публикацией).
