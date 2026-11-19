---
name: arrival-shift-pr165
description: PR #165 (2026-11-18): время между гостями по уборке — остаток минут, «Можно заселиться раньше», «Сдвинуть заезд»; автопилот делает это сам (PR #167)
metadata:
  type: project
  modified: 2026-11-18T15:21:26.620Z
---

2026-11-18 пользователь попросил: писать владельцу остаток времени по уборке, давать сдвинуть заезд, пускать раньше, если убрались быстрее. PR #165 (ветка claude/project-thread-9v1l3c): lib/arrival-shift.ts (shortWindowNote, afterReady, allowEarlyCheckin, shiftedStay, extendCleaningBefore), миграции 0068 (booking_terms.early_checkin_at) и 0069 (триггеры: время раннего гостя от early_checkin_at до start нельзя забронировать), действия брони early_checkin и shift_arrival (30/60/120 мин через proposeBookingChange, гость соглашается). Сдвиг по просьбе владельца до 2 ч сохраняет цену (bookingChangeQuote, ownerDelay). Уборка перед сдвинутым заездом не растягивается на следующую работу того же исполнителя. Слит 2026-11-18 (main 0e74918).

Автопилот (PR #167 слит 2026-11-18, main c1eccac): lib/arrival-autopilot.ts sweepArrivals в фоне admin-issues (каждые 2 мин). Под автопилотом ИИ сам пускает раньше, если гость оплатил и приедет в ближайшие 3 ч (EARLY_AUTO; дальше решает владелец, потому что свободное время ещё можно продать), и сам просит гостя заехать позже (один раз на бронь), когда уборка не успевает к заезду в ближайшие 2 ч. См. [[app-checklist]], [[overdue-cleaning-pr74]].
