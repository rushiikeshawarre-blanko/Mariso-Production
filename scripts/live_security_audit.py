import urllib.request
import ssl
import socket

URL = "https://mariso.store/"
API_URL = "https://mariso.store/api"

def audit_headers(url):
    print(f"[*] Auditing security headers for: {url}")
    try:
        req = urllib.request.Request(url, method='GET')
        req.add_header('User-Agent', 'MarisoSecurityAuditor/1.0')
        with urllib.request.urlopen(req) as response:
            headers = response.info()
            
            security_headers = {
                'Strict-Transport-Security': 'HSTS (Enforces HTTPS)',
                'Content-Security-Policy': 'CSP (Prevents XSS & data injection)',
                'X-Frame-Options': 'Clickjacking protection',
                'X-Content-Type-Options': 'MIME-sniffing prevention',
                'Referrer-Policy': 'Controls referrer information leaked',
                'Permissions-Policy': 'Restricts browser feature usage'
            }
            
            print("\n--- SECURITY HEADERS PRESENT ---")
            found = 0
            for header, desc in security_headers.items():
                if header in headers:
                    print(f"[+] {header}: {headers[header]} ({desc})")
                    found += 1
            
            print("\n--- MISSING SECURITY HEADERS (RECOMMENDED) ---")
            for header, desc in security_headers.items():
                if header not in headers:
                    print(f"[-] {header} is MISSING! ({desc})")
                    
            print("\n--- SERVER DISCLOSURES & CORS ---")
            print(f"[*] Server: {headers.get('Server', 'Not disclosed (Good)')}")
            print(f"[*] X-Powered-By: {headers.get('X-Powered-By', 'Not disclosed (Good)')}")
            print(f"[*] Access-Control-Allow-Origin: {headers.get('Access-Control-Allow-Origin', 'None')}")
            
    except Exception as e:
        print(f"[!] Error auditing headers: {e}")

def audit_ssl(domain):
    print(f"\n[*] Auditing SSL/TLS settings for: {domain}")
    try:
        context = ssl.create_default_context()
        with socket.create_connection((domain, 443)) as sock:
            with context.wrap_socket(sock, server_hostname=domain) as ssock:
                cert = ssock.getpeercert()
                cipher = ssock.cipher()
                version = ssock.version()
                
                print(f"[+] SSL Version: {version}")
                print(f"[+] Active Cipher: {cipher[0]} ({cipher[1]} bits)")
                
                # Check expiration
                notAfter = cert.get('notAfter')
                print(f"[+] Certificate Valid Until: {notAfter}")
    except Exception as e:
        print(f"[!] SSL Audit failed: {e}")

def audit_cors_origins():
    print(f"\n[*] Testing CORS behavior on API: {API_URL}/products")
    try:
        # Test with standard domain
        req1 = urllib.request.Request(f"{API_URL}/products", method='OPTIONS')
        req1.add_header('Origin', 'https://mariso.store')
        req1.add_header('Access-Control-Request-Method', 'GET')
        
        # Test with malicious/unauthorized domain
        req2 = urllib.request.Request(f"{API_URL}/products", method='OPTIONS')
        req2.add_header('Origin', 'https://maliciousattacker.com')
        req2.add_header('Access-Control-Request-Method', 'GET')
        
        with urllib.request.urlopen(req1) as r1:
            h1 = r1.info()
            print(f"[+] Allowed Origin for mariso.store: {h1.get('Access-Control-Allow-Origin', 'None')}")
            
        with urllib.request.urlopen(req2) as r2:
            h2 = r2.info()
            allowed_malicious = h2.get('Access-Control-Allow-Origin')
            if allowed_malicious == '*':
                print("[!] WARNING: API wildcard CORS is enabled (Access-Control-Allow-Origin: *).")
            elif allowed_malicious == 'https://maliciousattacker.com':
                print("[!] CRITICAL: API blindly reflects Origin headers (CORS spoofing possible)!")
            else:
                print(f"[+] Protected: API CORS did not allow malicious.com (Result: {allowed_malicious})")
    except Exception as e:
        print(f"[-] CORS Audit skipped or OPTIONS not allowed: {e}")

def check_sensitive_disclosures(domain):
    print(f"\n[*] Checking for public disclosure of sensitive paths:")
    paths = [
        ".env",
        ".git/config",
        "package.json",
        "requirements.txt",
        "server.py",
        "api/auth/login"
    ]
    
    for path in paths:
        url = f"https://{domain}/{path}"
        try:
            req = urllib.request.Request(url, method='GET')
            req.add_header('User-Agent', 'MarisoSecurityAuditor/1.0')
            with urllib.request.urlopen(req, timeout=5) as r:
                code = r.getcode()
                if code == 200:
                    content = r.read(300)
                    lowered = content.lower()
                    is_spa_fallback = (
                        b"<!doctype html" in lowered
                        or b"<div id=\"root\"" in lowered
                        or b"<div id='root'" in lowered
                    )
                    if is_spa_fallback:
                        print(f"[+] Protected: {path} returned SPA fallback HTML, not the real file")
                    else:
                        print(f"[!] DANGER: Exposed sensitive path: {url} (HTTP 200, Start: {content[:80]})")
                else:
                    print(f"[+] Protected: {path} returned HTTP {code}")
        except urllib.error.HTTPError as e:
            print(f"[+] Protected: {path} returned HTTP {e.code}")
        except Exception as e:
            print(f"[-] Checked {path}: {e}")

if __name__ == "__main__":
    print("==================================================")
    print("          MARISO LIVE PRODUCTION AUDIT            ")
    print("==================================================")
    audit_headers("https://mariso.store/")
    audit_headers("https://mariso.store/api/products")
    audit_ssl("mariso.store")
    audit_cors_origins()
    check_sensitive_disclosures("mariso.store")
    print("\n==================================================")
