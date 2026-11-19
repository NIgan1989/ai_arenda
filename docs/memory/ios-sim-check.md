---
name: ios-sim-check
description: Как проверить мобильное приложение на симуляторе iPhone через GitHub Actions против тестового стенда (когда Limrun не подходит)
metadata:
  type: reference
  modified: 2026-11-15T09:29:39.585Z
---

Временный workflow на `macos-26` поднимает [[qa-stand]] на раннере, собирает Release для симулятора (`expo prebuild`, `xcodebuild -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO`) и ведёт приложение через Maestro. Один прогон 35–40 минут. Готовые файлы есть в истории ветки PR #107 до коммита удаления: `.github/workflows/ios-sim-qa.yml`, `.github/ios-sim-qa/` (см. [[open-deal-fix-pr107]]).

Правки только на раннере: разрешить http в `mobile/src/api.ts` и ATS; хранить сессию в памяти вместо Keychain (у неподписанной сборки нет entitlement); `MAESTRO_DRIVER_STARTUP_TIMEOUT=600000`; прогреть стенд перед входом; `scrollUntilVisible` для кнопок ниже экрана; шаги вроде «Развернуть панель» и выбора роли делать необязательными.

Хранилище артефактов GitHub недоступно из облачной сессии: снимки печатать в лог задачи как base64 JPEG и доставать из лога.

**Why:** Limrun достаёт только до публичных адресов, а создавать тестовые аккаунты на боевом сервере нельзя (отклонено 2026-11-15). Limrun годится для экранов без входа или с аккаунтом от пользователя.
