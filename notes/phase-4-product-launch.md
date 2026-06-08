# Phase 3 — Product Launch
Goal: Ship it to real UIUC students and collect feedback.*

---

## Step 3a — Pre-Launch (Before You Deploy)

- **Talk to 5 students** — show them the app, ask what's missing or confusing
- Define your **one-liner**: *"AI-powered housing search for UIUC students — ask in plain English, get ranked results"*

---

## Step 3b — Deployment

- Deploy backend to **Railway** or **Render** (free tier, easy Python support)
- Keep Ollama local during dev; **swap to OpenAI API** for the deployed version (much more reliable for public users)
- Or: deploy Ollama on a GPU instance (Lambda Labs, ~$0.50/hr) if you want to keep it fully local

---

## Step 3c — Distribution (Where UIUC Students Actually Are)

- **r/UIUC** — post a "built this for housing season" thread
- **Facebook groups**: UIUC Housing, UIUC Class of 20XX, UIUC International Students
- **Discord servers**: UIUC CS Discord, major-specific servers
- **Unofficial UIUC Slack** workspaces

---

## Step 3d — Feedback Loop (Turns This Into a Resume Story)

- Track: How many queries? What do users ask that the system fails on?
- Iterate on prompt, retrieval quality, or data freshness
- Document your **metrics** (users, queries, pain points solved) — this is gold for interviews

---

## 🎯 Resume Angle

When talking about this project in interviews, frame it as:

*"Built an Agentic RAG application that aggregates UIUC housing listings from multiple sources and lets students search via natural language. Designed the retrieval pipeline with LangChain + Chroma, deployed on Railway, and launched to the UIUC student community."*

That hits: **LangChain**, **RAG**, **real users**, **product thinking** — exactly what AI engineering roles want to see.
