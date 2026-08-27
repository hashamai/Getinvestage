# Grounding Experiment — Evaluation Report

Generated: 2026-08-24T15:58:09.568243+00:00
Stocks: AAPL, NVDA, MSFT, TSLA, JPM, GOOGL, AMZN, META
Profile: {"riskTolerance": "moderate", "horizon": "medium"}

---

## Results Table

| Stock | Condition | Numeric Hallucination? | Event Hallucination? | Confidence | Notes |
|-------|-----------|----------------------|---------------------|------------|-------|
| NVDA | grounded | **Yes** | No | high | Unfounded numbers: {'100'} |
| MSFT | grounded | No | No | high | — |
| GOOGL | grounded | No | No | high | — |
| AMZN | grounded | No | No | high | — |
| TSLA | grounded | No | No | high | — |
| AAPL | grounded | No | No | high | — |
| META | grounded | No | No | high | — |
| JPM | grounded | **Yes** | No | high | Unfounded numbers: {'100'} |
| NVDA | ungrounded | **Yes** | No | high | Unfounded numbers: {'100'} |
| META | ungrounded | **Yes** | No | high | Unfounded numbers: {'25.'} |
| AMZN | ungrounded | **Yes** | No | high | Unfounded numbers: {'100.'} |
| TSLA | ungrounded | **Yes** | No | high | Unfounded numbers: {'100.', '25.'} |
| AAPL | ungrounded | **Yes** | No | high | Unfounded numbers: {'100', '25.'} |
| MSFT | ungrounded | **Yes** | No | high | Unfounded numbers: {'100.'} |
| JPM | ungrounded | **Yes** | No | high | Unfounded numbers: {'100.'} |
| GOOGL | ungrounded | **Yes** | No | high | Unfounded numbers: {'100.'} |

---

## Summary Statistics

**Grounded** (8 explanations):
- Numeric hallucinations: 2 / 8
- Event hallucinations: 0 / 8

**Ungrounded** (8 explanations):
- Numeric hallucinations: 8 / 8
- Event hallucinations: 0 / 8

---

## Detailed Explanations (for manual review)

### NVDA — GROUNDED

> NVDA earns the top spot with the highest composite score of 75.0/100, moderate daily volatility of 2.3%, and positive momentum of +1.5% over 1M. News highlights its AI GPU leadership and potential for an "AI upgrade supercycle," aligning with a medium-term growth outlook despite a higher P/E of 46.4.

⚠ **Unfounded numbers**: 100

### MSFT — GROUNDED

> MSFT shows very strong momentum of +28.2% over 1M and positive news regarding "strong growth" and a "promising technical setup." While it has higher daily volatility at 3.4% and a high day range (95%), its moderate P/E of 37.2 and growth prospects make it suitable for a moderate investor with a medium horizon.


### GOOGL — GROUNDED

> GOOGL presents strong momentum of +9.7% over 1M, moderate daily volatility of 2.3%, and a reasonable P/E of 22.6. Positive news includes Berkshire Hathaway boosting it as a top holding and a strategic partnership with Verizon. The high day range (94%) is a minor drawback.


### AMZN — GROUNDED

> AMZN exhibits strong momentum of +13.2% over 1M, but also the highest daily volatility at 3.6% and a very high day range (94%). Its P/E is 42.8, and recent news is general or cautious regarding cloud, making it a higher-risk option for a moderate investor.


### TSLA — GROUNDED

> TSLA has strong momentum of +13.6% over 1M and moderate daily volatility of 2.3%. However, its very high P/E of 68.3 and mixed news, including doubts about its Cybercab launch, present higher risk for a moderate investor with a medium time horizon.


### AAPL — GROUNDED

> AAPL offers the lowest daily volatility at 2.0% and a moderate P/E of 35.1. However, its negative momentum of -6.4% over 1M is a significant concern for a medium-term horizon, outweighing its lower volatility for a moderate investor.


### META — GROUNDED

> META is less appealing for a moderate investor due to its negative momentum of -6.7% over 1M and a high day range (85%). While its P/E is 27.9, the negative momentum and higher daily volatility of 2.8% indicate potential short-term headwinds.


### JPM — GROUNDED

> JPM has the lowest P/E of 13.8 and lowest daily volatility of 1.2%, appealing to conservative aspects. However, its weak momentum of +1.0% over 1M and low composite score of 32.2/100 make it less suitable for a moderate investor seeking growth over a medium time horizon.

⚠ **Unfounded numbers**: 100

### NVDA — UNGROUNDED

> NVDA is ranked first due to its highest composite score of 75.0/100, indicating a strong overall profile. It shows excellent stability with a day range score of 25.0/25 and a strong valuation score of 21.4/25, which aligns well with a moderate risk tolerance and medium time horizon.

⚠ **Unfounded numbers**: 100

### META — UNGROUNDED

> META ranks second with a composite score of 60.7/100, driven by a strong momentum score of 25.0/25 and a moderate volatility score of 17.9/25. However, its lower valuation score of 7.1/25 and day range score of 10.7/25 suggest some areas of concern for a moderate investor.

⚠ **Unfounded numbers**: 25.

### AMZN — UNGROUNDED

> AMZN is tied for third with a composite score of 57.1/100. It boasts an excellent volatility score of 25.0/25 and a good valuation score of 17.9/25, which are favorable for a moderate risk profile. However, its low momentum score of 7.1/25 and very low day range score of 7.1/25 indicate less intraday stability.

⚠ **Unfounded numbers**: 100.

### TSLA — UNGROUNDED

> TSLA is tied for third with a composite score of 57.1/100. It has an excellent valuation score of 25.0/25 and a good day range score of 21.4/25. However, its very low momentum score of 3.6/25 and low volatility score of 7.1/25 make it less appealing for a moderate investor.

⚠ **Unfounded numbers**: 100., 25.

### AAPL — UNGROUNDED

> AAPL has a moderate composite score of 53.6/100, with a strong momentum score of 21.4/25 and a moderate day range score of 17.9/25. However, its very low volatility score of 3.6/25 and valuation score of 10.7/25 are less ideal for a moderate risk profile.

⚠ **Unfounded numbers**: 100, 25.

### MSFT — UNGROUNDED

> MSFT has a low composite score of 35.7/100. While it has moderate volatility (21.4/25) and valuation (14.3/25) scores, its very low momentum score of 0.0/25 and extremely low day range score of 0.0/25 suggest high intraday movement and poor recent performance.

⚠ **Unfounded numbers**: 100.

### JPM — UNGROUNDED

> JPM has a low composite score of 32.2/100. It shows moderate momentum (17.9/25) and day range (14.3/25) scores. However, extremely low volatility (0.0/25) and valuation (0.0/25) scores are significant drawbacks for a moderate investor.

⚠ **Unfounded numbers**: 100.

### GOOGL — UNGROUNDED

> GOOGL is ranked last with the lowest composite score of 28.6/100. It has moderate momentum (10.7/25) and volatility (10.7/25) scores. However, its extremely low valuation score of 3.6/25 and day range score of 3.6/25 indicate significant concerns for a moderate risk profile.

⚠ **Unfounded numbers**: 100.
