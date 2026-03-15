# Модуль Logger

Логирование действий сервера в файлы и консоль с поддержкой ротации по дням и автоматической очисткой старых логов.

## Файл конфигурации

| Параметр | Тип | Описание |
|---|---|---|
| `UTC` | `boolean` | `true` для ведения логов по UTC+0 |
| `directory` | `string` | Директория для хранения логов |
| `format.file_name` | `string` | Формат имени файла (`%DD%`, `%MM%`, `%YYYY%`, `%YY%`, `%D%`, `%M%`) |
| `format.file_extension` | `string` | Расширение файлов логов |
| `format.log` | `string` | Формат строки лога (`%level%`, `%HH%`, `%MM%`, `%SS%`, `%H%`, `%M%`, `%S%`, `%text%`) |
| `json_format` | `boolean` | `true` для structured logging в JSON-формате |
| `save_logs` | `number` | Количество дней хранения логов. Файлы старше этого срока удаляются при запуске |

## Вывод в консоль

Все логи автоматически дублируются в консоль:
- `info` → `console.log` (stdout)
- `warn` → `console.warn` (stderr)
- `error` → `console.error` (stderr)

Формат в консоли идентичен формату в файле.

## Использование

```javascript
const { logger } = require('./modules');

// Через метод log с указанием уровня
logger.log('info', 'Сервер запущен');

// Через сокращения
logger.info('Информационное сообщение');
logger.warn('Предупреждение');
logger.error('Ошибка');

// Несколько сообщений
logger.info(['Строка 1', 'Строка 2']);
```

## Чтение логов

```javascript
// Вернет содержимое файла как строку или false
const content = await logger.get('15.03.2026');
```

## JSON-формат

При `json_format: true` каждая запись выглядит так:

```json
{"level":"INFO","timestamp":"2026-03-15T12:00:00.000Z","message":"Сервер запущен"}
```
