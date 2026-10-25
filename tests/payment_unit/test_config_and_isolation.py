import importlib
import os
from pathlib import Path
import socket
import subprocess

import pytest

from core.razorpay_config import read_razorpay_settings


def enabled_settings(**overrides):
    return {
        "RAZORPAY_ENABLED": "true",
        "RAZORPAY_ENV": "test",
        "RAZORPAY_KEY_ID": "rzp_test_dummy",
        "RAZORPAY_KEY_SECRET": "dummy-api-secret",
        "RAZORPAY_WEBHOOK_SECRET": "dummy-webhook-secret",
        **overrides,
    }


def test_disabled_settings_need_no_credentials():
    settings = read_razorpay_settings({})
    assert not settings.enabled
    assert settings.environment == "test"
    assert settings.base_url == "https://api.razorpay.com/v1"


@pytest.mark.parametrize("field", ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"])
def test_enabled_settings_require_each_credential(field):
    with pytest.raises(RuntimeError, match=field):
        read_razorpay_settings(enabled_settings(**{field: "  "}))


@pytest.mark.parametrize("mode,key", [("sandbox", "rzp_test_dummy"), ("live", "rzp_test_dummy"), ("test", "rzp_live_dummy"), ("test", "rzp_test_")])
def test_enabled_settings_reject_mode_mismatch(mode, key):
    with pytest.raises(RuntimeError):
        read_razorpay_settings(enabled_settings(RAZORPAY_ENV=mode, RAZORPAY_KEY_ID=key))


@pytest.mark.parametrize("mode", ["test", "live"])
def test_key_mode_does_not_change_api_host(mode):
    settings = read_razorpay_settings(enabled_settings(RAZORPAY_ENV=mode, RAZORPAY_KEY_ID=f"rzp_{mode}_dummy"))
    assert settings.enabled
    assert settings.base_url == "https://api.razorpay.com/v1"
    assert "dummy" not in repr(settings)


@pytest.mark.parametrize("value", ["nan", "inf", "-inf", "0", "-1", "61", "invalid"])
@pytest.mark.parametrize("field", ["RAZORPAY_CONNECT_TIMEOUT_SECONDS", "RAZORPAY_READ_TIMEOUT_SECONDS"])
def test_enabled_timeout_must_be_finite_and_bounded(field, value):
    with pytest.raises(RuntimeError, match=field):
        read_razorpay_settings(enabled_settings(**{field: value}))


def test_disabled_invalid_settings_do_not_break_cashfree_startup():
    settings = read_razorpay_settings({"RAZORPAY_ENV": "old-value", "RAZORPAY_READ_TIMEOUT_SECONDS": "nan"})
    assert not settings.enabled
    assert settings.read_timeout_seconds == 15


def test_real_config_import_and_reload_cannot_load_local_env():
    from core import config
    config = importlib.reload(config)
    assert config.DB_NAME == "payment_unit_not_a_real_database"
    assert not config.CASHFREE_ENABLED
    assert not config.RAZORPAY_ENABLED
    assert not config.AUTH0_JWKS_CLIENT


def test_environment_file_access_is_blocked_before_open():
    with pytest.raises(RuntimeError, match="environment files"):
        Path(".env").read_text()


def test_dns_and_direct_socket_connections_are_blocked():
    with pytest.raises(RuntimeError, match="socket.getaddrinfo"):
        socket.getaddrinfo("example.invalid", 443)
    with socket.socket() as sock:
        with pytest.raises(RuntimeError, match="socket.connect"):
            sock.connect(("127.0.0.1", 1))


def test_subprocess_cannot_escape_guards():
    with pytest.raises(RuntimeError, match="subprocess.Popen"):
        subprocess.run(["this-command-must-never-execute"], check=True)


def test_database_and_notification_boundaries_require_explicit_fakes():
    from core import database
    import email_service
    import whatsapp_service
    with pytest.raises(RuntimeError, match="explicit fake"):
        database.db.orders
    with pytest.raises(RuntimeError, match="explicit fake"):
        email_service.send_order_placed_email({})
    with pytest.raises(RuntimeError, match="explicit fake"):
        whatsapp_service.send_order_status_whatsapp({})
    assert os.environ.get("FEEDBACK_SCHEDULER_ENABLED") == "false"
