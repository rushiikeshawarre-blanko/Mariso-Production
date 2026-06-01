import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
import requests

from core import config

logger = logging.getLogger(__name__)

SHIPROCKET_TIMEOUT_SECONDS = 20
PINCODE_RE = re.compile(r"^\d{6}$")


def _to_float(value: Any, default: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _require_shiprocket_config() -> None:
    if not config.SHIPROCKET_ENABLED:
        raise HTTPException(status_code=503, detail="Shiprocket integration is disabled")

    if not config.SHIPROCKET_EMAIL or not config.SHIPROCKET_PASSWORD:
        raise HTTPException(status_code=500, detail="Shiprocket credentials are not configured")

    if not config.SHIPROCKET_PICKUP_LOCATION:
        raise HTTPException(status_code=500, detail="Shiprocket pickup location is not configured")


def ensure_shiprocket_configured() -> None:
    _require_shiprocket_config()


def is_valid_india_pincode(value: str) -> bool:
    return bool(PINCODE_RE.fullmatch(str(value or "").strip()))


def _require_shiprocket_serviceability_config() -> None:
    _require_shiprocket_config()

    if not is_valid_india_pincode(config.SHIPROCKET_PICKUP_PINCODE):
        raise HTTPException(status_code=500, detail="Shiprocket pickup pincode is not configured")


def _shiprocket_headers(token: str) -> dict:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }


def _parse_response_json(response: requests.Response) -> dict:
    try:
        data = response.json()
    except ValueError:
        return {"message": response.text[:500]}
    return data if isinstance(data, dict) else {"data": data}


def _extract_shiprocket_error(data: dict) -> str:
    message = (
        data.get("message")
        or data.get("error")
        or data.get("errors")
        or data.get("status")
        or "Shiprocket request failed"
    )
    if isinstance(message, (dict, list)):
        return str(message)[:500]
    return str(message)[:500]


def _raise_shiprocket_error(response: requests.Response, *, operation: str, order_id: Optional[str] = None) -> None:
    data = _parse_response_json(response)
    safe_message = _extract_shiprocket_error(data)
    logger.warning(
        "Shiprocket %s failed: order_id=%s status_code=%s message=%s",
        operation,
        order_id,
        response.status_code,
        safe_message,
    )
    raise HTTPException(
        status_code=502,
        detail={
            "message": f"Shiprocket {operation} failed",
            "shiprocket_status_code": response.status_code,
            "shiprocket_error": safe_message,
        },
    )


def authenticate_shiprocket() -> str:
    _require_shiprocket_config()
    response = requests.post(
        f"{config.SHIPROCKET_BASE_URL}/auth/login",
        json={
            "email": config.SHIPROCKET_EMAIL,
            "password": config.SHIPROCKET_PASSWORD,
        },
        headers={"Content-Type": "application/json"},
        timeout=SHIPROCKET_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        _raise_shiprocket_error(response, operation="auth login")

    data = _parse_response_json(response)
    token = data.get("token")
    if not token:
        logger.warning("Shiprocket auth login succeeded without token")
        raise HTTPException(status_code=502, detail="Shiprocket auth response did not include a token")
    return token


def _split_customer_name(name: str) -> tuple[str, str]:
    parts = str(name or "").strip().split()
    if not parts:
        return "Customer", ""
    if len(parts) == 1:
        return parts[0], ""
    return " ".join(parts[:-1]), parts[-1]


def _format_order_date(order: dict) -> str:
    raw_value = order.get("paid_at") or order.get("created_at")
    if raw_value:
        try:
            parsed = datetime.fromisoformat(str(raw_value).replace("Z", "+00:00"))
            return parsed.strftime("%Y-%m-%d %H:%M")
        except ValueError:
            pass
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")


def _item_sku(item: dict) -> str:
    return str(
        item.get("sku")
        or item.get("variant_sku")
        or item.get("product_id")
        or item.get("id")
        or "mariso-item"
    )


def _shiprocket_order_items(order: dict) -> list[dict]:
    items = []
    for item in order.get("items") or []:
        if not isinstance(item, dict):
            continue
        quantity = int(item.get("quantity") or item.get("units") or 1)
        quantity = max(quantity, 1)
        selling_price = _to_float(
            item.get("price")
            or item.get("unit_price")
            or item.get("selling_price")
            or item.get("line_total"),
            0,
        )
        items.append(
            {
                "name": str(item.get("name") or item.get("product_name") or "Mariso product")[:200],
                "sku": _item_sku(item)[:50],
                "units": quantity,
                "selling_price": round(selling_price, 2),
            }
        )
    return items


def build_shiprocket_order_payload(order: dict) -> dict:
    first_name, last_name = _split_customer_name(order.get("billing_name") or order.get("user_name") or "")
    address_2 = order.get("billing_address_2") or ""
    country = order.get("billing_country") or config.SHIPROCKET_DEFAULT_COUNTRY
    total_amount = _to_float(order.get("total_after_discount") or order.get("total_price"), 0)

    return {
        "order_id": str(order.get("id")),
        "order_date": _format_order_date(order),
        "pickup_location": config.SHIPROCKET_PICKUP_LOCATION,
        "billing_customer_name": first_name,
        "billing_last_name": last_name,
        "billing_address": str(order.get("billing_address") or "")[:200],
        "billing_address_2": str(address_2)[:200],
        "billing_city": str(order.get("billing_city") or "")[:50],
        "billing_pincode": str(order.get("billing_postal_code") or ""),
        "billing_state": str(order.get("billing_state") or "")[:50],
        "billing_country": str(country or "India")[:50],
        "billing_email": str(order.get("billing_email") or ""),
        "billing_phone": str(order.get("billing_phone") or ""),
        "shipping_is_billing": True,
        "order_items": _shiprocket_order_items(order),
        "payment_method": "Prepaid",
        "sub_total": round(total_amount, 2),
        "length": _to_float(config.SHIPROCKET_DEFAULT_LENGTH_CM, 20),
        "breadth": _to_float(config.SHIPROCKET_DEFAULT_BREADTH_CM, 20),
        "height": _to_float(config.SHIPROCKET_DEFAULT_HEIGHT_CM, 15),
        "weight": _to_float(config.SHIPROCKET_DEFAULT_WEIGHT_KG, 0.5),
    }


def _extract_source(data: Any) -> dict:
    if not isinstance(data, dict):
        return {}
    if any(key in data for key in ("order_id", "shipment_id", "awb_code", "courier_name")):
        return data
    for key in ("data", "response"):
        nested = data.get(key)
        if isinstance(nested, dict):
            return nested
    return data


def _extract_serviceability_couriers(data: Any) -> list[dict]:
    if not isinstance(data, dict):
        return []

    candidates = [
        data.get("available_courier_companies"),
        data.get("courier_companies"),
        data.get("couriers"),
    ]
    for key in ("data", "response"):
        nested = data.get(key)
        if isinstance(nested, dict):
            candidates.extend(
                [
                    nested.get("available_courier_companies"),
                    nested.get("courier_companies"),
                    nested.get("couriers"),
                ]
            )

    for candidate in candidates:
        if isinstance(candidate, list):
            return [item for item in candidate if isinstance(item, dict)]

    return []


def _format_estimated_delivery_days(courier: dict) -> Optional[str]:
    raw_days = (
        courier.get("estimated_delivery_days")
        or courier.get("estimate_delivery_days")
        or courier.get("delivery_days")
    )
    if raw_days is None or raw_days == "":
        return None

    text = str(raw_days).strip()
    if not text:
        return None
    return text if "day" in text.lower() else f"{text} days"


def _extract_courier_rate(courier: dict) -> Optional[float]:
    for key in (
        "rate",
        "freight_charge",
        "shipping_charge",
        "shipping_charges",
        "courier_charge",
        "total_charge",
    ):
        value = courier.get(key)
        if value in (None, ""):
            continue
        try:
            rate = float(value)
        except (TypeError, ValueError):
            continue
        if rate >= 0:
            return round(rate, 2)
    return None


def normalize_shiprocket_serviceability_response(data: dict) -> dict:
    couriers = _extract_serviceability_couriers(data)
    if not couriers:
        message = _extract_shiprocket_error(data)
        if message == "Shiprocket request failed":
            message = "Delivery is not available for this pincode yet."
        return {
            "available": False,
            "enabled": True,
            "estimated_delivery_days": None,
            "courier_name": None,
            "shipping_charge": None,
            "message": message,
        }

    courier = couriers[0]
    estimated_days = _format_estimated_delivery_days(courier)
    courier_name = courier.get("courier_name") or courier.get("courier_company_name")
    shipping_charge = _extract_courier_rate(courier)
    message = "Delivery is available"
    if estimated_days:
        message = f"Delivery available in {estimated_days}"

    return {
        "available": True,
        "enabled": True,
        "estimated_delivery_days": estimated_days,
        "courier_name": courier_name,
        "shipping_charge": shipping_charge,
        "message": message,
    }


def normalize_shiprocket_order_response(data: dict) -> dict:
    source = _extract_source(data)
    awb_code = source.get("awb_code") or source.get("awb")
    courier_name = source.get("courier_name") or source.get("courier_company_name")
    tracking_url = (
        source.get("tracking_url")
        or source.get("track_url")
        or source.get("tracking_url_external")
    )
    return {
        "shiprocket_order_id": source.get("order_id") or source.get("shiprocket_order_id"),
        "shiprocket_shipment_id": source.get("shipment_id") or source.get("shiprocket_shipment_id"),
        "shiprocket_awb_code": awb_code,
        "shiprocket_courier_name": courier_name,
        "shiprocket_tracking_url": tracking_url,
        "shipment_status": source.get("status") or source.get("shipment_status") or "created",
    }


def create_shiprocket_order(payload: dict) -> dict:
    token = authenticate_shiprocket()
    order_id = payload.get("order_id")
    response = requests.post(
        f"{config.SHIPROCKET_BASE_URL}/orders/create/adhoc",
        json=payload,
        headers=_shiprocket_headers(token),
        timeout=SHIPROCKET_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        _raise_shiprocket_error(response, operation="create order", order_id=order_id)

    data = _parse_response_json(response)
    normalized = normalize_shiprocket_order_response(data)
    logger.info(
        "Shiprocket shipment created: order_id=%s shipment_status=%s shiprocket_order_id=%s "
        "shipment_id=%s awb=%s courier=%s",
        order_id,
        normalized.get("shipment_status"),
        normalized.get("shiprocket_order_id"),
        normalized.get("shiprocket_shipment_id"),
        normalized.get("shiprocket_awb_code"),
        normalized.get("shiprocket_courier_name"),
    )
    return data


def check_shiprocket_serviceability(
    *,
    pincode: str,
    product_id: Optional[str] = None,
    quantity: int = 1,
) -> dict:
    if not config.SHIPROCKET_ENABLED:
        return {
            "available": None,
            "enabled": False,
            "message": "Delivery estimate will be available soon.",
        }

    if not is_valid_india_pincode(pincode):
        raise HTTPException(status_code=400, detail="Enter a valid 6-digit India pincode")

    _require_shiprocket_serviceability_config()
    token = authenticate_shiprocket()
    safe_quantity = max(int(quantity or 1), 1)
    weight = _to_float(config.SHIPROCKET_DEFAULT_WEIGHT_KG, 0.5) * safe_quantity

    response = requests.get(
        f"{config.SHIPROCKET_BASE_URL}/courier/serviceability/",
        params={
            "pickup_postcode": config.SHIPROCKET_PICKUP_PINCODE,
            "delivery_postcode": pincode,
            "cod": 0,
            "weight": round(weight, 3),
        },
        headers=_shiprocket_headers(token),
        timeout=SHIPROCKET_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        _raise_shiprocket_error(response, operation="serviceability", order_id=product_id)

    return normalize_shiprocket_serviceability_response(_parse_response_json(response))
