# Spider-Sense

Agentic incident-response tool — hackathon MVP.

## Architecture

```
Incident
   ↓
Orchestrator
   ↓
Log Scout | Code Hunter | Infra Scout | Security Scout  (parallel)
   ↓
Root Cause
   ↓
Fix
   ↓
Verification
   ↓
Resolved
```

## Stack

- **Backend**: FastAPI + SSE (Python)
- **Agents**: deterministic Python agents with LLM-optional fallback
- **Frontend**: React + Vite (TypeScript)
- **Demo**: deterministic `API Database Connection Failure` scenario

## Quick Start

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Golden Path Demo

1. Open http://localhost:5173
2. Click "Run Demo"
3. Watch parallel agents investigate
4. See root cause → proposed fix → verification → resolved
5. Completes in < 60 seconds
