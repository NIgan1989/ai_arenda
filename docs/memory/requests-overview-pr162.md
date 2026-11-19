---
name: requests-overview-pr162
description: «Заявки» и «Сводка» в приложении — вкладки по смыслу, история ИИ свёрнута и чистится через 7 дней, PR #162 (2026-11-18)
metadata:
  type: project
  modified: 2026-11-18T12:56:49.335Z
---

2026-11-18 пользователь: «Заявки» и «Сводка» хаотичны, нет логических фильтров, история не удаляется и показывается ужасно.
Причина: под каждой страницей приложения рендерилась вся переписка с ИИ (client_conversations, до 120 сообщений) — её не чистит очистка броней/жилья.
PR #162 (ветка claude/project-thread-2bg2qh): Заявки владельца — Новые/Брони/Архив (lib/booking-filters.ts ownerRequestTab, архив по месяцам); Сводка — «Ждут вас/Сейчас/Скоро» (lib/overview-board.ts, mobile/src/OverviewBoard.tsx); история — на странице только сказанное после её открытия (pageMark/historyEnd в App.tsx), в Сводке свёрнутая «История · N», старше 7 дней удаляется при загрузке (lib/conversation-history.ts). Снимки /mnt/project-files/requests-overview/. Слит 2026-11-18 (main dfe339b), публикация и сборки автоматически. Замечание Codex (дубль заявки гостя в «Скоро») учтено.
Стенд: «Сводка» и «Заявки» открывал временным `globalThis.__qaPage=setPageId` (не коммитить); переписку сеял прямо в client_conversations, брони копией строки (occupied_until>=end, статуса rejected нет). См. [[my-bookings-pr157]], [[qa-stand]].
