# syntax=docker/dockerfile:1.6
#
# QOpenBB Full Workspace packaging. Frontend inputs retain the frozen Bun lock.
# Backend inputs retain the Poetry lock; protected uv installs its exact export.
# Build context is the allowlisted assembled Workspace source, never live state.
# Application image assembly belongs to the Dagger build-only catalog.
#
###############################################
# Frontend — build terminalpro SPA in runtime mode
###############################################
FROM docker.io/oven/bun:1.4.3@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS bun-tool
FROM docker.io/library/node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS frontend-build

ARG OPENBB_IMAGE_VARIANT=full
# Public release identity supplied by the caller; no private terminalpro .env.
ARG VITE_RELEASE_VERSION
ENV NODE_OPTIONS="--max-old-space-size=8192" \
    SAFE_CHAIN_MINIMUM_PACKAGE_AGE_HOURS=48 \
    PATH="/root/.safe-chain/shims:/usr/local/bin:$PATH"
COPY --from=bun-tool /usr/local/bin/bun /usr/local/bin/bun
ADD --chmod=755 --checksum=sha256:3462a8395f822b392b7c0808c70116ef90e17a5a1479e604cfc41d57bfbd827c https://github.com/AikidoSec/safe-chain/releases/download/1.5.25/safe-chain-linuxstatic-x64 /usr/local/bin/safe-chain
WORKDIR /app
COPY terminalpro/package.json terminalpro/bun.lock ./
RUN safe-chain bun safe-chain-verify && safe-chain bun install --frozen-lockfile
COPY terminalpro/ ./
COPY lite/frontend.env ./frontend.lite.env
COPY lite/frontend.full.env ./frontend.full.env
RUN test -n "$VITE_RELEASE_VERSION" && case "$OPENBB_IMAGE_VARIANT" in \
      lite|full) cp "./frontend.${OPENBB_IMAGE_VARIANT}.env" ./.env ;; \
      *) echo "Unknown OPENBB_IMAGE_VARIANT=$OPENBB_IMAGE_VARIANT" >&2; exit 1 ;; \
    esac
ENV VITE_RELEASE_VERSION=${VITE_RELEASE_VERSION} \
    VITE_TRADINGVIEW_ENABLED=false
RUN bun run build:runtime


###############################################
# Backend base — python + poetry deps
###############################################
FROM docker.io/library/python:3.13.15-slim-bookworm@sha256:2325bb286ec344af3e5898cc224b5844e2707ac6e26b1632516fd3edc84a5e26 AS python-base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONIOENCODING=utf-8 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_DEFAULT_TIMEOUT=100 \
    POETRY_VERSION=2.3.2 \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1 \
    PYSETUP_PATH="/opt" \
    VENV_PATH="/opt/.venv" \
    TZ="America/New_York"

ENV PATH="$POETRY_HOME/bin:$VENV_PATH/bin:$PATH"

ADD --checksum=sha256:68a509da24b06b4223a1c0175fb5eb5bc79342b76cbeff0cfe51ac3f5b17b6b2 https://github.com/astral-sh/uv/releases/download/0.12.5/uv-x86_64-unknown-linux-gnu.tar.gz /tmp/uv.tar.gz
RUN tar -xzf /tmp/uv.tar.gz -C /tmp && cp /tmp/uv-x86_64-unknown-linux-gnu/uv /usr/local/bin/uv && rm -rf /tmp/uv*
ADD --chmod=755 --checksum=sha256:3462a8395f822b392b7c0808c70116ef90e17a5a1479e604cfc41d57bfbd827c https://github.com/AikidoSec/safe-chain/releases/download/1.5.25/safe-chain-linuxstatic-x64 /usr/local/bin/safe-chain
ENV SAFE_CHAIN_MINIMUM_PACKAGE_AGE_HOURS=48


FROM python-base AS backend-build

RUN apt-get update -y \
    && apt-get install --no-install-recommends -y \
       curl build-essential git unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR $PYSETUP_PATH

COPY lite/build-tools.txt /opt/build-tools.txt
RUN safe-chain uv safe-chain-verify \
    && uv venv /opt/tools \
    && safe-chain uv pip sync --python /opt/tools/bin/python --require-hashes /opt/build-tools.txt

COPY backend/pyproject.toml backend/poetry.lock ./
# Reject drift instead of resolving a different application dependency set.
RUN /opt/tools/bin/poetry check --lock \
    && /opt/tools/bin/poetry export --only main --without-hashes -o /opt/backend-requirements.txt \
    && uv venv "$VENV_PATH" \
    && safe-chain uv pip sync --python "$VENV_PATH/bin/python" --build-constraints /opt/build-tools.txt /opt/backend-requirements.txt \
    && safe-chain uv pip install --python "$VENV_PATH/bin/python" --no-deps Cython==3.2.4 setuptools==82.0.1 supervisor==4.3.0

RUN rm -rf $VENV_PATH/src/slowapi/poetry.lock $VENV_PATH/src/slowapi/docs/requirements.txt


###############################################
# Backend compile — produce .so for api / routers / utilities
###############################################
FROM backend-build AS backend-compile

WORKDIR $PYSETUP_PATH/code

COPY backend/setup_compile.py ./
COPY backend/api ./api
COPY backend/routers ./routers
COPY backend/utilities ./utilities

RUN . $VENV_PATH/bin/activate \
    && python setup_compile.py build_ext --inplace

RUN find api routers utilities -name "*.py" ! -name "__init__.py" | while read -r f; do \
        base="${f%.py}"; \
        if ls "${base}".cpython-*.so >/dev/null 2>&1; then rm "$f"; fi; \
    done \
    && find api routers utilities -name "*.c" -delete \
    && find . -type d -name "__pycache__" -prune -exec rm -rf {} + \
    && find api routers utilities -name "*.so" -exec strip --strip-unneeded {} +

# Trim the venv now that compilation is done. Cython was build-only. Bytecode
# (__pycache__/*.pyc) is recreated on first import as needed and adds up to
# ~30-50 MB across site-packages.
#
# DO NOT blindly delete dirs named "tests" / "docs" / "examples" here —
# several packages ship real importable submodules under those names
# (e.g. boto3.docs is a runtime module, not documentation).
RUN uv pip uninstall --python "$VENV_PATH/bin/python" cython setuptools \
    && find $VENV_PATH -depth -type d -name __pycache__ -exec rm -rf {} + \
    && find $VENV_PATH -depth -name "*.pyc" -delete \
    && find $VENV_PATH -depth -name "*.pyo" -delete


###############################################
# Runtime — backend + frontend + redis + nginx + supervisor
###############################################
FROM python-base AS runtime

ARG OPENBB_IMAGE_VARIANT=full

RUN apt-get update -y \
    && apt-get install --no-install-recommends -y \
       curl nginx redis-server gettext-base tini \
    && rm -rf /var/lib/apt/lists/* /var/log/nginx/* \
              /usr/share/doc /usr/share/man /usr/share/info /usr/share/locale \
    && mkdir -p /var/log/supervisor /run/nginx

COPY --from=backend-compile $VENV_PATH $VENV_PATH

RUN useradd -m -s /bin/bash appuser

WORKDIR $PYSETUP_PATH/code

# Compiled backend (.so + __init__.py only).
COPY --from=backend-compile --chown=appuser:appuser $PYSETUP_PATH/code/api ./api
COPY --from=backend-compile --chown=appuser:appuser $PYSETUP_PATH/code/routers ./routers
COPY --from=backend-compile --chown=appuser:appuser $PYSETUP_PATH/code/utilities ./utilities

# Plain-Python entry points + migrations.
COPY --chown=appuser:appuser backend/main.py ./
COPY --chown=appuser:appuser backend/init-db.py ./
COPY --chown=appuser:appuser backend/alembic.ini ./
COPY --chown=appuser:appuser backend/alembic ./alembic
COPY --chown=appuser:appuser backend/scripts ./scripts

# Workspace MCP package (imported by routers/pro/workspace_mcp via main.py).
# Shipped as source — it carries markdown resources loaded with
# importlib.resources, and is not part of the Cython compile stage. For a
# production lite release it should be added to setup_compile.py and compiled
# like api/routers/utilities.
COPY --chown=appuser:appuser backend/workspace_mcp ./workspace_mcp

# Frontend bundle.
COPY --from=frontend-build /app/dist /usr/share/nginx/html

# Container config.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY supervisord.conf /etc/supervisor/supervisord.conf
COPY entrypoint.sh /entrypoint.sh
COPY lite/origin_config.py lite/configure-origin.sh lite/qopenbb-routes.conf.template /usr/local/share/openbb/
COPY lite/bootstrap.py /usr/local/share/openbb/bootstrap.py
COPY render-frontend-config.sh /usr/local/share/openbb/render-frontend-config.lite.sh
COPY render-frontend-config.full.sh /usr/local/share/openbb/render-frontend-config.full.sh
# Admin-login helper: `docker exec openbb credentials`
COPY credentials.sh /usr/local/bin/credentials

# Account import helper: `docker exec openbb openbb-import /import/<file>.zip`
COPY import.sh /usr/local/bin/openbb-import
RUN case "$OPENBB_IMAGE_VARIANT" in \
      lite|full) cp "/usr/local/share/openbb/render-frontend-config.${OPENBB_IMAGE_VARIANT}.sh" /usr/local/bin/render-frontend-config.sh ;; \
      *) echo "Unknown OPENBB_IMAGE_VARIANT=$OPENBB_IMAGE_VARIANT" >&2; exit 1 ;; \
    esac \
    && chmod +x /entrypoint.sh /usr/local/bin/render-frontend-config.sh /usr/local/bin/credentials /usr/local/bin/openbb-import

ENV PATH="$VENV_PATH/bin:$PATH" \
    LD_LIBRARY_PATH="$VENV_PATH/lib" \
    OPENBB_IMAGE_VARIANT=${OPENBB_IMAGE_VARIANT} \
    PORT=3000 \
    DATABASE_TYPE=sqlite \
    DB_PATH=/data/openbb.db \
    FOLDER_STORAGE_PATH=/data/storage \
    REDIS_HOST=127.0.0.1 \
    REDIS_PORT=6379 \
    REDIS_PASS="" \
    MODE=lite \
    DISABLE_CORS=1 \
    STORAGE_PROVIDER=folder \
    EMAIL_PROVIDER=none \
    HUBSPOT=0 \
    PROMETHEUS=0 \
    WORKERS=1 \
    SUPPRESSED_API_ROUTERS='["bot", "terminal", "sdk", "run_tasks", "testing", "metrics"]' \
    SUPPRESSED_API_ROUTES='[]' \
    SELFURL=http://localhost:3000/api \
    FRONTENDURL=http://localhost:3000 \
    PROURL=http://localhost:3000

# /data holds SQLite, folder storage, and the redis dump. Created here with
# appuser ownership so the first-mount of a named volume inherits it.
# /opt/code's contents were already --chown'd by each COPY; only the WORKDIR
# itself needs its ownership updated (init_users writes user_create.json here),
# so we keep this chown non-recursive to avoid duplicating ~100 MB of files
# into a new layer.
RUN mkdir -p /data /data/storage /data/redis \
    && chown appuser:appuser /data /data/storage /data/redis $PYSETUP_PATH/code

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:${PORT}/api/health >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
