## Automated Tests

Tests use **Jest** and **Supertest** and run against a separate PostgreSQL database (`ecommerce_support_test`) with the built-in mock AI provider. No API key is needed and results are deterministic. 19 tests run in 2 files.

---

### What is covered

`backend/tests/supportSystem.test.js` (the 9 core scenarios)

| # | Scenario | What is verified |
| :--- | :--- | :--- |
| 1 | Authentication and access control | `401` without a token, `403` on another customer's ticket, `403`/`404` on another customer's order, `403` for customers on `/api/admin/*` |
| 2 | Ticket creation and multi-turn chat | Ticket saved for the owner, AI reply stored, follow-up message persisted |
| 3 | Missing order ID | AI asks for the order number, no refund tool is called |
| 4 | Eligible refund (`ORD-1001`, ₹1,499) | Exactly one `approved` refund, `electronics_return_policy.md` cited |
| 5 | Expired return window (`ORD-1003`) | `return_window_expired`, no refund |
| 6 | Refund above ₹5,000 | Ticket `escalated`, one `pending` escalation, no auto refund, staff approval creates the refund |
| 7 | Duplicate submission | Same key replays the original refund, a different key for the same order returns `409`, one refund row |
| 8 | Prompt injection | `prompt_injection_detected: true`, no ₹50,000 refund |
| 9 | Tool or database failure | Safe fallback reply, never claims approval |

`backend/tests/regression.test.js` (bug fixes and Gemini mode)

| # | Scenario | What is verified |
| :--- | :--- | :--- |
| 10 | Staff internal notes | Customers never receive `internal_note` from tickets or escalations |
| 11 | Escalation from chat | The order is linked to the ticket, staff approval creates the ₹12,999 refund, a second decision returns `409` |
| 12 | Approval without an order | Returns `400 NO_LINKED_ORDER` instead of approving with no refund |
| 13 | Refund decisions | No repeated decision, a rejected refund cannot be reopened |
| 14 | Parallel idempotent requests | Three simultaneous requests give `201, 200, 200` and one refund row |
| 15 | Invalid JSON body | Returns `400`, not `500` |
| 16 | Production JWT secret | The app refuses to start with a weak secret |
| 17 | Gemini mode | Each customer message is sent once, prompt injection is flagged |
| 18 | Gemini mode | Malformed tool arguments do not crash the agent |
| 19 | Gemini mode | An endless tool loop falls back to the safe mock agent |

---

### Prerequisites

- PostgreSQL running locally
- Dependencies installed: `cd shopcare-ai/backend && npm install`
- Test database created:

```bash
createdb -h 127.0.0.1 -U postgres ecommerce_support_test
```

To use a different test database:

```bash
export TEST_DATABASE_URL=postgresql://postgres:your_password@localhost:5432/my_test_db
```

---

### Run

```bash
cd shopcare-ai/backend

# all tests
npm test

# one file
npx jest tests/regression.test.js

# one scenario by name
npx jest -t "idempotency"

# coverage report
npx jest --runInBand --forceExit --coverage
```

Expected result:

```
PASS tests/regression.test.js
PASS tests/supportSystem.test.js

Test Suites: 2 passed, 2 total
Tests:       19 passed, 19 total
```

---

### How the tests work

- Each file sets its own environment: `NODE_ENV=test`, the test database, a test JWT secret and an empty `LLM_API_KEY` (mock AI).
- `beforeAll` calls `seedDatabase({ closePool: false })` to reset the demo data, then logs in as Alice, Bob and staff.
- Rate limiting is switched off when `NODE_ENV=test`.
- The Gemini tests replace `fetch` with a fake, so no network call is made.
- Tests run one at a time (`--runInBand`) because they share one database.

---

### Troubleshooting

| Problem | Fix |
| :--- | :--- |
| `database "ecommerce_support_test" does not exist` | Run the `createdb` command above |
| `ECONNREFUSED 127.0.0.1:5432` | Start PostgreSQL, or set `TEST_DATABASE_URL` |
| `password authentication failed` | Set `TEST_DATABASE_URL` with your PostgreSQL user and password |
| Jest does not exit | Keep `--forceExit` (already in `npm test`) |
| Tests interfere with each other | Run with `--runInBand`, never in parallel |

---

### GitHub Actions (optional)

Save as `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: ecommerce_support_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/ecommerce_support_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
        working-directory: shopcare-ai/backend
      - run: npm test
        working-directory: shopcare-ai/backend
```
