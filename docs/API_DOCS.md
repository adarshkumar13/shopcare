## API Documentation

- **Base URL:** `http://localhost:5000/api`
- **Swagger UI:** `http://localhost:5000/api-docs`
- **OpenAPI JSON:** `http://localhost:5000/api-docs.json` (exported copy: [`openapi.json`](../shopcare-ai/docs/openapi.json))
- **Postman collection:** [`ShopCare_AI.postman_collection.json`](./ShopCare_AI.postman_collection.json)

---

## Gemini API Setup

ShopCare AI uses Gemini through its OpenAI-compatible endpoint. Add these to `shopcare-ai/backend/.env`:

```env
LLM_API_KEY=your_gemini_api_key
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_MODEL=gemini-3-flash-preview
```

Get a key from [Google AI Studio](https://aistudio.google.com/apikey). If `LLM_API_KEY` is empty, the built-in mock AI provider is used. If a Gemini call fails, the agent falls back safely.

Check which mode is active:

```bash
curl http://localhost:5000/api/health
```

---

## Authentication

All endpoints except `/api/health`, `/api/auth/register` and `/api/auth/login` need a JWT:

```
Authorization: Bearer <token>
```

Get a token:

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@demo.com","password":"Customer123!"}'
```

| Role | Email | Password |
| :--- | :--- | :--- |
| Customer | `alice@demo.com` | `Customer123!` |
| Customer | `bob@demo.com` | `Customer123!` |
| Staff | `staff@demo.com` | `Staff123!` |

---

## Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | API, DB and AI provider status |
| `POST` | `/api/auth/register` | Public | Register a customer |
| `POST` | `/api/auth/login` | Public | Login and receive a JWT |
| `GET` | `/api/auth/me` | Authenticated | Current user profile |
| `GET` | `/api/orders` | Customer / Staff | Own orders (all for staff) |
| `GET` | `/api/orders/:id` | Customer / Staff | Order by UUID or `order_number` |
| `GET` | `/api/tickets` | Customer / Staff | Own tickets (all for staff) |
| `POST` | `/api/tickets` | Customer / Staff | Create ticket and trigger AI turn |
| `GET` | `/api/tickets/:id` | Owner / Staff | Ticket, messages, refunds, escalations |
| `POST` | `/api/tickets/:id/messages` | Owner / Staff | Post message (customer messages trigger AI) |
| `GET` | `/api/refunds` | Customer / Staff | List refunds |
| `POST` | `/api/refunds` | Customer / Staff | Submit idempotent refund request |
| `GET` | `/api/escalations` | Customer / Staff | List escalations |
| `GET` | `/api/admin/tickets` | Staff | Queue filter: `status`, `priority`, `escalated`, `search` |
| `GET` | `/api/admin/tickets/:id` | Staff | Full bundle with `audit_logs` |
| `PATCH` | `/api/admin/tickets/:id/status` | Staff | Update ticket status |
| `POST` | `/api/admin/escalations/:id/decision` | Staff | Approve, reject or request more info |
| `POST` | `/api/admin/refunds/:id/decision` | Staff | Approve or reject refund |
| `GET` | `/api/admin/audit-logs` | Staff | Recent audit logs |

---

## Request Examples

### Create ticket

```bash
curl -X POST http://localhost:5000/api/tickets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Item arrived broken",
    "description": "Please refund ORD-1001",
    "order_id": "ORD-1001"
  }'
```

### Post message

```bash
curl -X POST http://localhost:5000/api/tickets/$TICKET_ID/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Please refund ORD-1001"}'
```

### Create refund

```bash
curl -X POST http://localhost:5000/api/refunds \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "ORD-1001",
    "ticket_id": "<TICKET_UUID>",
    "amount": 1499,
    "reason": "Item arrived broken",
    "idempotency_key": "refund-ord-1001-001"
  }'
```

`ticket_id` and `reason` are required. Sending the same `idempotency_key` again returns the existing refund (`200`, `deduplicated: true`) instead of creating a duplicate. A different key for an order that already has a pending or approved refund returns `409`.

### Staff escalation decision

```bash
curl -X POST http://localhost:5000/api/admin/escalations/$ESCALATION_ID/decision \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decision":"approved","internal_note":"Defect verified via serial check"}'
```

`decision` values: `approved`, `rejected`, `more_info_requested`. Approving needs a ticket with a linked order (`400 NO_LINKED_ORDER` otherwise). An escalation that was already approved or rejected returns `409 ALREADY_DECIDED`.

### Staff refund decision

```bash
curl -X POST http://localhost:5000/api/admin/refunds/$REFUND_ID/decision \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decision":"rejected","note":"Fraud check failed"}'
```

`decision` values: `approved`, `rejected`. Repeating the current status, or changing a rejected refund, returns `409`.

---

## Business Rules Enforced by the API

| Rule | Behavior |
| :--- | :--- |
| Ownership | Customers can only access their own orders, tickets and refunds |
| Delivery status | Refunds only for `delivered` orders |
| Return window | Checked against `return_window_days` per item |
| Amount bounds | Refund cannot exceed the order `total_amount` |
| Auto-refund cap | Refunds above `AUTO_REFUND_MAX_INR` (default 5000) are escalated to staff |
| Idempotency | Duplicate `idempotency_key` returns the original refund, even for parallel requests |
| Internal notes | `internal_note` and `assigned_to` are only returned to staff |
| Rate limits | Login and register: 30 per 15 minutes per IP. Ticket creation and chat: 20 per minute per user. All API calls: 500 per 15 minutes per IP |
| Prompt injection | Override attempts are flagged with `prompt_injection_detected: true` and never executed |

---

## Postman

1. Import `ShopCare_AI.postman_collection.json`.
2. Run **Auth > Login (Alice)**. The token is saved to the `token` variable automatically.
3. Run **Tickets > Create ticket**, then set the `ticketId` collection variable from the response.
4. For staff requests, run **Auth > Login (Staff)** first.

You can also import `shopcare-ai/docs/openapi.json` directly into Postman or Insomnia.
