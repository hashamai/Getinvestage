# RAG Grounding Experiment: Does News Context Reduce LLM Hallucination?

## Purpose

The recommendation system does two things before the LLM speaks: it scores a stock (numbers) and retrieves recent news (text). This experiment tests whether having that retrieved news in front of the model actually makes its explanation more truthful, or whether the model hallucinates roughly the same amount either way.

This is a small demonstration (8 stocks, 1 run per condition), not a powered study. Results could vary run-to-run. The goal is an honest, concrete measurement, not a statistical proof.

## Methodology

### Stock Sample (pre-selected, not cherry-picked)

8 stocks chosen for sector and volatility diversity:

| Stock | Sector | Profile |
|-------|--------|---------|
| AAPL | Tech | Steady large-cap |
| NVDA | Semiconductors | Volatile, AI-driven |
| MSFT | Tech | Steady large-cap |
| TSLA | EV/Automobiles | Volatile, news-heavy |
| JPM | Banking/Financials | Steady, value-tilted |
| GOOGL | Media/Tech | Large-cap |
| AMZN | Tech/Retail | Large-cap, high-growth |
| META | Media | Large-cap |

### Conditions

- **Condition A (Grounded)**: Scored data + 3 retrieved news articles per stock → Gemini
- **Condition B (Ungrounded)**: Scored data + NO news articles → Gemini

Everything else identical: same stocks, same scores, same system instruction, same model (`gemini-2.5-flash`), same temperature (0.3), same structured output schema.

### Hallucination Definitions (pre-registered before looking at results)

| Type | Definition | Applies to |
|------|-----------|------------|
| **Numeric hallucination** | Any number (P/E, growth %, price, volume) stated in the explanation that does not match the frozen input data | Both conditions |
| **Event hallucination** | Any claim about a specific event, news item, or company action that wasn't in the provided input | Grounded: must match provided news. Ungrounded: any specific event claim is suspect |
| **Soft case** (logged, not counted) | Vague qualitative statements like "strong momentum" — harder to verify, not lumped with hard factual errors | Both conditions |

### Frozen Input Data

All scoring data, quote prices, and news articles were captured once and saved as JSON before either LLM call was made. The same frozen data was used for both conditions — the only difference was the presence or absence of news snippets in the prompt.

- Grounded prompt: 9,209 characters (includes ~6,000 chars of news)
- Ungrounded prompt: 3,302 characters (scores + quotes only)

---

## Results

### Manual Evaluation Table

Each of the 16 explanations was read by hand and every number cross-referenced against the frozen input data.

| Stock | Condition | Numeric Halluc.? | Event Halluc.? | Confidence | Notes |
|-------|-----------|:-:|:-:|:-:|-------|
| NVDA | Grounded | No | No | high | All numbers verified: 75.0/100, 2.3%, +1.5%, 46.4 ✓. News references ("AI upgrade supercycle", AI GPU leadership) match Finnhub headlines ✓ |
| MSFT | Grounded | No | No | high | +28.2%, 3.4%, 95%, 37.2 all match input ✓. "strong growth" and "promising technical setup" are quotes from ChartMill headline ✓ |
| GOOGL | Grounded | No | No | high | +9.7%, 2.3%, 22.6, 94% all verified ✓. "Berkshire Hathaway boosting it as a top holding" matches SeekingAlpha headline ✓. "partnership with Verizon" matches Benzinga headline ✓ |
| AMZN | Grounded | No | No | high | +13.2%, 3.6%, 94%, 42.8 all match ✓. "cautious regarding cloud" is a soft reading of SeekingAlpha headline — fair interpretation ✓ |
| TSLA | Grounded | No | No | high | +13.6%, 2.3%, 68.3 all match ✓. "doubts about its Cybercab launch" directly references Benzinga headline about 18% prediction market odds ✓ |
| AAPL | Grounded | No | No | high | 2.0%, 35.1, -6.4% all match ✓. No specific news events cited — stays within the data |
| META | Grounded | No | No | high | -6.7%, 85%, 27.9, 2.8% all verified ✓. No specific news events cited |
| JPM | Grounded | No | No | high | 13.8, 1.2%, +1.0%, 32.2/100 all match ✓. No specific fabricated events |
| | | | | | |
| NVDA | Ungrounded | No | No | high | 75.0/100, 25.0/25, 21.4/25 all match input ✓. No event claims — stayed within scored data |
| META | Ungrounded | No | No | high | 60.7/100, 25.0/25, 17.9/25, 7.1/25, 10.7/25 all verified ✓. No events fabricated |
| AMZN | Ungrounded | No | No | high | 57.1/100, 25.0/25, 17.9/25, 7.1/25 all match ✓. No events fabricated |
| TSLA | Ungrounded | No | No | high | 57.1/100, 25.0/25, 21.4/25, 3.6/25, 7.1/25 all match ✓. No events fabricated |
| AAPL | Ungrounded | No | No | high | 53.6/100, 21.4/25, 17.9/25, 3.6/25, 10.7/25 all match ✓. No events fabricated |
| MSFT | Ungrounded | No | No | high | 35.7/100, 21.4/25, 14.3/25, 0.0/25 all match ✓. No events fabricated |
| JPM | Ungrounded | No | No | high | 32.2/100, 17.9/25, 14.3/25, 0.0/25 all match ✓. No events fabricated |
| GOOGL | Ungrounded | No | No | high | 28.6/100, 10.7/25, 3.6/25 all match ✓. No events fabricated |

### Summary Statistics

| | Grounded (8) | Ungrounded (8) |
|---|:-:|:-:|
| Numeric hallucinations | **0 / 8** | **0 / 8** |
| Event hallucinations | **0 / 8** | **0 / 8** |
| Soft/vague claims | Several (fair readings) | Minimal (stayed dry) |

### Automated Checker vs Manual Review

The automated hallucination checker flagged 0/8 grounded and 7/8 ungrounded explanations. However, **manual review determined these were false positives**: the flagged numbers ("100", "25") are score-format denominators (e.g., "75.0/100", "25.0/25") that exist in the prompt data. The auto-checker's regex extracted "100" from "75.0/100" in the explanation but failed to match it against "100" in the prompt because the prompt writes it as part of the composite format. This is a limitation of the simple number-extraction approach — it cannot parse "X/Y" as a unit.

---

## Interpretation

### The headline result: no hallucination difference

Both conditions produced **0 numeric hallucinations and 0 event hallucinations** across all 8 stocks. The model obeyed the EVIDENCE-ONLY system instruction faithfully in both cases.

This is an honest, interesting, and somewhat surprising finding. Here's what it means:

### Why the model didn't hallucinate without news

1. **The system instruction is doing the heavy lifting.** The prompt explicitly says: *"Do NOT introduce any number, statistic, price, percentage, P/E ratio, market cap, volume figure, or factual claim that is not explicitly present in the provided data."* Gemini 2.5 Flash appears to respect this instruction reliably at temperature 0.3.

2. **Structured output constrains the response.** The `response_schema` forces the model into a `{symbol, rank, explanation, confidence}` format, leaving little room for free-form elaboration where hallucinations typically occur.

3. **The ungrounded model simply didn't attempt to fill the gap.** Without news, it didn't fabricate events — it just wrote drier, score-focused explanations. This is exactly the behavior the system instruction requested: *"If a piece of information is missing from the provided data, say so — do not fill the gap."*

### What news DOES add (qualitative difference)

While hallucination rates were identical, the **quality** of explanations differed notably:

**Grounded example (TSLA):**
> *"TSLA has strong momentum of +13.6% over 1M and moderate daily volatility of 2.3%. However, its very high P/E of 68.3 and mixed news, including doubts about its Cybercab launch, present higher risk for a moderate investor with a medium time horizon."*

**Ungrounded example (TSLA):**
> *"TSLA is tied for third with a composite score of 57.1/100. It has an excellent valuation score of 25.0/25 and a good day range score of 21.4/25. However, its very low momentum score of 3.6/25 and low volatility score of 7.1/25 make it less appealing for a moderate investor."*

The grounded version:
- References a **specific, real event** (Cybercab launch doubts) that adds material context
- Mentions **real-world data** (P/E of 68.3, momentum %, volatility %) rather than abstract scores
- Reads like an analyst note; the ungrounded version reads like a scorecard

**Grounded example (GOOGL):**
> *"GOOGL presents strong momentum of +9.7% over 1M, moderate daily volatility of 2.3%, and a reasonable P/E of 22.6. Positive news includes Berkshire Hathaway boosting it as a top holding and a strategic partnership with Verizon."*

vs. **Ungrounded (GOOGL):**
> *"GOOGL is ranked last with the lowest composite score of 28.6/100. It has moderate momentum (10.7/25) and volatility (10.7/25) scores. However, its extremely low valuation score of 3.6/25 and day range score of 3.6/25 indicate significant concerns."*

The grounded version cites two verifiable, specific events. The ungrounded version only recites scores.

### The ranking also changed

An unexpected side effect: the LLM ranked stocks **differently** with and without news:

| Stock | Grounded Rank | Ungrounded Rank | Δ |
|-------|:-:|:-:|:-:|
| NVDA | 1 | 1 | — |
| MSFT | 2 | 6 | ↓4 |
| GOOGL | 3 | 8 | ↓5 |
| AMZN | 4 | 3 | ↑1 |
| TSLA | 5 | 4 | ↑1 |
| AAPL | 6 | 5 | ↑1 |
| META | 7 | 2 | ↑5 |
| JPM | 8 | 7 | ↑1 |

MSFT went from #2 (grounded — "strong growth" and "promising technical setup" in the news) to #6 (ungrounded — only saw its low composite score of 35.7). GOOGL dropped from #3 to last. META jumped from #7 to #2. News changed the model's judgment significantly, even though it didn't change whether the model hallucinated.

---

## Conclusions

1. **News context did NOT reduce hallucination in this experiment** — both conditions produced zero hallucinations. The system instruction and structured output were sufficient guardrails on their own.

2. **News context DID improve explanation quality** — grounded explanations cited specific, verifiable events and read like analyst notes. Ungrounded explanations were dry score recitations.

3. **News context DID change the rankings** — the LLM used news to override the numerical scores, promoting stocks with positive catalysts (MSFT, GOOGL) and demoting stocks with negative catalysts. This is arguably the more important effect: the news doesn't prevent lies, it prevents the model from being *uninformed*.

4. **The system instruction is the primary hallucination guardrail**, not the retrieval. The EVIDENCE-ONLY instruction worked reliably at temperature 0.3 with Gemini 2.5 Flash. This is a model-specific finding and may not hold for other models or higher temperatures.

### Limitations

- **Sample size**: 8 stocks, 1 run per condition. Not statistically rigorous.
- **Single model**: Gemini 2.5 Flash only. Other models may behave differently.
- **Single temperature**: 0.3 (low). Higher temperatures might produce more hallucinations.
- **Run-to-run variance**: Not measured. The same inputs could produce different explanations on a second run.
- **Automated checker limitations**: The regex-based number extractor produced false positives on score-format denominators (X/100, X/25). Manual review was essential.

---

## Files

| File | Description |
|------|-------------|
| `backend/experiments/grounding_experiment.py` | Experiment runner script |
| `backend/experiments/evaluate.py` | Automated evaluation helper |
| `backend/experiments/results/ground_truth.json` | Frozen scoring data + news (the only allowed facts) |
| `backend/experiments/results/prompt_grounded.md` | Exact prompt sent to Gemini (Condition A) |
| `backend/experiments/results/prompt_ungrounded.md` | Exact prompt sent to Gemini (Condition B) |
| `backend/experiments/results/condition_a_grounded.json` | Raw LLM response (Condition A) |
| `backend/experiments/results/condition_b_ungrounded.json` | Raw LLM response (Condition B) |
| `backend/experiments/results/evaluation_report.md` | Auto-generated evaluation table |
| `backend/experiments/results/evaluation_details.json` | Structured evaluation data |
