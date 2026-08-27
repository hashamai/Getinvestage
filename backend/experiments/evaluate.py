"""Evaluate grounding experiment results.

Loads the frozen ground truth + both condition outputs, then:
  1. Extracts all numbers from each explanation
  2. Cross-references against ground-truth numbers
  3. Detects potential event/news claims in ungrounded explanations
  4. Outputs a markdown evaluation table for manual review

Usage:
    cd backend
    .venv/bin/python -m experiments.evaluate
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

RESULTS_DIR = Path(__file__).resolve().parent / "results"


def extract_numbers(text: str) -> set[str]:
    """Extract all numeric tokens from text (integers, decimals, percentages)."""
    return set(re.findall(r"-?\d+\.?\d*", text))


def extract_event_claims(text: str) -> list[str]:
    """Heuristic: extract sentences that look like specific event/news claims.

    Looks for patterns like:
    - "recently announced...", "reported...", "launched...", "acquired..."
    - "news about...", "according to..."
    - Past tense verbs about company actions
    """
    event_patterns = [
        r"(?:recently|just|announced|reported|launched|acquired|released|unveiled|"
        r"partnered|signed|filed|settled|recalled|expanded|closed|merged|split|"
        r"appointed|resigned|beat|missed|exceeded|surpassed|posted)[^.!?]*[.!?]",
    ]
    claims = []
    for pattern in event_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        claims.extend(matches)
    return list(set(claims))


def build_ground_truth_numbers(ground_truth: dict) -> dict[str, set[str]]:
    """Extract all numbers from the ground truth data per symbol."""
    result = {}
    for entry in ground_truth.get("scored", []):
        sym = entry["symbol"]
        # Serialize the entire entry to text and extract all numbers.
        entry_text = json.dumps(entry, default=str)
        result[sym] = extract_numbers(entry_text)

        # Also include news numbers if present.
        news_items = ground_truth.get("news_map", {}).get(sym, [])
        if news_items:
            news_text = json.dumps(news_items, default=str)
            result[sym] |= extract_numbers(news_text)
    return result


def build_news_claims(ground_truth: dict) -> dict[str, list[str]]:
    """Extract news headlines per symbol from ground truth."""
    result = {}
    for sym, articles in ground_truth.get("news_map", {}).items():
        result[sym] = [a.get("headline", "") for a in articles]
    return result


def evaluate():
    # Load data.
    gt_path = RESULTS_DIR / "ground_truth.json"
    ca_path = RESULTS_DIR / "condition_a_grounded.json"
    cb_path = RESULTS_DIR / "condition_b_ungrounded.json"

    for p in [gt_path, ca_path, cb_path]:
        if not p.exists():
            print(f"ERROR: {p.name} not found. Run the experiment first.")
            sys.exit(1)

    ground_truth = json.loads(gt_path.read_text())
    condition_a = json.loads(ca_path.read_text())
    condition_b = json.loads(cb_path.read_text())

    gt_numbers = build_ground_truth_numbers(ground_truth)
    gt_news = build_news_claims(ground_truth)

    # Build evaluation report.
    lines = []
    lines.append("# Grounding Experiment — Evaluation Report")
    lines.append("")
    lines.append(f"Generated: {ground_truth.get('generated_at', 'unknown')}")
    lines.append(f"Stocks: {', '.join(ground_truth.get('stocks', []))}")
    lines.append(f"Profile: {json.dumps(ground_truth.get('profile', {}))}")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Summary table header.
    lines.append("## Results Table")
    lines.append("")
    lines.append("| Stock | Condition | Numeric Hallucination? | Event Hallucination? | Confidence | Notes |")
    lines.append("|-------|-----------|----------------------|---------------------|------------|-------|")

    details = []
    stats = {"grounded": {"numeric": 0, "event": 0, "total": 0},
             "ungrounded": {"numeric": 0, "event": 0, "total": 0}}

    for condition_name, condition_data in [
        ("grounded", condition_a),
        ("ungrounded", condition_b),
    ]:
        rankings = condition_data.get("llm_response", {}).get("rankings", [])
        for entry in rankings:
            sym = entry.get("symbol", "?")
            explanation = entry.get("explanation", "")
            confidence = entry.get("confidence", "?")

            # --- Numeric check ---
            expl_numbers = extract_numbers(explanation)
            allowed_numbers = gt_numbers.get(sym, set())
            # Small integers (0-10) are allowed — same rule as production.
            unfounded_nums = set()
            for num in expl_numbers:
                if num not in allowed_numbers:
                    try:
                        if abs(float(num)) <= 10:
                            continue
                    except ValueError:
                        pass
                    unfounded_nums.add(num)

            has_numeric = len(unfounded_nums) > 0

            # --- Event check ---
            event_claims = extract_event_claims(explanation)
            has_event = False
            event_notes = []

            if condition_name == "grounded":
                # Check if event claims match provided news headlines.
                provided_headlines = gt_news.get(sym, [])
                headline_text = " ".join(provided_headlines).lower()
                for claim in event_claims:
                    # Check if any significant words from the claim appear in headlines.
                    claim_words = set(re.findall(r"\b\w{4,}\b", claim.lower()))
                    headline_words = set(re.findall(r"\b\w{4,}\b", headline_text))
                    overlap = claim_words & headline_words
                    if len(overlap) < 2 and provided_headlines:
                        has_event = True
                        event_notes.append(f"Claim not in news: '{claim.strip()}'")
            else:
                # Ungrounded: ANY specific event claim is suspect.
                if event_claims:
                    has_event = True
                    for claim in event_claims:
                        event_notes.append(f"Event claim without news: '{claim.strip()}'")

            # Build notes.
            notes_parts = []
            if unfounded_nums:
                notes_parts.append(f"Unfounded numbers: {unfounded_nums}")
            if event_notes:
                notes_parts.append("; ".join(event_notes[:2]))  # Keep concise
            notes = " | ".join(notes_parts) if notes_parts else "—"

            num_mark = "**Yes**" if has_numeric else "No"
            event_mark = "**Yes**" if has_event else "No"

            lines.append(f"| {sym} | {condition_name} | {num_mark} | {event_mark} | {confidence} | {notes} |")

            # Stats.
            stats[condition_name]["total"] += 1
            if has_numeric:
                stats[condition_name]["numeric"] += 1
            if has_event:
                stats[condition_name]["event"] += 1

            # Detailed entry.
            details.append({
                "symbol": sym,
                "condition": condition_name,
                "explanation": explanation,
                "confidence": confidence,
                "unfounded_numbers": sorted(unfounded_nums),
                "event_claims": event_claims,
                "has_numeric_hallucination": has_numeric,
                "has_event_hallucination": has_event,
            })

    lines.append("")
    lines.append("---")
    lines.append("")

    # Summary stats.
    lines.append("## Summary Statistics")
    lines.append("")
    for cond in ["grounded", "ungrounded"]:
        s = stats[cond]
        n = s["total"]
        lines.append(f"**{cond.title()}** ({n} explanations):")
        lines.append(f"- Numeric hallucinations: {s['numeric']} / {n}")
        lines.append(f"- Event hallucinations: {s['event']} / {n}")
        lines.append("")

    lines.append("---")
    lines.append("")

    # Detailed explanations for manual review.
    lines.append("## Detailed Explanations (for manual review)")
    lines.append("")
    for d in details:
        lines.append(f"### {d['symbol']} — {d['condition'].upper()}")
        lines.append("")
        lines.append(f"> {d['explanation']}")
        lines.append("")
        if d["unfounded_numbers"]:
            lines.append(f"⚠ **Unfounded numbers**: {', '.join(d['unfounded_numbers'])}")
        if d["event_claims"]:
            lines.append(f"📰 **Event claims detected**: {len(d['event_claims'])}")
            for claim in d["event_claims"]:
                lines.append(f"  - `{claim.strip()}`")
        lines.append("")

    # Write outputs.
    report_text = "\n".join(lines)
    report_path = RESULTS_DIR / "evaluation_report.md"
    report_path.write_text(report_text)
    print(f"Evaluation report saved → {report_path}")

    # Also save structured details.
    details_path = RESULTS_DIR / "evaluation_details.json"
    details_path.write_text(json.dumps(details, indent=2))
    print(f"Structured details saved → {details_path}")

    # Print summary to console.
    print()
    print("=" * 50)
    print("SUMMARY")
    print("=" * 50)
    for cond in ["grounded", "ungrounded"]:
        s = stats[cond]
        n = s["total"]
        print(f"  {cond.title():12s}  numeric: {s['numeric']}/{n}   event: {s['event']}/{n}")
    print()
    print(f"Full report: {report_path}")


if __name__ == "__main__":
    evaluate()
