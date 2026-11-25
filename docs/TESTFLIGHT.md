# iPhone в TestFlight

Подписанная сборка для iPhone собирается в Expo (EAS Build) и отправляется в TestFlight (EAS Submit) сборкой GitHub `.github/workflows/testflight.yml` («iPhone to TestFlight»). Сборка без подписи для Sideloadly (`ios.yml`, релиз `ios-latest`) остаётся запасным путём.

## Что уже настроено

- Проект Expo: владелец `dulat89s-team`, slug `aiqonaq`, ID `75eb8c2d-581f-4217-ab51-66133938a8f6` (`mobile/app.json`, `extra.eas.projectId`). Этот же ID нужен для push-уведомлений (`docs/MOBILE_PUSH.md`).
- `ios.config.usesNonExemptEncryption: false`: приложение пользуется только обычным HTTPS, поэтому Apple не спрашивает про экспорт шифрования.
- Профиль `testflight` в `mobile/eas.json`: продолжение `production` (сборка для магазина, номер сборки растёт сам на стороне Expo) с адресом сервера `https://ai-arenda.ai-arenda-kz.workers.dev`.

## Что нужно один раз от владельца аккаунтов

Секреты репозитория (Settings → Secrets and variables → Actions → Secrets):

| Имя | Откуда |
|---|---|
| `EXPO_TOKEN` | expo.dev → dulat89's team → Settings → Access tokens → робот с ролью Admin → Create token |
| `ASC_KEY_P8` | appstoreconnect.apple.com → Users and Access → Integrations → App Store Connect API → «+», роль Admin; весь текст скачанного файла `.p8` |
| `ASC_KEY_ID` | Key ID того же ключа |
| `ASC_ISSUER_ID` | Issuer ID над списком ключей |
| `APPLE_TEAM_ID` | developer.apple.com → Account → Membership details → Team ID |

Переменная репозитория (там же, вкладка Variables): `ASC_APP_ID`. Это Apple ID приложения: App Store Connect → Apps → AiQonaq → App Information → Apple ID (число). Само приложение в App Store Connect создаётся вручную (Apps → «+» → New App, платформа iOS, имя AiQonaq, Bundle ID `app.aiarenda.assistant`, SKU `aiqonaq`). Bundle ID появляется в списке после первой сборки, потому что Expo регистрирует его сам.

## Как запустить

Actions → «iPhone to TestFlight» → Run workflow на `main`. Задача `check` проверяет токен и ID проекта, задача `build` собирает приложение в Expo (около 20–40 минут, бесплатный план ставит сборки в очередь) и, если включено «Upload», отправляет его в TestFlight. Apple обрабатывает загруженную сборку ещё 10–30 минут.

Pull request, который меняет `mobile/app.json`, `mobile/eas.json` или саму сборку, запускает только `check`: ничего не собирается и не отправляется в Apple.

Бесплатный план Expo ограничивает число сборок iPhone в месяц, поэтому сборка запускается вручную, а не на каждое изменение.

## Тестировщики

App Store Connect → Apps → AiQonaq → TestFlight:

- Internal Testing: до 100 участников команды App Store Connect, без проверки Apple.
- External Testing: группа «Павлодар бета», до 10 000 человек по публичной ссылке `testflight.apple.com/join/…`. Первую сборку в группе Apple проверяет (обычно до суток). Для проверки нужны описание беты, почта для отзывов и тестовая учётка для входа; в заметке для проверяющего указать, что оплата в бете только имитация.

Каждая сборка в TestFlight живёт 90 дней.

## Подпись

Expo создаёт сертификат распространения только в «вопросном» режиме, даже с ключом App Store Connect. Поэтому перед сборкой задача `credentials` запускает `eas credentials:configure-build` в псевдотерминале и отвечает на все вопросы значениями по умолчанию: создать сертификат и профиль App Store, а если они уже есть, оставить их. Повторный запуск безопасен. Сертификат и профиль хранятся в Expo (expo.dev → AiQonaq → Credentials).

Если задача `credentials` упала, её журнал покажет вопрос, на котором она остановилась. Запасной путь: один раз выполнить на компьютере в папке `mobile` команду `npx eas-cli credentials:configure-build --platform ios --profile testflight` и ответить на вопросы.
