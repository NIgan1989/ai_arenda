---
name: brand-inside-pr169
description: PR #169 слит 2026-11-18 (main b4f3fed): экраны приложения в цветах и шрифте знака AiQonaq — золото, тёмный индиго, Unbounded в заголовках, «Оплачено», пустые списки с шаңыраком
metadata:
  type: project
  modified: 2026-11-18T16:57:23.485Z
---

2026-11-18 пользователь спросил, соответствует ли интерфейс новому знаку; оценка была 6 из 10 (обёртка в бренде, экраны внутри нет). Он одобрил эскиз (`/mnt/project-files/aiqonaq-brand/inside/board.png`) и сказал «делай все страницы согласно новому дизайну».

**PR #169** https://github.com/NIgan1989/ai_arenda/pull/169 (ветка claude/project-thread-xvk0cf), слит 2026-11-18 по слову пользователя (main b4f3fed), Publish run 160 и сборка Android № 460 прошли, сборка iPhone № 460 на момент записи стояла в очереди. Только приложение; общие цвета `warning*` меняются и на сайте.

Что сделано:
- `design/tokens.json`: `warning` стал тёплым оранжевым (#A8470A / #FFF0E6 / #F6C9A8), добавлены `goldInk`, `goldSoft`, `goldLine`.
- Шрифт логотипа: `mobile/assets/fonts/Unbounded-SemiBold.ttf` (урезан pyftsubset до латиницы и кириллицы), `brandFont` в `mobile/src/styles.ts`, грузится `useFonts` в компоненте `Fonted` в `mobile/App.tsx`. Тест `tests/brand.test.mjs` требует, чтобы `App()` начинался с `<SafeAreaProvider><View…><EntryStatusBar/>`, поэтому хук вынесен из `App`.
- `mobile/src/BrandMoments.tsx`: `Dome` (купол любого размера из PNG и лучей-View), `BrandEmpty` (пустой список), `celebrate()` + `BrandMoment` (экран «Оплачено» после `operations/payment-test`).
- Золото и `C.night`: ListTabs, шаги в RecordCard/SheetParts/PropertyQuick, AutopilotThreads, SwipeConfirm, орнамент шторки.

Не проверено: настоящий телефон и сборки (шрифт на устройстве, анимация лучей). Снимки стенда: `/mnt/project-files/aiqonaq-brand/inside/app/`.

**How to apply:** новые заголовки экранов писать через `...brandFont` (без fontWeight), золото только как второй акцент (текущий шаг, выбранная вкладка, ИИ), срочное — `warning`. Стенд: чтобы снова снять оплату, сбросить `booking_terms.paid_amount=0, deposit_status='pending'` и `bookings.payment_status='unpaid'`. См. [[aiqonaq-brand]], [[design-system]], [[qa-stand]].
