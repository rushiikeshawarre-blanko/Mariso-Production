"""Run ONLY offline payment unit tests, with guards installed before collection.

Use: .venv/bin/python -I -B scripts/run_payment_unit.py
This is an accidental-I/O guard for trusted tests, not an OS security sandbox.
"""

import ast
import os
from pathlib import Path
import sys
import types


class PaymentTestIOBlocked(RuntimeError):
    pass


def blocked(*args, **kwargs):
    raise PaymentTestIOBlocked("Payment unit tests require an explicit fake for external effects")


def audit_guard(event, args):
    if event in {
        "socket.connect", "socket.getaddrinfo", "socket.gethostbyname",
        "socket.gethostbyaddr", "socket.sendto", "socket.bind",
        "subprocess.Popen", "os.system", "os.posix_spawn", "os.fork", "os.exec",
    }:
        raise PaymentTestIOBlocked(f"Payment unit tests block {event}")
    if event == "open" and isinstance(args[0], (str, bytes, os.PathLike)):
        name = Path(os.fsdecode(args[0])).name
        if name == ".env" or name.startswith(".env."):
            raise PaymentTestIOBlocked("Payment unit tests must not read environment files")


class UnconfiguredDatabase:
    def __getattr__(self, name):
        blocked()


def install_guards(backend):
    # Only this disposable Python process is affected. No .env files are edited.
    os.environ.clear()
    os.environ.update({
        "ENVIRONMENT": "test",
        "MONGO_URL": "mongodb://127.0.0.1:1",
        "DB_NAME": "payment_unit_not_a_real_database",
        "JWT_SECRET": "payment-unit-dummy-not-a-deployment-secret",
        "FRONTEND_URL": "http://127.0.0.1:3000",
        "CASHFREE_ENABLED": "false",
        "SHIPROCKET_ENABLED": "false",
        "EMAIL_ENABLED": "false",
        "TWILIO_WHATSAPP_ENABLED": "false",
        "FEEDBACK_SCHEDULER_ENABLED": "false",
        "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
    })
    sys.dont_write_bytecode = True
    sys.addaudithook(audit_guard)
    dotenv = types.ModuleType("dotenv")
    dotenv.load_dotenv = lambda *args, **kwargs: False
    sys.modules["dotenv"] = dotenv
    database = types.ModuleType("core.database")
    database.db = UnconfiguredDatabase()
    database.client = UnconfiguredDatabase()
    database.close_mongo_connection = lambda: None
    sys.modules["core.database"] = database
    # Discover names without executing notification modules or loading credentials.
    for name in ("email_service", "whatsapp_service", "sms_service"):
        module = types.ModuleType(name)
        for node in ast.parse((backend / f"{name}.py").read_text()).body:
            if isinstance(node, ast.FunctionDef):
                setattr(module, node.name, blocked)
        sys.modules[name] = module
    sys._mariso_payment_unit_guards = True


def main():
    if len(sys.argv) != 1:
        raise SystemExit("This runner accepts no arguments and only collects tests/payment_unit")
    root = Path(__file__).resolve().parents[1]
    backend = root / "backend"
    install_guards(backend)
    sys.path.insert(0, str(backend))
    suite = root / "tests" / "payment_unit"
    import pytest
    return pytest.main([
        "-c", str(suite / "pytest.ini"),
        f"--confcutdir={suite}",
        "-p", "no:cacheprovider", "-q", str(suite),
    ])


if __name__ == "__main__":
    raise SystemExit(main())
