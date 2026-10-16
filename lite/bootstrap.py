"""Resolve single-owner bootstrap settings without writing credentials to logs."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import string
import tempfile

GENERATORS = {
    'JWT_SECRET': lambda: secrets.token_hex(48),
    'OPENBB_AES_KEY': lambda: secrets.token_hex(8),
    'LOCAL_STORAGE_SECRET_KEY': lambda: secrets.token_urlsafe(24),
    'OPENBB_FRONTEND_USER_AGENT': lambda: secrets.token_hex(8),
    'OPENBB_AI_USER_AGENT': lambda: secrets.token_hex(8),
    'OPENBB_GEO_KEY': lambda: secrets.token_hex(8),
    'OPENBB_CHARGEBEE_SITE_KEY': lambda: secrets.token_hex(8),
    'OPENBB_CHARGEBEE_API_KEY': lambda: secrets.token_hex(8),
}
DEFAULTS = {'OPENBB_ADMIN_EMAIL': 'admin@openbb.co', 'OKTA_DOMAIN': 'test.okta.com'}
KEYS = (*GENERATORS, *DEFAULTS, 'OPENBB_ADMIN_PASSWORD', 'OPENBB_AUTH_TOKEN')


def private_write(path: Path, text: str) -> None:
    fd, temporary_name = tempfile.mkstemp(prefix=path.name + '.', dir=path.parent)
    temporary = Path(temporary_name)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        stream.write(text)
    temporary.replace(path)


def password() -> str:
    classes = (string.ascii_uppercase, string.ascii_lowercase, string.digits, '!@#$%&*+?')
    chars = [secrets.choice(group) for group in classes]
    chars.extend(secrets.choice(''.join(classes)) for _ in range(20))
    secrets.SystemRandom().shuffle(chars)
    return ''.join(chars)


def auth_token(secret: str) -> str:
    def encode(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).rstrip(b'=').decode('ascii')
    header = encode(b'{"alg":"HS256","typ":"JWT"}')
    payload = encode(b'{"sub":"openbb"}')
    message = f'{header}.{payload}'
    signature = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    return f'{message}.{encode(signature)}'


def resolve_secrets(path: Path) -> dict[str, str]:
    stored = {}
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            key, separator, value = line.partition('=')
            if separator and key in KEYS:
                stored[key] = value
    values = {key: os.environ.get(key) or stored.get(key, '') for key in KEYS}
    for key, generate in GENERATORS.items():
        values[key] = values[key] or generate()
    for key, default in DEFAULTS.items():
        values[key] = values[key] or default
    values['OPENBB_ADMIN_PASSWORD'] = values['OPENBB_ADMIN_PASSWORD'] or password()
    values['OPENBB_AUTH_TOKEN'] = values['OPENBB_AUTH_TOKEN'] or auth_token(values['JWT_SECRET'])
    if any('\n' in value or '\r' in value or '\x00' in value for value in values.values()):
        raise ValueError('Bootstrap values must be single-line strings')
    private_write(path, ''.join(f'{key}={values[key]}\n' for key in KEYS))
    return values


def write_admin_config(path: Path, values: dict[str, str]) -> None:
    entity = '[entity]\nname = "OpenBB Lite"\nseats = 10000\naum = 1000\n'
    entity += 'company_type = "CORPORATION"\norganization_size = "SMALL"\ncountry = "DOM"\n'
    admin = '\n[[admins]]\nfirst_name = "Lite"\nlast_name = "Admin"\n'
    admin += 'email = ' + json.dumps(values['OPENBB_ADMIN_EMAIL'], ensure_ascii=False) + '\n'
    admin += 'password = ' + json.dumps(values['OPENBB_ADMIN_PASSWORD'], ensure_ascii=False) + '\n'
    private_write(path, entity + admin)


if __name__ == '__main__':
    import sys
    if len(sys.argv) != 3:
        raise SystemExit('Usage: bootstrap.py SECRETS_FILE ADMIN_CONFIG')
    write_admin_config(Path(sys.argv[2]), resolve_secrets(Path(sys.argv[1])))
