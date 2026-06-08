# template-server v2.2

Готовый production-ready шаблон сервера на Node.js с модульной архитектурой. Включает:

- **Logger** — файловое логирование (по умолчанию) + опциональный буферизованный сток в MongoDB (TTL, запросные логи).
- **DB** — MongoDB/Mongoose: replica set, пул/таймауты, авто-`syncIndexes`, отдельное соединение для логов.
- **Cache** — Redis (ioredis) с поддержкой Sentinel (HA), атомарными операциями и graceful-degradation.
- **API** — REST на Express 5: drain guard, request-ID, защита от инъекций, per-route bodyLimit, JWT-авторизация.
- **Sockets** — Socket.IO с CORS, JWT-хендшейком и Redis-adapter (мультиреплика).
- **Notifier** — отдельный процесс фоновых задач: cron-планировщик, распределённый Redis-лок, движок массовой рассылки.
- **Health** — лёгкий health-сервер для процессов без API.
- **Swagger** — автодокументация OpenAPI, генерируется из `config.json` методов при каждом старте.

TLS терминируется внешним nginx + Let's Encrypt (см. [docker/README.md](docker/README.md)).

> Требуется Node.js >= 22.0.0

## Установка

```bash
git clone https://github.com/stanevko-ilya/template-server
cd template-server
npm install
cp .env.example .env
```

Переменные окружения автоматически подставляются в JSON-конфиги модулей через синтаксис `${VAR_NAME}`.

### Основные переменные

| Переменная | Описание | По умолчанию |
|---|---|---|
| `DB_URL` | URL подключения к MongoDB | `mongodb://localhost:27017/mydb` |
| `MONGO_REPLICA_SET` | Имя replica set (пусто = standalone) | — |
| `API_PORT` | Порт API-сервера | `3000` |
| `SOCKETS_PORT` | Порт Socket-сервера | `3001` |
| `HEALTH_PORT` | Порт health-сервера (процесс notifier) | `3001` |
| `JWT_SECRET` | Секрет для JWT-токенов | — |
| `REDIS_HOST` / `REDIS_PORT` | Прямое подключение к Redis | `127.0.0.1` / `6379` |
| `REDIS_SENTINELS_JSON` / `REDIS_MASTER_NAME` | HA через Sentinel | — |
| `SWAGGER_ENABLED` | `true` — поднять `/api/docs` | `false` |
| `SERVICE_KEY` | Ключ доступа к Swagger UI и служебным эндпоинтам | — |
| `TEST_MODE` | `true` — отключить rate limit, увеличить bodyLimit | `false` |

Redis и MongoDB **опциональны на старте**: без Redis кэш работает в degraded-режиме (методы возвращают безопасные значения), без TLS приложение слушает plain HTTP.

## Запуск

```bash
# API-процесс (logger → db → cache → api + sockets)
npm start

# Процесс фоновых задач (logger → db → cache → notifier + health)
npm run notifier

# Линтинг / формат / тесты
npm run lint
npm run format
npm test
```

### Docker

```bash
cp .env.docker.example .env.docker
docker compose up -d --build          # HTTP-стек: nginx (LB) + backend (реплики) + notifier + mongo + redis
```

Продакшен с TLS/Let's Encrypt — оверлей `docker-compose.prod.yml`, см. [docker/README.md](docker/README.md).

## Модульная структура

Каждый модуль расположен в `modules/` и наследуется от базового класса `Module` (`modules/_class.js`): единый lifecycle `start()`→`stop()`, статус (`on`/`off`/`load`), загрузка `config.json` с подстановкой env. Модули авто-обнаруживаются по `index.js`.

Очередь запуска — `priority_launch_queue` в `index.js`: `logger` → `db` → `cache` → остальные. **Мультипроцесс**: `index.js` исключает `notifier`/`health` (они живут в `notifier.js`); `notifier.js` исключает `api`/`sockets`.

### Заготовленные модули

| Модуль | Описание |
|---|---|
| [Logger](modules/logger/) | Файловое логирование + опциональный буферизованный Mongo-сток (флаг `db_enabled`) |
| [DB](modules/db/) | MongoDB/Mongoose: replica set, пул, `syncIndexes`, отдельное соединение логов |
| [Cache](modules/cache/) | Redis (ioredis): Sentinel, `get/set/incr/setnx/expire/exists`, graceful-degradation |
| [API](modules/api/) | Express 5: drain guard, request-ID, injection guard, per-route bodyLimit, JWT |
| [Sockets](modules/sockets/) | Socket.IO: CORS, JWT-хендшейк, Redis-adapter |
| [Notifier](modules/notifier/) | Планировщик фоновых задач (cron + распределённый лок), авто-дискавери джоб |
| [Health](modules/health/) | Минимальный health-сервер `GET /api/ping` |

### Кэш (Redis)

`modules.cache`: `get/set/getJson/del/incr/setnx/expire/exists` + `client`. Все методы при недоступности Redis возвращают безопасные дефолты (не бросают). Sentinel включается через `REDIS_SENTINELS_JSON`.

### Фоновые задачи (Notifier)

Джобы — файлы `modules/notifier/jobs/*.js`, экспортируют:

```js
module.exports = {
    name: 'my-job',
    enabled: true,
    daily: { hour: 9, minute: 0 },   // ежедневно в 09:00 (config.timezone_offset_hours)
    // или: interval_minutes: 15,     // каждые 15 минут
    async run(modules, config) { /* ... */ },
};
```

Параллельный запуск защищён внутрипроцессным гардом + распределённым Redis-локом. Тулкит массовой рассылки — `functions/{rateLimiter,batchPipeline,pluralize,notifierHelpers}.js` (token-bucket лимит, пул конкурентности, ретраи с backoff, дедуп через Redis-сеты).

### Swagger

При `SWAGGER_ENABLED=true` спека OpenAPI 3 генерируется из `config.json` методов при каждом старте и отдаётся на `/api/docs?key=SERVICE_KEY`. Авторизация — JWT Bearer (кнопка **Authorize**).

## Утилиты (`functions/`)

| Файл | Описание |
|---|---|
| `generateId.js` / `getRandom.js` / `asyncDelay.js` | ID, случайные числа, промис-задержка |
| `directorySearch.js` | Рекурсивный поиск файлов (флаг `deep` для вложенных маршрутов) |
| `array.js` / `date.js` / `number.js` / `object.js` | Хелперы по типам данных |
| `rateLimiter.js` | Token-bucket лимитер скорости + `getRps()` |
| `batchPipeline.js` | Массовая рассылка: пул конкурентности, ретраи, backoff, abort |
| `pluralize.js` | Русское склонение + рендер шаблонов сообщений |
| `notifierHelpers.js` | Дедуп отправок (Redis-сеты) + запись в `notification-log` |

## Безопасность и надёжность API

- **helmet** / **cors** / **express-rate-limit** (глобальный + per-user по JWT, опционально через Redis-стор).
- **NoSQL-санитайз** тела (рекурсивно вырезает ключи на `$`) — per-route.
- **Защита от инъекций** в query-параметрах (SQL/XSS-паттерны → 400).
- **Request-ID** (`crypto.randomUUID`) и расширенное логирование запросов/ответов.
- **Per-route bodyLimit** (`config.bodyLimit` метода), `array`-тип параметров.
- **JWT-авторизация** с ролевым доступом (`config.auth.roles`).
- **Drain guard**: при shutdown новые запросы получают 503, активные дорабатываются (до 5с), затем сервер закрывается.

## Тестирование

[Vitest](https://vitest.dev/), тесты в `tests/`. `npm test`.

- `tests/integration/modules.test.js` — lifecycle всех модулей (logger, db, cache, api, sockets, notifier, health).
- `tests/integration/api.test.js` — авто-раннер API-методов через `getTest()`.
- `tests/unit/` — юнит-тесты утилит (rateLimiter, batchPipeline, pluralize, swagger, cache, directorySearch и др.).

Реализуйте `getTest()` в классе метода — раннер подхватит его автоматически (для `auth`-методов Bearer-токен добавляется автоматически).

## Graceful Shutdown

Обработка `SIGTERM`/`SIGINT`: остановка модулей в обратном порядке, drain активных HTTP-запросов, flush логов. Таймаут принудительного выхода — 10 секунд.
