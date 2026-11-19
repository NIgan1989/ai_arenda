---
name: pages-audit
description: Аудит нетронутых страниц от 2026-11-12: список доработок по приоритетам и что уже взято в работу
metadata:
  type: project
  modified: 2026-11-12T20:24:41.998Z
---

2026-11-12 пользователь попросил найти страницы и промежуточные экраны, которые не трогали. Список показан ему в ветке «Доработать оставшиеся страницы сервиса», снимок «как есть» в `/mnt/project-files/pages-audit/before-overview.png`. Приоритеты:

1. Карточка брони и задания (лист RecordCollection в `components/patterns/record-collection.tsx`, содержимое в `app/chat.tsx` блоки bookings/jobs): повтор названия, пустой блок фото, кнопки россыпью. Сделано в PR #21 https://github.com/NIgan1989/ai_arenda/pull/21 (ветка claude/project-thread-7p3mxa, слит 2026-11-12 по «сливай», main a57df31, публикация прошла, run 43302900486): шапка `record-head`, этапы одной строкой с полосой, факты `record-facts`, действия `recordActions` в app/chat.tsx; приложение `mobile/src/RecordCard.tsx`; общее время `lib/record-span.ts`. Снимки: /mnt/project-files/pages-audit/booking-card-*.png. Не проверено: реальный телефон, рамка карточки в списках приложения.
2. Календарь (`components/rental-calendar.tsx`, `mobile/src/RentalCalendar.tsx`): в неделе/месяце текст ломается по буквам, кружок даты коричневый от старой гаммы. Сделано в PR #22 https://github.com/NIgan1989/ai_arenda/pull/22 (слит 2026-11-12, main 8b32551): месяц с точками и список выбранного дня, общий `lib/calendar-days.ts`, FullCalendar удалён. Снимки: /mnt/project-files/pages-audit/calendar-*.png.
3. Заявка на проживание (`components/booking-request.tsx`) и «Создать уборку»: системное поле datetime-local в американском формате, три шага. Сделано в PR #24 https://github.com/NIgan1989/ai_arenda/pull/24 (слит 2026-11-13 по «сливай и дальше иди», main 18113a6): один экран, общий `lib/stay-choice.ts`, `components/stay-picker.tsx`, `components/cleaning-request.tsx`, приложение `mobile/src/StayRequest.tsx`. Снимки: /mnt/project-files/pages-audit/request-*.png. Не проверено: телефон, тариф «Ночь», готовое предложение с карты.
4. «Управление» (`components/operations-hub.tsx`): стена текста, галочки. Сделано в PR #28 https://github.com/NIgan1989/ai_arenda/pull/28 (слит 2026-11-13, main 2e9a92b): вход списком разделов (`managementMenu` в lib/role-experience.ts, стили `.acct` + `components/operations-menu.css`), правила уборок переключателями с сохранением сразу. Страница только на сайте. Содержимое остальных разделов (финансы, календари, ключи, уведомления) не трогали. Снимки: /mnt/project-files/pages-audit/management-*.png.
5. Списки и каталог: «Фото не добавлено», нет группировки по времени, огромные карточки каталога. Сделано в PR #30 https://github.com/NIgan1989/ai_arenda/pull/30 (слит 2026-11-13, main bbb2735): `lib/record-groups.ts`, значок вместо надписи, `components/listing-compact.css` (проп compact у PropertyListing в каталоге). В приложении карточки списков полные, добавлены только группы. Снимки lists-*.png.
6. Вход, регистрация, /join/[role]: два заголовка подряд. Сделано в PR #33 https://github.com/NIgan1989/ai_arenda/pull/33 (слит 2026-11-13, main 3446854): AuthForm embedded без заголовка, `components/role-entry.css`, в приложении Auth titled={false}. Снимки auth-*.png.
7. Правовые страницы /privacy, /terms, /data-deletion: голый текст. Сделано в PR #35 https://github.com/NIgan1989/ai_arenda/pull/35 (слит 2026-11-13, main 4a3ba7c): `components/legal-information.css`, вкладки, текст не менялся. Весь список из 7 пунктов закрыт. Оферты ведутся в отдельной ветке «Подготовить оферты сервиса».

Стенд: новые миграции (0032, 0033) к sqlite стенда сами не применяются, применять через node:sqlite к файлу в outputs/browser-qa/state/v3/d1. Сервер сам создаёт таблицы, вручную применять drizzle не нужно (sqlite3 в контейнере нет), достаточно одного запроса к API и трёх seed-скриптов. Карточка в списке открывается кликом по `button.record-summary`.

См. [[design-system]], [[palette-redesign-pr12]].
