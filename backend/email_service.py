import os
from typing import Iterable
import resend

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")



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
        <a href="{FRONTEND_URL}/account/orders/{order.get('id')}">
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

    customer_name = order.get("billing_name", "Customer")
    status = str(order.get("status", "")).capitalize()
    order_id = order.get("id")
    order_short_id = str(order_id)[:8].upper()
    order_link = f"{FRONTEND_URL}/account/orders/{order_id}"
    feedback_link = f"{FRONTEND_URL}/feedback/{order_id}"

    items_list = ""
    for item in order.get("items", []):
        name = item.get("product_name", "Item")
        qty = item.get("quantity", 1)
        items_list += f"""
        <li>Product: {name}<br/>Quantity: {qty}</li>
        """

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