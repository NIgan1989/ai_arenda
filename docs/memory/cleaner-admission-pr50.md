---
name: cleaner-admission-pr50
description: PR #50 (2026-11-13): почему «Назначить» отказывала (обязательная проверка исполнителя), как теперь показан путь отклик → проверка → назначение
metadata:
  type: project
---

2026-11-13: в проде pilot_policy require_owner_review=1, require_cleaner_review=1, require_phone=0. Назначение требует одобренной заявки participant_reviews (role cleaner). Раньше заявка при отклике не создавалась, поэтому владелец получал отказ 409.

PR #50 https://github.com/NIgan1989/ai_arenda/pull/50, ветка claude/project-thread-2xe1d0. Что сделано:
- `cleanerAdmission`/`requestCleanerAdmission` в lib/pilot-governance.ts. Отклик (route jobs apply) сам создаёт заявку.
- `admission` есть в workerCard и в profile исполнителя.
- `lib/cleaner-next.ts`: следующий шаг исполнителя, общий для сайта и приложения.
- После решения в админке уведомляются исполнитель и владельцы.
- Убран дубль «Мои отклики и работа» на «Моих заданиях».

Пользователь — администратор платформы и проверяет себя сам: Админка → Проверки (/admin?section=reviews). Старый отклик без заявки получает кнопку «Отправить анкету на проверку».

Стенд: новые миграции (0039, 0040) применяются вручную. При 429 на вход очистить auth_attempt_limits. PR #50 слит 2026-11-13 по «сливай» (main 112a3ae) и опубликован (run 43393162209).

Продолжение: PR #52 https://github.com/NIgan1989/ai_arenda/pull/52, слит 2026-11-13 по «сливай» (main 1194b21), опубликован вместе с #51 (run 43394007090). На страницах-списках (jobs, assignments, cleaning, bookings, properties) runIntent для списка со своей страницей переходит на неё (rolePages по intent) и не добавляет второй список. В приложении run() для заданий делает setPageId. Скриншоты в /mnt/project-files/cleaner-pages/. См. [[cleaning-details-pr39]].
