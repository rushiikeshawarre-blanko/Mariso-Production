Mariso Production

Full-stack e-commerce platform for handcrafted candles and home décor.

Tech Stack
	•	Frontend: React (CRACO)
	•	Backend: FastAPI
	•	Database: MongoDB (assumed)

Setup

Frontend

cd frontend
npm install
npm start

Backend

cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app -–reload

## Features

- Product catalog with variant support (color + fragrance)

- Dynamic pricing system:
  - Base price
  - Discount price
  - Variant-level price override

- Variant-based inventory system:
  - Stock managed per combination (color + fragrance)
  - Active/inactive variant control
  - Base stock disabled when variants exist

- Storefront variant selection:
  - Users select color and fragrance
  - Price and availability update dynamically
  - Prevents selection of inactive or unavailable combinations

- Inventory-safe cart system:
  - Variant-specific stock validation
  - Quantity limited by live variant stock
  - Prevents adding out-of-stock combinations

- Checkout flow with backend validation

- Admin panel for product & inventory management:
  - Generate variant combinations
  - Edit SKU, stock, and price per variant
  - Real-time stock summary

- Order creation and management

- Multi-channel notification system:
  - Email (Resend)
  - SMS (Twilio)
  - WhatsApp (Twilio)
  - Triggered on:
    - Order placement
    - Order status updates (confirmed, packed, shipped, delivered)

## Inventory Handling

The system ensures stock consistency across:

- Product page (variant-aware availability)
- Cart (variant-level quantity validation)
- Checkout (final backend verification)
- Admin inventory management

All pricing and stock calculations are validated server-side, ensuring accurate handling of variant-based inventory.

Status

🚧 Production preparation in progress

Latest updates:
- Variant-based inventory system implemented
- Storefront variant selection completed
- Email notification system integrated


## Payment migration checkpoint — Phase 1

Phase 0 restored the interrupted Cashfree baseline. Phase 1 added configuration
and isolated tests. Phase 2 adds a separately gated test-only order-creation API
and additive payment-attempt storage. Customer checkout, Cashfree verification,
refunds and customer UI still use the existing implementation.
The existing baseline is not declared production-ready by these checks.

### Agreed behavior and remaining gates

- Automatic capture; a captured payment after reservation expiry requires admin
  review before fulfillment. Do not silently mark it failed or fulfill without stock.
- Approved cancellations refund the full captured amount, including shipping and
  gift packaging. Refund execution will be implemented in Phase 5.
- Keep historical Cashfree IDs, callbacks, status checks and refunds provider-specific.
  Do not relabel existing records. Assume historical obligations may exist until checked.
- Live account activation, staging/production origins, webhook hostname, MongoDB
  transaction support and background-worker ownership remain unconfirmed.
- Partial-refund UI is deferred; the later refund ledger must still account for
  provider/dashboard partial refunds and prevent over-refunding.
- No live payment, refund, deployment or provider switch is authorized by a unit test.

### Configuration

`backend/.env.example` contains blank secrets and disabled defaults. It is not a
replacement for an existing deployment environment. No real environment file was changed.
`RAZORPAY_ENABLED` defaults to false; enabling it validates required keys, webhook
secret, test/live consistency and finite timeouts, but does not switch customer checkout. The separate Phase 2 creation gate is described below.
Both modes use the fixed API base `https://api.razorpay.com/v1`. Prefix validation
is a configuration check, not evidence of account activation or valid credentials.
When disabled, incomplete Razorpay configuration cannot block Cashfree startup.
No Razorpay frontend environment variable is needed: a later backend endpoint
will return only the public key ID and checkout options.

Before test-mode acceptance, confirm a public HTTPS webhook host and configure
`/api/payments/razorpay/webhook` separately for test/live. Planned events:
`payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`,
`refund.created`, `refund.processed`, `refund.failed`. The route is not implemented yet.
Enter secrets directly into the secret store; never into chat, source or logs.

Provider references:
- [API authentication](https://razorpay.com/docs/api/authentication/)
- [Capture settings](https://razorpay.com/docs/payments/payments/capture-settings/)
- [Webhook validation](https://razorpay.com/docs/webhooks/validate-test/?preferred-country=IN)
- [Idempotent refunds](https://razorpay.com/docs/api/refunds/normal-refunds-idempotent/)

### Offline backend checks

From the repository root, using the existing environment:

```sh
.venv/bin/python -I -B scripts/run_payment_unit.py
```

This dedicated runner collects only `tests/payment_unit`. Before collection it
replaces the current test process environment with dummy values, disables dotenv
loading and third-party pytest plugin auto-loading, blocks socket connections,
DNS, subprocesses and environment-file reads, and substitutes fail-closed database
and notification modules. No parent-shell or deployment variables are changed.
Tests must supply explicit fakes for database and notification effects. Normal
pytest collection of this directory fails with instructions to use the runner.
These are accidental-I/O guards for trusted tests, not an OS sandbox.

Do not run the old backend or end-to-end suites as an acceptance shortcut: their
fixtures load local environments and some tests contact or mutate a remote app.
These offline checks do not prove MongoDB transaction behavior or provider acceptance.
A separate order-service import attempt found `openpyxl` missing from the existing
virtual environment (it is declared in `backend/requirements.txt`). No dependency
was installed; full backend startup remains unverified until dependency setup is reviewed.

### Browser test preparation

`tests/playwright.payment.config.ts` is separate from the existing remote-default
configuration. It accepts only an HTTP `127.0.0.1` origin, collects only
`tests/payment_browser`, and does not start an app or backend automatically.
Payment specs must import `test` and `expect` from `./fixtures`, which blocks
unmocked API/external requests and WebSockets and disables the API request fixture.
Use a static local frontend server with no backend proxy; mock authentication,
the Checkout SDK and all payment APIs. Never reuse a running production-connected app.
Routing guards do not sandbox arbitrary Node code or replace review of new specs.

After Phase 4 adds payment browser specs and the existing Playwright dependencies
and browser are available, the proposed command from the repository root is:

```sh
cd tests
./node_modules/.bin/playwright test --config=playwright.payment.config.ts
```

Browser execution is not part of Phase 1; no dependencies or browsers are installed
by these commands or by the migration work so far.

### Phase 1 rollback

Keep the four pre-existing unrelated edits untouched. Remove only Phase 1 additions
and the Razorpay block in `backend/core/config.py`, the `.gitignore` exception for
the blank backend example, and this README section.
Do not reset the repository, alter real environment values, or remove Cashfree data.
Next checkpoint: review Phase 2 backend creation/storage before enabling any checkout.


## Phase 2 — test-only order creation and storage

Implemented `POST /api/payments/razorpay/create-order` with authenticated ownership.
Both `RAZORPAY_ENABLED` and `RAZORPAY_CREATE_ORDERS_ENABLED` must be true; both
remain disabled by default. The service rejects live mode. Do not enable either
flag until isolated test-mode integration is separately approved. No frontend code
was switched, and no live credentials, provider requests or database operations
were used during implementation.

Request: the checkout address/items/coupon shape plus a client-generated UUID
`request_id`. Reuse this UUID for transport retries of the SAME checkout payload.
Browser totals and item prices are forbidden. Product, variant, pack and packaging
selection reuse existing server validation; money is rounded half-up to paise at
unit-price boundaries. Coupon eligibility/identity uses the existing service,
with the approved coupon snapshot recalculated using Decimal. Shipping rules are
preserved with an explicit rounding function for the new path. Final payable
amount is immutable integer paise and INR; historical rupee fields remain intact.
The monetary parser rejects non-finite/negative values and values above INR 1 billion
(an application bound, not an account limit). Payable amounts below INR 1 are rejected.

Response: internal `order_id`, `payment_attempt_id`, provider `razorpay_order_id`,
public `key_id`, integer `amount`, `currency`, `stock_reserved_until`, and pending
`payment_status`. There is no payment session, secret, or paid/confirmed result.
Creation never deducts reserved stock permanently, records coupon usage, sends
notifications or creates shipments.

### Persistence and duplicate handling

`payment_attempts` stores a deterministic request claim scoped to authenticated
user and environment, a hash of the request, internal order ID, public key ID,
receipt and state. A unique partial index allows only one active Razorpay attempt
per user/environment. Additional indexes enforce receipt, provider order and
internal-order uniqueness. The indexes are created at application startup ONLY
when both gates are enabled; no indexes were executed during implementation.
Index creation failure must prevent startup; do not bypass startup index creation.

States: `preparing` → `reserving` → `creating` → `attaching` → `ready`.
Pricing rejection becomes `rejected` and releases the active-attempt constraint.
Other failures retain the constraint as `creation_unknown` or
`reconciliation_required` (a process crash may leave the earlier state).
A repeat with the same request/payload returns the stored ready response only while
the reservation remains valid. Changed payloads, another request key while active,
expired reservations and uncertain attempts return conflicts without new provider calls.

Before stock changes, persist the local order and its pricing snapshot. Before
provider creation, persist the creating state. The adapter uses Basic authentication,
integer amount, INR, unique receipt, minimal internal-ID notes and no generic
idempotency header. Its bounded synchronous HTTP call runs in a worker thread,
ignores proxy environment, refuses redirects and does not retry. It validates the
provider ID, amount, currency, receipt and created status before attachment.
Provider errors/timeouts/invalid responses remain uncertain; raw provider errors,
credentials, customer payloads and signatures are not logged or returned.

A received provider ID is saved on the attempt before attaching it to the order.
If persistence fails, retain receipt/attempt evidence for reconciliation. No blind
provider retry, stock release or replacement checkout is performed. New Cashfree
checkout cleanup is now provider-scoped so it cannot expire a Razorpay reservation.

### Acceptance limits and next checkpoint

Offline tests exercise the actual pricing and creation service with in-memory
collections and mocked HTTP/notifications. They cover request validation, paise,
coupons, shipping, reservation/attachment failures, duplicate/concurrent requests,
expired attempts, provider response validation and route authentication wiring.
They do not prove real MongoDB index/transaction behavior, HTTP delivery, provider
activation, or the complete payment lifecycle. The route test explicitly replaces
the rate limiter; actual rate limiting remains unverified.

The existing virtual environment also lacks `slowapi` and `httpx`; no packages
were installed. The adapter uses existing `requests`. Payment services can now
import without the unrelated Excel dependency because admin filtering is imported
only where used. Full server/admin export startup still requires dependency review.

Reservation operations still span documents. On a crash, recovery must inspect the
stored operation; do not guess or blindly repeat inventory writes. Phase 3 must
provide recoverable inventory transitions and reconcile expired/unknown attempts
before customer use. No worker or cleanup is implemented in Phase 2, so active
attempts deliberately stay blocked after uncertain outcomes. Actual payment failure
and deliberate retry require a later reconciled new attempt, not request-ID reuse.

Rollback: turn off the creation gate first; preserve attempt/order records if any
were ever created. Revert only Phase 2 source additions/changes using its snapshot,
keeping Phase 1 and the four pre-existing edits. Do not remove historical fields,
reset Git, or delete records/indexes. Stop here for review before Phase 3.


## Phase 3A — payment evidence checkpoint (Phase 3 remains incomplete)

Adds authenticated `/api/payments/razorpay/verify` and signed
`/api/payments/razorpay/webhook`. `RAZORPAY_PROCESSING_ENABLED` defaults false,
requires test configuration, and is independent of the creation gate.
Keep both gates disabled for normal application use at this checkpoint.

Verification uses the server-stored provider order ID, constant-time HMAC,
owned order/attempt/key matching and a bounded authenticated payment fetch.
Only an exact amount/currency/order match with captured=true and status=captured
creates immutable payment evidence. Authorized payments are not marked paid.
Evidence does not update orders, inventory, coupons or notifications and does not
permit fulfillment. Replays use built-in MongoDB `_id` uniqueness.

Webhooks validate the raw bytes before parsing and acknowledge only after durable
inbox insertion. Duplicate event IDs must retain the same body digest. Only event,
provider references, configuration identity and a digest are stored, not raw
customer data or signatures. HTTP failure before persistence must be retried.
Supported subscriptions: payment.authorized, payment.captured, payment.failed,
order.paid. Other events return 422; do not subscribe to refunds yet. Secret
rotation is not implemented; retain the same test webhook secret for this stage.

Local test command: `.venv/bin/python -I -B scripts/run_payment_unit.py`.
These isolated tests do not connect to Atlas or Razorpay.

Remaining Phase 3 work: Atlas-backed transactional reservation/finalization and
expiry release; reconciliation of interrupted creation and unattached provider
orders; inbox processing with retries; coupon accounting and notification outbox;
late-capture admin review; real test-database concurrency/crash validation.
MongoDB Atlas was selected for testing. Use a dedicated non-production database;
no database connection or credentials were used in this checkpoint. Existing
Phase 2 reservations remain potentially ambiguous and must not be automatically
replayed. No frontend switch or production release is authorized by this checkpoint.

Protocol references: [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/)
and [payment fetch](https://razorpay.com/docs/api/payments/fetch-with-id/).


## Phase 3B — transactional processing and recovery (test-mode only)

This supersedes the Phase 3A evidence-only behavior. Verified captured payments
now enter a MongoDB transaction that confirms held inventory, records payment,
increments coupon `used_count`, and queues one notification per channel. Replays
return the already-paid order. Late captures, partially refunded captures and
legacy reservations go to `paid_stock_issue` without automatic fulfillment.
No external API call occurs inside a retryable transaction callback.

New reservations use `inventory_version=1`. Reservation and expiry stock writes
are transactional and have no standalone-MongoDB fallback. Existing Phase 2
reservations without this marker are never automatically replayed. Creation now
requires processing plus the recovery-worker gate and a replica set or mongos.
All gates remain disabled by default, and live mode remains blocked.

The optional worker polls every 30 seconds. It re-fetches captured payments,
processes signed inbox records, reconciles provider orders by stored reference or
receipt, validates internal notes/amount/currency, and attaches recovered IDs.
It never retries the provider order-creation POST. Missing or ambiguous provider
results retain the active checkout claim for manual review; stock can expire
safely on version-1 orders. A customer with such a claim cannot start another
checkout until it is reconciled. Failed/authorized events never downgrade paid
orders. Each pass is bounded to 50 attempts and 50 events with retry delays.

`RAZORPAY_WORKER_ENABLED=false` and `RAZORPAY_NOTIFICATIONS_ENABLED=false` are new
controls. Keep them false until local setup and test credentials are ready.
Turning off creation does not disable reconciliation of existing attempts.
Notification delivery also respects EMAIL_ENABLED/TWILIO_WHATSAPP_ENABLED.
Email jobs freeze their payload and use a stable Resend idempotency key, retry
up to eight times within 23 hours, then require review. Expired send leases and
uncertain WhatsApp deliveries become `delivery_unknown` for manual review rather
than blindly resending. The simple Razorpay confirmation email is separate from
legacy Cashfree templates. No notifications were actually sent during validation.

Validation: 130 offline tests passed, including stock rollback, duplicate and
concurrent finalization, expiry, legacy holds, receipt recovery, event ordering,
notification gating and retry behavior. An isolated temporary MongoDB replica
set on port 27018 also passed real concurrent finalization, multi-product rollback,
and concurrent variant-expiry tests. The disposable test database was dropped and
that temporary server was stopped. These checks did not read application .env or
modify the existing mariso database. Four unrelated pre-existing edits remain
unchanged. Existing dependency deprecation warnings remain.

### Local replica-set setup still required

The main Homebrew MongoDB on port 27017 is standalone. User approved conversion,
but filesystem permission to modify `/opt/homebrew/etc/mongod.conf` was not granted.
Its original configuration is unchanged. A backup was saved in the task workspace
under `work/phase3b-prepared/mongod.conf.original` before preparing this change.

Stop the application backend, back up the MongoDB configuration, then add this
at the top level of `/opt/homebrew/etc/mongod.conf` (do not duplicate a replication
section if one already exists):

```yaml
replication:
  replSetName: mariso-local
```

Restart `brew services restart mongodb-community`, then initialize once:

```bash
mongosh 'mongodb://127.0.0.1:27017/admin' --quiet --eval 'rs.initiate({_id:"mariso-local",members:[{_id:0,host:"localhost:27017"}]})'
```

Wait for `db.hello().isWritablePrimary` to become true before restarting the
backend. Existing local data stays in the same dbPath. Never run this against a
remote/production MongoDB server. Do not remove database files or run --repair.

### Remaining acceptance work

The frontend still uses Cashfree. Real Razorpay test API keys/webhook secret and
a reachable test webhook URL have not been configured or exercised. No live
provider API, refund, email, or WhatsApp was sent. Replica-set conversion for the
main local database, full application startup with worker enabled, process-kill
recovery testing, manual-review tooling, and provider end-to-end tests remain.
Refund handling and frontend switching remain later phases. Do not release this
checkpoint to production. Manual-review rows must be investigated before clearing
an active payment claim; never delete them merely to unblock another payment.

References: [MongoDB transaction retries](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/crud/transactions/),
[Razorpay receipt lookup](https://github.com/razorpay/razorpay-node/blob/master/documents/order.md),
[Resend idempotency](https://resend.com/changelog/idempotency-keys).


## Phase 4 — gated frontend Razorpay checkout

`REACT_APP_RAZORPAY_ENABLED=true` selects the new Razorpay checkout path at frontend
startup/build time. It defaults off. Do not enable it until the replica set,
backend processing/worker gates and test credentials are ready. No credentials or
real environment files were changed in this phase. Razorpay test keys come from
the server response; the browser never receives a secret. Live keys are rejected.

The SDK is loaded before reserving stock, with a 15-second timeout and a retryable
loader. Checkout uses the server amount/currency/order ID and disables in-modal
payment retries. A persistent, user-scoped session request ID is reused after an
uncertain creation response. Pending order references survive reloads. Changed
checkout payloads cannot bypass an unresolved request, and repeat submits while
one is running are blocked. Closing/failing the modal leads to status recovery,
not an assumption that the charge failed. Client callbacks are verified by the
backend; signatures are not stored or logged. There is no automatic Cashfree
fallback after a Razorpay failure.

The protected `/payment/razorpay/return` page reads an owner-scoped, read-only
status endpoint. It polls pending status up to 12 times, supports manual refresh,
and distinguishes pending, expired and paid-stock-review states. It only navigates
to success when the server reports paid plus confirmed inventory. It clears the
cart only when it still matches the original checkout cart. Direct success-page
navigation cannot claim success for an unconfirmed Razorpay order. Account payment
refreshes dispatch by the order's provider, retaining historical Cashfree support.
A separately gated Razorpay shipping preview uses the same server pricing code as
order creation. Cashfree return URLs and backend historical workflows remain.

Validation: 135 offline backend tests and 18 isolated frontend tests pass. Frontend
tests mock the SDK/API and cover uncertain creation, request reuse, modal dismissal,
payment failure, verification timeout, SDK timeout, invalid amounts/keys, server
confirmation, stock review, and preserving changed carts. Modified JSX files also
pass parsing. These are not real Razorpay or full-browser end-to-end tests; actual
SDK appearance, authentication redirects and webhook delivery remain acceptance
checks after configuration. No production build, payment or deployment was run.

Run backend checks from the project root:
`.venv/bin/python -I -B scripts/run_payment_unit.py`

Run frontend checks from `frontend`: `npm run test:payments`.
This dedicated Jest configuration avoids loading the app's environment files.

To roll back new checkout, leave/remove REACT_APP_RAZORPAY_ENABLED or set it false
and restart/rebuild the frontend. Preserve Razorpay backend processing for any
existing attempts. Do not relabel old provider records or remove their references.
Razorpay cancellation/refund support is test-only; live rollout remains pending.


### Razorpay reservation expiry and Buy again

Resume payment only reopens an owned, unpaid Razorpay order with a valid stock
reservation. Expired orders cannot renew their hold or reuse their old quote.
Account Orders and the payment return page show Buy again after expiry.

The authenticated, rate-limited buy-again endpoint checks the old Razorpay order
and its complete payment history. It blocks unresolved, paid, partial, or ambiguous
payments. It releases any expired stock hold, rebuilds catalog selections with
current prices/availability, and transactionally retires the old active claim.
Unavailable products or variants leave the claim intact. Repeated requests are
safe. The cart merges restored lines without multiplying matching items, keeps
unrelated items, and sends the customer through fresh checkout. Discounts, gift
packaging and shipping must be reviewed again; checkout validates them server-side.

The old order stays expired. Its provider order is not cancelled by this operation.
Retired claims remain monitored, and a late capture goes to paid_stock_issue for
admin review without competing for the new active claim or deducting stock again.
New checkout creation is blocked when a paid_stock_issue is already recorded.
This does not guarantee a provider can never capture an old in-flight payment;
late-capture reconciliation and refund operations remain required before production.

Local browser acceptance of Buy again passed: a fresh confirmed order was created and the original remained expired. No production deployment.


### Razorpay full cancellation refunds (test only)

Enable `RAZORPAY_REFUNDS_ENABLED=true` alongside the existing test processing and
worker flags, then restart the backend. It defaults to false. Keep notifications
and external fulfillment disabled during local acceptance.

Add `refund.created`, `refund.processed`, and `refund.failed` to the existing
Razorpay test webhook. Keep the four existing payment events and the same secret.
The worker verifies signed events and fetches refund details from Razorpay before
updating the order. It also polls incomplete refund requests if events are missed.

Use a fresh confirmed test purchase within the existing one-hour cancellation
window. Request cancellation in the customer order details, approve it in Admin
Orders, then choose Initiate Refund. Approval restores stock atomically exactly
once and sets the refund pending. Initiation refunds the full captured amount in
paise, including shipping and gift charges. Refund status progresses separately
from the cancelled order status; Sync Refund Status provides a manual refresh.

A durable claim permits only one refund POST. Timeouts or uncertain responses are
reconciled by receipt/payment/refund ID; they never trigger automatic resubmission.
If no matching provider refund can be found, the order requires manual review.
Do not clear its refund ID to retry. Provider failure likewise requires review.
Historic Cashfree orders retain their existing handlers.

Pending acceptance: real Razorpay test-mode cancellation and refund, stock before/
after, duplicate-click/replayed webhook behavior. Cancellation/refund notifications,
late-capture exception refunds, and live credentials/rollout are not included in
this checkpoint. No live refund has been issued by these changes.

### Razorpay notification acceptance

Confirmation, approved cancellation, and completed full refunds now enqueue customer
email, admin email, and customer WhatsApp jobs atomically with the order transition.
Repeated verification/refund events do not duplicate jobs. The notification worker
scopes jobs and orders to the configured payment environment. Legacy jobs without an
environment are left untouched; do not bulk replay historic test messages.

Enable RAZORPAY_WORKER_ENABLED, RAZORPAY_NOTIFICATIONS_ENABLED, EMAIL_ENABLED, and
TWILIO_WHATSAPP_ENABLED in backend/.env and remove explicit false overrides from the
backend startup command. Restart the backend. Existing email/Twilio credentials are
required. Missing configuration leaves pending jobs with a sanitized last_error and
a five-minute retry. Configure both approved WhatsApp template Content SIDs:

- TWILIO_WHATSAPP_ORDER_CANCELLED_CONTENT_SID: “Hi {{1}}, your Mariso order {{2}}
  has been cancelled. Your refund of INR {{3}} will be processed separately.”
- TWILIO_WHATSAPP_REFUND_COMPLETED_CONTENT_SID: “Hi {{1}}, your refund of INR {{3}}
  for Mariso order {{2}} has been processed to your original payment method.”

These are separate templates with variables 1=customer name, 2=short order ID,
3=full captured amount formatted with two decimals. Submit utility templates in
Twilio and save the approved HX IDs privately in .env. No free-form fallback is
used. Existing confirmed-order template/CTA behavior remains unchanged.

Use a fresh test purchase, then request cancellation, approve it, and refund it.
Check provider acceptance IDs and actual customer receipt for both channels.
A sent job means provider acceptance, not proven inbox/handset delivery. Email
failures retry with a frozen payload/idempotency key for at most 23 hours; ambiguous
WhatsApp submissions and abandoned leases require review, not blind resend.
Stale confirmations after cancellation are superseded. If refund completion occurs
before cancellation notice delivery, the completion notice supersedes the pending
cancellation notice. Refund-initiation and cancellation-request/rejection notices
are not introduced in this checkpoint. No real notifications were sent by unit tests.


### Razorpay-only checkout cutover
New checkout uses Razorpay exclusively. The retired Cashfree create-session endpoint
returns HTTP 410 before reserving stock or contacting Cashfree. Historical Cashfree
verification, status, webhooks and refunds remain supported; retain their credentials
until outstanding legacy obligations are resolved. The browser Cashfree SDK loader
and new-session API helpers have been removed.

Keep REACT_APP_RAZORPAY_ENABLED=true for checkout; disabling it reports payment
unavailability instead of falling back to Cashfree. Backend creation still requires
RAZORPAY_ENABLED, RAZORPAY_CREATE_ORDERS_ENABLED, RAZORPAY_PROCESSING_ENABLED and
RAZORPAY_WORKER_ENABLED. Live mode additionally requires RAZORPAY_LIVE_ENABLED=true,
RAZORPAY_ENV=live and matching live credentials. The live flag defaults to false.
No local credentials or running environment were switched to live by this change.
Do not disable processing when merely pausing new checkouts: disable creation only.

Release acceptance still requires browser regression coverage, a late-capture
paid_stock_issue resolution procedure, production webhook/worker/database validation,
and a controlled live smoke test. Cancellation/refund WhatsApp templates are deferred.
