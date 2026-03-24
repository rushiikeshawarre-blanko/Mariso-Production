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

    items_html = build_order_items_html(order.get("items", []))
    subject = f"Your Mariso order {order['id'][:8].upper()} has been placed"

    html = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Thank you for your order, {order.get('billing_name', 'Customer')}!</h2>
      <p>Your order has been placed successfully.</p>
      <p><strong>Order ID:</strong> {order.get('id')}</p>
      <p><strong>Total:</strong> ₹{order.get('total_price', 0):,.2f}</p>
      <p><strong>Payment Method:</strong> {str(order.get('payment_method', '')).capitalize()}</p>
      <h3>Items</h3>
      <ul>{items_html}</ul>
      <p>We’ll keep you updated as your order moves forward.</p>
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

    html = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Hello {order.get('billing_name', 'Customer')},</h2>
      <p>Your order status has been updated.</p>
      <p><strong>Order ID:</strong> {order.get('id')}</p>
      <p><strong>Current Status:</strong> {status}</p>
      <p><strong>Total:</strong> ₹{order.get('total_price', 0):,.2f}</p>
      <p>You can check your order details in your account.</p>
    </div>
    """

    send_email(subject, to_email, html)