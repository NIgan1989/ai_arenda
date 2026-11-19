---
name: ios-build
description: Сборка приложения для iPhone: PR #11 (ios.yml, без подписи, релиз ios-latest), что нужно от пользователя для TestFlight
metadata:
  type: project
  modified: 2026-11-12T06:28:31.095Z
---

2026-11-12: пользователь спросил про сборку для iPhone. PR #11 слит в main (caaea4b), первая сборка main зелёная, файл на https://github.com/NIgan1989/ai_arenda/releases/tag/ios-latest. Сделан PR #11 (ветка claude/project-thread-jzirlt): `.github/workflows/ios.yml` на macos-26 собирает `ai-arenda-unsigned.ipa` без подписи (репозиторий публичный, macOS-минуты бесплатны), сборки main идут в релиз `ios-latest`. Описание: docs/IOS_BUILD.md.

Аккаунта Apple Developer у пользователя нет (на 2026-11-12). Expo Go не подходит: проект на SDK 57, Expo Go из App Store поддерживает другую версию SDK, `eas go` требует платный аккаунт Apple.

Пути установки: бесплатно через Sideloadly и свой Apple ID (7 дней), либо TestFlight после Apple Developer Program (99 $/год) + ключ App Store Connect API в секретах репозитория. Пользователь выбрал «Пока не нужно»: только автосборка, без установки на телефон и без аккаунта Apple (2026-11-12).

**How to apply:** если появится аккаунт Apple, добавлять в ios.yml шаг подписи и загрузки в TestFlight. См. [[home-redesign-pr10]] (Android-сборка), [[repo-overview]].
