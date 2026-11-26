## Architecture Diagram

```mermaid
flowchart TB
    CUI["Customer portal<br/>React + Vite"]
    SUI["Staff dashboard<br/>React + Vite"]

    subgraph API["Express API"]
        GW["API gateway<br/>Helmet, CORS, Zod, RBAC"]
        AUTH["Auth<br/>bcrypt + JWT"]
        SVC["Transactional services<br/>refund and escalation rules"]
    end

    subgraph AI["AI agent"]
        AGENT["Support agent"]
        LLM["LLM or mock provider"]
        RAG["Local RAG retriever"]
    end

    subgraph TOOLS["Agent tools"]
        T1["get_order_details"]
        T2["search_return_policy"]
        T3["process_refund"]
        T4["escalate_to_human"]
    end

    KB[("knowledge_base/*.md")]
    PG[("PostgreSQL")]
    HR["Human review queue"]

    CUI -->|REST + JWT| GW
    SUI -->|REST + JWT| GW
    GW --> AUTH
    GW --> AGENT
    AGENT <--> LLM
    AGENT --> T1 & T2 & T3 & T4
    T2 --> RAG --> KB
    T1 & T3 & T4 --> SVC
    SVC --> PG
    SVC -->|over 5000 INR or flagged| HR
    HR -.->|reviewed in| SUI
    SUI -->|approve, reject, request info| GW
```

### How it works

1. **Frontend:** Customers use the customer portal to chat with support. Staff use the staff dashboard to review cases. Both talk to the backend over REST, using a JWT to prove who they are.

2. **API gateway:** Every request goes through one entry point. It checks security, validates the input, and enforces roles, so a customer can't use staff features.

3. **AI agent:** When a customer sends a message, the agent reads it and decides what to do. It uses either a real LLM or a built-in mock, so the app also works without an API key.

4. **Agent tools:** The agent can only act through four tools: look up an order, search the return policy, process a refund, or escalate to a human. The policy search reads the markdown files in the knowledge base, so answers come with citations.

5. **Transactional services:** The tools don't change data directly. They go through backend services that check ownership, the return window, the refund limit, and duplicate requests. Even if the AI is tricked, these rules still apply.

6. **PostgreSQL:** All data is stored here: orders, tickets, messages, refunds, escalations, and audit logs.

7. **Human review:** If a refund is over ₹5,000 or flagged, it goes to the review queue instead of being auto-approved. Staff open it in the dashboard and approve, reject, or ask for more info. Their decision goes back through the same services, and the action is saved in the audit log.
