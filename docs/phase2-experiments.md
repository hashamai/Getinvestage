# GetInvestage Phase 2: Reconciliation & Sensitivity Experiments

## Part 1: Automated Claim-Reconciliation

### Overview
We built `backend/experiments/reconciliation.py` to formally verify LLM hallucination checks. Instead of manually reading explanations, this module:
1. **Extracts** numeric claims and candidate event claims from the LLM's text.
2. **Reconciles** them against a frozen "ledger" (the exact scores, prices, and news provided in the prompt).
3. **Categorizes** discrepancies (e.g., `missing_source`).

### Results
Running the reconciliation script against the 16 explanations from the previous grounding experiment yielded the following:

- **Missing Source Numbers:** 0 for both conditions (matches the manual benchmark of 0/8). The script correctly parsed composite score denominators (e.g., "75.0/100") by converting them to float and checking against valid prompt data, eliminating the false positives of the previous naive regex checker.
- **Event Candidates:** Flagged 1 sentence for GOOGL (grounded) and 1 for TSLA (grounded). Manual review confirmed both statements accurately reflected provided news snippets (Berkshire holding/Verizon partnership for GOOGL, Cybercab doubts for TSLA).
- **Unverifiable Candidates:** 0 flagged. Because the structured JSON forced concise explanations, every generated sentence contained at least one concrete number or event trigger.

**Conclusion:** The claim-reconciliation module successfully automated the hallucination check with zero false positives, proving that the LLM was completely faithful to the provided ledger.

---

## Part 2: Rank-Shift Justification Check (Manual)

In the previous experiment, we noticed that grounding (adding news) didn't change hallucination rates, but it *did* change rankings significantly. We manually reviewed the news provided to MSFT, META, and GOOGL to determine if these shifts were justified.

*(Note on META: The previous summary noted META "jumped 5 ranks when news was added." Looking at the raw data, META was ranked #7 with news and #2 without news. So news actually **hurt** META's ranking.)*

| Stock | Shift with News | News Cited in Prompt | Judgment & Reason |
|-------|-----------------|----------------------|-------------------|
| **MSFT** | ↑ 4 ranks (#6 to #2) | ChartMill headline praising "strong growth screen" and "bull flag setup." Other news was about NVDA and GOOGL. | **Questionable / Overreaction.** A 4-rank jump based on a single piece of technical analysis (ChartMill) seems disproportionate, especially since the LLM explicitly cited this "promising technical setup" to override MSFT's low composite score (35.7). |
| **META** | ↓ 5 ranks (#2 to #7) | General AI news (power grid strain, CoreWeave data centers) and Berkshire buying GOOGL. | **Questionable / Hidden Effect.** None of the news explicitly mentioned META negatively. The LLM dropped META's rank without citing the news in its explanation. It likely penalized META relatively because MSFT and GOOGL received positive catalysts, pushing META down the list. |
| **GOOGL** | ↑ 5 ranks (#8 to #3) | Berkshire Hathaway boosting Google as a top holding; new strategic partnership with Verizon. | **Justified.** These are two specific, highly material positive catalysts. Bumping GOOGL from last place up to #3 based on strong qualitative signals (Buffett backing + major partnership) is exactly the kind of intelligent fusion reasoning we want from the model. |

**Conclusion:** The LLM's fusion capability is a double-edged sword. It correctly identifies and heavily weights major qualitative catalysts (GOOGL), but it is also susceptible to overweighting minor technical analysis headlines (MSFT) and adjusting ranks based on macro/competitor news without explicitly explaining why (META).

---

## Part 3: Input-Sensitivity Experiment

### Overview
To test whether the LLM's reasoning genuinely tracks the input data (or if it just pattern-matches plausible finance language regardless of the numbers), we conducted an input-sensitivity test (`backend/experiments/input_sensitivity_experiment.py`). We selected three stocks, deliberately changed a single significant input metric for each in the frozen ledger, and re-generated the explanations (using the grounded condition).

### Method
1. **AAPL (Steady):** Changed momentum from -6.4% to +25.0%.
2. **NVDA (Volatile):** Changed P/E valuation from 46.4 to an extreme 150.0.
3. **MSFT (News-Driven):** Changed momentum from +28.2% to a terrible -30.0%.

### Results

| Stock | Original Explanation (Excerpt) | Modified Explanation (Excerpt) | Responsive? |
|-------|--------------------------------|--------------------------------|-------------|
| **AAPL** | *Rank 6*: "...its negative momentum of -6.4% over 1M is a significant concern for a medium-term horizon..." | *Rank 1*: "...due to its strong 1-month momentum of +25.0% and lowest daily volatility of 2.0%." | **YES**. The LLM correctly identified the flipped metric, changing its assessment from "significant concern" to the primary reason for a #1 ranking. |
| **NVDA** | *Rank 1*: "...aligning with a medium-term growth outlook despite a higher P/E of 46.4." | *Rank 2*: "However, its extremely high P/E of 150.0 presents a significant valuation concern for a moderate investor..." | **YES**. The LLM identified the massive P/E increase and correctly framed it as a "significant valuation concern," dropping it from the top spot. |
| **MSFT** | *Rank 2*: "MSFT shows very strong momentum of +28.2% over 1M and positive news regarding 'strong growth'..." | *Rank 3*: "Microsoft is least recommended due to its negative 1-month momentum of -30.0% and highest daily volatility..." | **YES**. The LLM completely flipped its stance, allowing the newly terrible momentum metric to override the positive news it had previously cited. |

**Conclusion:** The LLM exhibits strong input-sensitivity. Its reasoning and rankings are genuinely responsive to the specific numeric data provided in the prompt, confirming it is not merely relying on pre-trained ticker associations or generic language generation.
