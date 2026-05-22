import os
from html import escape
from typing import Iterable
import resend

FRONTEND_URL = (os.getenv("FRONTEND_URL", "").strip().rstrip("/") or "https://mariso.store")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip()
EMAIL_ENABLED = os.getenv("EMAIL_ENABLED", "false").strip().lower() == "true"

def _get_email_config() -> tuple[str | None, str]:
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    from_email = os.getenv("RESEND_FROM_EMAIL", "").strip()
    return api_key, from_email


def _is_email_enabled() -> bool:
    api_key, from_email = _get_email_config()
    return EMAIL_ENABLED and bool(api_key and from_email)


def _safe(value) -> str:
    return escape(str(value or ""), quote=True)


def _format_currency(value) -> str:
    try:
        return f"₹{float(value or 0):,.0f}"
    except (TypeError, ValueError):
        return "₹0"


def send_email(subject: str, to_email: str, html: str) -> None:
    api_key, from_email = _get_email_config()

    if not EMAIL_ENABLED:
        print("Email skipped: EMAIL_ENABLED is false")
        return

    if not api_key or not from_email:
        print("Email skipped: missing RESEND_API_KEY or RESEND_FROM_EMAIL")
        return

    if not to_email:
        print("Email skipped: missing recipient")
        return

    try:
        resend.api_key = api_key

        response = resend.Emails.send(
            {
                "from": from_email,
                "to": [to_email],
                "subject": subject,
                "html": html,
            }
        )
        print(f"Email sent successfully: {response}")
    except Exception as e:
        print(f"Email send failed: {e}")


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


def _order_tracking_link(order: dict) -> str:
    tracking_token = str(order.get("tracking_token") or "").strip()
    return f"{FRONTEND_URL}/track-order/{tracking_token}"


def send_order_placed_email(order: dict) -> None:
    to_email = order.get("billing_email")
    if not to_email:
        print("Email skipped: missing billing_email")
        return

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

    send_email(subject, to_email, html)


# Admin alert for new order
def send_admin_new_order_alert(order: dict) -> None:
    if not ADMIN_EMAIL:
        print("Admin email skipped: missing ADMIN_EMAIL")
        return

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

    send_email(subject, ADMIN_EMAIL, html)


def send_order_status_email(order: dict) -> None:
    to_email = order.get("billing_email")
    if not to_email:
        print("Email skipped: missing billing_email")
        return

    customer_name = _safe(order.get("billing_name", "Customer"))
    status = str(order.get("status", "")).capitalize()
    order_id = order.get("id")
    order_short_id = str(order_id)[:8].upper()
    order_link = _order_tracking_link(order)
    feedback_link = f"{FRONTEND_URL}/feedback/{order_id}"

    items_list = build_order_items_html(order.get("items", [])) or "<li>No item details available</li>"

    if status == "Confirmed":
        subject = f"Your Mariso order {order_short_id} has been confirmed"
        html = f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937;">
          <p>Dear {customer_name},</p>

          <p>
            Thank you for shopping with <strong>Mariso</strong>! We truly appreciate your order and are excited to bring a touch of beauty to your day.
          </p>

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
            Our team is carefully preparing your order to ensure it reaches you in perfect condition. You will be notified once your order is dispatched.
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

    elif status == "Shipped":
        subject = "Your MARISO Order Has Been Shipped 🚚"
        html = f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937;">
          <p>Hi {customer_name},</p>

          <p>
            We’re excited to let you know that your order from <strong>MARISO</strong> has been shipped and is on its way to you 🎉
          </p>

          <p>
            You can track your order using the link below:<br/>
            🔗 <a href="{order_link}">{order_link}</a>
          </p>

          <p>
            We hope you love your purchase and can’t wait for it to reach you!
          </p>

          <p>
            If you have any questions, feel free to reply to this email — we’re always happy to help 💛
          </p>

          <p>
            Warm regards,<br/>
            <strong>Team MARISO</strong>
          </p>
        </div>
        """

    elif status == "Delivered":
        subject = "🎁 A Surprise Discount is Waiting for You…"
        html = f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937;">
          <p>Hi {customer_name},</p>

          <p>
            🎁 You’ve got a surprise discount waiting! 👀✨
          </p>

          <p>
            Your <strong>MARISO</strong> order has been successfully delivered 🎉<br/>
            We hope it brought a smile to your face 🌸
          </p>

          <p>
            Now here’s the fun part…<br/>
            👉 Simply share your feedback using the link below:<br/>
            <a href="{feedback_link}">{feedback_link}</a>
          </p>

          <p>
            ✨ Once you hit submit, your random discount % will instantly appear on your screen!<br/>
            (Every customer unlocks a different surprise 😉)
          </p>

          <p>
            We’d love to hear your thoughts — and can’t wait to serve you again 💛
          </p>

          <p>
            Warm regards,<br/>
            <strong>Team MARISO</strong>
          </p>
        </div>
        """

    else:
        subject = f"Your Mariso order {order_short_id} is now {status}"
        html = f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937;">
          <p>Dear {customer_name},</p>
          <p>Your order status has been updated to <strong>{status}</strong>.</p>
          <p>
            View your order here:<br/>
            <a href="{order_link}">{order_link}</a>
          </p>
          <p>Warm regards,<br/><strong>Team Mariso</strong></p>
        </div>
        """

    send_email(subject, to_email, html)
