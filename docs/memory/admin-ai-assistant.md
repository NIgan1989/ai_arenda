---
name: admin-ai-assistant
description: План ИИ-помощника админа платформы (2026-11-13): авто-проверки, Telegram админу, обращения, жалобы, сводка, дизайн служебных страниц админки
metadata:
  type: project
  modified: 2026-11-13T08:40:47.872Z
---

2026-11-13 пользователь попросил упростить и алгоритмизировать работу админа, плюс улучшить дизайн и скорость служебных страниц админки (Проверки, Обращения, Жалобы, Правила, Состояние). Ветка claude/project-thread-dq3shm.
План: 1) ИИ сам проверяет квартиры и исполнителей по правилам (переключатель «Проверяет ИИ / Я сам» в правилах), спорное админу с кнопками; 2) уведомления админа в Telegram с кнопками; найдено, что dedupe 'admin:...' не совпадает ни с одной ролью, поэтому триггер notification_outbox их не отправляет и в Telegram они не уходят; 3) ИИ разбирает обращения «Есть проблема»; 4) жалобы: очевидное скрывает сам; 5) сводка в 9:00; 6) дизайн служебных страниц. Пополнения баланса остаются ручными до банка.
Ключевые места: lib/participant-security.ts (requestParticipantReview/decideParticipantReview), lib/pilot-governance.ts, lib/platform-admin.ts, components/platform-admin.tsx, планировщик runOperationalTick в lib/background.ts. См. [[cleaner-admission-pr50]], [[monetization]].
Пункт 1 сделан: PR #54 https://github.com/NIgan1989/ai_arenda/pull/54 (ветка claude/project-thread-dq3shm), 2026-11-13: lib/admin-autocheck.ts, миграция 0042_ai_reviews.sql (0041 занял PR #53), components/admin-reviews.tsx. Слит и опубликован 2026-11-13. Скриншоты в /mnt/project-files/admin-ai/. QA: вход в стенд через fetch /api/auth/login на странице (qa-owner, +77000000001, админ на стенде); сид заявок /tmp/claude/qa/reviews-seed.mjs (пропадает с контейнером).

Пункты 2–6: PR #55 https://github.com/NIgan1989/ai_arenda/pull/55 (2026-11-13). Состав: миграция 0043_admin_telegram.sql (триггер notification_outbox_admin), lib/admin-telegram.ts (кнопки, callback код 'a'), lib/admin-issues.ts (sweepIssues), lib/admin-reports.ts (sweepReports), lib/admin-digest.ts (сводка 9:00 UTC+5), новые страницы components/admin-issues.tsx, admin-reports.tsx, admin-policy.tsx. «Состояние» не переделывалась. Скриншоты 4–7 в /mnt/project-files/admin-ai/. Слит 2026-11-13 (main e417f9a), миграция переименована в 0044_admin_telegram.sql (0043 занял #56), публикация прошла (run 43402860610). Все 6 пунктов плана сделаны. Треду PR #57 сообщено, что их 0044 нужно переименовать в 0045.
2026-11-13 пользователь спросил про автопилот владельцев и исполнителей: у владельца есть режим «ИИ», у исполнителя автопилота нет (только receive_offers в worker_dispatch, lib/dispatch.ts). Предложен автопилот исполнителя (правила: районы, дни/часы, мин. оплата → ИИ сам принимает; план дня; напоминание о фото), ждёт выбора на карточке.
