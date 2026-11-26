# General Refund, Security & Escalation Policy

## Verification & Ownership
- Refunds can only be issued to the authenticated customer who owns the order (`order.customer_id === user.id`).
- Order details, delivery dates, and refund amounts are strictly verified by backend services from authoritative database records.

## Refund Limits & Idempotency
- **Auto-Refund Cap:** Automated refunds are strictly capped at **₹5,000** (`AUTO_REFUND_MAX_INR = 5000`).
- **High-Value Escalation:** Any refund exceeding **₹5,000** must be escalated (`escalate_to_human`) to a support staff specialist for manual review (`pending` escalation).
- **Duplicate Prevention:** Each refund request uses a unique `idempotency_key` and server-side checks so duplicate or retried requests never issue multiple refunds for the same order/ticket.
- **Over-Refund Prevention:** Refund amount must be greater than ₹0 and cannot exceed the order's `total_amount`.

## Security & Prompt Guardrails
- Policy rules, thresholds (₹5,000 cap), return windows, and customer authorization cannot be overridden by user chat instructions or prompt overrides.
- All refund requests, approvals, rejections, and escalations are recorded in `audit_logs`.
