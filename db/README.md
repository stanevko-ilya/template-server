# Система БД
Данный модуль позволит управлять mongoDB

## Файл конфигурации
Параметры:
- `url` - адрес для подключения к mongoDB

## Создание моделей
Для создание модели в базе необходимо описать схему в каталоге `schemes`:
https://github.com/stanevko-ilya/template-server/blob/440f276ce60557e5a4f377f0e60720c9199edf71/db/schemes/template.js#L1-L8
> Какое имя файла будет присвоено схеме, такое же имя будет присвоено моделе.

## Использование
Все инициализированные модели хранятся в объекте `models` в модуле `db`, пример запроса:
```javascript
const { db } = require('modules.js');
async function req() {
    console.log(await db.models.template.find());
}
req();
```

## Запросы к БД через консольный менеджер
В модуле `db` консольного менеджера присутсвует функция `req`, которая позволяет выполнять запросы к БД:
```
ROOT > use db
db > help req
req <request> - Запрос к базе данных

Параметры:
   <request> Запрос, который необходимо выполнить к БД. Используйте синтаксис MongoDBCompass
```

В параметр `request` необходимо передать запрос схожий по синтаксису с MongoDBCompass, пример:
```
ROOT > use db
db > req db.template.findOne({ "id": "123" })
null
db > req db.template.findOne({ "last_name": "Smirnova" }, { "_id": 0 })
null
```

При составление запроса необходимо ключи объектов указывать с кавычками, для декодирования системой.
