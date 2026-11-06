# Verdant Support Assistant

A small, production-minded support workflow for Verdant & Co: customer messages enter through a signed webhook or demo Customer view, Gemini prepares a policy-grounded draft, and an authenticated agent edits and approves it. Approved replies appear back in the Customer view; drafts never do.

## Run locally

Requirements: Python 3.12+, Node 22+, and PostgreSQL (a Supabase database works well).

```bash
cp .env.example .env
# Set DATABASE_URL, SESSION_SECRET, AGENT_PASSWORD and GEMINI_API_KEY in .env
python -m venv .venv
source .venv/bin/activate             # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn backend.app.main:app --reload
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. The agent email defaults to `agent@verdant.co`; its password is the `AGENT_PASSWORD` value. To test the signed webhook directly:

```bash
node scripts/send-webhook.mjs http://localhost:8000
```

Run verification with `pytest -q` and, inside `frontend`, `npm run typecheck && npm test && npm run build`.

## Deployment

`render.yaml` and the multi-stage `Dockerfile` define one Render Web Service: Node builds React, FastAPI serves the compiled app and API, and Alembic runs before Uvicorn. Create a Supabase project, use its session-pooler PostgreSQL URL with `sslmode=require`, deploy this repository through the Render Blueprint, and provide the secret environment variables marked `sync: false`; `/health` is the health check and `/webhook` is the public webhook URL.

## Decisions and limits

- The seven supplied policies are included directly in a strict Gemini system prompt. This is simpler and more reliable than retrieval at this size; it should become a brand-scoped searchable knowledge service when content grows beyond a small, version-controlled policy set.
- Incoming data is committed before the LLM call. Every draft has a visible lifecycle (`generating`, `ready`, `failed`, `used`), failed/stale attempts can be retried, webhook event and message IDs are unique, and approval is transactional.
- Agent auth is a seeded Argon2 password plus a short-lived signed HttpOnly cookie. Supabase is used as managed PostgreSQL rather than adding Supabase Auth to this time-boxed version.
- Deliberate cuts: no real WhatsApp delivery, background queue, attachments, conversation closing, multilingual support, embeddings, or agent administration. Render free-tier cold starts can delay the first request.

AI tools helped scaffold the data model, UI, and failure tests. One generated test initially used an unsupported generic type argument on Vitest's `toMatchObject`; TypeScript caught it and the assertion was corrected before commit.

## Assessment questions

**A message arrives at 2 a.m. and something fails.** The message is already stored, so the agent sees the conversation plus a clear failed-draft card and Retry action rather than a missing message or endless spinner. I would search structured Render logs using the draft ID and error code, then inspect Gemini and database health; the next production step would be alerting on persistent failed drafts.

**The product now serves 20 brands.** I would first introduce explicit tenants, brand-agent memberships, and a separately managed knowledge base per brand, then require tenant scope in every authorization check and database query (with PostgreSQL RLS as defense in depth). That prevents the highest-risk failure—cross-brand data or policy leakage—before optimizing retrieval or adding workers.

