---
name: telegram-notices-pr117
description: PR #117 (2026-11-16): Telegram-оповещения стали понятными — заголовок, текст события, кнопка «Открыть» вместо голой ссылки
metadata:
  type: project
  modified: 2026-11-16T16:11:41.882Z
---

Жалоба 2026-11-16: в Telegram приходили ссылки вместо оповещений. Причина: `deliverOutbox` в lib/delivery.ts для любого уведомления без кнопок решения слал «AiQonaq: новое событие в рабочей роли.» + ссылку.
PR #117 https://github.com/NIgan1989/ai_arenda/pull/117 (ветка claude/project-thread-x7uuve): `plainTelegramNotice` — заголовок со значком из `pushTarget` (lib/web-push.ts), текст уведомления, кнопка «Открыть» на нужную карточку/чат; parse_mode HTML; в чатах скрываются коды и телефоны; текст, написанный людьми (обращения, причины, отзывы), заменяется указанием «в сервисе» (по замечанию Codex). Кнопки Telegram не могут открыть приложение (схема aiarenda:// не разрешена), ведут на сайт. Картинка: /mnt/project-files/telegram-notices/bylo-stalo.png. Слит 2026-11-16 (main 02d8322), публикация зелёная (run 43907719396).
