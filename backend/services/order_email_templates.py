"""Shared Mariso email rendering; no delivery or credential access."""
import os
from html import escape
from typing import Iterable

FRONTEND_URL = (os.getenv("FRONTEND_URL", "").strip().rstrip("/") or "https://mariso.store")

def _safe(value) -> str:
    return escape(str(value or ""), quote=True)


def _format_currency(value) -> str:
    try:
        return f"₹{float(value or 0):,.0f}"
    except (TypeError, ValueError):
        return "₹0"


def build_order_items_html(items: Iterable[dict]) -> str:
    rows = []
    for item in items:
        name = _safe(item.get("product_name", "Item"))
        qty = _safe(item.get("quantity", 1))
        line_total = item.get("line_total", (item.get("price", 0) or 0) * (item.get("quantity", 1) or 1))
        color = _safe(item.get("color_name") or item.get("color_id") or "")
        flavor = _safe(item.get("flavor_name") or item.get("flavor_id") or "")

        variant_details = []
        if color:
            variant_details.append(f"Color: {color}")
        if flavor:
            variant_details.append(f"Fragrance: {flavor}")

        variant_html = ""
        if variant_details:
            variant_html = f"<br/><span style=\"color: #6B7280; font-size: 13px;\">{' • '.join(variant_details)}</span>"

        rows.append(f"<li>{name} × {qty} — {_format_currency(line_total)}{variant_html}</li>")
    return "".join(rows)


def build_cancelled_product_names_html(items: Iterable[dict]) -> str:
    rows = []
    for item in items:
        rows.append(f"<li>{_safe(item.get('product_name') or 'Item')}</li>")
    return "".join(rows)


def build_cancellation_reasons_html(order: dict) -> str:
    rows = []
    for reason in order.get("cancellation_reasons") or []:
        if reason == "Others":
            other_reason = str(order.get("cancellation_reason_other") or "").strip()
            if other_reason:
                rows.append(f"<li>Other: {_safe(other_reason)}</li>")
            else:
                rows.append("<li>Other</li>")
        else:
            rows.append(f"<li>{_safe(reason)}</li>")

    if not rows and order.get("cancellation_reason"):
        rows.append(f"<li>{_safe(order.get('cancellation_reason'))}</li>")

    return "".join(rows)


def _order_tracking_link(order: dict) -> str:
    tracking_token = str(order.get("tracking_token") or "").strip()
    return f"{FRONTEND_URL}/track-order/{tracking_token}"


def build_order_placed_email(order: dict) -> tuple[str, str]:
    order_short_id = str(order.get("id", ""))[:8].upper()
    subject = f"Your Mariso order {order_short_id} is confirmed"
    order_link = _order_tracking_link(order)

    items_list = build_order_items_html(order.get("items", [])) or "<li>No item details available</li>"

    html = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937;">
      <p>Dear {_safe(order.get('billing_name', 'Customer'))},</p>

      <p>
        Thank you for shopping with <strong>Mariso</strong>! We truly appreciate your order and are excited to bring a touch of beauty to your day.
      </p>

      <p><strong>Order ID:</strong> {order_short_id}</p>

      <p><strong>Here are the details of your purchase:</strong></p>

      <ul>
        {items_list}
      </ul>

      <p>
        You can view your order details and track its status anytime using the link below:<br/>
        <strong>View Your Order:</strong>
        <a href="{order_link}">
          View Order
        </a>
      </p>

      <p>
        Our team is carefully preparing your order to ensure it reaches you in perfect condition.
        We’ll notify you once your order is packed and ready to ship.
      </p>

      <p>
        If you have any questions or need assistance, feel free to reply to this email - we’re always here to help.
      </p>

      <p>
        Thank you once again for choosing Mariso. We look forward to serving you again!
      </p>

      <p>
        Warm regards,<br/>
        <strong>Team Mariso</strong>
      </p>
    </div>
    """

    return subject, html


def build_order_cancellation_email(order: dict) -> tuple[str, str]:
    customer_name = _safe(order.get("billing_name", "Customer"))
    cancelled_products = build_cancelled_product_names_html(order.get("items", [])) or "<li>No item details available</li>"
    cancellation_reasons = build_cancellation_reasons_html(order) or "<li>No reason provided</li>"

    html = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937;">
      <p>Dear {customer_name},</p>

      <p>We would like to confirm that your cancellation request has been successfully processed.</p>

      <p>The following product(s) from your order have been cancelled:</p>
      <ul>
        {cancelled_products}
      </ul>

      <p><strong>Cancellation reason:</strong></p>
      <ul>
        {cancellation_reasons}
      </ul>

      <p>
        If a refund is applicable, it will be processed to your original payment method and should reflect within the applicable banking timelines.
      </p>

      <p>
        Should you have any questions or require further assistance, please feel free to reply to this email.
      </p>

      <p>Thank you for choosing Mariso.</p>

      <p>
        Warm regards,<br/>
        <strong>Team Mariso</strong>
      </p>
    </div>
    """

    return "Mariso Order Cancellation Confirmation", html


def build_admin_new_order_email(order: dict) -> tuple[str, str]:
    order_id = _safe(order.get("id", ""))
    order_short_id = order_id[:8].upper()
    customer_name = _safe(order.get("billing_name") or order.get("user_name") or "Customer")
    customer_email = _safe(order.get("billing_email") or order.get("user_email") or "")
    customer_phone = _safe(order.get("billing_phone", ""))
    payment_method = _safe(order.get("payment_method", ""))
    total_price = _format_currency(order.get("total_price", 0))

    address_parts = [
        order.get("billing_address"),
        order.get("billing_city"),
        order.get("billing_postal_code"),
    ]
    shipping_address = _safe(", ".join([str(part) for part in address_parts if part]))

    items_html = build_order_items_html(order.get("items", [])) or "<li>No item details available</li>"
    admin_orders_url = f"{FRONTEND_URL}/admin/orders"

    subject = f"New Mariso order received - {order_short_id}"

    html = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937;">
      <h2 style="margin-bottom: 8px;">New Mariso order received</h2>

      <p>A new order has been placed on <strong>Mariso</strong>.</p>

      <h3>Order Summary</h3>
      <p>
        <strong>Order ID:</strong> {order_id}<br/>
        <strong>Total:</strong> {total_price}<br/>
        <strong>Payment method:</strong> {payment_method}
      </p>

      <h3>Customer</h3>
      <p>
        <strong>Name:</strong> {customer_name}<br/>
        <strong>Email:</strong> {customer_email}<br/>
        <strong>Phone:</strong> {customer_phone}
      </p>

      <h3>Shipping Address</h3>
      <p>{shipping_address or "Not available"}</p>

      <h3>Items</h3>
      <ul>
        {items_html}
      </ul>

      <p>
        <a href="{admin_orders_url}" style="color: #9C6B5B; font-weight: bold;">
          Open admin dashboard
        </a>
      </p>
    </div>
    """

    return subject, html
