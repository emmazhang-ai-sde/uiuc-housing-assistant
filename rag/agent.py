import os
from contextvars import ContextVar

from langchain.agents import create_agent
from langchain_core.tools import tool
from langgraph.checkpoint.memory import MemorySaver

from rag.rag_chain import build_where, get_filtered_docs, filter_by_location

_provider = os.getenv("LLM_PROVIDER", "ollama").lower()
if _provider == "groq":
    from langchain_groq import ChatGroq
    # llama-4-scout's tool-calling path on Groq is unreliable (documented ~100% failure
    # rate under load vs near-0% for llama-3.3-70b-versatile — see community.groq.com/t/
    # tool-use-failed-on-llama4-models/427). It intermittently raises a 400 tool_use_failed
    # even when the model isn't attempting a tool call at all.
    _llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=os.environ["GROQ_API_KEY"])
else:
    from langchain_ollama import ChatOllama
    from config import LLM_MODEL
    _llm = ChatOllama(model=LLM_MODEL)

# Carries explicit UI filters from the request context into the housing_search tool.
# Set by the /chat endpoint before invoking the agent; reset in a finally block.
ui_filters: ContextVar[dict | None] = ContextVar("ui_filters", default=None)

# How many messages to keep in the checkpointer per thread.
# Each turn adds ~3 messages (HumanMsg + AIMsg(tool_call) + ToolMsg + AIMsg(final) ≈ 4).
# Keeping 12 covers ~3 full turns comfortably within Groq's 30k TPM limit.
MAX_CHECKPOINTED_MESSAGES = 12


def _summarize_listings(listings: list[dict], applied_filters: dict) -> str:
    """Build a compact text block of listing facts for the LLM to reason over."""
    if not listings:
        if applied_filters:
            f_str = ", ".join(f"{k}={v}" for k, v in applied_filters.items())
            return f"No listings found. Filters applied by the UI: {f_str}. Do not assume a different price or bed constraint — use only these filters."
        return "No listings found matching the query."
    lines = [f"Found {len(listings)} listings. Do not invent details — use only the data below.\n"]
    for m in listings[:5]:
        price = (
            f"${m['price_per_bed_low']}"
            if m.get("price_per_bed_low") == m.get("price_per_bed_high")
            else f"${m.get('price_per_bed_low', '?')}–${m.get('price_per_bed_high', '?')}/bed"
        )
        lines.append(
            f"- {m.get('address')} | {m.get('beds')}BR {m.get('unit_type','')} | "
            f"{price} | {m.get('availability', 'Unknown availability')}"
        )
    if len(listings) > 5:
        lines.append(f"... and {len(listings) - 5} more.")
    return "\n".join(lines)


@tool(response_format="content_and_artifact")
def housing_search(query: str) -> tuple[str, list[dict]]:
    """Search the UIUC housing database. Use this for questions about
    apartments, lease terms, landlords, neighborhoods, prices, and
    anything related to housing near UIUC."""
    # Filters are resolved deterministically in the /chat endpoint (NL extraction +
    # explicit UI FilterPanel, with an available-only default) and passed in via the
    # ui_filters context var. We don't ask the LLM to fill structured filter args —
    # small models do it unreliably across multi-turn context.
    filters = ui_filters.get() or {}
    where = build_where(filters)
    docs = get_filtered_docs(query, where=where)
    docs = filter_by_location(docs, location_hint=filters.get("location_hint"))
    listings = [doc.metadata for doc in docs]
    return _summarize_listings(listings, filters), listings


_checkpointer = MemorySaver()

_SYSTEM = (
    "You are a friendly, conversational assistant for students at the University of "
    "Illinois Urbana-Champaign. You chat naturally like a normal AI assistant AND you "
    "can search a UIUC housing database when the user actually needs it.\n\n"

    "── HOW TO RESPOND ───────────────────────────────────────────────────────\n"
    "First, judge what the user's message is:\n\n"

    "A) CASUAL / GENERAL — greetings ('hi', 'hey'), small talk, thanks, or general "
    "questions not about finding a specific place to live.\n"
    "   → Just reply naturally and conversationally, the way ChatGPT would. Vary your "
    "wording — never use a fixed template. Do NOT bring up the housing search flow, "
    "buffers, or clarifying questions unprompted. It's fine to briefly mention you can "
    "help find housing near UIUC if it feels natural, but keep it light and only once.\n\n"

    "B) HOUSING SEARCH — the user is looking for a place: mentions apartments, rent, "
    "budget, beds, a neighborhood, move-in timing, landlords, or asks you to find/"
    "recommend units.\n"
    "   → Enter the two-step SEARCH FLOW below.\n\n"
    "When unsure, treat it as casual (A) and just talk — only start the SEARCH FLOW "
    "once housing intent is clear.\n\n"

    "── SEARCH FLOW (only for case B) ────────────────────────────────────────\n"
    "This is NOT a script. Talk like a person. Do not paste a form or a fixed "
    "block of questions — the wording must be different every time.\n\n"

    "STEP 1 — CONFIRM NATURALLY BEFORE SEARCHING:\n"
    "When housing intent appears, DO NOT call housing_search immediately. Instead "
    "reply conversationally in a sentence or two:\n"
    "  • Briefly reflect back what you understood, in your own words.\n"
    "  • If anything is ambiguous, unusual, or looks like a typo (e.g. a semester "
    "number that doesn't line up with a move-in date, an odd budget, a place name "
    "you don't recognize), gently ask about it — 'did you mean…?' — instead of "
    "silently accepting it.\n"
    "  • Then ask ONE light guiding question to move forward, e.g. 'want me to pull "
    "up some options now?' — or, if a key detail is missing, ask for just that one "
    "thing (budget, area, or move-in timing). Never ask for all of them at once.\n"
    "You may keep it to a single friendly question. The goal is a real conversation, "
    "not a questionnaire.\n\n"

    "STEP 2 — SEARCH:\n"
    "Call housing_search once the user signals they're ready — 'go ahead', 'yes', "
    "'sure', 'show me', answering your question, or asking outright to search now. "
    "Pass a natural-language query describing what they want; the budget, bed count, "
    "and availability filters they mentioned are applied automatically. By default "
    "only rentable (not fully-leased) units are shown, which is what a searching "
    "student wants.\n"
    "When you call housing_search, the UI automatically shows a card/table/map grid "
    "of the matching units — you do not need to emit any special marker. Keep your "
    "text reply short; the grid carries the detail.\n\n"

    "HANDLING FOLLOW-UPS MID-SEARCH:\n"
    "If the user pauses to ask a side question (e.g. 'is it too late to sign a "
    "lease?'), just answer it naturally and conversationally. Do NOT re-paste the "
    "confirmation questions or restart the flow — pick the thread back up only when "
    "they're ready to continue.\n\n"

    "── GENERAL RULES ────────────────────────────────────────────────────────\n"
    "Only use information returned by housing_search — never invent addresses, "
    "prices, or availability. When the user refers to a location or preference "
    "mentioned earlier in the conversation, carry that context forward."
)

agent = create_agent(
    _llm,
    tools=[housing_search],
    checkpointer=_checkpointer,
    system_prompt=_SYSTEM,
)
