# Docker / деплой

## Локально / dev (HTTP)

```bash
cp .env.docker.example .env.docker   # отредактируйте JWT_SECRET, SERVICE_KEY
docker compose up -d --build
# nginx → http://localhost/api/ping
```

Стек: `nginx` (балансировка по репликам) → `backend` (×3) + `notifier` + `mongo` (replica set `rs0`) + `redis`.
Масштабирование реплик: `deploy.replicas` у сервиса `backend` в `docker-compose.yml`.

## Продакшен (TLS + Let's Encrypt)

Требуется домен с A-записью на сервер и открытый :80/:443.

1. Заполните `.env.docker`: `LE_DOMAIN`, `LE_EMAIL`, `LE_STAGING=1` (тест) / `0` (боевой).

2. **Bootstrap сертификата** (chicken-egg: nginx с TLS не стартует без сертификата).
   Поднимите временный HTTP-конфиг для ACME-челленджа:
   ```bash
   # одноразово подменяем prod-шаблон на init-шаблон
   docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.prod.yml \
     run --rm -v "$PWD/docker/nginx.init-ssl.conf.template:/etc/nginx/templates/default.conf.template:ro" \
     -e DOMAIN=$LE_DOMAIN -p 80:80 nginx &
   # сервис certbot выпустит сертификат в volume certbot-certs
   docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.prod.yml up -d certbot
   ```
   Либо проще: временно укажите в `docker-compose.prod.yml` у `nginx` монтирование
   `nginx.init-ssl.conf.template`, поднимите стек, дождитесь выпуска сертификата
   контейнером `certbot`, затем верните `nginx.prod.conf.template` и `docker compose ... up -d nginx`.

3. Полный запуск:
   ```bash
   docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```
   `nginx` терминирует TLS и проксирует на `backend`; `certbot` обновляет сертификат
   (раз в 12ч), `nginx` перечитывает конфиг раз в 6ч.

## MongoDB с авторизацией (продакшен)

Базовый `mongo` поднят без auth. Для боевого включите `--auth --keyFile` и replica set:
см. паттерн с `mongo-keyfile-init` (генерация keyfile в named volume) и `MONGO_USER/PASSWORD`,
затем `DB_URL=mongodb://mongo:27017/appdb?authSource=admin` + `MONGO_USER`/`MONGO_PASSWORD`.
