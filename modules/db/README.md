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

Создайте файл в каталоге `models/` с описанием схемы Mongoose. Имя файла станет именем модели:

```javascript
// modules/db/models/user.js
const { Schema } = require('mongoose');

module.exports = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
});
```

## Использование

```javascript
const { db } = require('./modules');

// Все модели доступны через db.models
const users = await db.models.user.find();
const user = await db.models.user.create({ name: 'Test', email: 'test@test.com' });
```
