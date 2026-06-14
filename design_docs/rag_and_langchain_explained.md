# How RAG + LangChain Work in This Project

---

## What RAG Does

**RAG = Retrieval-Augmented Generation.** It's the core architectural pattern that solves the fundamental problem: an LLM like Llama 3.1 knows nothing about Green Street Realty listings — they're private, local, and constantly changing. RAG bridges that gap with two phases:

### Phase 1 — Build (`ingest.py`)

```
SQLite DB  →  LangChain Documents  →  Embeddings  →  Chroma vector store
```

1. Each listing's text is converted into a **numeric vector** (a "fingerprint" of its meaning) by the `all-MiniLM-L6-v2` embedding model.
2. All 489 vectors are stored in **Chroma**, a local vector database (`chroma_db/`).

### Phase 2 — Query (`rag_chain.py`)

```
User question  →  Retriever  →  Top-6 listings  →  Prompt + LLM  →  Answer
```

When a student asks *"2BR under $900/bed"*:

1. The question is **also embedded** into a vector.
2. **Cosine similarity search** in Chroma finds the 6 most semantically relevant listings (`k=6`).
3. Those raw listings are **injected into the prompt** as `{context}`.
4. The LLM reads only those 6 listings and writes a formatted, grounded answer.

> **Why it's good here:** Without RAG, the LLM would hallucinate addresses and prices. With RAG, it can only cite listings you've actually scraped — the prompt literally says `"Use ONLY the listings provided. Do not invent addresses, prices, or availability."`

---

## What LangChain Does

LangChain is the **glue framework** that wires all the pieces together cleanly. Here's what each component does in the code:

| LangChain Component | Where Used | What It Does |
|---|---|---|
| `Document` | `ingest.py:34` | A standard container pairing `page_content` (the text chunk the LLM reads) with `metadata` (beds, price, url — structured fields for filtering) |
| `HuggingFaceEmbeddings` | `ingest.py:52`, `rag_chain.py:19` | Wraps the `all-MiniLM-L6-v2` model so you call `.embed_documents()` without managing the model directly |
| `Chroma` (vectorstore) | `ingest.py:54`, `rag_chain.py:20` | Persists and loads the vector store from disk; `.as_retriever()` turns it into a callable search object |
| `PromptTemplate` | `rag_chain.py:67` | Fills `{context}` and `{question}` placeholders at runtime — keeps prompt logic separate from pipeline logic |
| `ChatOllama` | `rag_chain.py:68` | Connects to your local Ollama server running `llama3.1:8b` |
| `RunnablePassthrough` | `rag_chain.py:76` | Passes the raw user question through unchanged to fill `{question}` |
| `StrOutputParser` | `rag_chain.py:79` | Strips the LLM's response object down to a plain Python string |
| **LCEL chain** (`\|` operator) | `rag_chain.py:75–80` | Composes all steps into one callable pipeline — `chain.invoke("2BR under $900")` runs the entire flow end-to-end |

### The LCEL Chain

The `|` pipe operator is the key LangChain feature here. This single expression wires all six steps together:

```python
chain = (
    {"context": retriever | format_docs,   # retrieve → format docs
     "question": RunnablePassthrough()}    # pass question as-is
    | prompt                               # fill the prompt template
    | llm                                  # call the local LLM
    | StrOutputParser()                    # extract plain string
)
```

**Retrieve → Format → Prompt → LLM → Parse.** No boilerplate loops, no manual state passing.

---

## Why This Combination Is the Right Choice Here

| Problem | How RAG + LangChain Solves It |
|---|---|
| LLM has no knowledge of live Champaign listings | RAG injects real scraped data at query time |
| 489 listings can't all fit in one prompt | Vector search retrieves only the 6 most relevant ones |
| Listings change (new ones, leased ones) | Re-run `ingest.py` to rebuild the vector store — chain is unchanged |
| Local LLM (no API cost) needs to stay grounded | Prompt template strictly constrains the LLM to provided context |
| Connecting many tools (embedding, DB, LLM, UI) is complex | LangChain's standard interfaces and LCEL make swapping parts easy (e.g., swap Ollama for OpenAI in one line) |

> **In short:** RAG makes the LLM **accurate** (by grounding it in your data), and LangChain makes the pipeline **maintainable** (by standardizing how all the pieces connect).
