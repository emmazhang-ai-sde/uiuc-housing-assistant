# ui.py
# All HTML/CSS constants and rendering helpers for the Streamlit UI.
# Extracted from app.py to keep it readable.

import pandas as pd
import streamlit as st

# ── Global CSS ────────────────────────────────────────────────────────────────
GLOBAL_CSS = """
<style>
/* ── Streamlit chrome ── */
#MainMenu, footer { visibility: hidden; }
[data-testid="stToolbar"] { display: none !important; }

/* ── Layout ── */
.block-container {
    padding-top: 0 !important;
    padding-bottom: 5rem !important;
    max-width: 1100px !important;
    padding-left: 2rem !important;
    padding-right: 2rem !important;
}

/* ── Sidebar ── */
section[data-testid="stSidebar"] { border-right: 1px solid #e2e8f0 !important; }
[data-testid="stSidebar"] > div:first-child {
    background: #f8fafc !important;
    padding: 24px 20px !important;
}
[data-testid="stSidebar"] hr { border-color: #e2e8f0 !important; margin: 24px 0 !important; }

/* Sidebar clear button */
[data-testid="stSidebar"] button {
    background: transparent !important; border: none !important;
    color: #475569 !important; border-radius: 8px !important;
    font-size: 14px !important; font-weight: 500 !important; box-shadow: none !important;
}
[data-testid="stSidebar"] button:hover {
    background: #e2e8f0 !important; color: #0f172a !important; box-shadow: none !important;
}

/* ── Suggestion buttons ── */
div[data-testid="column"] button {
    background: white !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 12px !important;
    color: #475569 !important;
    font-size: 14px !important;
    text-align: left !important;
    padding: 12px 16px !important;
    box-shadow: none !important;
    min-height: 56px !important;
    width: 100% !important;
}
div[data-testid="column"] button:hover {
    background: #f8fafc !important; border-color: #cbd5e1 !important;
    color: #334155 !important; box-shadow: none !important;
}

/* ── Chat messages ── */
[data-testid="stChatMessage"] { background: transparent !important; border: none !important; }

/* ── Chat input ── */
[data-testid="stChatInputContainer"] > div {
    background: #f1f5f9 !important; border: none !important;
    border-radius: 16px !important; box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important;
}
[data-testid="stChatInputContainer"] textarea {
    background: transparent !important; border: none !important;
    font-size: 15px !important; color: #1e293b !important;
}
[data-testid="stChatInputContainer"] textarea::placeholder { color: #94a3b8 !important; }
[data-testid="stChatInputSubmitButton"] {
    background: #0f172a !important; border-radius: 10px !important;
}
[data-testid="stChatInputSubmitButton"]:hover { background: #1e293b !important; }
</style>
"""

# ── Static HTML blocks ────────────────────────────────────────────────────────
SIDEBAR_HTML = """
<style>
.sb-head{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin:0 0 14px;}
.sb-row{font-size:14px;color:#475569;line-height:1.8;}
.sb-bold{font-weight:600;color:#0f172a;}
.sb-tips{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:14px;}
.sb-tips li{display:flex;gap:8px;font-size:14px;color:#475569;line-height:1.5;}
.sb-dot{color:#3b82f6;flex-shrink:0;}
.sb-code{background:#e2e8f0;color:#334155;padding:1px 5px;border-radius:4px;font-size:12px;font-family:monospace;}
</style>

<div style="display:flex;align-items:center;gap:10px;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #e2e8f0;">
  <div style="width:36px;height:36px;background:#fff7ed;border-radius:50%;
              display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">🏠</div>
  <div>
    <div style="font-weight:700;color:#0f172a;font-size:15px;line-height:1;">UIUC Housing Assistant</div>
    <div style="font-size:10px;color:#94a3b8;margin-top:4px;text-transform:uppercase;
                letter-spacing:.07em;font-weight:500;">Green Street Realty · Champaign, IL</div>
  </div>
</div>

<p class="sb-head">About</p>
<div class="sb-row"><span class="sb-bold">Data source:</span> Green Street Realty</div>
<div class="sb-row"><span class="sb-bold">Listings:</span> 489 floor plans · 251 properties</div>
<div class="sb-row"><span class="sb-bold">Last scraped:</span> May 20, 2026</div>
<div class="sb-row" style="margin-bottom:28px;"><span class="sb-bold">Area:</span> Champaign, IL (UIUC)</div>
<p class="sb-head">Search Tips</p>
<ul class="sb-tips">
  <li><span class="sb-dot">•</span><span>Mention bed count: <code class="sb-code">"2BR"</code> or <code class="sb-code">"2 bedroom"</code></span></li>
  <li><span class="sb-dot">•</span><span>Set a budget: <code class="sb-code">"under $900/bed"</code></span></li>
  <li><span class="sb-dot">•</span><span>Ask about location: <code class="sb-code">"near Grainger"</code></span></li>
  <li><span class="sb-dot">•</span><span>Availability: <code class="sb-code">"August 2026"</code></span></li>
</ul>
"""


WELCOME_HTML = """
<div style="margin-bottom:20px;">
  <h2 style="font-size:20px;font-weight:600;color:#1e293b;margin:0 0 6px;">
    How can I help you find a home?
  </h2>
  <p style="font-size:14px;color:#64748b;margin:0;">Try one of these common searches:</p>
</div>
"""

# ── Per-component CSS (injected once per response) ────────────────────────────
_CARD_CSS = """
<style>
.cards-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:24px;}
.listing-card{background:white;border:1px solid #e2e8f0;border-radius:16px;padding:20px;
              box-shadow:0 1px 3px rgba(0,0,0,.06);}
.card-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;}
.card-address{font-weight:700;color:#0f172a;font-size:14px;line-height:1.3;margin:0;flex:1;margin-right:8px;}
.card-body{display:flex;flex-direction:column;gap:12px;}
.card-row{display:flex;align-items:flex-start;gap:12px;}
.card-icon{font-size:18px;line-height:1;}
.card-label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;}
.card-value{font-size:14px;font-weight:600;color:#334155;}
.card-muted{color:#94a3b8;font-weight:400;}
.card-footer{margin-top:16px;padding-top:16px;border-top:1px solid #f8fafc;}
.card-link{font-size:14px;font-weight:700;color:#2563eb;text-decoration:none;}
</style>
"""

_TABLE_CSS = """
<style>
.summary-wrap{overflow:hidden;border-radius:16px;border:1px solid #e2e8f0;
              box-shadow:0 1px 3px rgba(0,0,0,.06);margin-top:4px;}
.summary-head{background:#f8fafc;padding:12px 20px;border-bottom:1px solid #e2e8f0;}
.summary-head h3{margin:0;font-size:14px;font-weight:700;color:#1e293b;}
.stbl{width:100%;border-collapse:collapse;font-size:13px;color:#475569;}
.stbl thead th{padding:10px 20px;border-bottom:1px solid #e2e8f0;background:white;font-size:11px;
               font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;
               text-align:left;white-space:nowrap;}
.stbl tbody td{padding:12px 20px;white-space:nowrap;}
.stbl tbody tr{border-bottom:1px solid #f1f5f9;}
.stbl tbody tr:hover{background:#f8fafc;}
</style>
"""

# ── Helpers ───────────────────────────────────────────────────────────────────
def price_str(low, high) -> str:
    if low is None:
        return "—"
    if low == high:
        return f"${low:,}"
    return f"${low:,}–${high:,}"


def availability_badge(avail: str) -> str:
    avail = avail or ""
    if avail.lower() == "leased":
        bg, color = "#f1f5f9", "#475569"
    else:
        bg, color = "#fff7ed", "#c2410c"
    return (
        f'<span style="background:{bg};color:{color};font-size:10px;font-weight:700;'
        f'padding:2px 8px;border-radius:4px;text-transform:uppercase;white-space:nowrap;">'
        f'{avail}</span>'
    )


def user_bubble(text: str) -> str:
    """Right-aligned user message bubble matching the design."""
    return f"""
<div style="display:flex;justify-content:flex-end;align-items:flex-start;
            gap:12px;margin:16px 0;">
  <div style="background:#f1f5f9;border-radius:16px 16px 4px 16px;padding:12px 20px;
              max-width:80%;font-size:15px;color:#1e293b;font-weight:500;
              line-height:1.6;word-break:break-word;">
    {text}
  </div>
  <div style="width:32px;height:32px;background:#e2e8f0;border-radius:50%;
              display:flex;align-items:center;justify-content:center;
              flex-shrink:0;font-size:15px;">🌽</div>
</div>
"""


# ── Listing renderers ─────────────────────────────────────────────────────────
def render_listing_cards(docs: list) -> None:
    if not docs:
        return
    cards = []
    for doc in docs:
        m         = doc.metadata
        ppb_low   = m.get("price_per_bed_low")
        ppb_high  = m.get("price_per_bed_high")
        ptot_low  = m.get("price_total_low")  or ppb_low
        ptot_high = m.get("price_total_high") or ppb_high
        avail     = m.get("availability", "")
        url       = m.get("url", "#")
        beds      = m.get("beds", "")
        unit      = m.get("unit_type", "")
        address   = m.get("address", "")
        pb        = price_str(ppb_low, ppb_high)
        pt        = price_str(ptot_low, ptot_high)
        beds_lbl  = f"{beds} bed" if beds else ""

        cards.append(f"""
<article class="listing-card">
  <div class="card-header">
    <h3 class="card-address">{address}</h3>
    {availability_badge(avail)}
  </div>
  <div class="card-body">
    <div class="card-row">
      <span class="card-icon">🛏️</span>
      <div>
        <div class="card-label">Layout</div>
        <div class="card-value">{unit} · {beds_lbl}</div>
      </div>
    </div>
    <div class="card-row">
      <span class="card-icon">💰</span>
      <div>
        <div class="card-label">Rent</div>
        <div class="card-value">{pb}/bed <span class="card-muted">({pt} total)</span></div>
      </div>
    </div>
  </div>
  <div class="card-footer">
    <a href="{url}" target="_blank" class="card-link">View Listing →</a>
  </div>
</article>""")

    st.markdown(
        _CARD_CSS + '<div class="cards-grid">' + "".join(cards) + "</div>",
        unsafe_allow_html=True,
    )


def render_summary(docs: list) -> None:
    if not docs:
        st.info("No matching listings found.")
        return

    render_listing_cards(docs)

    rows = []
    for doc in docs:
        m         = doc.metadata
        ppb_low   = m.get("price_per_bed_low")
        ppb_high  = m.get("price_per_bed_high")
        ptot_low  = m.get("price_total_low")  or ppb_low
        ptot_high = m.get("price_total_high") or ppb_high
        rows.append({
            "Address":        m.get("address", ""),
            "Unit":           m.get("unit_type", ""),
            "Beds":           m.get("beds", ""),
            "Price/bed":      price_str(ppb_low, ppb_high),
            "Price/mo total": price_str(ptot_low, ptot_high),
            "Availability":   m.get("availability", ""),
            "Link":           m.get("url", ""),
        })

    df = pd.DataFrame(rows).sort_values("Address").reset_index(drop=True)
    df["Address"] = df["Address"].where(df["Address"] != df["Address"].shift(), "")

    trows = []
    for _, row in df.iterrows():
        avail      = row["Availability"]
        avail_style = "color:#94a3b8;" if str(avail).lower() == "leased" else ""
        link       = row["Link"]
        link_html  = (
            f'<a href="{link}" target="_blank" '
            f'style="color:#2563eb;font-weight:600;text-decoration:none;">View →</a>'
            if link else "—"
        )
        trows.append(f"""<tr>
  <td>{row["Address"]}</td>
  <td style="font-style:italic;">{row["Unit"]}</td>
  <td>{row["Beds"]}</td>
  <td style="font-weight:600;color:#0f172a;">{row["Price/bed"]}</td>
  <td>{row["Price/mo total"]}</td>
  <td style="{avail_style}">{avail}</td>
  <td>{link_html}</td>
</tr>""")

    st.markdown(
        _TABLE_CSS + f"""
<div class="summary-wrap">
  <div class="summary-head"><h3>Summary</h3></div>
  <div style="overflow-x:auto;">
    <table class="stbl">
      <thead><tr>
        <th>Address</th><th>Unit</th><th>Beds</th>
        <th>Price/bed</th><th>Price/mo total</th><th>Availability</th><th>Link</th>
      </tr></thead>
      <tbody>{"".join(trows)}</tbody>
    </table>
  </div>
</div>""",
        unsafe_allow_html=True,
    )
