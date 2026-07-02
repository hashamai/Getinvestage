---
name: project-goal
description: "What the Stock-market project is, who it's for, and the key product decisions made in office-hours"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1b6d1c01-860a-4955-ab91-cf23115e476c
---

Stock-market is a **hired-first portfolio project** (goal: get hired, learn-by-building second). It's a stock-market research assistant. Stack: Python/FastAPI backend + React frontend. Windows dev environment.

Key decisions (office-hours, 2026-07-02):
- **Differentiator = grounded, genuinely useful AI**, not a wrapped ChatGPT.
- **Headline feature = RAG-powered equity research assistant** (RAG kept central at the builder's explicit request). Rich text corpus: news, earnings-call transcripts, SEC filings.
- **Hybrid AI design: RAG for text questions, lightweight tool-calling for numeric questions** (LLM calls FastAPI/yfinance for numbers instead of hallucinating). This split is the intended senior-level signal.
- **Approach A→B: thin deployed slices weekly**, each aimed at the full RAG-assistant vision. Deploy from day one; the live URL is the most important artifact.
- Build order: Slice 0 deploy skeleton → dashboard → numeric assistant → RAG over news → enrich corpus + eval set → optional wow extra.

Eng-review decisions (2026-07-02):
- **Market data: Finnhub free tier as PRIMARY** (not yfinance — yfinance scrapes Yahoo, no SLA, cloud IPs get blocked, would break the live demo). Persistent cache + serve-stale-on-error.
- **Deploy: Render (FastAPI) + Vercel (React).** Finnhub key = Render env var (never in React bundle); CORS scoped to Vercel domain. Deploy day one (Slice 0).
- **RAG corpus deferred to Slice 3**; when there, use Finnhub news + SEC EDGAR filings. Earnings-call transcripts NOT in scope (no free/legal source).
- Slice 2-3 open: LLM cost cap + per-IP rate limit before public assistant endpoint; start with simple function-calling before a full agent loop.

Full design doc: C:\Users\HP\.gstack\projects\Stock-market\HP-main-design-20260702-022331.md
