# template-server (TypeScript)

Production-ready шаблон сервера на **TypeScript (ESM)** с модульной архитектурой, организованный как
**монорепозиторий** (Yarn workspaces + Nx):

- **`packages/backend`** — сам сервер (ESM TypeScript, Node ≥ 22).
- **`packages/shared`** — пакет общих типов (`@template-server/shared`), который импортируют и бэкенд, и
  будущий фронтенд: типизация живёт в одном месте. Пакет без зависимостей (чистые типы) — безопасен для браузера.

Заготовленные модули:

- **Logger** — файловое логирование (по умолчанию) + опциональный буферизованный сток в MongoDB (TTL, запросные логи).
- **DB** — MongoDB/Mongoose: replica set, пул/таймауты, авто-`syncIndexes`, отдельное соединение для логов.
- **Cache** — Redis (ioredis) с поддержкой Sentinel (HA), атомарными операциями и graceful-degradation.
- **API** — REST на Express 5: drain guard, request-ID, защита от инъекций, per-route bodyLimit, JWT-авторизация.
- **Sockets** — Socket.IO с CORS, JWT-хендшейком и Redis-adapter (мультиреплика).
- **Notifier** — отдельный процесс фоновых задач: cron-планировщик, распределённый Redis-лок, движок массовой рассылки.
- **Health** — лёгкий health-сервер для процессов без API.
- **Swagger** — автодокументация OpenAPI, генерируется из `config.ts` методов при каждом старте.

TLS терминируется внешним nginx + Let's Encrypt (см. [docker/README.md](docker/README.md)).

> Требуется Node.js >= 22.0.0 и Yarn (classic, v1).

## Установка

```bash
git clone https://github.com/stanevko-ilya/template-server
cd template-server
yarn install
cp packages/backend/.env.example packages/backend/.env
```

Конфиг каждого модуля — типизированный `config.ts`, читающий `process.env` напрямую со значениями по
умолчанию (синтаксис `${VAR}` из JS-версии больше не используется).

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
| `LOGGER_DB_ENABLED` | `true` — включить Mongo-сток логгера | `false` |
| `SWAGGER_ENABLED` | `true` — поднять `/api/docs` | `false` |
| `SERVICE_KEY` | Ключ доступа к Swagger UI и служебным эндпоинтам | — |
| `TEST_MODE` | `true` — отключить rate limit, увеличить bodyLimit | `false` |

Redis и MongoDB **опциональны на старте**: без Redis кэш работает в degraded-режиме (методы возвращают
безопасные значения), без TLS приложение слушает plain HTTP.

## Разработка и запуск

```bash
# Dev (tsx watch): API-процесс / процесс фоновых задач
yarn dev:backend
yarn dev:notifier
# или оба пакета сразу (shared в watch + backend):
yarn dev

# Сборка (nx: shared → backend, tsc → dist + копирование статики)
yarn build

# Прод-запуск скомпилированного кода
yarn workspace @template-server/backend start            # node dist/index.js
yarn workspace @template-server/backend start:notifier   # node dist/notifier.js

# Линт / формат / тесты
yarn lint
yarn format
yarn test
```

В dev backend импортирует `@template-server/shared` как сырой TS-исходник (через tsconfig `paths`); в проде —
через workspace-симлинк на собранный `packages/shared/dist`.

### Docker

```bash
cp .env.docker.example .env.docker
docker compose up -d --build          # HTTP-стек: nginx (LB) + backend (реплики) + notifier + mongo + redis
```

Образ собирается multi-stage из корня репозитория (`packages/backend/Dockerfile`). Продакшен с TLS/Let's
Encrypt — оверлей `docker-compose.prod.yml`, см. [docker/README.md](docker/README.md).

## Архитектура

### Пакет shared (`@template-server/shared`)

`packages/shared/src` — чистые типы и константы, общие для бэкенда и фронта: коды ошибок (`ERROR_CODES`/
`ERROR_MESSAGES`), перечисления (`ModuleStatus`, `LogLevel`, `ParamType`, ...), конверт ответа
(`ApiResponse<T>`/`ApiSuccess`/`ApiError`), описание параметров (`ParamSpec`), маршруты (`API_ROUTES`) и
типы документов БД (`Log`, `NotificationLog`). Фронтенд добавляет `@template-server/shared` как зависимость
и импортирует типы оттуда.

### Модульная система (`packages/backend/src`)

Каждый модуль расположен в `src/modules/<name>/` и наследуется от базового класса `Module<TConfig>`
(`src/modules/_class.ts`): единый lifecycle `start()`→`stop()`, статус (`on`/`off`/`load`), типизированный
конфиг. Модули **авто-обнаруживаются** загрузчиком (`src/modules.ts` + `directorySearch`) и подключаются
через асинхронный `import()`. Расширение исходников (`.ts` под `tsx`, `.js` под собранным `dist`) определяется
в рантайме из `import.meta.filename`.

Очередь запуска — `priority_launch_queue` в `src/index.ts`: `logger` → `db` → `cache` → остальные.
**Мультипроцесс**: `index.ts` исключает `notifier`/`health` (они живут в `notifier.ts`); `notifier.ts`
исключает `api`/`sockets`.

| Модуль | Описание |
|---|---|
| [Logger](packages/backend/src/modules/logger/) | Файловое логирование + опциональный буферизованный Mongo-сток (`LOGGER_DB_ENABLED`) |
| [DB](packages/backend/src/modules/db/) | MongoDB/Mongoose: replica set, пул, `syncIndexes`, отдельное соединение логов |
| [Cache](packages/backend/src/modules/cache/) | Redis (ioredis): Sentinel, `get/set/incr/setnx/expire/exists`, graceful-degradation |
| [API](packages/backend/src/modules/api/) | Express 5: drain guard, request-ID, injection guard, per-route bodyLimit, JWT |
| [Sockets](packages/backend/src/modules/sockets/) | Socket.IO: CORS, JWT-хендшейк, Redis-adapter |
| Notifier | Планировщик фоновых задач (cron + распределённый лок), авто-дискавери джоб |
| Health | Минимальный health-сервер `GET /api/ping` |

### Фоновые задачи (Notifier)

Джобы — файлы `src/modules/notifier/jobs/*.ts`, экспортируют по умолчанию объект `NotifierJob`:

```ts
import type { NotifierJob } from '../index.js';

const job: NotifierJob = {
    name: 'my-job',
    enabled: true,
    daily: { hour: 9, minute: 0 }, // ежедневно в 09:00 (config.timezone_offset_hours)
    // или: interval_minutes: 15,
    async run(modules, config) {
        /* ... */
    },
};
export default job;
```

Параллельный запуск защищён внутрипроцессным гардом + распределённым Redis-локом. Тулкит массовой рассылки —
`src/functions/{rateLimiter,batchPipeline,pluralize,notifierHelpers}.ts` (token-bucket лимит, пул
конкурентности, ретраи с backoff, дедуп через Redis-сеты).

### Swagger

При `SWAGGER_ENABLED=true` спека OpenAPI 3 генерируется из `config.ts` методов при каждом старте и отдаётся
на `/api/docs?key=SERVICE_KEY`. Авторизация — JWT Bearer (кнопка **Authorize**).

## Безопасность и надёжность API

- **helmet** / **cors** / **express-rate-limit** (глобальный + per-user по JWT, опционально через Redis-стор).
- **NoSQL-санитайз** тела (рекурсивно вырезает ключи на `$`) — per-route.
- **Защита от инъекций** в query-параметрах (XSS-паттерны → 400).
- **Request-ID** (`crypto.randomUUID`) и расширенное логирование запросов/ответов.
- **Per-route bodyLimit** (`config.bodyLimit` метода), `array`-тип параметров.
- **JWT-авторизация** с ролевым доступом (`config.auth.roles`).
- **Drain guard**: при shutdown новые запросы получают 503, активные дорабатываются (до 5с), затем сервер закрывается.

## Тестирование

[Vitest](https://vitest.dev/), тесты в `packages/backend/tests/`. `yarn test`.

- `tests/integration/modules.test.ts` — lifecycle всех модулей (logger, db, cache, api, sockets, notifier, health).
- `tests/integration/api.test.ts` — авто-раннер API-методов через `getTest()`.
- `tests/unit/` — юнит-тесты утилит (rateLimiter, batchPipeline, pluralize, swagger, cache, directorySearch и др.).

Реализуйте `getTest()` в классе метода — раннер подхватит его автоматически (для `auth`-методов Bearer-токен
добавляется автоматически).

## Graceful Shutdown

Обработка `SIGTERM`/`SIGINT`: остановка модулей в обратном порядке, drain активных HTTP-запросов, flush логов.
Таймаут принудительного выхода — 10 секунд.
