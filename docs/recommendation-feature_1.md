# Recommendation Feature — How It Works

## High-Level Pipeline

The recommendation feature follows a **4-step pipeline** where the LLM never decides on its own — it only **explains data that's already been scored by deterministic rules**.

```
User sends symbols + risk profile
        │
        ▼
┌─────────────────────┐
│ 1. Score Candidates  │  ← rules-based, no ML
│    (scoring.py)      │
└────────┬────────────┘
         ▼
┌─────────────────────┐
│ 2. Build Context     │  ← fetch news from Finnhub
│    (context.py)      │
└────────┬────────────┘
         ▼
┌─────────────────────┐
│ 3. LLM Explain       │  ← Gemini structured output
│    (recommend.py)    │
└────────┬────────────┘
         ▼
┌─────────────────────┐
│ 4. Merge & Return    │  ← ranked results + factors
└─────────────────────┘
```

---

## Step 1: Rules-Based Scoring (`backend/services/scoring.py`)

The scoring engine is **pure math, no ML, no LLM**. It computes a 0–100 composite score from 4 equally-weighted factors (25 points each):

| Factor | What it measures | Source | Direction |
|--------|-----------------|--------|-----------|
| **Momentum** | 1-month return from candle history | Yahoo Finance 1M candles | Higher is better |
| **Volatility** | Std-dev of daily log returns | Yahoo Finance 1M candles | **Lower** is better |
| **Valuation** | P/E ratio from seed data | Hardcoded seed table (14 stocks) | **Lower** is better (value tilt) |
| **Day Range** | Position in today's high–low range | Finnhub/Yahoo real-time quote | Higher is better |

### How scoring works:

1. **Fetch data concurrently** — for each symbol, it calls `market.get_quote()`, `market.get_candles("1M")`, and `market.get_profile()` in parallel via `asyncio.gather`. If a quote fails entirely, the symbol is excluded. Missing candles or profile degrade gracefully.

2. **Compute raw values** — e.g. momentum = `(last_close - first_close) / first_close`

3. **Percentile rank within the candidate set** — each candidate's raw value is ranked against the other candidates in that batch (0.0 = worst, 1.0 = best). For volatility and valuation, **lower raw values get higher percentile** (inverted).

4. **Weighted sum** — each percentile is multiplied by the factor's weight (25). If a factor is unavailable for a symbol (e.g. P/E not in the lookup table), its weight is **redistributed proportionally** across the available factors so the total always sums to 100.

5. **Sort by score descending** and return.

> **Note:** The P/E table in `scoring.py` is hardcoded for the 14 seed stocks only. Any symbol outside this list gets no valuation factor, and its weight is redistributed to the other 3 factors.

---

## Step 2: News Context Retrieval (`backend/services/context.py`)

Simple and pragmatic — no embeddings, no vector DB:

- For each scored symbol, calls `MarketService.get_news()` (which hits Finnhub's `/company-news` endpoint, already cached with a 15-minute TTL)
- Takes the **top 3 most recent** articles per symbol
- Extracts `headline`, `source`, `summary`
- All fetches run concurrently via `asyncio.gather`
- If news fails for a symbol, it maps to an empty list (non-critical)

---

## Step 3: LLM-Explained Ranking (`backend/services/recommend.py`)

This is where **Gemini** comes in. The LLM's role is strictly to **explain and rank** the pre-scored data — it does NOT discover new information.

### Prompt Construction

The `_build_user_prompt()` function assembles a structured markdown document containing:

```
## User Profile
- Risk tolerance: moderate
- Time horizon: medium

## AAPL
Composite score: 72.3/100

### Quote
- Current price: 294.40
- Change: +1.23 (+0.42%)
- Day high: 296.10
...

### Scoring Factors
- momentum: 18.8/25 (+4.2% over 1M)
- volatility: 22.1/25 (0.8% daily vol)
...

### Recent News
- [Reuters] Apple reports record Q3 services revenue
...
```

### System Instruction

The system prompt enforces an **EVIDENCE-ONLY RULE**:

> *"You must ONLY use the data provided below. Do NOT introduce any number, statistic, price, percentage, P/E ratio, market cap, volume figure, or factual claim that is not explicitly present in the provided data."*

It also tells the LLM to consider the user's risk tolerance and time horizon when ranking.

### Gemini API Call

```python
client = genai.Client(api_key=settings.gemini_api_key)
response = client.models.generate_content(
    model=settings.gemini_model,        # "gemini-2.5-flash" by default
    contents=user_prompt,
    config=genai.types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=RANKING_SCHEMA,  # Structured output
        temperature=0.3,                 # Low creativity
    ),
)
```

The response is **structured JSON** enforced by `response_schema`:

```json
{
  "rankings": [
    {
      "symbol": "AAPL",
      "rank": 1,
      "explanation": "Apple shows the strongest momentum...",
      "confidence": "high"
    }
  ]
}
```

### Hallucination Check

After the LLM responds, `_hallucination_check()` extracts all numeric tokens from the explanation and verifies they exist in the input data. If the LLM invents a number (e.g., a P/E ratio it wasn't given), the result is `flagged: true` and the UI shows a ⚠ warning. Small integers (≤10) are exempted since they appear naturally in language.

---

## Step 4: Merge & Return

The scored data and LLM rankings are merged into the final response:

```json
{
  "generatedAt": "2026-08-23T16:00:00Z",
  "cached": false,
  "profile": { "riskTolerance": "moderate", "horizon": "medium" },
  "results": [
    {
      "symbol": "AAPL",
      "rank": 1,
      "score": 72.3,
      "factors": {
        "momentum": { "value": 18.8, "max": 25, "label": "+4.2% over 1M" },
        "volatility": { "value": 22.1, "max": 25, "label": "0.8% daily vol" }
      },
      "explanation": "Apple shows the strongest momentum...",
      "confidence": "high",
      "flagged": false,
      "news": [],
      "profile": { "name": "Apple Inc.", "industry": "Technology" }
    }
  ],
  "disclaimer": "Educational insights — not financial advice."
}
```

Results are sorted by the LLM's rank, not the numerical score — the LLM can reorder based on user profile context.

---

## API Route (`backend/api/recommend.py`)

### Endpoint

`POST /api/recommend`

### Request Body

```json
{
  "symbols": ["AAPL", "NVDA", "MSFT"],
  "profile": {
    "riskTolerance": "moderate",
    "horizon": "medium"
  }
}
```

### Validation

- **Symbols**: 1–10 symbols, each 1–10 chars, uppercased, deduplicated
- **Risk tolerance**: must be `conservative`, `moderate`, or `aggressive`
- **Horizon**: must be `short`, `medium`, or `long`
- All validated with Pydantic `field_validator`

### Error Handling

| Status | Condition |
|--------|-----------|
| 422 | Invalid symbols or profile values |
| 404 | None of the symbols could be found |
| 503 | LLM unavailable or GEMINI_API_KEY not set |

---

## Caching Strategy

- **Cache key**: SHA-256 hash of `(sorted_symbols + profile)` — deterministic, so the same query always hits the same cache entry
- **TTL**: 20 minutes (configurable via `RECOMMEND_CACHE_TTL` env var)
- **Backend**: Uses the same `TTLCache` as the market service (Redis-backed if available, SQLite fallback)
- **UI indicator**: Cached responses include `"cached": true` and the frontend shows a `CACHED` badge

---

## Frontend UI (`getinvestage/src/components/Recommendations.jsx`)

Accessible at `/recommend` (linked from the Dashboard header).

### User Inputs

- **Ticker input**: comma/space-separated symbols
- **Risk tolerance pills**: conservative / moderate / aggressive
- **Time horizon pills**: short / medium / long

### Result Cards (per stock)

- **Rank badge** — `#1`, `#2`, etc.
- **Score ring** — animated SVG donut chart (0–100), color-coded (green >70, amber >40, red ≤40)
- **Confidence dot** — green (high), amber (medium), grey (low)
- **Hallucination flag** — ⚠ if unfounded numbers detected
- **Factor bars** — horizontal progress bars for each scoring factor with labels
- **Recent news** — headlines + sources
- **Expandable explanation** — the LLM's reasoning, hidden by default

### URL Support

`/recommend?symbols=AAPL,NVDA` auto-triggers analysis on load.

---

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `GEMINI_API_KEY` | *(empty — required)* | Google AI Studio API key |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Which Gemini model to use |
| `RECOMMEND_CACHE_TTL` | `1200` (20 min) | How long to cache results |

---

## Design Principles

1. **LLM explains, never decides** — the scoring is deterministic rules; the LLM only narrates what the data already shows
2. **Hallucination guardrail** — numeric claims in the explanation are cross-checked against input data
3. **Graceful degradation** — missing P/E redistributes weight; missing news returns empty; missing candles skip the factor
4. **Honest labeling** — cached responses, flagged hallucinations, and confidence levels are all surfaced to the user
5. **Educational, not advice** — disclaimer enforced at every layer

---

## File Map

```
backend/
  services/
    scoring.py      ← rules-based 0–100 scoring (4 factors, percentile-ranked)
    context.py      ← news retrieval for LLM context (reuses MarketService)
    recommend.py    ← orchestrator: score → context → Gemini → merge
  api/
    recommend.py    ← POST /api/recommend route + Pydantic validation
  core/
    config.py       ← GEMINI_API_KEY, GEMINI_MODEL, RECOMMEND_CACHE_TTL

getinvestage/
  src/
    components/
      Recommendations.jsx  ← /recommend page UI
    App.jsx                ← route registration
```
