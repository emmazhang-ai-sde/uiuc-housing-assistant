# Phase 1 — Local Model Environment
Goal: Get a local LLM running and connected to LangChain so you're not burning API credits during dev.

---

## Background & Context

This project is based on a guide from Xiaohongshu/RED (blogger: 瓦子) aimed at CS students learning AI development for job searches.

**Week 1: LangChain + Local Model Environment**

- **Learn LangChain** — most AI job postings require it; follow a highly-rated tutorial but *must* reproduce the code yourself
- **Small practice project** — e.g., use LangChain + OpenAI API to convert natural language → search keywords → fetch 3rd-party data → React frontend; or a RAG Chat for a product
- **Local model with Ollama** — run 7B/8B models locally to avoid expensive API costs (M1 Pro 16GB works well)

**Week 2: LangGraph + Agent Workflows**

- **Learn LangGraph** — don't overthink CrewAI vs Google SDK; concepts transfer across frameworks
- **Agent Workflow** — build pipeline-style agents with business logic (e.g., Agentic RAG with conditional routing)
- **Resource**: AI Jason's videos on LangGraph

**Key Advice**

- **RAG is a must-know** for AI interviews — study RAG principles, ReRank, why/when to use RAG, its limitations, and Agentic RAG
- **Don't copy tutorial projects to your resume** — build a larger, more complex, original project on top of what you learned
- The two-week foundation should give you enough to build a competitive, original project that helps you stand out in interviews

---

**Profile:** CS student · Real product + resume goal · UIUC housing listings aggregator · 5–15 hrs/week

Follow these four steps in order.

---

## Step 1/4 — Install Ollama and Pull a Model

```bash
brew install ollama

# Option A — Start now and restart at login (recommended):
brew services start ollama

# Option B — Start manually for this session only:
ollama serve

# Pull the model (downloads ~4.9 GB):
ollama pull llama3.1:8b
```

- If you used `brew services start ollama`, Ollama is already running in the background — no need to run `ollama serve` manually. For a one-time start, use `ollama serve` instead.
- 💡 **Run `ollama pull llama3.1:8b` here in Step 1** — the script in Step 4 will fail with a `404` if the model hasn't been downloaded yet.
- ⚠️ **Ollama running ≠ model available.** The server and the model are two separate things. You can have the server running with no models downloaded yet.

---

## Step 2/4 — Set Up Your Virtual Environment and Install Packages

#### ⚠️ Common mistake:
- Running `pip install` directly on a Homebrew-managed Python triggers this error:
```
error: externally-managed-environment
This environment is externally managed
```

**Why it happens:** 
- Homebrew's Python (PEP 668) blocks direct `pip` installs to protect its own dependencies — installing globally can break Homebrew tools that rely on specific package versions.

**The fix — set up a virtual environment (4 sub-steps):**
- A virtual environment is a fully isolated Python sandbox. It cannot affect your system Python. Deleting the `.venv` folder removes it completely with zero side effects.

```bash
       # 2.1 — Create the virtual environment
       python3 -m venv .venv

       # 2.2 — Activate it (your prompt will show (.venv) at the front)
       source .venv/bin/activate

       # 2.3 — Install packages safely inside the sandbox
       pip install langchain langchain-ollama python-dotenv

       # 2.4 — (Every new terminal) Re-activate before working on this project
       source ~/Library/CloudStorage/OneDrive-Personal/ai/.venv/bin/activate
```

 - Use `langchain-ollama`, not the older `langchain-community` — that one is deprecated.
 - 💡 Packages installed inside `.venv` are only available when it is active. Look for `(.venv)` in your terminal prompt to confirm.

---

## Step 3/4 — Create `chat.py`

```python
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage

llm = ChatOllama(model="llama3.1:8b")

response = llm.invoke([HumanMessage(content="What is RAG in AI development?")])
print(response.content)
```

---

## Step 4/4 — Run the Script

```bash
python chat.py
```

#### Troubleshooting: Model Not Found (404)

The following error appears when running `python chat.py` before pulling the model:

```
ollama._types.ResponseError: model 'llama3.1:8b' not found (status code: 404)
```

- **Root cause:** 
       Ollama was running correctly — the 404 confirms the server was reachable. The model was simply never downloaded.
- **Fix:** 
       Run `ollama pull llama3.1:8b` (back in Step 1) before running the script.

---

## What Is Happening Under the Hood

```
Your Python script (chat.py)
         ↓
  ChatOllama — LangChain wrapper
         ↓  formats message into Ollama's API format
  HTTP request → http://localhost:11434
         ↓
  Ollama server — running on your machine
         ↓  routes to the correct model
  llama3.1:8b — local model weights on disk
         ↓
  Response travels back up the same chain
         ↓
  Printed in your terminal
```

**No data leaves your machine. 
No API costs. 
This is why local dev with Ollama is preferred over calling OpenAI directly during the build phase.**

---

### Quick Diagnostic

| Symptom | Likely cause |
|---|---|
| `Connection refused` | Ollama server is not running — run `ollama serve` |
| `404 model not found` | Model not pulled — run `ollama pull llama3.1:8b` |
| Response is slow/wrong | Model too large for your RAM — try a smaller model |

---

**Checkpoint:** You can chat with a local model from a Python script. ✅

**Next:** → `phase-2-core-product-build.md`
