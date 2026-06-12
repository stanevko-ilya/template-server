# Модуль API

REST API сервер на Express 5 с встроенными middleware безопасности и JWT-авторизацией.

## Файл конфигурации

| Параметр | Тип | Описание |
|---|---|---|
| `port` | `string` | Порт сервера. Поддерживает интерполяцию: `${API_PORT}` |
| `sub_url` | `string` | Префикс URL: `api` → `http://host:port/api/...` |
| `paths.methods` | `string` | Директория с методами |
| `paths.static` | `string` | Директория со статическими файлами |
| `headers` | `array` | Дополнительные заголовки (`[{ name, value }]`) |
| `cors` | `object` | Настройки CORS (опционально, передается в `cors()`) |
| `rateLimit.windowMs` | `number` | Окно rate limit в мс (опционально, по умолчанию 15 минут) |
| `rateLimit.max` | `number` | Максимум запросов за окно (опционально, по умолчанию 100) |

> Параметры `cors` и `rateLimit` отсутствуют в конфиге по умолчанию. При необходимости добавьте их в `config.json` — без них используются стандартные значения.

## TLS

Приложение слушает plain HTTP. TLS терминируется внешним nginx (+ Let's Encrypt) — см. [docker/README.md](../../docker/README.md).

## Middleware

Все запросы проходят через цепочку middleware:
1. **helmet** — security-заголовки
2. **cors** — CORS-политики
3. **express-mongo-sanitize** — защита от NoSQL-инъекций
4. **express-rate-limit** — ограничение частоты запросов
5. **static files** — раздача статических файлов
6. **custom headers** — пользовательские заголовки из конфига
7. **OPTIONS handling** — возврат `200` для preflight-запросов
8. **body parsing** — `express.json()`, `express.urlencoded()`
9. **request logging** — логирование метода, URL, статуса и времени ответа

## Создание методов

Создайте каталог с именем метода внутри `methods/`, добавьте `index.js` и `config.json`.

Структура каталогов определяет URL:
```
methods/ping/         → /api/ping
methods/system/ping/  → /api/system/ping
methods/users/        → /api/users
```

### index.js метода

```javascript
const Method = require('../_class');

class Ping extends Method {
    async getResponse(req, res) {
        return { ok: true };
    }

    constructor(url, express) {
        super(__dirname, url, express);
    }
}

module.exports = Ping;
```

### config.json метода

```json
{
    "use": true,
    "method": "get",
    "params": [],
    "errors": []
}
```

| Параметр | Тип | Описание |
|---|---|---|
| `use` | `boolean` | Включен ли метод |
| `method` | `string` | HTTP-метод: `get`, `post`, `put`, `delete` и т.д. |
| `params` | `array` | Параметры запроса (см. ниже) |
| `errors` | `array` | Дополнительные ошибки метода |
| `auth` | `object` | Настройки авторизации (см. ниже) |

### Параметры запроса

```json
{
    "name": "user_id",
    "required": true,
    "type": "objectId",
    "orientation": "positive",
    "interval": [0, 100],
    "valid_values": ["a", "b", "c"]
}
```

| Поле | Тип | Описание |
|---|---|---|
| `name` | `string` | Имя параметра |
| `required` | `boolean` | Обязательный ли параметр |
| `type` | `string` | Тип: `string`, `number`, `object`, `boolean`, `objectId` |
| `orientation` | `string` | `positive` или `negative` — приведение знака числа |
| `interval` | `[number, number]` | Допустимый диапазон для чисел |
| `valid_values` | `array` | Допустимые значения |

### Дополнительные ошибки

```json
{
    "errors": [
        { "code": 1, "message": "Пользователь не найден" }
    ]
}
```

Для возврата ошибки из `getResponse`:
```javascript
return { error_code: 1, status: 404 };
```

### Встроенные ошибки

| Код | Описание |
|---|---|
| `-1` | Ошибка во время выполнения запроса |
| `-2` | Ошибка во время проверки параметров |
| `-3` | Метод отключен |
| `-4` | Необходима авторизация |
| `-5` | Недостаточно прав |

## JWT-авторизация

Добавьте секцию `auth` в `config.json` метода:

```json
{
    "use": true,
    "method": "get",
    "auth": {
        "roles": ["admin", "moderator"]
    }
}
```

Токен передается в заголовке `Authorization: Bearer <token>`. Декодированный payload доступен в `req.user`.

Переменная окружения `JWT_SECRET` задает секретный ключ.

## Встроенные методы

- **ping** (`GET /api/ping`) — возвращает `{ ok: true }`
- **health** (`GET /api/health`) — возвращает статусы всех модулей: `{ status: 'ok', logger: 'on', db: 'on', cache: 'on', api: 'on', sockets: 'on' }`
