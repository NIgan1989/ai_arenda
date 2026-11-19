---
name: owner-analytics-pr173
description: «Доходы» — бизнес-показатели владельца в меню приложения, PR #173 слит и опубликован 2026-11-19 (main 7eea062)
metadata:
  type: project
  modified: 2026-11-19T17:36:06.197Z
---

2026-11-19 пользователь попросил владельцам отслеживать бизнес-показатели (предложил меню оплат). Выбрано место: первая строка меню владельца «Доходы» (значение: чистая прибыль за 30 дней), открывает экран mobile/src/OwnerAnalytics.tsx.
Сервер: lib/owner-analytics.ts, GET /api/owner/analytics?period=week|month|year (только владелец, свои объекты), без новых таблиц: брони confirmed/completed по дате начала, уборки (своя = 0, отмена = cancel_fee), platform_commissions и cleaning_commissions mode=charged, autopilot_charges, finance_entries expense/compensation, stay_reviews, property_views (30 дней). Совет ИИ — правила (ownerAdvice).
PR #173 (ветка claude/project-thread-yrfzkw), снимки /mnt/project-files/owner-analytics/. Слит и опубликован 2026-11-19 (main 7eea062, Publish run 163, сборки Android и iPhone № 474). Замечания Codex учтены: «Мой дом» (type home) исключён из показателей; при пределе строк остаются новые. Чистый расчёт в lib/owner-analytics.ts (без серверных импортов, иначе падает проверка типов приложения), загрузчик в lib/owner-analytics-db.ts. На настоящем телефоне не проверено.
Стенд: финансовые брони сеялись скриптом в базу стенда (booking_overlap — между бронями нужен зазор). Админка/бухгалтерия/финансист — в другом треде. См. [[monetization]], [[qa-stand]].
