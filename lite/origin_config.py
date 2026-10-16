"""Validate the public origin and derive nonsecret application addresses."""
import json
import re
import shlex
import sys
from urllib.parse import urlsplit


def settings(value: str) -> dict[str, str]:
    if re.search(r'[\s\\"\x27$;{}]', value):
        raise ValueError('PUBLIC_URL must be a plain HTTP(S) origin')
    parsed = urlsplit(value)
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in ('', '/')
            or not re.fullmatch(r'[A-Za-z0-9.\-\[\]:]+', parsed.netloc)):
        raise ValueError('PUBLIC_URL must be an HTTP(S) origin without credentials or path')
    _ = parsed.port
    origin = f'{parsed.scheme}://{parsed.netloc}'
    return {'PUBLIC_URL': origin, 'PUBLIC_SCHEME': parsed.scheme,
            'PUBLIC_HOST': parsed.netloc, 'FRONTENDURL': origin, 'PROURL': origin,
            'SELFURL': origin + '/api', 'BACKEND_URL': '/api',
            'DATA_API_URL': origin + '/data', 'AGENT_API_URL': origin + '/agent',
            'AI_API_URL': '', 'PLATFORM_URL': '', 'DATABASE_API_URL': ''}


if __name__ == '__main__':
    values = settings(sys.argv[1])
    if '--shell' in sys.argv:
        print('\n'.join(f'export {key}={shlex.quote(value)}' for key, value in values.items()))
    else:
        print(json.dumps(values))
