# Система API
Данный моудль позволит создать и настроить api

## Файл конфигурации
Параметры:
- `https` - `true` для использования https-протокола
- `port` - порт, на котором будет запускаться сервер
- `timeout` - максимальное время в мс для ответа сервера на запросы
- `sub_url` - дополнительный путь в адрессной строке для `'api'` => `http://{ip}:{port}/api`

## Настройка SSL
Для домена, на котором планируется развернуть API, необходимо выпустить SSL-сертифика и запонить файлы в папке `SSL-certification`:
- `key.key` - `-----BEGIN RSA PRIVATE KEY-----`
- `certificat.crt` - `-----BEGIN CERTIFICATE-----(Основной)`
- `domain.cabundle` - `-----BEGIN CERTIFICATE-----(Основной)`, `-----BEGIN CERTIFICATE-----(корневой)`, `-----BEGIN CERTIFICATE-----(промежуточный)`

## Создание методов
Для добавления метода необходимо создать каталог с название метода внутри каталог `methods`, внутри каталога необходимо создать файл `index.js` и описать обработчик в виде класса. В функцию `get_response` передаются параметры `req` и `res`, при помощи которых можно взаимодействовать с интерфейсом запроса, для использования заготовленного функционала достаточно вернуть объект, который будет отправлен для в виде овтета.

Для заготовленного метода ping URL адрес по умолчанию будет: `http://{ip}:{port}/api/ping`, если необходимо, чтобы URL был `http://{ip}:{port}/api/system/ping`, то в каталоге `methods` необходимо создать каталог `saystem`, и в нём создать каталог `ping`, в котором будет описан обработчки

## Файл конфигурации метода
Параметры:
- `use` - флаг, отвечающий за прослушевание метода
- `method` - тип метода: `'get'`, `'post'` и т.д.
- `params` - параметры, которые должен принимать метод

Формат для параметра `params`:
```javascript
"params": [{
    "name": String, // Имя параметра
    "required": Boolean, // Является ли параметр обязательным
    "type": "string"|"number"|"object"|"boolean"|"objectId", // Тип получаемого значения
    "orientation": "positive"|"negative", // Используется для присвоения определнного знака числу, если type = "number"; Не указывайте, если знак должен остаться неизменным
    "interval": [Number, Number] // Проверка принадлежности значения к промежутку, если type = "number"; Не указывайте, если ограничей для значения нет
    "valid_values": Array<*> // Допустимые значения параметра
}]
```