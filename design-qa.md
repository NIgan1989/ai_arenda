# Архив проверки предыдущего интерфейса

# Human Rhythm — design QA

final result: passed (archived)

Date: 2026-10-26. Scope: existing web app, all shared page surfaces and role workspaces; no deployment or native mobile-app redesign.

## Visual source and evidence

Selected visual is the THIRD displayed ideation result: `C:/Users/Dulat/.codex/generated_images/01a1792f-7415-7ba2-b740-d33823a0bda6/exec-6bf3cb8c-ca5c-4c93-b926-474ed0fa6200.png` (1487 x 1058). Normalized proportionally to 1440 x 1024 for comparison. Owner reference is populated; the real signed-in owner has no properties yet. Therefore the populated comparison uses an isolated, read-only fixture rendering the real Chat, navigation, photo and overview components. Fixture data never reaches the application database. Real guest/owner empty states were reviewed separately.

- `outputs/design/warm-owner-fixture.png`: full-page browser capture at 1440 x 1024 CSS/pixels. Viewport-only emulated captures appeared soft, so final comparisons use full-page evidence.
- `outputs/design/warm-owner-comparison.png`: source left and final implementation right, normalized to the same viewport and owner/property/next-arrival state.
- `outputs/design/warm-details-comparison.png`: both logo/header, typography and property/action regions together in one comparison input. This was inspected after the final full-frame comparison.
- `outputs/design/warm-guest-mobile.png`: actual guest empty state at 390 x 844.
- `outputs/design/warm-final-app.png`: actual signed-in owner empty state in the user's normal preview size.

## Review and fixes

Initial pass was blocked by P2 findings:

1. Hero cover initially loaded before the generated asset was saved. Verified real asset returns image/png, reloaded and captured the rendered photograph.
2. Mobile content lost about 94 px to both the old dock padding and new navigation reserve. Removed the duplicate reserve and explicitly reset inherited dock positioning. Rechecked 390 px width: no horizontal overflow, CTA and dock reachable.
3. Initial desktop heading and content started too high/small relative to the target. Aligned the 292 px sidebar, 42 px content inset, 63 px overview heading, two-line description and 330 px feature image. Captured and compared again.
4. Two-column form labels inherited inconsistent top margins. Reset margins inside input rows; controls retain 44+ px targets and visible focus.
5. The pinned event was repeated below the feature. Remaining-events list now starts with the second event. Owner booking date is matched to the displayed property, not another property's booking.

## Final required passes

- Typography: Prata display headings and Golos Text UI/body; clear Cyrillic hierarchy, readable controls, no clipped headings at reviewed desktop/mobile sizes. The generated source does not specify exact font files; these are the closest project-compatible match.
- Spacing/layout: compared full frames and focused regions. Source composition retained: quiet sidebar, large editorial title, generous vertical rhythm, wide photo feature, compact detail/action strip, assistant at the lower right. Mobile stacks the feature and labels the bottom navigation.
- Colors: ivory #fcfaf7, deep ink #201a29, terracotta #a7462e, subtle warm surfaces. Green remains only where it communicates readiness/success. Focus, selected, disabled and urgent states remain distinct.
- Assets: generated transparent house/continuous-door logo in public/brand-mark.png, also used as favicon; editorial warm apartment in public/welcome-home.png. The welcome cover is labelled as an illustration and never inserted into real property records. Listings use their own stored images or an explicit missing-photo state.
- Copy/content: real role-scoped data supplies titles, statuses, dates and events. No fictional ready status, booking, cleaner completion or listing is inserted into the user's account. Empty states have a clear next action.
- Behavior: browser checked real guest overview/catalog, expanded property details, booking-date form opening, calendar via mobile overflow menu, settings and account; real owner overview and opening the property editor without saving. Isolated login and registration form switching checked at 390 px. Normal navigation preserves native links and role guards. Assistant launcher opens composer when needed. Existing activity timers remain available.
- Accessibility/responsiveness: labelled links and controls, current-page state, modal escape/focus behavior retained, reduced-motion support, legible semantic statuses. Reviewed 1440 px desktop, intermediate default preview width, and 390 px mobile. No horizontal overflow in reviewed views.
- Runtime: no errors in the isolated design fixture console. TypeScript check and production build passed. All 58 auth/service tests passed.

## Non-blocking P3 notes

The exact AI mock typography, thumbnail crop and logo stroke are approximated with production fonts and separately generated assets. Existing functional navigation includes calendar and settings beyond the six links illustrated in the source. Native React Native screens are outside this web redesign and were not visually tested. External banking/AI/SMS functionality was not changed.

No remaining P0/P1/P2 issue in the reviewed scope. Final combined and focused comparisons were inspected after fixes.
# Проверка поиска и подключения ролей — 27 октября 2026

- Публичная главная: проверены широкая версия 1440 px и мобильная компоновка, анкета исполнителя — 390 px. Сохранён существующий тёплый стиль.
- Переход из поиска открывает настоящую форму бронирования с выбранной квартирой, датами, тарифом и числом гостей. Заявка при переходе не создаётся.
- Меню профиля показывает подключённые кабинеты; подключение исполнителя предлагает отдельную анкету в том же аккаунте.
- HTTP smoke-проверка: анонимный каталог, перенаправление закрытого кабинета на вход, регистрация с гостевым профилем, добавление владельца/исполнителя, выход. Синтетический аккаунт после проверки удалён.
- 68 основных и 18 мобильных тестов прошли; TypeScript и production-сборка прошли. Секрет OpenAI в сборке не найден.
- Модерация и проверка прав на объекты остаются отдельным этапом. Подключение роли не представлено как верификация.


---

# Текущая проверка нового концепта

# Design QA — умный подбор на карте

Source: `design/approved-map-mobile.png`, третий выбранный пользователем вариант, 853×1846 px, композиция 390×844 CSS px.

Implementation: действующие React-компоненты с реальными доменными сервисами в изолированной SQLite в памяти, `http://127.0.0.1:5178/`. Снимки `outputs/matching-mobile-final.png`, `outputs/matching-desktop-final.png`, `outputs/matching-search-final.png`, `outputs/matching-booked-final.png`.

## Проверенные поверхности

- Шрифт Golos Text загружен. Иерархия: этапы, заголовок, объяснение, фото/стоимость, основное действие, альтернативы.
- Палитра, форма панели, логотип и расстояния следуют выбранному направлению. Живая картографическая подложка и фактическая цена заменяют вымышленные сведения из изображения. В QA используется существующая иллюстрация `welcome-home.png`; в рабочем каталоге — только фотографии объектов.
- Настоящие кнопки, поля, доступные подписи и согласие перед заявкой. Действия доступны без имитации оплаты или готовности. Анимация привязана к ожиданию и учитывает reduced motion.
- Проверены 320, 390, 834 и 1440 px; горизонтальное переполнение не найдено. Панель использует ширину своего контейнера для боковой/нижней компоновки.
- В браузере пройдены опрос, предварительный запрос, ответ владельца, раскрытие квартиры, автоматический расчёт и успешное сохранение одной заявки. Проверено возвращение после отмены. Данные рабочей базы не использовались.

## Найденные и исправленные проблемы

- P2: одиночная ссылка логотипа получала стиль круглой кнопки профиля и переносилась. Исправлен селектор, восстановлена общая шапка.
- P2: элементы управления картой перекрывали форму. Карта выделена в отдельный слой; панель и закреплённая кнопка возврата находятся выше.
- P2: нативные даты могли отличаться от данных обработчика при автозаполнении. Перед отправкой читается FormData, результат сохраняется в состоянии.
- P2: первоначальное центрирование/смена ширины могли увести выбранный объект к краю. Добавлено повторное кадрирование выбранной точки с учётом панели. Повторная проверка 1440 → 390 px пройдена: выбранная ценовая метка находится в видимой области над панелью (`outputs/matching-mobile-final.png`).

Карта использует настоящую подложку и ценовые метки, а не растровый макет. Примерная география и фото из источника не подменяют данные сервиса. Наличие только одного варианта явно отключает переключение альтернатив. Эти отличия намеренные.

final result: passed

После восстановления браузера повторно пройдены включение быстрых запросов владельцем, опрос гостя, получение запроса, подтверждение готовности и отображение рекомендации. Финальные снимки после исправления кадрирования сравнены с источником в одном входе: источник 853×1846 px соответствует композиции 390×844 CSS px; реализация 390×844 px, плотность 1, без панели QA. Широкая реализация — 1440×900 px. Шрифт, интервалы, палитра, чёткость фото и фактические подписи проверены. Содержание адаптировано к проверенным данным: отдельный депозит, подтверждение владельца и отключённая единственная альтернатива. Более компактная шапка сохраняет место для точных дат; настоящая карта и фотографии объектов намеренно отличаются от иллюстрации.

При проверке облачной страницы обнаружен P1: MapLibre CSS, загруженный последним, меняет `.map-surface` на `position:relative`, высота поверхности становится нулевой. Исправлено независимым компонентным правилом `.rental-map-canvas>.map-surface`. Также исправлен P2: старый общий стиль помещал кнопки масштаба под шапку запроса; специфичное правило умной карты сохраняет отступ 150 px. После повторной сборки и публикации проверены настоящая карта, нажатие плюса с видимым изменением масштаба, поиск и пустой результат. Финальные облачные снимки: `outputs/matching-cloud-mobile.png` (390×844) и `outputs/matching-cloud-desktop.png` (1440×900), плотность 1. Высота карты равна высоте окна, ширина документа совпадает с окном. Пустой результат намеренный: рабочий каталог не содержит объявлений. Финальных блокирующих замечаний нет.

Административная карта проверена при 390 и 1440 px: загрузка и обновление, выбор объекта, реальные счётчики броней/уборок и переход к объектам. Мобильный снимок `outputs/matching-admin-mobile-final.png`; ширина документа 390 px при окне 390 px. Горизонтальное переполнение отсутствует. Отдельного исходного макета административной карты нет; проверена согласованность с текущими токенами и работающими компонентами. Нерешённых P0/P1/P2 в проверенном объёме нет. Push на физических устройствах и нативное приложение этой визуальной проверкой не охвачены.
