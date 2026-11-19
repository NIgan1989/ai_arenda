---
name: regular-cleaner-pr57
description: PR #57 (2026-11-13): «Постоянный исполнитель» (было «Моя уборщица») — закрепление уборщика за квартирой, резерв оплаты, комиссия пары; слит и опубликован 2026-11-13 (main a88d225)
metadata:
  type: project
  modified: 2026-11-13T09:29:11.264Z
---

2026-11-13 пользователь спросил, как удержать постоянную пару владелец+уборщица от ухода в WhatsApp; одобрил план («да делай»): не прятать номера, а сделать сервис удобнее.
PR #57 https://github.com/NIgan1989/ai_arenda/pull/57, ветка claude/project-thread-o4k5et. 2026-11-13 пользователь сказал «сливай» и попросил: уборщиком может быть и мужчина — все тексты переписаны нейтрально («Постоянный исполнитель», вкладка админки «Исполнителям»). На main остались старые «уборщица» вне этого PR (property-quick, administrator-runtime). Правки по ревью Codex в 59daba9. После слияния #55 (0044_admin_telegram) миграция переименована в 0045_regular_cleaners.sql (c26db7a).
- lib/regular-cleaner.ts (+ lib/regular-cleaner-text.ts общие тексты), миграция 0045_regular_cleaners.sql: regular_cleaners, cleaning_holds (held→due→paid/returned через триггеры на cleaning_jobs), cleaning_commissions; platform_billing += cleaning_rate_bp 1000, pair_rate_bp 500, pair_month_cap 2000.
- coordinateDispatch: постоянной уборщице предложение первой (без receive_offers/города); её accept в decideOffer сразу назначает. Отказ/таймаут → обычный rankCleaners.
- Свободный баланс владельца = availableSql (пополнения − комиссии броней и уборок − резервы); balanceSql в platform-billing теперь он.
- Выплата уборщице вручную админом: /admin?section=revenue вкладка «Уборщицам» → finance_entries job_payment (source provider, actor system:cleaner-payout).
- UI: components/regular-cleaner.tsx и mobile/src/RegularCleaner.tsx (строка «Моя уборщица» в редактировании квартиры), components/regular-flats.tsx (у уборщицы в «Предложения работы»), метки в шапке задания.
Перед слиянием: номер миграции сверить с main (PR #55 добавляет 0043_admin_telegram — конфликт номера, кто сливается вторым, переименовывает; db/current-schema.sql пересобрать `node scripts/schema-snapshot.mjs --write`).
Скриншоты: /mnt/project-files/regular-cleaner/, страница https://claude.ai/artifact/6Z6krSGughBWEknAZVSFzk
QA: без .dev.vars фоновая проверка владельца запускается при открытии его страниц; вход в Expo-превью через прокси без Origin (порт 8091).
См. [[monetization]], [[algorithms-plan]].
