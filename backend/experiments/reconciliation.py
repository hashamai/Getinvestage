import json
import re
import sys
from pathlib import Path

RESULTS_DIR = Path(__file__).resolve().parent / "results"

def extract_sentences(text: str) -> list[str]:
    # Simple sentence splitter
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if s.strip()]

def extract_numbers_from_text(text: str) -> list[str]:
    """Extract raw numeric strings from text."""
    # Matches integers and decimals, potentially with negative signs.
    # We avoid matching periods at the end of sentences by not including trailing dots.
    # E.g., "25." -> "25"
    raw_matches = re.findall(r"-?\d+(?:\.\d+)?", text)
    return raw_matches

def to_float(val) -> float | None:
    try:
        return float(val)
    except (ValueError, TypeError):
        return None

def build_ledger_numbers(ground_truth: dict, symbol: str) -> set[float]:
    """Extract all valid numbers for a given stock from the ground truth."""
    allowed = set()
    
    # Add fixed denominators
    allowed.add(100.0)
    allowed.add(25.0)

    # Find the scored entry
    scored_entry = next((s for s in ground_truth.get("scored", []) if s["symbol"] == symbol), None)
    if scored_entry:
        allowed.add(to_float(scored_entry.get("score")))
        
        # Quote values
        quote = scored_entry.get("quote", {})
        for k, v in quote.items():
            if isinstance(v, (int, float)):
                allowed.add(float(v))
                
        # Factor values
        factors = scored_entry.get("factors", {})
        for f_name, f_data in factors.items():
            allowed.add(to_float(f_data.get("value")))
            allowed.add(to_float(f_data.get("max")))
            allowed.add(to_float(f_data.get("raw")))
            
            # Also extract any numbers from the label (e.g. "+1.5% over 1M" -> 1.5, 1)
            label = f_data.get("label", "")
            for num_str in extract_numbers_from_text(label):
                f_val = to_float(num_str)
                if f_val is not None:
                    allowed.add(f_val)

    # Add numbers from news articles
    news_items = ground_truth.get("news_map", {}).get(symbol, [])
    for item in news_items:
        for key in ["headline", "summary"]:
            text = item.get(key, "")
            for num_str in extract_numbers_from_text(text):
                f_val = to_float(num_str)
                if f_val is not None:
                    allowed.add(f_val)

    # Remove None if it got added
    allowed.discard(None)
    return allowed

def is_number_in_ledger(num_val: float, ledger: set[float], tolerance: float = 0.001) -> bool:
    """Check if a number is in the ledger, accounting for floating point issues."""
    # Allow small integers (rankings, general speech like '2-3 sentences')
    if abs(num_val) <= 10.0 and num_val.is_integer():
        return True
        
    for ledger_val in ledger:
        if abs(num_val - ledger_val) <= tolerance:
            return True
    return False

def extract_event_candidates(sentence: str) -> bool:
    """Heuristic to flag sentences that might be event claims."""
    event_triggers = [
        r"\bannounced\b", r"\blaunched\b", r"\blaunch\b", 
        r"\bpartnership\b", r"\bpartnered\b", 
        r"\bacquired\b", r"\bacquisition\b",
        r"\breleased\b", r"\bunveiled\b", 
        r"\bsigned\b", r"\bsettled\b", r"\bsettlement\b",
        r"\brecalled\b", r"\brecall\b", 
        r"\bmerged\b", r"\bmerger\b",
        r"\bappointed\b", r"\bresigned\b",
        r"\bboosting\b", r"\bbuying\b",
        r"\bdoubts about\b"
    ]
    trigger_pattern = re.compile("|".join(event_triggers), re.IGNORECASE)
    return bool(trigger_pattern.search(sentence))

def reconcile():
    gt_path = RESULTS_DIR / "ground_truth.json"
    ca_path = RESULTS_DIR / "condition_a_grounded.json"
    cb_path = RESULTS_DIR / "condition_b_ungrounded.json"

    if not gt_path.exists():
        print("Run grounding_experiment.py first.")
        return

    ground_truth = json.loads(gt_path.read_text())
    cond_a = json.loads(ca_path.read_text())
    cond_b = json.loads(cb_path.read_text())

    reports = []

    for condition_name, data in [("grounded", cond_a), ("ungrounded", cond_b)]:
        rankings = data.get("llm_response", {}).get("rankings", [])
        
        for entry in rankings:
            symbol = entry.get("symbol")
            explanation = entry.get("explanation", "")
            
            ledger_numbers = build_ledger_numbers(ground_truth, symbol)
            
            sentences = extract_sentences(explanation)
            
            missing_source_nums = []
            event_candidates = []
            unverifiable_candidates = []
            
            for sentence in sentences:
                nums_in_sentence = extract_numbers_from_text(sentence)
                has_event_trigger = extract_event_candidates(sentence)
                
                # Check numbers
                sentence_has_missing_num = False
                for num_str in nums_in_sentence:
                    f_val = to_float(num_str)
                    if f_val is not None:
                        if not is_number_in_ledger(f_val, ledger_numbers):
                            missing_source_nums.append({"value": num_str, "context": sentence})
                            sentence_has_missing_num = True

                if has_event_trigger:
                    event_candidates.append(sentence)
                elif not nums_in_sentence:
                    # No numbers, no event triggers -> candidate for unverifiable/qualitative
                    unverifiable_candidates.append(sentence)
                    
            reports.append({
                "symbol": symbol,
                "condition": condition_name,
                "explanation": explanation,
                "discrepancies": {
                    "missing_source_numbers": missing_source_nums,
                    # We leave contradicted_value empty for v1 automated extraction, 
                    # as true contradiction requires manual semantic check or complex NLP.
                    "contradicted_value_numbers": [] 
                },
                "manual_review_needed": {
                    "event_candidates": event_candidates,
                    "unverifiable_candidates": unverifiable_candidates
                }
            })

    report_path = RESULTS_DIR / "reconciliation_report.json"
    report_path.write_text(json.dumps(reports, indent=2))
    print(f"Reconciliation report saved to {report_path}")
    
    # Print summary
    print("\n--- Reconciliation Summary ---")
    for r in reports:
        sym = r['symbol']
        cond = r['condition']
        missing_nums = len(r['discrepancies']['missing_source_numbers'])
        events = len(r['manual_review_needed']['event_candidates'])
        unverif = len(r['manual_review_needed']['unverifiable_candidates'])
        
        flags = []
        if missing_nums > 0: flags.append(f"{missing_nums} missing nums")
        if events > 0: flags.append(f"{events} event candidates")
        if unverif > 0: flags.append(f"{unverif} unverifiable candidates")
        
        flag_str = ", ".join(flags) if flags else "CLEAN"
        print(f"[{cond.upper()}] {sym}: {flag_str}")

if __name__ == "__main__":
    reconcile()
