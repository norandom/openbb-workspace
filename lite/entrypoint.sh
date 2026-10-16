#!/bin/bash
# Preserve the upstream account and migration flow using private bind state.
set -euo pipefail
source /usr/local/share/openbb/configure-origin.sh
umask 077
DATA_DIR="${DATA_DIR:-/data}"
SECRETS_FILE="${DATA_DIR}/secrets.env"
STATE_DIR="${DATA_DIR}/state"
mkdir -p "$DATA_DIR/storage" "$DATA_DIR/redis" "$STATE_DIR" /opt/code/scripts/cfgs
chown -R appuser:appuser "$DATA_DIR"
chmod 700 "$STATE_DIR" /opt/code/scripts/cfgs

python /usr/local/share/openbb/bootstrap.py "$SECRETS_FILE" /opt/code/scripts/cfgs/config.toml
chown appuser:appuser "$SECRETS_FILE" /opt/code/scripts/cfgs/config.toml
while IFS='=' read -r key value; do
  export "$key=$value"
done < "$SECRETS_FILE"

umask 022
/usr/local/bin/render-frontend-config.sh
envsubst '${PORT} ${PUBLIC_SCHEME} ${PUBLIC_HOST}' < /etc/nginx/templates/default.conf.template > /etc/nginx/sites-available/default
ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/default.dpkg-dist
cd /opt/code
rm -f user_create.json
chown appuser:appuser /opt/code/scripts/cfgs
if [[ "${DATABASE_TYPE}" != "sqlite" ]]; then
  runuser -u appuser -- python /opt/code/init-db.py
fi

umask 077
echo '[entrypoint] Running database migrations.'
runuser -u appuser -- python -m alembic upgrade head
echo '[entrypoint] Initializing local account.'
runuser -u appuser -- python -m scripts.init_users
# init_users creates this operational invitation metadata under the private umask.
chmod 600 user_create.json
touch "$STATE_DIR/initialised"
chown appuser:appuser "$STATE_DIR/initialised"
echo '[entrypoint] Bootstrap complete. Retrieve credentials using docker exec CONTAINER credentials.'
umask 022
exec /opt/.venv/bin/supervisord -c /etc/supervisor/supervisord.conf
