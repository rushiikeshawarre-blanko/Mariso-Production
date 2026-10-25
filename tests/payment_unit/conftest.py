import sys

import pytest


if not getattr(sys, "_mariso_payment_unit_guards", False):
    raise pytest.UsageError(
        "Use .venv/bin/python -I -B scripts/run_payment_unit.py; "
        "direct pytest collection does not install the payment I/O guards."
    )
