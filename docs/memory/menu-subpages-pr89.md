---
name: menu-subpages-pr89
description: PR #89 слит (2026-11-14): «Данные и безопасность» простыми экранами; PR #90 «Настройки» короткими группами слит и опубликован
metadata:
  type: project
  modified: 2026-11-14T07:13:30.091Z
---

2026-11-14 пользователь прислал скриншоты сырой подстраницы «Данные и безопасность» и попросил привести все подстраницы меню в современный вид и проверить остальные у каждой роли. PR #89 https://github.com/NIgan1989/ai_arenda/pull/89, ветка claude/project-thread-6qssmx. Слит и опубликован 2026-11-14 (main 74205d8).

Сайт: `components/safety-controls.tsx` (AccountSafety с page/go: devices, ai, delete, reports, requests; AdminDeletionRequests для /admin), `account-control.tsx` (MenuView `safety:*`, шапка `.acct-top` стрелка+заголовок), стили в `account-list.css`. Приложение: `mobile/src/AccountSafety.tsx`, `AccountControl.tsx`, `Group space` в AccountRows. Очередь жалоб в меню убрана (она в /admin «Жалобы и безопасность»).

2026-11-14 по просьбе пользователя тариф владельца убран из меню: переключатель «Автопилот» первой строкой во вкладке «Настройки» жилья (`components/flat-autopilot.tsx`, `mobile/src/FlatAutopilot.tsx`, текст в `lib/flat-autopilot.ts`; включение через operations/autopilot/start с одним propertyId, выключение через matching/preference mode manual). У исполнителя тариф остался в меню.

2026-11-14 пользователь попросил меньше текста и красивую подачу в «Настройках» меню: PR #90 https://github.com/NIgan1989/ai_arenda/pull/90 — группы Уведомления/Банк/Приватность, переключатели и выбор в строку (`Choice` в mobile/src/AccountRows.tsx, `.acct-seg` на сайте), компактные Telegram/push скрыты, пока не настроены; «Приватность» добавлена в приложение. Слит и опубликован 2026-11-14 (main eef59b3).

Не сделано, можно предложить: строка Telegram «Скоро» без пользы, заголовок шторки «Меню» остаётся над заголовком экрана.

Снимки: /mnt/project-files/menu-subpages/. Стенд и превью приложения — [[qa-stand]]; в приложении после входа сначала выбрать роль, прокси 5175 держать отдельным фоновым процессом.

2026-11-14 PR #91: документы (/privacy, /terms, /data-deletion) принимают `?from=` и кнопкой «Назад» возвращают туда, откуда открыты; экран меню хранится в адресе `?menu=safety[:page]` (`lib/menu-address.ts`, `lib/legal-return.ts`); приложение открывает документы с `from=app` → «В приложение» (aiarenda://). Слит и опубликован 2026-11-14 (main 12174e3).
