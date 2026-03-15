# Модуль DB

Подключение и работа с MongoDB через Mongoose.

## Файл конфигурации

| Параметр | Тип | Описание |
|---|---|---|
| `url` | `string` | URL подключения к MongoDB. Поддерживает интерполяцию: `${DB_URL}` |
| `directory` | `string` | Директория с файлами моделей |

## Переменные окружения

```
DB_URL=mongodb://localhost:27017/mydb
```

## Создание моделей

Создайте файл в каталоге `models/`. Файл должен экспортировать массив из двух элементов: определение схемы и опции. Имя файла (без расширения) станет именем модели:

```javascript
// modules/db/models/user.js
module.exports = [
    // Определение схемы
    {
        name: { type: String, required: true },
        email: { type: String, required: true },
    },
    // Опции
    {
        versionKey: false
    }
];
```

> Файл `_template.js` игнорируется при загрузке и служит образцом.

## Использование

```javascript
const { db } = require('./modules');

// Все модели доступны через db.models
const users = await db.models.user.find();
const user = await db.models.user.create({ name: 'Test', email: 'test@test.com' });
```

## Метод `req`

Универсальный метод для выполнения запросов к БД с логированием:

```javascript
const { db } = require('./modules');

// req(model_name, method_name, params)
const users = await db.req('user', 'find', [{ name: 'Test' }]);
const user = await db.req('user', 'findById', ['507f1f77bcf86cd799439011']);
```

Параметры:
- `model_name` — имя модели (соответствует имени файла)
- `method_name` — метод Mongoose-модели (`find`, `findById`, `create`, `updateOne` и т.д.)
- `params` — массив аргументов, которые будут переданы в метод
