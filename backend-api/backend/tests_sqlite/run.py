# ruff: noqa: S404, S603, T201
"""Run SQLite regressions in a fresh process without operator configuration."""

import subprocess
import sys
import tempfile
from pathlib import Path


def main():
    backend = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="qopenbb-sqlite-") as temporary:
        env = {
            "PATH": str(Path(sys.executable).parent) + ":/usr/bin:/bin",
            "HOME": temporary,
            "LANG": "C.UTF-8",
            "PYTHONPATH": str(backend),
            "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
            "QOPENBB_SQLITE_SANDBOX": temporary,
            "DATABASE_TYPE": "sqlite",
            "DB_PATH": str(Path(temporary) / "settings.db"),
            "FOLDER_STORAGE_PATH": str(Path(temporary) / "storage"),
            "STORAGE_PROVIDER": "folder",
            "MODE": "onprem",
            "SELFURL": "http://localhost.invalid/api",
            "PROURL": "http://localhost.invalid",
            "REDIS_PASS": "synthetic-test-password",
            "JOSESECRET": "synthetic-test-jwt-secret",
            "OPENBB_AES_KEY": "0123456789abcdef0123456789abcdef",
        }
        command = [
            sys.executable,
            "-m",
            "pytest",
            "-p",
            "pytest_asyncio.plugin",
            "-c",
            str(backend / "pyproject.toml"),
            str(backend / "tests_sqlite"),
            "--confcutdir=" + str(backend / "tests_sqlite"),
            "--basetemp=" + str(Path(temporary) / "pytest"),
            "-o",
            "addopts=",
            "-o",
            "asyncio_mode=auto",
            "-q",
            *sys.argv[1:],
        ]
        print("Exercised child:", " ".join(command), flush=True)
        result = subprocess.run(command, cwd=temporary, env=env, check=False).returncode
    if Path(temporary).exists():
        raise RuntimeError("SQLite test sandbox survived launcher exit")
    print("Removed sandbox:", temporary, flush=True)
    return result


if __name__ == "__main__":
    raise SystemExit(main())
