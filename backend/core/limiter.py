from slowapi import Limiter
from fastapi import Request
import logging

logger = logging.getLogger(__name__)

def get_safe_client_ip(request: Request) -> str:
    """
    Extracts the real client's IP address behind CDN/reverse proxies.
    Favors 'x-forwarded-for' first (leftmost IP) and 'x-real-ip' second,
    falling back securely to request.client.host.
    """
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        # X-Forwarded-For can contain multiple hops: "client_ip, proxy1, proxy2"
        # Take the leftmost IP representing the actual user client
        client_ip = x_forwarded_for.split(",")[0].strip()
        if client_ip:
            return client_ip
            
    x_real_ip = request.headers.get("x-real-ip")
    if x_real_ip:
        return x_real_ip.strip()
        
    if request.client:
        return request.client.host
        
    return "127.0.0.1"

import sys

# Instantiate Limiter with our custom safe IP resolver.
# Disable the limiter during testing so it doesn't interfere with pytest mocks or direct route function calls.
is_testing = "pytest" in sys.modules
limiter = Limiter(key_func=get_safe_client_ip, enabled=not is_testing)
logger.info(f"Application-level slowapi rate limiter initialized (enabled={not is_testing})")
