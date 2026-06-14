# rag_chain.py
# Retriever + LLM chain for UIUC housing search (Green Street Realty data)
#
# Run:    python -m rag.rag_chain
# Output: prints answers to a set of real-case student test questions

import os, sys
from pathlib import Path

import json
if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ["TRANSFORMERS_OFFLINE"] = "1"

from typing import Any
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_ollama import ChatOllama
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from config import CHROMA_DIR, EMBED_MODEL, LLM_MODEL, K_RESULTS, SCORE_GAP

# ── Load vector store ─────────────────────────────────────────────────────────
embeddings  = HuggingFaceEmbeddings(model_name=EMBED_MODEL)
vectorstore = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)


# ── Custom retriever ─────────────────────────────────────────────────────────
class RelativeThresholdRetriever(BaseRetriever):
    """Returns up to k results, dropping any whose score falls more than
    SCORE_GAP below the top result. Adapts to the query instead of using
    a fixed floor — a weak query still returns its best matches."""
    vectorstore: Any
    k: int
    max_gap: float

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> list[Document]:
        results = self.vectorstore.similarity_search_with_relevance_scores(query, k=self.k)
        if not results:
            return []
        top_score = results[0][1]
        return [doc for doc, score in results if top_score - score <= self.max_gap]

# Instantiate retriever with vector store and parameters
retriever = RelativeThresholdRetriever(
    vectorstore=vectorstore,
    k=K_RESULTS,
    max_gap=SCORE_GAP,
)


# ── Prompt template ───────────────────────────────────────────────────────────
PROMPT_TEMPLATE = """
You are a UIUC housing assistant. All listings are from Green Street Realty in Champaign, IL.
Use ONLY the listings provided. Do not invent addresses, prices, or availability.

LISTINGS:
{context}

STUDENT QUESTION:
{question}

Return ONLY a valid JSON object — no prose, no markdown, no explanation.

Schema:
{{
  "listings": [
    {{
      "address": "string",
      "unit_type": "string",
      "beds": number,
      "baths": number,
      "price_per_bed": "string",
      "price_total": "string",
      "availability": "string",
      "area": "string",
      "url": "string",
      "over_budget": boolean
    }}
  ],
  "summary": "string"
}}

Rules:
- Sort: available listings first, leased last.
- Set over_budget: true if the high end of price range exceeds the student's stated budget.
- summary: one line, e.g. "Found 2 available listings within your budget."
- Output raw JSON only. No ```json fences.
"""

prompt = PromptTemplate.from_template(PROMPT_TEMPLATE)
llm    = ChatOllama(model=LLM_MODEL)

def parse_json_output(text: str) -> dict:
    # Strip accidental fences just in case
    clean = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(clean)

# ── Chain ─────────────────────────────────────────────────────────────────────
def format_docs(docs):
    return "\n\n---\n\n".join([d.page_content for d in docs])

chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)


# ── Real-case student test questions ──────────────────────────────────────────
# These reflect the kinds of questions actual UIUC students ask during housing season.
TEST_QUESTIONS = [
    "I'm looking for a 2 bedroom apartment under $900/bed per month. What's available?",
]

if __name__ == "__main__":
    for i, question in enumerate(TEST_QUESTIONS, 1):
        print(f"\n{'='*65}")
        print(f"Q{i}: {question}")
        print(f"{'='*65}")
        raw = chain.invoke(question)
        data = parse_json_output(raw)
        import pprint; pprint.pprint(data)
