from twilio.rest import Client
import os


def _get_twilio_client():
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    return Client(account_sid, auth_token)


def send_whatsapp(to_number: str, message: str):
    try:
        client = _get_twilio_client()
        msg = client.messages.create(
            body=message,
            from_=os.getenv("TWILIO_WHATSAPP_NUMBER"),
            to=f"whatsapp:{to_number}"
        )
        print(f"WhatsApp sent: {msg.sid}")
    except Exception as e:
        print(f"WhatsApp failed: {e}")


def send_order_placed_whatsapp(order: dict):
    phone = order.get("billing_phone")
    if not phone:
        print("WhatsApp skipped: missing billing_phone")
        return

    customer_name = order.get("billing_name", "Customer")
    order_short_id = str(order.get("id", ""))[:8].upper()
    total_price = float(order.get("total_price", 0) or 0)

    order_link = f"http://localhost:3000/account/orders/{order.get('id')}"

    message = (
        f"Hello {customer_name} 💐\n\n"
        f"Your Mariso order {order_short_id} has been placed successfully ✨\n\n"
        f"Total: ₹{total_price:,.2f}\n\n"
        f"We’re excited to prepare something beautiful for you 🌸\n\n"
        f"Track your order anytime here:\n"
        f"👉 {order_link}\n\n"
        f"We’ll keep you updated on every step."
    )

    send_whatsapp(phone, message)


def send_order_status_whatsapp(order: dict):
    phone = order.get("billing_phone")
    if not phone:
        print("WhatsApp skipped: missing billing_phone")
        return

    customer_name = order.get("billing_name", "Customer")
    order_short_id = str(order.get("id", ""))[:8].upper()
    status = str(order.get("status", "")).capitalize()

    order_link = f"http://localhost:3000/account/orders/{order.get('id')}"

    status_messages = {
        "Confirmed": (
            f"Hello {customer_name} 💐\n\n"
            f"Your Mariso order {order_short_id} has been confirmed ✨\n\n"
            f"We’re carefully preparing your order to make it perfect 🌸\n\n"
            f"Track your order anytime here:\n"
            f"👉 {order_link}\n\n"
            f"We’ll keep you updated on every step."
        ),
        "Shipped": (
            f"Hello {customer_name} 🚚\n\n"
            f"Great news! Your Mariso order {order_short_id} has been shipped ✨\n\n"
            f"It’s on the way and will reach you soon 🌸\n\n"
            f"Track your order here:\n"
            f"👉 {order_link}"
        ),
        "Delivered": (
            f"Hello {customer_name} ✨\n\n"
            f"Your Mariso order {order_short_id} has been delivered 💐\n\n"
            f"We hope it brings a smile to your day 🌸\n\n"
            f"Thank you for choosing Mariso ❤️"
        ),
    }

    message = status_messages.get(
        status,
        f"Hello {customer_name}, your Mariso order {order_short_id} is now {status}."
    )

    send_whatsapp(phone, message)