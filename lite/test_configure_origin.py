"""Exercise actual origin startup with synthetic container DNS, without services."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

LITE = Path(__file__).resolve().parent
BASH = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else shutil.which('bash')


class ContainerResolverTests(unittest.TestCase):
    def configure(self, contents, override=None):
        base = Path(os.environ.get('QOPENBB_DNS_TEST_ROOT',
                    'D:/BuildArtifacts/QOpenBB/dns-tests' if os.name == 'nt' else tempfile.gettempdir()))
        base.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as temporary:
            root = Path(temporary)
            resolver = root / 'resolv.conf'
            if contents is not None:
                resolver.write_text(contents)
            script = (LITE / 'configure-origin.sh').read_text()
            script = script.replace("Path('/etc/resolv.conf')", f'Path({str(resolver)!r})')
            script = script.replace('python ', f'"{Path(sys.executable).as_posix()}" ')
            script = script.replace('envsubst ', f'"{(root / "envsubst").as_posix()}" ')
            (root / 'configure.sh').write_text(script, newline='\n')
            (root / 'envsubst').write_text('#!/bin/bash\nprintf "resolver %s;\\n" "$NGINX_RESOLVER"\n', newline='\n')
            (root / 'envsubst').chmod(0o755)
            route = root / 'routes.conf'
            env = {**os.environ, 'ORIGIN_HELPERS': LITE.as_posix(), 'ROUTES_OUT': route.as_posix(),
                   'PUBLIC_URL': 'http://127.0.0.1:23003', 'EXCEL_ENABLED': 'false',
                   'TEST_PYTHON': Path(sys.executable).as_posix(), 'PATH': str(root) + os.pathsep + os.environ['PATH']}
            env.pop('NGINX_RESOLVER', None)
            if override is not None:
                env['NGINX_RESOLVER'] = override
            result = subprocess.run([BASH, (root / 'configure.sh').as_posix()], cwd=LITE.parent, env=env,
                                    capture_output=True, text=True, timeout=20,
                                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            return result, route.read_text() if route.exists() else None

    def assert_resolver(self, contents, expected, override=None):
        result, route = self.configure(contents, override)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(route.startswith(f'resolver {expected};\n'), route)
        self.assertIn('location = /excel { return 404; }', route)

    def test_docker_dns_retained(self):
        self.assert_resolver('nameserver 127.0.0.11\n', '127.0.0.11')

    def test_podman_uses_first_valid_container_dns(self):
        self.assert_resolver('# container DNS\nsearch example.invalid\nnameserver invalid\n'
                             'nameserver 10.89.9.1 # gateway\nnameserver 10.89.10.1\n', '10.89.9.1')

    def test_ipv6_resolver_is_bracketed_for_nginx(self):
        self.assert_resolver('nameserver 2001:db8::53\n', '[2001:db8::53]')

    def test_explicit_nginx_override_preserved_without_resolv_file(self):
        self.assert_resolver(None, '[::1]:5353 127.0.0.1:5353', '[::1]:5353 127.0.0.1:5353')

    def test_empty_override_uses_container_dns(self):
        self.assert_resolver('nameserver 10.90.1.1\n', '10.90.1.1', '')

    def test_missing_or_invalid_resolver_fails_before_routes(self):
        for contents in (None, '', 'nameserver invalid\nnameserver fe80::1%eth0\n'):
            with self.subTest(contents=contents):
                result, route = self.configure(contents)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('No valid container nameserver', result.stderr)
                self.assertIsNone(route)


if __name__ == '__main__':
    unittest.main()
