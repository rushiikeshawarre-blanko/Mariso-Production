"""INR monetary boundaries for new payment attempts; historical fields stay rupees."""

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from fastapi import HTTPException


def decimal_amount(value) -> Decimal:
    try:
        if isinstance(value, bool) or value is None:
            raise ValueError
        amount = Decimal(str(value))
        if not amount.is_finite() or amount < 0 or amount > Decimal('1000000000'):
            raise ValueError
        return amount
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(400, 'Invalid monetary amount') from None


def money(value) -> Decimal:
    return decimal_amount(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def rupees(value) -> float:
    """Compatibility projection only; provider authority is stored integer paise."""
    return float(money(value))


def paise(value, *, payable=False) -> int:
    amount = int(money(value) * 100)
    if payable and amount < 100:
        raise HTTPException(400, 'Payable amount must be at least INR 1.00')
    return amount
