# template-server
Данный проект представляет шаблон сервера, который может позволить более быстрое написание backend части для проекта.
> В русском тексте как в документации, так и в коде могут быть опечатки, орфографические и пунктуационные ошибки :)

> В ходе практического применения шаблона были выявлены некоторые недоработки и ошибки. Сейчас идёт работа по переработке шаблона

## Установка
1. Скопируйте код
2. Установите все пакеты, необходимые для работы
```
$ git clone https://github.com/stanevko-ilya/template-server
$ npm i -d
```

## Запуск
`npm start` или `node index.js`

## Использование
Проект уже имеет 4 заготовленных модуля, которые скорее всего Вам пригодятся
1. [Система логирования](https://github.com/stanevko-ilya/template-server/tree/master/logger) - позволяет вести логирование действий, которые происходят на сервер
2. [Система API](https://github.com/stanevko-ilya/template-server/tree/master/api) - используется для создание api
3. [Система БД](https://github.com/stanevko-ilya/template-server/tree/master/db) - используется для запросов к mongoDB
4. [Консольный менеджер](https://github.com/stanevko-ilya/template-server/tree/master/console_manager) - позволяет управлять другими системами сервера посредством консоли

Доступ к уже встроеным модулям можно получить через файл `modules.js`:
```javascript
const { logger, db, api } = require('modules.js');
```
> При написание своих модулей, рекомендую реализовать для них +- такой же интерфейс и подключение

## Кастоматизация встроенных типов
В файле `customize.js` дополнены некоторые прототипы:
> Дополнения прототипов рекомендую дописывать в этом же файле
- `Number.toStringWithZeros` - возвращает строку, в которой число приведено к формату с двумя символами (только для целых положительных чисел)
- `Array.isEmpty` - вернет `true`, если массив пустой
- `Array.shuffle` - перемешает элементы в массиве
- `Array.clone` - создаст независимую копию массива
- `Object.clone` - создаст независимую копию объекта
- `Date.toShortDate` - вернет дату, месяц, год в строке
```javascript
21.toStringWithZeros() // '21'
4.toStringWithZeros() // '04'
10.toStringWithZeros() // '10'
7.toStringWithZeros() // '07'

[].isEmpty() // true
[21,4,10,7].isEmpty() // false

new Date(1682024400000).toShortDate() // 21.04
new Date(1688936400000).toShortDate(true) // 10.07.2023
```
