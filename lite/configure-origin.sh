#!/bin/bash
set -euo pipefail
ORIGIN_HELPERS="${ORIGIN_HELPERS:-/usr/local/share/openbb}"
origin_exports="$(python "$ORIGIN_HELPERS/origin_config.py" "${PUBLIC_URL:-http://localhost:23003}" --shell)"
eval "$origin_exports"
export AI_COPILOT_OPENBB_COPILOT=false AI_COPILOT_AI_ENHANCEMENTS=false
export AI_COPILOT_WEB_SEARCH=false AI_COPILOT_SEC_FILINGS=false AI_COPILOT_JINA_AI=false
if [[ -z "${NGINX_RESOLVER:-}" ]]; then
  # Dynamic service routes need the container network's DNS, including Podman.
  NGINX_RESOLVER="$(python - <<'PY'
import ipaddress
from pathlib import Path

try:
    lines = Path('/etc/resolv.conf').read_text().splitlines()
except OSError:
    raise SystemExit('No valid container nameserver; set NGINX_RESOLVER explicitly')
for line in lines:
    fields = line.split('#', 1)[0].split(';', 1)[0].split()
    if len(fields) < 2 or fields[0] != 'nameserver' or '%' in fields[1]:
        continue
    try:
        address = ipaddress.ip_address(fields[1])
    except ValueError:
        continue
    print(f'[{address}]' if address.version == 6 else str(address))
    break
else:
    raise SystemExit('No valid container nameserver; set NGINX_RESOLVER explicitly')
PY
)"
fi
export NGINX_RESOLVER
route_out="${ROUTES_OUT:-/etc/nginx/qopenbb-routes.conf}"
envsubst '${NGINX_RESOLVER} ${PUBLIC_HOST} ${PUBLIC_SCHEME}' < "$ORIGIN_HELPERS/qopenbb-routes.conf.template" > "$route_out"
case "${EXCEL_ENABLED:-false}" in
  true)
    cat >> "$route_out" <<'EOF'
location = /excel { return 308 /excel/; }
location ^~ /excel/ {
  set $excel_origin http://excel:80;
  rewrite ^/excel/(.*)$ /$1 break;
  proxy_pass $excel_origin;
  proxy_intercept_errors off;
}
EOF
    ;;
  false) printf '\nlocation = /excel { return 404; }\nlocation ^~ /excel/ { return 404; }\n' >> "$route_out" ;;
  *) echo 'EXCEL_ENABLED must be true or false' >&2; exit 1 ;;
esac
