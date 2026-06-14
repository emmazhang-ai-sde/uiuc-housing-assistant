# app.py
# Streamlit chat UI for the UIUC Housing Assistant
#
# Run: streamlit run app.py

import re
import streamlit as st
from rag.rag_chain import chain, retriever
from streamlit_ui.ui import (
    GLOBAL_CSS, SIDEBAR_HTML, WELCOME_HTML,
    user_bubble, render_summary,
)

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="UIUC Housing Assistant",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Cache the chain so the embedding model + Chroma only load once ────────────
@st.cache_resource
def load_chain():
    return chain

rag = load_chain()

# ── Global CSS ────────────────────────────────────────────────────────────────
st.markdown(GLOBAL_CSS, unsafe_allow_html=True)

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown(SIDEBAR_HTML, unsafe_allow_html=True)
    st.divider()
    if st.button("🗑  Clear chat", use_container_width=True):
        st.session_state.messages = []
        st.rerun()

# ── Session state ─────────────────────────────────────────────────────────────
if "messages" not in st.session_state:
    st.session_state.messages = []
if "pending" not in st.session_state:
    st.session_state.pending = None

# ── Welcome / suggestion area (fresh chat only) ───────────────────────────────
SUGGESTED = [
    "2BR under $900/bed — what's available?",
    "Cheapest 1 bedroom near campus",
    "4BR options and total monthly cost?",
    "Units available for August 2026",
]

if not st.session_state.messages:
    st.markdown(WELCOME_HTML, unsafe_allow_html=True)
    col1, col2 = st.columns(2)
    for i, q in enumerate(SUGGESTED):
        col = col1 if i % 2 == 0 else col2
        if col.button(f'"{q}"', key=f"sq_{i}", use_container_width=True):
            st.session_state.pending = q
            st.rerun()

# ── Avatars ───────────────────────────────────────────────────────────────────
USER_AVATAR      = "🌽"
ASSISTANT_AVATAR = "🏠"

# ── Helpers ───────────────────────────────────────────────────────────────────
def format_response(text: str) -> str:
    text = re.sub(r'\$(\d)', r'\\$\1', text)
    for marker in ["🏠", "🛏", "💰", "📅", "🔗", "⚠️", "Found", "Note"]:
        text = text.replace(f"\n{marker}", f"\n\n{marker}")
    return text.strip()

# ── Display chat history ──────────────────────────────────────────────────────
for msg in st.session_state.messages:
    if msg["role"] == "user":
        st.markdown(user_bubble(msg["content"]), unsafe_allow_html=True)
    else:
        with st.chat_message("assistant", avatar=ASSISTANT_AVATAR):
            st.markdown(msg["content"])

# ── Handle input — from chat box or suggestion button ────────────────────────
user_input = st.chat_input("e.g. 2BR under $900/month near Grainger")

if st.session_state.pending:
    user_input = st.session_state.pending
    st.session_state.pending = None

if user_input:
    st.session_state.messages.append({"role": "user", "content": user_input})
    st.markdown(user_bubble(user_input), unsafe_allow_html=True)

    with st.chat_message("assistant", avatar=ASSISTANT_AVATAR):
        try:
            answer = rag.invoke(user_input)
            docs   = retriever.invoke(user_input)
            st.markdown(format_response(answer))
            render_summary(docs)
        except Exception as e:
            answer = f"⚠️ Something went wrong: {e}"
            st.markdown(answer)

    st.session_state.messages.append({"role": "assistant", "content": answer})

st.caption("Assistant can make mistakes. Verify important info before signing.")
