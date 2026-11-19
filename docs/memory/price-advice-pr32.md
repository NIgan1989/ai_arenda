---
name: price-advice-pr32
description: PR #32 (2026-11-12): ИИ-администратор предлагает цену по спросу после приёмки уборки, пуш с кнопками, правила и где код
metadata:
  type: project
  modified: 2026-11-12T22:19:27.088Z
---

2026-11-12 пользователь попросил: ИИ сам считает спрос/предложение «в моменте» и ненавязчиво предлагает владельцу поднять или снизить цену; момент — после приёмки уборки; цена меняется только по кнопке; красивое пуш-уведомление.

PR #32 https://github.com/NIgan1989/ai_arenda/pull/32, ветка claude/project-thread-94353i. Код: `lib/price-advice.ts` (сигналы и правила), миграция `0034_price_advice.sql` (таблица price_suggestions), карточка kind 'price' в `lib/approvals.ts`, пуш с кнопками в `public/sw.js` + `pushPayload` в `lib/web-push.ts`, баннер на карте `components/price-tip.tsx` и `mobile/src/PriceTip.tsx`. Срабатывает в `jobAction approve` и `readinessAction ready`.
Правила: вверх 10–20% при спросе ≥1,5× свободных квартир / загрузке ≥70% / выходных, не выше 125% медианы похожих; вниз 10–15% только при полном затишье и цене выше похожих, не ниже minimum_rate. Не чаще раза в 3 дня, «Оставить» — пауза 7 дней, два подряд — 14 дней.
Скриншоты: /mnt/project-files/price-advice/. Сливать после «сливай» пользователя. Не проверено: пуш на реальном телефоне (на iPhone у веб-пуша нет кнопок).
Стенд: для приложения нужен прокси 8091 (убирает Origin, CORS) и `expo start --clear`; лимит входа сбрасывается `DELETE FROM auth_attempt_limits`.
См. [[autopilot-pr17]], [[design-system]].

2026-11-13 PR #32 слит (main f0eeb22, миграция 0035_price_advice.sql). Продолжение — план из 9 алгоритмов: [[algorithms-plan]].
