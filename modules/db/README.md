# Система БД
Данный модуль позволит управлять mongoDB

## Файл конфигурации
Параметры:
- `url` - адрес для подключения к mongoDB

## Создание моделей
Для создание модели в базе необходимо описать схему в каталоге `models`:
https://github.com/stanevko-ilya/template-server/blob/v2/modules/db/models/_template.js
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
