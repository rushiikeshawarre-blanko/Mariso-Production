"""Razorpay configuration only; no SDK, requests, or checkout selection."""

from dataclasses import dataclass, field
from math import isfinite
from typing import Mapping


@dataclass(frozen=True)
class RazorpaySettings:
    enabled: bool
    environment: str
    key_id: str = field(repr=False)
    key_secret: str = field(repr=False)
    webhook_secret: str = field(repr=False)
    connect_timeout_seconds: float
    read_timeout_seconds: float
    base_url: str = "https://api.razorpay.com/v1"


def read_razorpay_settings(environ: Mapping[str, str]) -> RazorpaySettings:
    """Validate enabled integration configuration without exposing secret values.

    Dormant configuration cannot prevent the existing Cashfree app from starting.
    Enabling this flag does not switch checkout; that wiring belongs to later phases.
    """
    enabled = environ.get("RAZORPAY_ENABLED", "false").strip().lower() == "true"
    environment = environ.get("RAZORPAY_ENV", "test").strip().lower() or "test"
    key_id = environ.get("RAZORPAY_KEY_ID", "").strip()
    key_secret = environ.get("RAZORPAY_KEY_SECRET", "").strip()
    webhook_secret = environ.get("RAZORPAY_WEBHOOK_SECRET", "").strip()

    def timeout(name: str, default: float) -> float:
        try:
            value = float(environ.get(name, str(default)))
            if not isfinite(value) or not 0 < value <= 60:
                raise ValueError
            return value
        except (TypeError, ValueError):
            if enabled:
                raise RuntimeError(f"{name} must be finite, greater than 0 and at most 60 seconds") from None
            return default

    connect_timeout = timeout("RAZORPAY_CONNECT_TIMEOUT_SECONDS", 5)
    read_timeout = timeout("RAZORPAY_READ_TIMEOUT_SECONDS", 15)
    if enabled:
        if environment not in {"test", "live"}:
            raise RuntimeError("RAZORPAY_ENV must be test or live")
        for name, value in (
            ("RAZORPAY_KEY_ID", key_id),
            ("RAZORPAY_KEY_SECRET", key_secret),
            ("RAZORPAY_WEBHOOK_SECRET", webhook_secret),
        ):
            if not value:
                raise RuntimeError(f"Missing required environment variable: {name}")
        prefix = f"rzp_{environment}_"
        if not key_id.startswith(prefix) or len(key_id) == len(prefix):
            raise RuntimeError("RAZORPAY_KEY_ID does not match RAZORPAY_ENV")

    return RazorpaySettings(
        enabled=enabled,
        environment=environment,
        key_id=key_id,
        key_secret=key_secret,
        webhook_secret=webhook_secret,
        connect_timeout_seconds=connect_timeout,
        read_timeout_seconds=read_timeout,
    )
