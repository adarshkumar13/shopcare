# ShopCare AI

E-commerce customer support and refund management system built with React + Vite, Node.js + Express, and PostgreSQL. A tool-calling AI agent answers customers using a local policy knowledge base (RAG with citations), refunds up to ₹5,000 are approved automatically, and larger refunds go to a staff review queue.

---

## Project Structure

```
shopcare/
├── .env.example
├── Architecture/ARCHITECTURE.md
├── Database/
│   ├── DATABASE_SCHEMA.md
│   └── ER_DIAGRAM.md
├── docs/
│   ├── API_DOCS.md
│   └── ShopCare_AI.postman_collection.json
├── test/TESTING.md
└── shopcare-ai/
    ├── docker-compose.yml
    ├── docs/openapi.json
    ├── backend/      (Express API, tests, knowledge base)
    └── frontend/     (React + Vite)
```

---

## Architecture

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

Full explanation: [Architecture/ARCHITECTURE.md](./Architecture/ARCHITECTURE.md). The database schema and ER diagram are in [Database/](./Database/).

---

## Prerequisites

- Git
- Node.js `>= 20` and npm `>= 10`
- PostgreSQL `>= 15`
- (Optional) Docker and Docker Compose
- (Optional) A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). Without a key the built-in mock AI runs, so no paid key is needed.

---

## Setup

### 1. Clone the repo and create the env file

```bash
git clone https://github.com/adarshkumar13/shopcare.git
cd shopcare
cp .env.example shopcare-ai/backend/.env
cd shopcare-ai
```

Edit `shopcare-ai/backend/.env` with your values. Never commit it.

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

---

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `5000` | API server port |
| `NODE_ENV` | `development` | `development`, `production` or `test` |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/ecommerce_support` | PostgreSQL connection string |
| `TEST_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/ecommerce_support_test` | Database used by the tests |
| `JWT_SECRET` | dev-only value | Secret for signing JWTs. In production it must be 32+ random characters |
| `JWT_EXPIRES_IN` | `24h` | JWT lifetime |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed frontend origins |
| `LLM_API_KEY` | empty | Gemini (or other OpenAI-compatible) key. Empty means mock AI |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | For Gemini use `https://generativelanguage.googleapis.com/v1beta/openai` |
| `LLM_MODEL` | `gpt-4o-mini` | For Gemini use `gemini-3-flash-preview` |
| `AUTO_REFUND_MAX_INR` | `5000` | Maximum automatic refund in INR |
| `TRUST_PROXY` | `0` | Set to `1` when running behind one reverse proxy |
| `SEED_DEMO_DATA` | `true` | Docker only. Seeds demo data when the database is empty |
| `VITE_API_URL` | `/api` | Frontend only. Put it in `shopcare-ai/frontend/.env` if the API is on another origin |

To use Gemini, set these in `backend/.env`:

```env
LLM_API_KEY=your_gemini_api_key
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_MODEL=gemini-3-flash-preview
```

---

## Database Setup and Migrations

```bash
createdb -h 127.0.0.1 -U postgres ecommerce_support
createdb -h 127.0.0.1 -U postgres ecommerce_support_test
```

```bash
cd shopcare-ai/backend
npm run migrate
```

Migrations are repeatable (`backend/src/db/schema.sql` uses `IF NOT EXISTS`).

---

## Seed Data

```bash
cd shopcare-ai/backend

npm run seed        # reset and seed demo data (deletes existing tickets, orders and refunds)
npm run db:setup    # migrate and seed in one command
```

`npm run seed` replaces all orders, tickets, messages, refunds, escalations and audit logs. Do not run it on a database with real data.

Demo logins:

| Role | Email | Password |
| :--- | :--- | :--- |
| Staff | `staff@demo.com` | `Staff123!` |
| Customer | `alice@demo.com` | `Customer123!` |
| Customer | `bob@demo.com` | `Customer123!` |

Demo orders: `ORD-1001` (eligible, ₹1,499), `ORD-1002` (₹12,999, needs staff review), `ORD-1003` (return window expired), `ORD-1004` (shipped), `ORD-1005` (already refunded), plus Bob's `ORD-2001` and `ORD-2002`.

---

## Run Commands

### Local development (two terminals)

```bash
# Terminal 1: API on http://localhost:5000 (Swagger UI at /api-docs)
cd shopcare-ai/backend && npm run dev

# Terminal 2: frontend on http://localhost:5173
cd shopcare-ai/frontend && npm run dev
```

### Production build

```bash
cd shopcare-ai/frontend && npm run build
cd ../backend && npm start
```

### Docker Compose

```bash
cd shopcare-ai
cp ../.env.example .env
```

Set `JWT_SECRET` (32+ characters) in `shopcare-ai/.env`, then:

```bash
docker compose up --build
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:5000`
- Swagger UI: `http://localhost:5000/api-docs`

Demo data is seeded only when the database is empty, so your data survives restarts. Set `SEED_DEMO_DATA=false` to skip seeding.

### Tests

```bash
cd shopcare-ai/backend
npm test
```

See [test/TESTING.md](./test/TESTING.md) for details.

---

## Documentation

- [API documentation](./docs/API_DOCS.md) and [Postman collection](./docs/ShopCare_AI.postman_collection.json)
- [OpenAPI spec](./shopcare-ai/docs/openapi.json)
- [Architecture](./Architecture/ARCHITECTURE.md)
- [Database schema](./Database/DATABASE_SCHEMA.md) and [ER diagram](./Database/ER_DIAGRAM.md)
- [Testing guide](./test/TESTING.md)
