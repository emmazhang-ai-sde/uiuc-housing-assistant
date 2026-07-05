# Price Direction Extraction Fix: Two-Round Debugging Log

**Created: 2026-07-05**

← Back to [Filter System](filter-system.md)

This records how a "studio under $1000 gets treated as ≥ $1,000/bed instead of ≤ $1,000/bed" bug was tracked down over two rounds on 2026-07-05, so the same class of mistake (a small extraction model, correct on a single turn, wrong once conversation history re-enters the prompt) is easy to recognize next time.

---

## The symptom

A user typed "i'm looking for studio under $1000" and the results header showed "Budget: ≥ $1,000/bed" — the opposite of what was asked. A follow-up "yes please" (no price mentioned at all) kept showing the same inverted budget.

---

## Round 1: single-message fix, verified against the wrong turn

**Diagnosis.** `extract_filters()` in `rag/rag_chain.py` asks `llama-3.1-8b-instant` to classify each dollar amount as a FLOOR (`min_price_per_bed`) or a CEILING (`max_price_per_bed`) based on wording. The prompt's own examples put the word "under" in both buckets: the FLOOR list includes `"nothing under $X"` / `"avoid cheap ones under $X"`, and the CEILING list includes plain `"under $X"`. That keyword overlap is exactly the kind of ambiguity an 8B model resolves unreliably — it kept filing a bare "studio under $1000" into `min_price_per_bed`.

The frontend was not at fault: `AssistantMessage.tsx`'s `formatBudget()` correctly renders `≥` whenever `min_price_per_bed` is set and no max is present — it was faithfully displaying an already-wrong extraction.

**Fix.** Added `_correct_price_direction(query, filters)` in `rag/rag_chain.py`: a deterministic regex pass that finds a ceiling comparator (`under`, `below`, `less than`, `up to`, `at most`, `no more than`, `within`, `budget of`, `max`) sitting directly in front of a dollar amount in the raw query, first blanking out FLOOR phrases like `"nothing under $X"` so their embedded "under" isn't misread as a ceiling. If the model produced no max at all, the guard places the amount in `max_price_per_bed` (or `max_price_total` above $1,500, mirroring the prompt's own per-bed/total split) and clears a `min_price_per_bed` that had wrongly absorbed the same amount.

**Verification.** Ran the regex logic standalone (no LLM call) against 10 cases — direct "under" queries, floor phrases, ranges, bed-count numbers that aren't prices, and total-vs-per-bed splits. All passed, and `rag/rag_chain.py` byte-compiled cleanly.

**Result.** Still showed `≥` in the product. The turn that reproduced it was "yes please" — a follow-up with no price wording at all, which Round 1's guard could not touch since it only inspected the current message.

---

## Round 2: the inversion survives across turns via conversation history

**Root cause.** `extract_filters(query, history)` re-runs the LLM on *every* turn, prepending the last six messages of history. On "yes please", the model re-derives filters from the earlier "studio under $1000" turn still sitting in that history — and reproduces the same inverted `min_price_per_bed`. Round 1's guard never saw the price statement because it lived in `history`, not in `query`.

**Fix.** Extended `_correct_price_direction` to accept `history` and locate the user's *most recently stated* price: the current message if it names an amount, otherwise the latest earlier user turn that did. The repair logic then branches on where that statement came from:

- **Current message names a ceiling but the model set no max:** place it in `max_price_per_bed`/`max_price_total` and clear an absorbing `min_price_per_bed` — same as Round 1.
- **The ceiling came from history:** only flip an *already-present* `min_price_per_bed` to the correct max field. It never fabricates a fresh ceiling in this branch, so a user who later says "show me everything" (clearing their budget) isn't handed back a budget the model no longer believes exists.

This distinction matters: without it, the guard would re-inject a stale ceiling on every future turn regardless of whether the user had moved on from it.

**Verification.** Extended the standalone test to 9 multi-turn cases, including:
- follow-up re-deriving an inverted min from an earlier "under $1000" turn (the reported bug),
- a follow-up where the model correctly cleared all price fields (guard must not re-inject a ceiling),
- a floor stated in history ("above $1500") staying a floor across a follow-up,
- a newer ceiling in a later turn overriding an older floor,
- a range ("between $1000 and $1300") surviving a follow-up with both bounds intact,
- `"nothing under $1000"` in history staying a floor, not flipped to a ceiling.

All 9 passed; `rag/rag_chain.py` byte-compiled cleanly.

**Outstanding.** This was verified at the regex/unit level only, not against a live `/chat` call through `ChatGroq` (would need `GROQ_API_KEY` set in the environment and a running backend). The backend process must also be restarted (or running with `--reload` picking up the change) for either round's fix to take effect — an already-running process serving stale bytecode was suspected to explain why Round 1's fix appeared not to work in the product.

---

## Files touched

- `rag/rag_chain.py` — `_correct_price_direction()`, `_mentions_price()`, `_CEILING_BEFORE_AMOUNT`, `_FLOOR_NEGATED`, `_FLOOR_COMPARATOR`; wired into `extract_filters()`.
