from twilio.rest import Client
import os


def _get_twilio_client():
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    return Client(account_sid, auth_token)


def send_sms(to_number: str, message: str):
    try:
        client = _get_twilio_client()
        msg = client.messages.create(
            body=message,
            from_=os.getenv("TWILIO_PHONE_NUMBER"),
            to=to_number
        )
        print(f"SMS sent: {msg.sid}")
    except Exception as e:
        print(f"SMS failed: {e}")


def send_order_placed_sms(order: dict):
    phone = order.get("billing_phone")
    if not phone:
        print("SMS skipped: missing billing_phone")
        return

    customer_name = order.get("billing_name", "Customer")
    order_short_id = str(order.get("id", ""))[:8].upper()
    total_price = float(order.get("total_price", 0) or 0)

    message = (
        f"Hi {customer_name}, your Mariso order {order_short_id} has been placed successfully. "
        f"Total: ₹{total_price:,.2f}."
    )

    send_sms(phone, message)


def send_order_status_sms(order: dict):
    phone = order.get("billing_phone")
    if not phone:
        print("SMS skipped: missing billing_phone")
        return

    customer_name = order.get("billing_name", "Customer")
    order_short_id = str(order.get("id", ""))[:8].upper()
    status = str(order.get("status", "")).capitalize()

    message = (
        f"Hi {customer_name}, your Mariso order {order_short_id} is now {status}."
    )

    send_sms(phone, message)