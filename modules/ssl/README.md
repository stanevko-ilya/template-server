# Модуль SSL

Управление SSL/TLS-сертификатами. Поддерживает два режима: загрузка из файлов и автоматическое получение через Let's Encrypt.

## Файл конфигурации

| Параметр | Тип | Описание |
|---|---|---|
| `mode` | `string` | Режим работы: `off`, `file`, `letsencrypt` |
| `file.key` | `string` | Путь к файлу приватного ключа |
| `file.cert` | `string` | Путь к файлу сертификата |
| `file.ca` | `string` | Путь к CA bundle (опционально) |
| `letsencrypt.domain` | `string` | Домен для сертификата |
| `letsencrypt.email` | `string` | Email для ACME-аккаунта |
| `letsencrypt.staging` | `boolean` | `true` для тестового окружения Let's Encrypt |
| `letsencrypt.renewCheckInterval` | `number` | Интервал проверки обновления в мс (по умолчанию 12 часов) |

## Переменные окружения

```bash
# Режим работы (off | file | letsencrypt)
SSL_MODE=off

# --- Режим file ---
SSL_KEY_PATH=./path/to/key.pem
SSL_CERT_PATH=./path/to/cert.pem
SSL_CA_PATH=./path/to/ca.pem

# --- Режим letsencrypt ---
SSL_DOMAIN=example.com
SSL_EMAIL=admin@example.com
```

## Режим `file`

Загружает сертификаты из указанных файлов. Если `SSL_CA_PATH` не указан или файл не найден, CA bundle будет пропущен.

## Режим `letsencrypt`

Автоматическое получение и обновление сертификатов через ACME-протокол (Let's Encrypt):

1. При первом запуске генерируется account key и запрашивается сертификат
2. Для прохождения HTTP-01 challenge запускается временный HTTP-сервер на порту 80
3. Полученные сертификаты сохраняются в `modules/ssl/certs/`
4. Если до истечения сертификата осталось менее 30 дней, он обновляется автоматически
5. Проверка обновления выполняется каждые 12 часов (настраивается)

> Для режима `letsencrypt` необходимо, чтобы порт 80 был доступен извне и домен указывал на сервер.

## Использование другими модулями

SSL-модуль запускается в приоритетной очереди до API и Sockets. Остальные модули получают credentials через реестр модулей:

```javascript
const modules = require('./modules');

const credentials = modules.ssl?.getCredentials();
// { key: Buffer, cert: Buffer, ca?: Buffer } или null
```
