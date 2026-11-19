---
name: media-calendars-pr38
description: PR #38 (2026-11-13): фото квартир в R2 и экран «Календари площадок» в редактировании квартиры
metadata:
  type: project
---

PR #38 https://github.com/NIgan1989/ai_arenda/pull/38 (ветка claude/project-thread-r113az). Пользователь выбрал «сделай сам» из списка: 1) фото в хранилище, 2) синхронизация календарей.
- Фото квартир в R2 bucket `ai-arenda-media` (binding BUCKET), миграция 0036 `media.object_key`, `lib/media-store.ts`, фоновые задачи media-move/media-sweep. Аватары в D1. Публикация создаёт bucket сама (`scripts/ensure-r2-bucket.mjs`); если R2 не включён на аккаунте или у токена нет права Workers R2 Storage: Edit, публикуется без хранилища (фото в D1), пояснение в журнале Actions. Тогда пользователю нужно один раз включить R2 в панели Cloudflare или добавить право токену.
- Синхронизация iCal уже была (lib/external-calendar.ts, раздел «Управление → Календари»); добавлен простой экран в редактировании квартиры (сайт + приложение), подключение ссылки одним шагом, ссылка экспорта бессрочная. У Krisha iCal нет.
- Telegram-уведомления уже есть в коде (delivery/telegram, TELEGRAM_BOT_TOKEN): нужен только бот и секрет.
См. [[monetization]], [[pages-audit]].
PR #38 слит 2026-11-13 (main 0779b38, миграция переименована в 0037_media_storage.sql из-за 0036_calendar_windows).
Telegram: PR #40 https://github.com/NIgan1989/ai_arenda/pull/40 — `scripts/setup-telegram.mjs` в публикации по секрету GitHub TELEGRAM_BOT_TOKEN (сам кладёт секреты Worker и webhook), строка «Telegram» в аккаунте (components/telegram-settings.tsx, mobile/src/NativeTelegram.tsx), бот отвечает на /start. Пользователю дана инструкция: создать бота у @BotFather и добавить секрет; ключ в чат не просить.
2026-11-13 PR #40 (Telegram) слит (main 75f6fa3). Первая публикация с PR #38 (run 43382352607) прошла без R2: «CLOUDFLARE_API_TOKEN has no R2 permission». Пользователю дана инструкция добавить токену право Account → Workers R2 Storage: Edit (и включить R2 в панели), после этого перезапустить «Publish to Cloudflare» (можно самому через actions_run_trigger).
2026-11-13 07:15Z: бот @ai_arenda_kz_bot подключён публикацией (run 43383399901 попытка 2). R2 на аккаунте не включён (код 10042) — фото пока в D1; пользователю дана инструкция включить R2 в панели и снова нажать Re-run.
2026-11-13 07:22Z (run 43383399901 попытка 3): R2 подключён, env.BUCKET (ai-arenda-media) в Worker. Пользователь написал «телеграм бот не работает»: в D1 delivery_links и delivery_channels пусты — кнопку «Подключить Telegram» на сайте не нажимали; в приложении строки нет до новой сборки APK. Дана инструкция: сайт → Аккаунт → Настройки → Telegram. Диагностика: D1 читается коннектором Cloudflare (база 4648861c-…), workers.dev из сессии недоступен.
2026-11-13: PR #44 слит и опубликован: redirect:'error' → 'manual' (Telegram не мог отправлять сообщения), одно нажатие Start подключает все роли. В 07:58 у Дулата подключены все 3 роли. Фото бота: /mnt/project-files/telegram/bot-avatar.jpg, ставится через @BotFather /setuserpic. PR #49: кнопки решений в Telegram (callback_query → decideApproval, lib/delivery.ts noticeDecision/decisionMessage), слит и опубликован 2026-11-13 08:13Z; в живую на настоящей заявке ещё не проверено.
