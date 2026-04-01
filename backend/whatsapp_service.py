from twilio.rest import Client
import os

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


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


def send_order_status_whatsapp(order: dict):
    phone = order.get("billing_phone")
    if not phone:
        print("WhatsApp skipped: missing billing_phone")
        return

    customer_name = order.get("billing_name", "Customer")
    order_short_id = str(order.get("id", ""))[:8].upper()
    status = str(order.get("status", "")).capitalize()

    order_link = f"{FRONTEND_URL}/account/orders/{order.get('id')}"
    feedback_link = f"{FRONTEND_URL}/feedback/{order.get('id')}"

    status_messages = {
        "Confirmed": (
            f"Hello {customer_name} 💐\n\n"
            f"Your Mariso order {order_short_id} has been confirmed ✨\n\n"
            f"We’re carefully preparing your order to make it perfect 🌸\n\n"
            f"Track your order anytime here:\n"
            f"👉 {order_link}\n\n"
            f"We’ll keep you updated on every step."
        ),
        "Packed": (
            f"Hi {customer_name} 😊\n\n"
            f"Great news! Your order from MARISO has been packed and is ready to ship 🎁\n\n"
            f"We’re preparing it with care and it will be shipped shortly 🚚\n\n"
            f"Stay tuned for tracking details.\n\n"
            f"Thank you for shopping with us! 💛\n"
            f"– Team MARISO"
        ),
        "Shipped": (
            f"Hi {customer_name} 🎉\n\n"
            f"Your MARISO order {order_short_id} has been shipped and is on its way to you 🚚💨\n\n"
            f"📦 Track your order here:\n"
            f"👉 {order_link}\n\n"
            f"We can’t wait for you to receive it! 💛\n"
            f"– Team MARISO"
        ),
        "Delivered": (
            f"🎁 You’ve got a Surprise Discount waiting! 👀✨\n\n"
            f"Hi {customer_name}\n\n"
            f"Your MARISO order {order_short_id} has been delivered 🎉\n"
            f"We hope you absolutely loved it 🌸\n\n"
            f"Want to unlock your reward? It’s super simple:\n\n"
            f"👉 Share your feedback here:\n"
            f"{feedback_link}\n\n"
            f"✨ Hit submit & your random discount % will instantly appear!\n"
            f"This can be availed on your next purchase.\n\n"
            f"Hurry… go check your reward now 😍\n\n"
            f"– Team MARISO"
        ),
    }

    message = status_messages.get(
        status,
        f"Hello {customer_name}, your Mariso order {order_short_id} is now {status}."
    )

    send_whatsapp(phone, message)