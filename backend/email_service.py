import os
from typing import Iterable
import resend




def _get_email_config() -> tuple[str | None, str]:
    api_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")
    return api_key, from_email


def _is_email_enabled() -> bool:
    api_key, from_email = _get_email_config()
    return bool(api_key and from_email)


def send_email(subject: str, to_email: str, html: str) -> None:
    api_key, from_email = _get_email_config()

    if not api_key or not from_email:
        print("Email skipped: missing RESEND_API_KEY or RESEND_FROM_EMAIL")
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
        name = item.get("product_name", "Item")
        qty = item.get("quantity", 1)
        line_total = item.get("line_total", (item.get("price", 0) or 0) * qty)
        rows.append(f"<li>{name} × {qty} — ₹{line_total:,.0f}</li>")
    return "".join(rows)


def send_order_placed_email(order: dict) -> None:
    to_email = order.get("billing_email")
    if not to_email:
        print("Email skipped: missing billing_email")
        return

    subject = f"Your Mariso order {order['id'][:8].upper()} has been placed"

    items_list = ""
    for item in order.get("items", []):
        name = item.get("product_name", "Item")
        qty = item.get("quantity", 1)
        items_list += f"""
        <li>Product: {name}<br/>Quantity: {qty}</li>
        """

    html = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937;">
      <p>Dear {order.get('billing_name', 'Customer')},</p>

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
        <a href="http://localhost:3000/account/orders/{order.get('id')}">
          View Order
        </a>
      </p>

      <p>
        Our team is carefully preparing your order to ensure it reaches you in perfect condition.
        You will be notified once your order is dispatched.
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


def send_order_status_email(order: dict) -> None:
    to_email = order.get("billing_email")
    if not to_email:
        print("Email skipped: missing billing_email")
        return

    status = str(order.get("status", "")).capitalize()
    subject = f"Your Mariso order {order['id'][:8].upper()} is now {status}"

    items_list = ""
    for item in order.get("items", []):
        name = item.get("product_name", "Item")
        qty = item.get("quantity", 1)
        items_list += f"""
        <li>Product: {name}<br/>Quantity: {qty}</li>
        """

    status_messages = {
        "Confirmed": "Your order has been confirmed and is now being prepared with care.",
        "Shipped": "Great news! Your order is on the way and will reach you soon.",
        "Delivered": "Your order has been delivered. We hope it brings a smile to your day.",
    }

    html = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937;">
      <p>Dear {order.get('billing_name', 'Customer')},</p>

      <p>
        Thank you for shopping with <strong>Mariso</strong>! Here is an update regarding your order.
      </p>

      <p>
        <strong>Status Update:</strong> {status}<br/>
        {status_messages.get(status, "Your order status has been updated.")}
      </p>

      <p><strong>Order Details:</strong></p>

      <ul>
        {items_list}
      </ul>

      <p>
        You can view your order details and track its progress anytime using the link below:<br/>
        <strong>View Your Order:</strong>
        <a href="http://localhost:3000/account/orders/{order.get('id')}">
          View Order
        </a>
      </p>

      <p>
        If you have any questions or need assistance, feel free to reply to this email — we’re always here to help.
      </p>

      <p>
        Thank you once again for choosing Mariso.
      </p>

      <p>
        Warm regards,<br/>
        <strong>Team Mariso</strong>
      </p>
    </div>
    """

    send_email(subject, to_email, html)