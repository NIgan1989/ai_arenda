---
name: chat-edge-pr13
description: PR #13 (2026-11-12): чаты от края до края на телефоне, вариант 2 из трёх; скриншоты в project-files/chat-edge
metadata:
  type: project
---

2026-11-12 пользователь пожаловался на боковые поля в окне чатов. Показаны 3 варианта (1 «Мессенджер», 2 «Строго от края», 3 «Полосы-плитки»), скриншоты в `/mnt/project-files/chat-edge/`. Рекомендован и сделан вариант 2: PR #13 https://github.com/NIgan1989/ai_arenda/pull/13, ветка claude/project-thread-a16d0i. Пользователь выбрал вариант 2; PR слит 2026-11-12 (main 5f76fb1), публикация в Cloudflare прошла (run 43274308776), Android APK собран. На физическом телефоне не проверено.

Сайт: правила под `@media(max-width:700px)` в конце `app/glass.css`, область `.workspace-shell[data-section=chats]`, нужен `!important` из-за старых слоёв CSS. Приложение: стили в `mobile/src/NativeChats.tsx` (search, inboxRow, aiRow, mine/theirs, transcript).

Стенд: перед сидами нужно один раз войти через /signin, чтобы появился файл sqlite; лимит входов чистится `DELETE FROM auth_attempt_limits`. Варианты быстро примерять через `page.addStyleTag` в playwright. См. [[design-system]], [[palette-redesign-pr12]].
