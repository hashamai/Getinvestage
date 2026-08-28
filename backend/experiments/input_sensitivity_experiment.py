import asyncio
import json
import os
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from google import genai
from google.genai import types

from services.recommend import _build_user_prompt, SYSTEM_INSTRUCTION, RANKING_SCHEMA

# Setup
load_dotenv()
RESULTS_DIR = Path(__file__).resolve().parent / "results"
GT_PATH = RESULTS_DIR / "ground_truth.json"
ORIGINAL_GROUNDED_PATH = RESULTS_DIR / "condition_a_grounded.json"
MODEL_ID = "gemini-2.5-flash"

def modify_scored_data(scored_data: list) -> tuple[list, dict]:
    """Modifies specific input values for AAPL, NVDA, and MSFT."""
    modified_scored = []
    modifications = {}
    
    for entry in scored_data:
        sym = entry["symbol"]
        if sym not in ["AAPL", "NVDA", "MSFT"]:
            continue
            
        # Create a deep copy to avoid modifying the original data unintentionally
        new_entry = json.loads(json.dumps(entry))
        
        if sym == "AAPL":
            # Original: negative momentum (-6.4%, 21.4/25)
            # New: highly positive momentum (+25.0%, 25.0/25)
            new_entry["factors"]["momentum"]["raw"] = 0.25
            new_entry["factors"]["momentum"]["value"] = 25.0
            new_entry["factors"]["momentum"]["label"] = "+25.0% over 1M"
            modifications["AAPL"] = "Changed momentum from -6.4% to +25.0%"
            
        elif sym == "NVDA":
            # Original: P/E 46.4, 21.4/25
            # New: P/E 150.0, 0.0/25
            new_entry["factors"]["valuation"]["raw"] = 150.0
            new_entry["factors"]["valuation"]["value"] = 0.0
            new_entry["factors"]["valuation"]["label"] = "P/E 150.0"
            modifications["NVDA"] = "Changed P/E from 46.4 to 150.0 (worse valuation score)"
            
        elif sym == "MSFT":
            # Original: +28.2% momentum, 0.0/25 (wait, original score was 0.0 for MSFT momentum, presumably because it was too high/volatile? Or maybe 0.0 was a bug in original scoring? Doesn't matter, we change it.)
            # New: -30.0% momentum, 0.0/25
            new_entry["factors"]["momentum"]["raw"] = -0.30
            new_entry["factors"]["momentum"]["value"] = 0.0
            new_entry["factors"]["momentum"]["label"] = "-30.0% over 1M"
            modifications["MSFT"] = "Changed momentum from +28.2% to -30.0%"
            
        modified_scored.append(new_entry)
        
    return modified_scored, modifications

async def run_sensitivity_experiment():
    print("Starting Input-Sensitivity Experiment...")
    
    if not GT_PATH.exists() or not ORIGINAL_GROUNDED_PATH.exists():
        print("Required data files missing. Run grounding_experiment.py first.")
        return
        
    ground_truth = json.loads(GT_PATH.read_text())
    original_grounded = json.loads(ORIGINAL_GROUNDED_PATH.read_text())
    
    # 1. Prepare modified data
    modified_scored, modifications = modify_scored_data(ground_truth.get("scored", []))
    
    profile = ground_truth.get("profile", {"riskTolerance": "moderate", "horizon": "medium"})
    news_map = ground_truth.get("news_map", {})
    
    # 2. Build the new prompt
    prompt = _build_user_prompt(modified_scored, news_map, profile)
    
    # 3. Call Gemini
    print("Calling Gemini with modified prompt...")
    client = genai.Client()
    response = client.models.generate_content(
        model=MODEL_ID,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            temperature=0.3,
            response_mime_type="application/json",
            response_schema=RANKING_SCHEMA,
        ),
    )
    
    # 4. Save and analyze results
    new_result = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "modifications": modifications,
        "llm_response": json.loads(response.text)
    }
    
    out_path = RESULTS_DIR / "sensitivity_experiment.json"
    out_path.write_text(json.dumps(new_result, indent=2))
    print(f"Saved results to {out_path}\n")
    
    # 5. Output comparison
    print("--- Sensitivity Comparison ---")
    
    original_rankings = {r["symbol"]: r for r in original_grounded.get("llm_response", {}).get("rankings", [])}
    new_rankings = {r["symbol"]: r for r in new_result.get("llm_response", {}).get("rankings", [])}
    
    for sym in ["AAPL", "NVDA", "MSFT"]:
        orig = original_rankings.get(sym)
        new = new_rankings.get(sym)
        
        print(f"\n[{sym}] - {modifications[sym]}")
        
        if not orig or not new:
            print("  Missing data for comparison.")
            continue
            
        print(f"  ORIGINAL (Rank {orig['rank']}):")
        print(f"  {orig['explanation']}")
        
        print(f"  MODIFIED (Rank {new['rank']}):")
        print(f"  {new['explanation']}")
        
        # We will judge manually in the output log.
        print("\n  Responsive? (Y/N): [Judge Manually]")
        
if __name__ == "__main__":
    asyncio.run(run_sensitivity_experiment())
