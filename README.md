# template-server v2

Готовый шаблон production-ready сервера на Node.js с модульной архитектурой. Включает логирование, работу с MongoDB, REST API (Express 5), WebSocket-сервер (Socket.IO), SSL/TLS, JWT-авторизацию и Docker-поддержку.

> Требуется Node.js >= 22.0.0

## Установка

```bash
git clone https://github.com/stanevko-ilya/template-server
cd template-server
npm install
```

## Конфигурация

Все настройки задаются через переменные окружения. Скопируйте шаблон и заполните нужные значения:

```bash
cp .env.example .env
```

Переменные окружения автоматически подставляются в JSON-конфиги модулей через синтаксис `${VAR_NAME}`.

### Основные переменные

| Переменная | Описание | По умолчанию |
|---|---|---|
| `DB_URL` | URL подключения к MongoDB | `mongodb://localhost:27017/mydb` |
| `API_PORT` | Порт API-сервера | `443` |
| `SOCKETS_PORT` | Порт Socket-сервера | `444` |
| `JWT_SECRET` | Секретный ключ для JWT-токенов | — |
| `SSL_MODE` | Режим SSL: `off`, `file`, `letsencrypt` | `off` |

## Запуск

```bash
# Запуск
npm start

# Линтинг
npm run lint
npm run lint:fix

# Форматирование
npm run format

# Тесты (все)
npm test

# Интеграционные тесты модулей
npx vitest run tests/integration/modules.test.js

# Интеграционные тесты API
npx vitest run tests/integration/api.test.js
```

### Docker

```bash
docker compose up -d
```

Приложение запустится вместе с MongoDB. В `Dockerfile` настроен healthcheck на `/api/ping`.

### PM2

```bash
pm2 start ecosystem.config.js
```

## Модульная структура

Каждый модуль расположен в каталоге `modules/` и наследуется от базового класса `Module` (`modules/_class.js`), который предоставляет единый lifecycle: `start()` → `stop()`, управление статусом (`on`/`off`) и загрузку конфигурации из `config.json`.

Модули автоматически обнаруживаются по наличию файла `index.js` в подкаталогах `modules/`.

Очередь запуска задается в `index.js` через массив `priority_launch_queue`. По умолчанию: `logger` → `db` → `ssl` → остальные модули.

### Заготовленные модули

| Модуль | Описание |
|---|---|
| [Logger](modules/logger/) | Логирование в файлы и консоль с ротацией и очисткой |
| [DB](modules/db/) | Подключение и работа с MongoDB через Mongoose |
| [SSL](modules/ssl/) | Управление SSL-сертификатами (файлы или Let's Encrypt) |
| [API](modules/api/) | REST API на Express 5 с middleware безопасности |
| [Sockets](modules/sockets/) | WebSocket-сервер на Socket.IO |

## Утилиты (`functions/`)

| Файл | Описание |
|---|---|
| `generateId.js` | Генерация криптостойких ID через `crypto.randomBytes()` |
| `getRandom.js` | Случайные числа (целые и дробные) |
| `asyncDelay.js` | Промис-обертка над `setTimeout` |
| `directorySearch.js` | Рекурсивный поиск файлов в каталоге |
| `array.js` | `isEmpty`, `shuffle`, `cloneArray`, `target`, `equal`, `getDepth` |
| `date.js` | `toShortDate`, `toUTCZone`, `isValid`, `toTimeDate` |
| `number.js` | `toStringWithZeros` |
| `object.js` | `isObject`, `cloneObject`, `deepCopy` |

## Тестирование

Используется [Vitest](https://vitest.dev/). Тесты расположены в `tests/`.

### Структура тестов

```
tests/
├── integration/
│   ├── modules.test.js   # Lifecycle модулей (start/stop)
│   └── api.test.js        # Автотесты всех API-методов
└── unit/                  # Юнит-тесты утилит
```

### Интеграционные тесты модулей (`modules.test.js`)

Проверяют корректность запуска и остановки всех модулей (logger, ssl, api, sockets). Каждый модуль должен получить статус `on` после `start()` и `off` после `stop()`.

### Интеграционные тесты API (`api.test.js`)

Автоматический тестовый раннер, который:
1. Находит все API-методы через `directorySearch`
2. Вызывает `getTest()` у каждого метода
3. Для методов с не-`null` результатом создаёт тестовый кейс
4. Выполняет реальные HTTP-запросы к запущенному серверу

### Добавление теста для нового API-метода

Реализуйте метод `getTest()` в классе вашего метода. Тестовый раннер подхватит его автоматически.

```js
class MyMethod extends Method {
    getResponse(req) { /* ... */ }

    getTest() {
        return {
            request: {
                params: { key: 'value' },    // query для GET, body для POST
                headers: {}                   // опционально
            },
            expect: {
                status: 200,
                body: { result: 'expected' }  // объект (deepEqual) или функция (динамическая проверка)
            }
        };
    }

    constructor(url, express) { super(__dirname, url, express) }
}
```

Поле `expect.body` может быть функцией для динамической валидации:

```js
expect: {
    status: 200,
    body: (response) => response.status === 'ok'
}
```

Для методов с JWT-авторизацией (`auth` в `config.json`) тестовый раннер автоматически добавляет Bearer-токен.

## Безопасность

API-сервер включает следующие middleware:
- **helmet** — стандартные security-заголовки
- **cors** — настраиваемые CORS-политики
- **express-rate-limit** — ограничение частоты запросов
- **express-mongo-sanitize** — защита от NoSQL-инъекций
- **JWT-авторизация** — Bearer-токены с ролевым доступом

## Graceful Shutdown

Обработка сигналов `SIGTERM` и `SIGINT` с последовательной остановкой модулей в обратном порядке. Таймаут принудительного завершения — 10 секунд.
