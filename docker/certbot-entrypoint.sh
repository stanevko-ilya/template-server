#!/bin/sh
# Первичный выпуск сертификата Let's Encrypt (webroot) + цикл авто-обновления.
set -e

DOMAIN="${LE_DOMAIN:?LE_DOMAIN required}"
EMAIL="${LE_EMAIL:?LE_EMAIL required}"

STAGING_FLAG=""
[ "${LE_STAGING}" = "1" ] && STAGING_FLAG="--staging"

# Первичный выпуск, если сертификата ещё нет
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "[certbot] Выпуск сертификата для $DOMAIN ..."
    certbot certonly --webroot -w /var/www/certbot \
        -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email \
        $STAGING_FLAG --non-interactive \
        || echo "[certbot] Не удалось выпустить сертификат (проверьте DNS A-запись и доступность :80)"
fi

# Цикл авто-обновления (раз в 12ч)
trap exit TERM
while :; do
    certbot renew --webroot -w /var/www/certbot $STAGING_FLAG --quiet || true
    sleep 12h & wait $!
done
